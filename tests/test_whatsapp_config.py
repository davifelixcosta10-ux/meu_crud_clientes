"""
Testes Fase 4 — rotas de configuração WhatsApp (QA browser).

Cobertura:
- POST /api/integracoes/whatsapp: criação, update na mesma row (nunca segunda), 400, 403, 401
- POST /api/integracoes/whatsapp/test: 404 sem integração, 200 com config válida
- IntegracaoCreate aceita tipo 'whatsapp' (rejeita tipo inventado)
- Seed de automações no criar_organizacao (upsert com 2 rows)
"""
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.models import IntegracaoCreate

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
INTEGRACAO_ID = "bbbbbbbb-0000-0000-0000-00000000000c"

CONFIG_EVOLUTION = {
    "provider": "evolution",
    "base_url": "https://evolution.example.com",
    "instance": "daviflow",
    "token": "tok_123",
}


def _mock_supabase_auth(fake_user_id=FAKE_USER_ID):
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake_user_id)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m


def _mock_supabase_whatsapp(integracao_existente=True, config=CONFIG_EVOLUTION):
    """Mock de supabase client para as rotas de config WhatsApp.

    Cadeias:
    - integracoes select id/config: .eq(org_id).eq(tipo).limit(1).execute -> row (ou [])
    - integracoes update: .update({}).eq(id).execute
    """
    m = MagicMock()
    rows = [{"id": INTEGRACAO_ID, "config": config}] if integracao_existente else []
    updates = []
    inserts = []

    def table(name):
        t = MagicMock()
        if name == "integracoes":
            sel = t.select.return_value
            sel.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=rows
            )
        if name == "integracoes":
            t.update.side_effect = lambda payload: _mk_update(payload)
            t.insert.side_effect = lambda payload: _mk_insert(payload)
        return t

    def _mk_update(payload):
        updates.append(payload)
        u = MagicMock()
        u.eq.return_value.execute.return_value = MagicMock(data=[dict(payload)])
        return u

    def _mk_insert(payload):
        inserts.append(payload)
        u = MagicMock()
        u.execute.return_value = MagicMock(data=[dict(payload)])
        return u

    m.table.side_effect = table
    m._updates = updates
    m._inserts = inserts
    return m


# ============================================================
# 1. POST /api/integracoes/whatsapp
# ============================================================

def test_whatsapp_config_admin_cria_ok():
    sb = _mock_supabase_whatsapp(integracao_existente=False)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", return_value=True):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    r = client.post(
                        "/api/integracoes/whatsapp",
                        json={"config": CONFIG_EVOLUTION},
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 200, r.text
                    assert r.json() == {"status": "ok"}


def test_whatsapp_config_existente_atualiza_mesma_row():
    sb = _mock_supabase_whatsapp(integracao_existente=True)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", return_value=True):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    with patch("app.storage.criar_integracao") as mock_criar:
                        r = client.post(
                            "/api/integracoes/whatsapp",
                            json={"config": CONFIG_EVOLUTION},
                            headers={"Authorization": "Bearer fake_token"},
                        )
                        assert r.status_code == 200, r.text
                        # nunca cria segunda row whatsapp — só update
                        mock_criar.assert_not_called()
                        assert sb._updates, "update deveria ser chamado"
                        assert sb._updates[0]["config"] == CONFIG_EVOLUTION
                        assert sb._updates[0]["ativo"] is True


def test_whatsapp_config_invalida_sem_token_400():
    sb = _mock_supabase_whatsapp(integracao_existente=False)
    config = {k: v for k, v in CONFIG_EVOLUTION.items() if k != "token"}
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", return_value=True):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    r = client.post(
                        "/api/integracoes/whatsapp",
                        json={"config": config},
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 400
                    assert "token" in r.json()["detail"].lower()


def test_whatsapp_config_membro_403():
    sb = _mock_supabase_whatsapp(integracao_existente=False)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", side_effect=ValueError("Apenas admin pode realizar esta ação")):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    r = client.post(
                        "/api/integracoes/whatsapp",
                        json={"config": CONFIG_EVOLUTION},
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 403


def test_whatsapp_config_sem_token_401():
    r = client.post("/api/integracoes/whatsapp", json={"config": CONFIG_EVOLUTION})
    assert r.status_code == 401


# ============================================================
# 2. POST /api/integracoes/whatsapp/test
# ============================================================

def test_whatsapp_test_sem_integracao_404():
    sb = _mock_supabase_whatsapp(integracao_existente=False)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", return_value=True):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    r = client.post(
                        "/api/integracoes/whatsapp/test",
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 404
                    assert r.json()["detail"] == "Configuração WhatsApp não encontrada"


def test_whatsapp_test_config_valida_200():
    sb = _mock_supabase_whatsapp(integracao_existente=True)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", return_value=True):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                with patch("app.storage.get_supabase_client", return_value=sb):
                    r = client.post(
                        "/api/integracoes/whatsapp/test",
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 200, r.text
                    assert r.json()["status"] == "ok"
                    assert r.json()["mensagem"] == "Configuração válida"


# ============================================================
# 3. IntegracaoCreate aceita whatsapp
# ============================================================

def test_integracao_create_aceita_whatsapp():
    ic = IntegracaoCreate(tipo="whatsapp", nome="WhatsApp", config={"a": 1})
    assert ic.tipo == "whatsapp"


def test_integracao_create_rejeita_tipo_inventado():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        IntegracaoCreate(tipo="telegram")


# ============================================================
# 4. Seed de automações no criar_organizacao
# ============================================================

def test_criar_organizacao_semeia_automacoes():
    from app.storage import criar_organizacao
    sb = _mock_supabase_auth()
    sb_admin = _mock_supabase_auth()
    upserts = []

    def table(name):
        t = MagicMock()
        if name == "organizacoes":
            ins = MagicMock()
            ins.execute.return_value = MagicMock(
                data=[{"id": ORG, "nome": "Org", "owner_id": FAKE_USER_ID}]
            )
            t.insert.return_value = ins
        elif name == "automacoes":
            t.upsert.side_effect = lambda rows, on_conflict=None: _mk_upsert(rows, on_conflict)
        return t

    def _mk_upsert(rows, on_conflict):
        u = MagicMock()
        u.execute.return_value = MagicMock(data=rows)
        upserts.append((rows, on_conflict))
        return u

    sb.table.side_effect = table
    sb_admin.table.side_effect = table

    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.get_supabase_admin_client", return_value=sb_admin):
            org = criar_organizacao(FAKE_USER_ID, "Org Teste")
            assert org["id"] == ORG
            assert org["papel"] == "admin"
            # seed best-effort: upsert com as 2 automações padrão
            assert upserts, "seed de automacoes deveria ser chamado"
            rows, on_conflict = upserts[0]
            assert on_conflict == "org_id,tipo"
            tipos = {r["tipo"] for r in rows}
            assert tipos == {"inativo_30d", "vence_3d"}
            assert all(r["org_id"] == ORG and r["ativo"] is True for r in rows)


def test_criar_organizacao_seed_falha_nao_derruba_signup():
    from app.storage import criar_organizacao
    sb = _mock_supabase_auth()
    sb_admin = _mock_supabase_auth()

    def table_ok(name):
        t = MagicMock()
        if name == "organizacoes":
            ins = MagicMock()
            ins.execute.return_value = MagicMock(
                data=[{"id": ORG, "nome": "Org", "owner_id": FAKE_USER_ID}]
            )
            t.insert.return_value = ins
        elif name == "automacoes":
            t.upsert.side_effect = Exception("RLS block")
        return t

    def table_erro(name):
        raise Exception("boom")

    sb.table.side_effect = table_ok
    sb_admin.table.side_effect = table_erro

    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.get_supabase_admin_client", return_value=sb_admin):
            # signup não pode falhar mesmo se o seed falhar
            org = criar_organizacao(FAKE_USER_ID, "Org Teste")
            assert org["id"] == ORG
            assert org["papel"] == "admin"
