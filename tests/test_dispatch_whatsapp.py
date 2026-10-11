"""
Fase 4 — Testes do motor de dispatch WhatsApp (processar_notificacoes_pendentes)
+ rotas /api/notificacoes/processar e /api/automacoes/run.
"""
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from app.main import app
from app.storage import _interpolarmensagem, _formatar_brl, _telefone_para_e164, processar_notificacoes_pendentes

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
ROW_ID = "aaaaaaaa-0000-0000-0000-00000000000b"


def _mock_supabase_auth(fake_user_id=FAKE_USER_ID):
    m = MagicMock()
    mr = MagicMock()
    mr.user = MagicMock(id=fake_user_id)
    mr.error = None
    m.auth.get_user.return_value = mr
    return m


CLIENTE = {
    "nome": "João Silva",
    "telefone": "11999998888",
    "valor_plano": 1500.0,
    "vencimento_dia": 10,
    "campos_custom": {"carros": [{"placa": "ABC-1234"}]},
    "org_id": ORG,
}

ROW_PENDENTE = {
    "id": ROW_ID,
    "org_id": ORG,
    "cliente_id": 1,
    "tipo": "inativo_30d",
    "canal": "whatsapp",
    "status": "pendente",
    "mensagem": None,
    "erro": None,
    "created_at": "2026-10-10T00:00:00Z",
    "sent_at": None,
}


def _mock_supabase_dispatch(rows, cliente=CLIENTE, automacao=None, template=None, cliente_existe=True):
    """Mock do supabase client para o motor de dispatch.

    Cadeias mockadas:
    - notificacoes_log select: .eq(status).eq(org_id?).order.limit.execute -> rows
    - clientes select: .eq(id).limit.execute -> [cliente] (ou [] se não existe)
    - automacoes select: .eq(org_id).eq(tipo).limit.execute -> [automacao] ou []
    - templates_whatsapp select: .eq(id).eq(org_id).limit.execute -> [template] ou []
    - notificacoes_log update: .update({}).eq(id).execute
    """
    m = MagicMock()
    updates = []

    def table(name):
        t = MagicMock()
        if name == "notificacoes_log":
            sel = t.select.return_value
            sel.eq.return_value.eq.return_value = sel.eq.return_value  # cadeia
            sel.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=rows)
            # caso sem org_id: .eq(status).order(...).limit(...).execute()
            sel.eq.return_value.order.return_value = sel.eq.return_value.order.return_value
            t.update.side_effect = lambda payload: _mk_update(t, payload, updates)
        elif name == "clientes":
            sel = t.select.return_value
            sel.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[cliente] if cliente_existe else []
            )
        elif name == "automacoes":
            sel = t.select.return_value
            sel.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[automacao] if automacao is not None else []
            )
        elif name == "templates_whatsapp":
            sel = t.select.return_value
            sel.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[template] if template is not None else []
            )
        return t

    def _mk_update(t, payload, updates):
        u = MagicMock()
        u.eq.return_value.execute.side_effect = lambda: updates.append((payload)) or MagicMock(data=[dict(payload)])
        return u

    m.table.side_effect = table
    m._updates = updates
    return m


# ============================================================
# 1. Interpolação de placeholders
# ============================================================

def test_interpolacao_nome_valor_placa():
    tpl = "Olá {{nome}}, {{valor}} até dia {{vencimento}}. Carro {{placa}}."
    out = _interpolarmensagem(tpl, CLIENTE)
    assert "João Silva" in out
    assert "R$ 1.500,00" in out
    assert "10" in out
    assert "ABC-1234" in out
    assert "{{" not in out


def test_interpolacao_placeholder_desconhecido_preservado():
    out = _interpolarmensagem("Olá {{nome}}, {{cidade}}?", CLIENTE)
    assert "João Silva" in out
    assert "{{cidade}}" in out


def test_interpolacao_case_insensitive_e_vazio():
    out = _interpolarmensagem("Olá {{NOME}} {{placa}}", {"nome": "Maria", "campos_custom": {}})
    assert out == "Olá Maria "


def test_formatar_brl():
    assert _formatar_brl(1500) == "R$ 1.500,00"
    assert _formatar_brl(0) == "R$ 0,00"
    assert _formatar_brl(None) == ""
    assert _formatar_brl("abc") == ""


def test_telefone_e164():
    assert _telefone_para_e164("11999998888") == "5511999998888"
    assert _telefone_para_e164("5511999998888") == "5511999998888"
    assert _telefone_para_e164("(11) 99999-8888") == "5511999998888"
    assert _telefone_para_e164("123") is None
    assert _telefone_para_e164("") is None


# ============================================================
# 2. Processar pendentes — success
# ============================================================

def test_processar_envia_e_atualiza_row():
    sb = _mock_supabase_dispatch(
        [ROW_PENDENTE],
        automacao={"template_id": "tpl-1"},
        template={"mensagem": "Oi {{nome}}!"},
    )
    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.enviar_whatsapp", return_value={"success": True, "message_id": "m1"}) as mock_send:
            res = processar_notificacoes_pendentes(ORG)
    assert res == {"processadas": 1, "enviadas": 1, "erros": 0}
    mock_send.assert_called_once()
    args = mock_send.call_args[0]
    assert args[0] == ORG
    assert args[1] == "5511999998888"
    assert "João Silva" in args[2]
    # update de row deve ter status enviado + sent_at
    upd = [u for u in sb._updates if u.get("status") == "enviado"]
    assert upd and upd[0].get("sent_at") and upd[0].get("mensagem")


# ============================================================
# 3. enviar_whatsapp falha -> erro
# ============================================================

def test_processar_erro_envio():
    sb = _mock_supabase_dispatch([ROW_PENDENTE])
    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.enviar_whatsapp", return_value={"success": False, "erro": "Erro ao enviar WhatsApp: falha"}):
            res = processar_notificacoes_pendentes(ORG)
    assert res == {"processadas": 1, "enviadas": 0, "erros": 1}
    upd = [u for u in sb._updates if u.get("status") == "erro"]
    assert upd and upd[0].get("erro") == "Erro ao enviar WhatsApp: falha"


# ============================================================
# 4. Sem integração WhatsApp -> erro amigável, sem crash
# ============================================================

def test_processar_sem_integracao_whatsapp():
    sb = _mock_supabase_dispatch([ROW_PENDENTE])
    # enviar_whatsapp REAL retornaria erro amigável; simulamos exatamente isso
    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.enviar_whatsapp", return_value={"success": False, "erro": "WhatsApp não configurado para esta organização"}):
            res = processar_notificacoes_pendentes(ORG)
    assert res == {"processadas": 1, "enviadas": 0, "erros": 1}
    upd = [u for u in sb._updates if u.get("status") == "erro"]
    assert upd and upd[0].get("erro") == "WhatsApp não configurado para esta organização"


def test_processar_cliente_nao_encontrado():
    sb = _mock_supabase_dispatch([ROW_PENDENTE], cliente_existe=False)
    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.enviar_whatsapp") as mock_send:
            res = processar_notificacoes_pendentes(ORG)
    mock_send.assert_not_called()
    assert res["erros"] == 1
    upd = [u for u in sb._updates if u.get("erro") == "Cliente não encontrado"]
    assert upd


def test_processar_telefone_invalido():
    cli = dict(CLIENTE, telefone="123")
    sb = _mock_supabase_dispatch([ROW_PENDENTE], cliente=cli)
    with patch("app.storage.get_supabase_client", return_value=sb):
        with patch("app.storage.enviar_whatsapp") as mock_send:
            res = processar_notificacoes_pendentes(ORG)
    mock_send.assert_not_called()
    upd = [u for u in sb._updates if u.get("erro") == "Telefone inválido para WhatsApp"]
    assert upd


def test_processar_sem_pendentes():
    sb = _mock_supabase_dispatch([])
    with patch("app.storage.get_supabase_client", return_value=sb):
        res = processar_notificacoes_pendentes(ORG)
    assert res == {"processadas": 0, "enviadas": 0, "erros": 0}


# ============================================================
# 5. Rotas — RBAC
# ============================================================

def test_processar_rota_sem_token_401():
    r = client.post(f"/api/notificacoes/processar?org_id={ORG}")
    assert r.status_code == 401


def test_processar_rota_membro_403():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", side_effect=ValueError("Usuário não é admin da organização")):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                r = client.post(
                    f"/api/notificacoes/processar?org_id={ORG}",
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 403


def test_processar_rota_admin_ok():
    sb = _mock_supabase_dispatch([])
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=sb):
            with patch("app.storage._verificar_admin", return_value=True):
                with patch("app.storage._get_default_org_id", return_value=ORG):
                    r = client.post(
                        f"/api/notificacoes/processar?org_id={ORG}",
                        headers={"Authorization": "Bearer fake_token"},
                    )
                    assert r.status_code == 200
                    data = r.json()
                    assert data["status"] == "ok"
                    assert data["notificacoes"] == {"processadas": 0, "enviadas": 0, "erros": 0}


# ============================================================
# 6. /api/automacoes/run com contadores de notificações
# ============================================================

def test_run_automacoes_admin_retorna_notificacoes():
    sb = _mock_supabase_dispatch([])
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage.get_supabase_client", return_value=sb):
            with patch("app.storage._verificar_admin", return_value=True):
                with patch("app.storage._get_default_org_id", return_value=ORG):
                    with patch("app.main.run_automacoes_manual", return_value={"status": "ok"}):
                        r = client.post(
                            "/api/automacoes/run",
                            headers={"Authorization": "Bearer fake_token"},
                        )
                        assert r.status_code == 200
                        data = r.json()
                        assert data["status"] == "ok"
                        assert "notificacoes" in data
                        assert data["notificacoes"]["processadas"] == 0
                        assert data["notificacoes"]["enviadas"] == 0
                        assert data["notificacoes"]["erros"] == 0


def test_run_automacoes_membro_403():
    with patch("app.main.get_supabase_client", return_value=_mock_supabase_auth()):
        with patch("app.storage._verificar_admin", side_effect=ValueError("Usuário não é admin da organização")):
            with patch("app.storage._get_default_org_id", return_value=ORG):
                r = client.post(
                    "/api/automacoes/run",
                    headers={"Authorization": "Bearer fake_token"},
                )
                assert r.status_code == 403
