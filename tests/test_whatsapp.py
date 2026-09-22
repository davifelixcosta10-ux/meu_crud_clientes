from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


def _mock_supabase_auth(fake_user_id=FAKE_USER_ID):
    """Create a mock Supabase client that validates the fake token."""
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake_user_id)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m


def _mock_supabase_whatsapp_config():
    """Create a mock Supabase client with WhatsApp config."""
    m = MagicMock()
    m.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data={"config": {"provider": "evolution", "base_url": "http://test", "instance": "test", "token": "test"}}
    )
    return m


def _mock_httpx_post_success(message_id="msg_123"):
    """Create a mock httpx.post that returns success."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"key": {"id": message_id}}
    mock_response.raise_for_status = MagicMock()
    return mock_response


def _mock_httpx_post_failure():
    """Create a mock httpx.post that returns failure."""
    import httpx
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = "Bad Request"
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "HTTP 400: Bad Request", request=MagicMock(), response=mock_response
    )
    return mock_response


def test_whatsapp_enviar_requires_auth():
    r = client.post("/api/whatsapp/enviar", json={
        "org_id": ORG,
        "telefone_e164": "5511999999999",
        "mensagem": "Teste"
    })
    assert r.status_code == 401


def test_whatsapp_enviar_member_403():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_whatsapp_config()):
            with patch("app.storage._verificar_admin", side_effect=ValueError("Usuário não é admin da organização")):
                with patch("httpx.post", return_value=_mock_httpx_post_success()):
                    r = client.post("/api/whatsapp/enviar?org_id=" + ORG,
                        json={
                            "telefone_e164": "5511999999999",
                            "mensagem": "Teste"
                        },
                        headers={"Authorization": "Bearer fake_token"}
                    )
                    assert r.status_code == 403


def test_whatsapp_enviar_invalid_phone_422():
    # Even with auth, invalid phone should return 422
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        r = client.post("/api/whatsapp/enviar?org_id=" + ORG,
            json={
                "telefone_e164": "abc",  # invalid format
                "mensagem": "Teste"
            },
            headers={"Authorization": "Bearer fake_token"}
        )
        assert r.status_code == 422


def test_whatsapp_enviar_success():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_whatsapp_config()):
            with patch("app.storage._verificar_admin", return_value=True):
                with patch("httpx.post", return_value=_mock_httpx_post_success("msg_123")):
                    r = client.post("/api/whatsapp/enviar?org_id=" + ORG,
                        json={
                            "telefone_e164": "5511999999999",
                            "mensagem": "Teste"
                        },
                        headers={"Authorization": "Bearer fake_token"}
                    )
                    assert r.status_code == 200
                    data = r.json()
                    assert data["success"] is True
                    assert data["message_id"] == "msg_123"


def test_whatsapp_enviar_httpx_failure():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_whatsapp_config()):
            with patch("app.storage._verificar_admin", return_value=True):
                with patch("httpx.post", return_value=_mock_httpx_post_failure()):
                    r = client.post("/api/whatsapp/enviar?org_id=" + ORG,
                        json={
                            "telefone_e164": "5511999999999",
                            "mensagem": "Teste"
                        },
                        headers={"Authorization": "Bearer fake_token"}
                    )
                    assert r.status_code == 400
                    data = r.json()
                    assert "detail" in data
                    assert "Erro HTTP 400" in data["detail"]