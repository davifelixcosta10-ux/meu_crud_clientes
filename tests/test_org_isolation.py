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

def test_org_isolation_forbidden():
    fake = "dcfaf27f-fa5c-4a35-8c54-82263e5225f9"
    # Simula _verificar_membro falhando
    with patch("app.main.get_supabase_client", return_value=mock_sup(fake)):
        with patch("app.storage.listar_organizacoes", return_value=[{"id":"org-a"}]):
            # Tenta listar clientes de org-b com token de org-a → deve 500 ou 403 mas não vazar
            # Nossa validação atual retorna 500 com detail generico, não vaza
            # Aqui testamos que sem ser membro, carregar_clientes levanta ValueError
            from app.storage import _verificar_membro
            try:
                _verificar_membro(fake, "org-b-00000000-0000-0000-0000-000000000000")
                assert False, "deveria falhar"
            except ValueError as e:
                assert "Acesso negado" in str(e) or "inválido" in str(e)
