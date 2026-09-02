from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "online"

def test_auth_required():
    r = client.get("/api/planos")
    assert r.status_code == 401

def test_membro_forbidden_planos():
    fake = "f052bdd6-52dd-456f-9d80-ce017c5df2d1"
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake)
    mr.error = None
    m.auth.get_user.return_value = mr
    with patch("app.main.get_supabase_client", return_value=m):
        with patch("app.main.criar_plano", side_effect=ValueError("Apenas admin pode realizar esta ação")):
            r = client.post("/api/planos?org_id=00000000-0000-0000-0000-000000000000", headers={"Authorization": "Bearer fake"}, json={"nome":"X"})
            assert r.status_code == 403
