from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"


def _mock_supabase_auth(fake_user_id=FAKE_USER_ID):
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake_user_id)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m


def _mock_supabase_automacao():
    """Mock do client supabase: automação com org_id e template válido."""
    m = MagicMock()

    def table(name):
        t = MagicMock()
        if name == "automacoes":
            sel = t.select.return_value
            sel.eq.return_value.execute.return_value = MagicMock(
                data=[{"org_id": ORG}]
            )
            upd = t.update.return_value
            upd.eq.return_value.execute.return_value = MagicMock(
                data=[{"id": "1", "org_id": ORG, "tipo": "inativo_30d",
                       "canal": "whatsapp", "template_id": "10"}]
            )
        elif name == "templates_whatsapp":
            sel = t.select.return_value
            # template pertence à mesma org
            sel.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"id": "10", "org_id": ORG}]
            )
        return t

    m.table.side_effect = table
    return m


def _mock_supabase_template_outra_org():
    m = MagicMock()

    def table(name):
        t = MagicMock()
        if name == "automacoes":
            sel = t.select.return_value
            sel.eq.return_value.execute.return_value = MagicMock(
                data=[{"org_id": ORG}]
            )
        elif name == "templates_whatsapp":
            sel = t.select.return_value
            sel.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )
        return t

    m.table.side_effect = table
    return m


def test_patch_automacao_canal_whatsapp_admin_ok():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_automacao()):
            with patch("app.storage._verificar_admin", return_value=True):
                r = client.patch(
                    f"/api/automacoes/1?org_id={ORG}",
                    json={"canal": "whatsapp", "template_id": "10"},
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 200
                data = r.json()
                assert data["canal"] == "whatsapp"
                assert data["template_id"] == "10"


def test_patch_automacao_canal_invalido_422():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        r = client.patch(
            f"/api/automacoes/1?org_id={ORG}",
            json={"canal": "telegram"},
            headers={"Authorization": "Bearer fake_token"},
        )
        assert r.status_code == 422


def test_patch_automacao_template_outra_org_400():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_template_outra_org()):
            with patch("app.storage._verificar_admin", return_value=True):
                r = client.patch(
                    f"/api/automacoes/1?org_id={ORG}",
                    json={"canal": "whatsapp", "template_id": "10"},
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 400
                assert "Template não encontrado na organização" == r.json()["detail"]


def test_patch_automacao_membro_403():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=_mock_supabase_automacao()):
            with patch("app.storage._verificar_admin", side_effect=ValueError("Apenas admin pode realizar esta ação")):
                r = client.patch(
                    f"/api/automacoes/1?org_id={ORG}",
                    json={"canal": "whatsapp", "template_id": "10"},
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 403


def test_get_notificacoes_requires_auth():
    r = client.get(f"/api/notificacoes?org_id={ORG}")
    assert r.status_code == 401


def test_get_notificacoes_membro_outra_org_403():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=MagicMock()):
            with patch("app.storage._verificar_membro", side_effect=ValueError("Acesso negado à organização")):
                r = client.get(
                    f"/api/notificacoes?org_id={ORG}",
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 403


def test_get_notificacoes_ok():
    log = [{
        "id": "n1", "org_id": ORG, "cliente_id": "1",
        "tipo": "inativo_30d", "canal": "whatsapp",
        "status": "enviado", "mensagem": "Olá",
        "erro": None, "created_at": "2026-10-10T00:00:00Z",
        "sent_at": "2026-10-10T00:00:01Z",
    }]
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch(
            "app.main.listar_notificacoes",
            return_value=log,
        ):
            r = client.get(
                f"/api/notificacoes?org_id={ORG}",
                headers={"Authorization": "Bearer fake_token"},
            )
            assert r.status_code == 200
            data = r.json()
            assert len(data) == 1
            assert data[0]["canal"] == "whatsapp"
