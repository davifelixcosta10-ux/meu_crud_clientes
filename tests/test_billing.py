from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import sys
from app.main import app

client = TestClient(app)

ORG = "00000000-0000-0000-0000-000000000000"


def _fake_stripe(event=None, raise_error=False):
    """Injeta módulo stripe falso em sys.modules (evita dependência real no teste)."""
    fake = MagicMock()
    if raise_error:
        fake.Webhook.construct_event.side_effect = ValueError("bad signature")
    else:
        fake.Webhook.construct_event.return_value = event
    return fake


def test_billing_status_requires_auth():
    r = client.get("/api/billing/status")
    assert r.status_code == 401


def test_webhook_not_configured_returns_503():
    with patch("app.main.STRIPE_SECRET_KEY", None), patch("app.main.STRIPE_WEBHOOK_SECRET", None):
        r = client.post("/api/billing/webhook", content=b"{}")
        assert r.status_code == 503


def test_webhook_bad_signature_rejected():
    with patch("app.main.STRIPE_SECRET_KEY", "sk_test"), patch("app.main.STRIPE_WEBHOOK_SECRET", "whsec_test"):
        sys.modules["stripe"] = _fake_stripe(raise_error=True)
        try:
            r = client.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "bad"})
            assert r.status_code == 400
        finally:
            sys.modules.pop("stripe", None)


def test_webhook_checkout_completed_registra_pagamento():
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_test_123",
            "client_reference_id": ORG,
            "customer": "cus_123",
            "subscription": "sub_123",
            "amount_total": 4990,
            "currency": "brl",
            "metadata": {"user_id": "user-1"},
        }},
    }
    with patch("app.main.STRIPE_SECRET_KEY", "sk_test"), patch("app.main.STRIPE_WEBHOOK_SECRET", "whsec_test"):
        sys.modules["stripe"] = _fake_stripe(event=event)
        try:
            with patch("app.main.registrar_pagamento", return_value={"id": "pag-1"}) as mock_reg:
                r = client.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=abc"})
                assert r.status_code == 200
                assert r.json()["status"] == "ok"
                mock_reg.assert_called_once()
                kwargs = mock_reg.call_args.kwargs
                assert kwargs["org_id"] == ORG
                assert kwargs["status_pag"] == "active"
                assert kwargs["valor"] == 49.9
        finally:
            sys.modules.pop("stripe", None)


def test_webhook_session_sem_org_ignorada():
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_test_999", "client_reference_id": None}},
    }
    with patch("app.main.STRIPE_SECRET_KEY", "sk_test"), patch("app.main.STRIPE_WEBHOOK_SECRET", "whsec_test"):
        sys.modules["stripe"] = _fake_stripe(event=event)
        try:
            with patch("app.main.registrar_pagamento") as mock_reg:
                r = client.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=abc"})
                assert r.status_code == 200
                assert r.json()["status"] == "ignorado"
                mock_reg.assert_not_called()
        finally:
            sys.modules.pop("stripe", None)


def test_webhook_subscription_deleted():
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_123"}},
    }
    with patch("app.main.STRIPE_SECRET_KEY", "sk_test"), patch("app.main.STRIPE_WEBHOOK_SECRET", "whsec_test"):
        sys.modules["stripe"] = _fake_stripe(event=event)
        try:
            with patch("app.main.atualizar_pagamento_status_por_customer", return_value=1) as mock_upd:
                r = client.post("/api/billing/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=abc"})
                assert r.status_code == 200
                mock_upd.assert_called_once_with("cus_123", "canceled")
        finally:
            sys.modules.pop("stripe", None)
