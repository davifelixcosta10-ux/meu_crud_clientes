"""Testes das otimizações de backend (migration 011 / cache de orgs / retry HTTP).

Cobrem o que foi mudado para performance, para não regredir sem aviso:
1. listar_organizacoes() memoiza por ORGS_CACHE_TTL segundos
2. invalidar_cache_orgs() força releitura (criar/remover org e membro)
3. fallback de membership usa UMA query .in_() em vez de N queries (N+1)
4. gzip ligado no app (resposta JSON grande comprimida)
5. _http_post() repete em 429/5xx e NÃO repete em 4xx de negócio
"""
import httpx
import pytest

from app import storage
from app.main import app


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    """Stub mínimo da cadeia do Supabase client, contando idas ao 'banco'.

    Filtra de verdade por eq()/in_() para que os testes distingam a query de
    owner da query em lote (senão todo filtro devolveria a tabela inteira).
    """

    def __init__(self, log, table, dados):
        self._log = log
        self._table = table
        self._dados = dados
        self._filtros = []
        self.in_usado = None

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def eq(self, coluna, valor):
        self._filtros.append(lambda r: str(r.get(coluna)) == str(valor))
        return self

    def in_(self, coluna, valores):
        valores = [str(v) for v in valores]
        self.in_usado = valores
        self._log.append(f"{self._table}.in_{coluna}")
        self._filtros.append(lambda r: str(r.get(coluna)) in valores)
        return self

    def execute(self):
        self._log.append(self._table)
        linhas = self._dados.get(self._table, [])
        for filtro in self._filtros:
            linhas = [r for r in linhas if filtro(r)]
        return _Res(linhas)


class _SupabaseFake:
    def __init__(self, dados):
        self.log: list[str] = []
        self._dados = dados

    def table(self, nome):
        return _Query(self.log, nome, self._dados)


@pytest.fixture(autouse=True)
def _limpar_cache():
    storage.invalidar_cache_orgs()
    yield
    storage.invalidar_cache_orgs()


def test_listar_organizacoes_memoiza_dentro_do_ttl(monkeypatch):
    fake = _SupabaseFake({
        "organizacoes": [{"id": "org-1", "nome": "Org 1", "owner_id": "u1"}],
        "membros": [],
    })
    monkeypatch.setattr(storage, "get_supabase_client", lambda: fake)

    primeira = storage.listar_organizacoes("u1")
    consultas_da_primeira = len(fake.log)
    segunda = storage.listar_organizacoes("u1")

    assert [o["id"] for o in primeira] == ["org-1"]
    assert segunda == primeira
    assert len(fake.log) == consultas_da_primeira, "segunda chamada não deveria ir ao banco"
    assert consultas_da_primeira == 2  # organizacoes + membros


def test_invalidar_cache_forca_releitura(monkeypatch):
    fake = _SupabaseFake({"organizacoes": [], "membros": []})
    monkeypatch.setattr(storage, "get_supabase_client", lambda: fake)

    storage.listar_organizacoes("u1")
    antes = len(fake.log)
    storage.invalidar_cache_orgs()
    storage.listar_organizacoes("u1")

    assert len(fake.log) == antes * 2


def test_fallback_membership_usa_uma_query_em_lote(monkeypatch):
    """Sem o join aninhado (caso RLS), antes era 1 query por org — agora 1 só."""
    fake = _SupabaseFake({
        "organizacoes": [
            {"id": "org-a", "nome": "A", "owner_id": "outro"},
            {"id": "org-b", "nome": "B", "owner_id": "outro"},
        ],
        "membros": [
            {"org_id": "org-a", "user_id": "u1", "papel": "membro", "organizacoes": None},
            {"org_id": "org-b", "user_id": "u1", "papel": "admin", "organizacoes": None},
        ],
    })
    # .in_ devolve o que estiver em "organizacoes"
    monkeypatch.setattr(storage, "get_supabase_client", lambda: fake)

    orgs = storage.listar_organizacoes("u1")

    ids = sorted(o["id"] for o in orgs)
    assert ids == ["org-a", "org-b"], "as duas orgs do usuário devem aparecer"
    assert fake.log.count("organizacoes") == 2, "1 query de owner + 1 .in_ em lote"
    assert "organizacoes.in_id" in fake.log


def test_gzip_ativo_no_app():
    from starlette.middleware.gzip import GZipMiddleware

    assert any(m.cls is GZipMiddleware for m in app.user_middleware), (
        "GZipMiddleware precisa estar registrado — é o ganho de banda das listagens"
    )


def test_http_post_repete_em_5xx():
    chamadas = {"n": 0}

    class _Cliente:
        def post(self, url, **kw):
            chamadas["n"] += 1
            if chamadas["n"] < 3:
                req = httpx.Request("POST", url)
                return httpx.Response(503, request=req)
            return httpx.Response(200, request=httpx.Request("POST", url))

    monkey_shim = _Cliente()
    original = storage.httpx.post
    storage.httpx.post = monkey_shim.post
    try:
        resp = storage._http_post("https://exemplo.test/hook", json={"a": 1})
    finally:
        storage.httpx.post = original

    assert resp.status_code == 200
    assert chamadas["n"] == 3, "deveria tentar 3x antes de desistir de um 503"


def test_http_post_nao_repete_em_4xx():
    chamadas = {"n": 0}

    class _Cliente:
        def post(self, url, **kw):
            chamadas["n"] += 1
            return httpx.Response(400, request=httpx.Request("POST", url))

    original = storage.httpx.post
    storage.httpx.post = _Cliente().post
    try:
        resp = storage._http_post("https://exemplo.test/hook", json={})
    finally:
        storage.httpx.post = original

    assert resp.status_code == 400
    assert chamadas["n"] == 1, "erro de payload não melhora repetindo"
