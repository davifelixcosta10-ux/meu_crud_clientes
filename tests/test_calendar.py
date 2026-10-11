"""
Testes Fase 5 — Google Calendar OAuth real + sync atividade→evento.
Padrão de mock: tests/test_whatsapp.py (auth via get_user, patch de httpx.post em app.storage).
"""
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import time

from app.main import app
from app import storage as storage_mod

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
STATE = f"v1.{ORG}.{FAKE_USER_ID}.{int(time.time()) + 600}.deadbeef"


def _mock_supabase_auth(fake_user_id=FAKE_USER_ID):
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake_user_id)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m


def _mock_httpx_token_response(status_code=200, payload=None):
    r = MagicMock()
    r.status_code = status_code
    r.json.return_value = payload or {
        "access_token": "at_test",
        "refresh_token": "rt_test",
        "expires_in": 3600,
    }
    return r


def _mock_httpx_event_response():
    r = MagicMock()
    r.status_code = 200
    r.json.return_value = {"id": "evt_123", "summary": "ligacao: Cliente"}
    return r


# ------------------------------------------------------------
# 1. GET auth-url sem env → 503 amigável
# ------------------------------------------------------------
def test_auth_url_sem_env_503(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        r = client.get("/api/integracoes/calendar/auth-url", headers={"Authorization": "Bearer fake"})
    assert r.status_code == 503
    assert "não configurado" in r.json()["detail"].lower()


# ------------------------------------------------------------
# 2. GET auth-url com env → 200 com URL real do Google
# ------------------------------------------------------------
def test_auth_url_com_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid_test")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "cs_test")
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()), \
         patch("app.storage.get_supabase_client", return_value=_mock_supabase_auth()), \
         patch.object(storage_mod, "_get_default_org_id", return_value=ORG):
        r = client.get("/api/integracoes/calendar/auth-url?org_id=" + ORG, headers={"Authorization": "Bearer fake"})
    assert r.status_code == 200
    data = r.json()
    assert data["mock"] is False
    assert "accounts.google.com" in data["auth_url"]
    assert "access_type=offline" in data["auth_url"]
    assert "calendar.events" in data["auth_url"]
    assert "state=v1." in data["auth_url"]


# ------------------------------------------------------------
# 3. GET callback com state inválido → 302 ?calendar=erro
# ------------------------------------------------------------
def test_callback_state_invalido(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid_test")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "cs_test")
    monkeypatch.setenv("API_KEY_PEPPER", "pepper_test")
    r = client.get("/api/integracoes/calendar/callback", params={"code": "abc", "state": "v1.xxx.yyy.9999999999.badsig"}, follow_redirects=False)
    assert r.status_code == 302
    assert "calendar=erro" in r.headers["location"]


# ------------------------------------------------------------
# 4. GET callback com state válido + token exchange 200 → upsert + ?calendar=ok
# ------------------------------------------------------------
def test_callback_valido(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid_test")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "cs_test")
    monkeypatch.setenv("API_KEY_PEPPER", "pepper_test")
    state_valido = storage_mod._calendar_sign_state(ORG, FAKE_USER_ID, int(time.time()) + 600)

    upd_calls = {}

    def _table(table):
        t = MagicMock()
        sel = t.select.return_value
        eq1 = sel.eq.return_value
        eq2 = eq1.eq.return_value
        eq2.limit.return_value.execute.return_value = MagicMock(data=[])  # sem row existente
        t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": 1}])
        upd_calls["update"] = t.update
        t.insert.return_value.execute.return_value = MagicMock(data=[{"id": 2}])
        return t

    supa = MagicMock()
    supa.table.side_effect = _table

    with patch("app.storage.get_supabase_client", return_value=supa), \
         patch("app.storage.httpx.post", return_value=_mock_httpx_token_response()), \
         patch("app.storage.criar_integracao", return_value={"id": 3}) as ci:
        r = client.get("/api/integracoes/calendar/callback", params={"code": "abc", "state": state_valido}, follow_redirects=False)
    assert r.status_code == 302
    assert "calendar=ok" in r.headers["location"]
    ci.assert_called_once()
    cfg = ci.call_args[0][0]["config"]
    assert cfg["access_token"] == "at_test"
    assert cfg["refresh_token"] == "rt_test"


# ------------------------------------------------------------
# 5. calendar_criar_evento falha → None; POST /api/atividades ainda 201
# ------------------------------------------------------------
def test_criar_evento_falha_nao_bloqueia_atividade(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid_test")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "cs_test")

    atv = {"id": 1, "org_id": ORG, "tipo": "ligacao", "data": "2026-10-10", "nota": "n", "cliente_id": "c1"}

    def _fail_post(*a, **k):
        raise Exception("google down")

    assert storage_mod.calendar_criar_evento(ORG, atv, "Cliente") is None


def test_post_atividade_201_mesmo_com_calendar_quebrado(monkeypatch):
    atv_row = {"id": 1, "user_id": FAKE_USER_ID, "cliente_id": "c1", "tipo": "ligacao",
               "data": "2026-10-10", "concluida": False, "nota": "n", "org_id": ORG}

    supa = MagicMock()
    cli_sel = supa.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "c1"}])
    ins = supa.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[atv_row])
    supa.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    # nomes para evento
    def _table(t):
        tb = MagicMock()
        tb.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "c1"}])
        tb.insert.return_value.execute.return_value = MagicMock(data=[atv_row])
        tb.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
        return tb
    supa.table.side_effect = _table

    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()), \
         patch("app.storage.get_supabase_client", return_value=supa), \
         patch("app.storage.calendar_criar_evento", side_effect=Exception("boom")):
        r = client.post("/api/atividades?org_id=" + ORG, json={
            "cliente_id": "c1", "tipo": "ligacao", "data": "2026-10-10"
        }, headers={"Authorization": "Bearer fake"})
    assert r.status_code == 201


# ------------------------------------------------------------
# 6. calendar_sync_pendentes: admin → contadores; membro → 403
# ------------------------------------------------------------
def test_sync_admin_contadores(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid_test")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "cs_test")

    atv_pendente = {"id": 1, "org_id": ORG, "cliente_id": "c1", "tipo": "ligacao", "data": "2026-10-10", "nota": "n", "google_event_id": None}

    def _table(t):
        tb = MagicMock()
        if t == "atividades":
            tb.select.return_value.eq.return_value.is_.return_value.gte.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[atv_pendente])
            tb.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": 1}])
        elif t == "clientes":
            tb.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[{"id": "c1", "nome": "Cliente"}])
        elif t == "integracoes":
            tb.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[{"config": {"access_token": "at"}}])
        return tb

    supa = MagicMock()
    supa.table.side_effect = _table

    with patch("app.storage.get_supabase_client", return_value=supa), \
         patch("app.storage._verificar_admin", return_value=True), \
         patch("app.storage.httpx.post", return_value=_mock_httpx_event_response()):
        res = storage_mod.calendar_sync_pendentes(FAKE_USER_ID, ORG)
    assert res == {"sincronizadas": 1, "falhas": 0, "total": 1}


def test_sync_membro_403(monkeypatch):
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()), \
         patch("app.storage._get_default_org_id", return_value=ORG), \
         patch("app.storage._verificar_admin", side_effect=ValueError("Apenas admin pode realizar esta ação")):
        r = client.post("/api/integracoes/calendar/sync?org_id=" + ORG, headers={"Authorization": "Bearer fake"})
    assert r.status_code == 403


# ------------------------------------------------------------
# 7. listar_integracoes sanitiza config (tokens nunca voltam)
# ------------------------------------------------------------
def test_listar_integracoes_sanitizada():
    row = {"id": 1, "tipo": "calendar", "nome": "Google Calendar", "ativo": True,
           "config": {"access_token": "at", "refresh_token": "rt", "token": "tk", "connected_at": "2026-10-07"}}

    supa = MagicMock()
    supa.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[row])

    with patch("app.storage.get_supabase_client", return_value=supa), \
         patch("app.storage._verificar_membro", return_value=True):
        res = storage_mod.listar_integracoes(FAKE_USER_ID, ORG)
    assert len(res) == 1
    cfg = res[0]["config"]
    assert "access_token" not in cfg
    assert "refresh_token" not in cfg
    assert "token" not in cfg
    assert cfg["connected_at"] == "2026-10-07"


# ------------------------------------------------------------
# 8. POST sync sem token → 401
# ------------------------------------------------------------
def test_sync_sem_token_401():
    r = client.post("/api/integracoes/calendar/sync")
    assert r.status_code == 401
