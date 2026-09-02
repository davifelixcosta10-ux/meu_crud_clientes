from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app
client = TestClient(app)

def mock_sup(uid):
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=uid)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m

def test_membro_forbidden_planos():
    fake = "f052bdd6-52dd-456f-9d80-ce017c5df2d1"
    with patch("app.main.get_supabase_client", return_value=mock_sup(fake)):
        with patch("app.main.criar_plano", side_effect=ValueError("Apenas admin pode realizar esta ação")):
            r = client.post("/api/planos?org_id=00000000-0000-0000-0000-000000000000", headers={"Authorization": "Bearer fake"}, json={"nome":"X"})
            assert r.status_code == 403

def test_membro_forbidden_templates():
    fake = "f052bdd6-52dd-456f-9d80-ce017c5df2d1"
    with patch("app.main.get_supabase_client", return_value=mock_sup(fake)):
        with patch("app.main.criar_template", side_effect=ValueError("Apenas admin pode realizar esta ação")):
            r = client.post("/api/templates?org_id=00000000-0000-0000-0000-000000000000", headers={"Authorization": "Bearer fake"}, json={"nome":"T","mensagem":"M"})
            assert r.status_code == 403

def test_membro_forbidden_automacoes():
    fake = "f052bdd6-52dd-456f-9d80-ce017c5df2d1"
    with patch("app.main.get_supabase_client", return_value=mock_sup(fake)):
        with patch("app.main.run_automacoes_manual", side_effect=ValueError("Apenas admin pode realizar esta ação")):
            r = client.post("/api/automacoes/run", headers={"Authorization": "Bearer fake"})
            assert r.status_code == 403
