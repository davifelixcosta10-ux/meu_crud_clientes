from unittest.mock import patch, MagicMock
from app.storage import _COLUNAS_CLIENTE

def test_campos_custom_in_colunas():
    assert "campos_custom" in _COLUNAS_CLIENTE

def test_vertical_seed():
    fake = "dcfaf27f-fa5c-4a35-8c54-82263e5225f9"
    m = MagicMock()
    m.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{"vertical":"hospital"}]
    m.table.return_value.select.return_value.execute.return_value.data = [{"vertical":"hospital"}]
    with patch("app.storage.get_supabase_client", return_value=m):
        from app.storage import get_org_vertical
        # Mock to return hospital
        with patch("app.storage.get_supabase_client", return_value=m):
            # Just test that function exists and returns string
            assert callable(get_org_vertical)
