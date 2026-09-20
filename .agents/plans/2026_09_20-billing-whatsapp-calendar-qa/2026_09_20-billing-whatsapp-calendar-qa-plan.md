---
name: "DaviFlow Billing + WhatsApp + Calendar + QA"
description: "Implement high-priority roadmap: Stripe billing (Fase 3D), automatic WhatsApp automations (Evolution/Meta), real Google Calendar integration, and QA consolidation. No email reminders (Resend requires custom domain)."
created_at: "2026-09-20T00:00:00Z"

created_by:
  tool: "OpenCode"
  model:
    name: "moonshotai/kimi-k3"
    version: "k3"
    reasoning_effort: "medium"
---

# DaviFlow - High Priority: Billing + WhatsApp + Calendar + QA

## Goal

Ship the four high-priority items from the roadmap: Stripe subscription billing (Fase 3D) with checkout + webhook, automatic WhatsApp dispatch for automations via Evolution/Meta API, real Google Calendar OAuth sync, and a QA consolidation pass. Email reminders are explicitly out (Resend requires a custom domain).

## Context

Project docs and conventions to follow:

- `instructions.md`: never commit to `main`, one branch + one Vercel Preview per phase, incremental slices, backend logic/RLS only changes when explicitly requested.
- `plan.md`, `context.md`, `README.md`: update at the end of each phase.
- `CONTEXTO_KIMI.md`: architecture snapshot (74 routes, 54 models, ~70 storage functions, 7 migrations).
- Backend: `app/main.py` (FastAPI 74 routes, slowapi rate limits, JWT via `supabase.auth.get_user`), `app/models.py` (Pydantic), `app/storage.py` (org-scoped helper: `_verificar_membro`, `_verificar_admin`, `_ensure_org_id`), `api/index.py` (Vercel entry).
- DB: `supabase/migrations/001..007` (run in order as service_role), `integracoes` table has `config jsonb` (reusable for WhatsApp/Calendar credentials), `automacoes` table + `run_automacoes()` SECURITY DEFINER + `pg_cron` 09:00 UTC.
- Frontend: `dashboard.html` + `app.js` (neo-brutalist monochrome design), `Config -> Geral/Notificacoes/Conta` tabs.
- Tests: `tests/test_health.py`, `test_rbac.py`, `test_org_isolation.py`, `test_vertical.py`, verification command: `python3 -m py_compile app/main.py app/storage.py && node --check app.js && python3 -m pytest tests/ -q`.

User decisions (2026-09-20):

- Payments: Stripe (original Fase 3D).
- Email reminders: skipped (no custom domain for Resend).
- WhatsApp: automatic send via Evolution API (self-hosted) or Meta Cloud API.
- Granularity: 6+ phases.

Preconditions (user-side, external):

- Stripe account active + env vars on Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
- WhatsApp instance reachable: `WHATSAPP_BASE_URL`, provider token (stored per-org in `integracoes.config`).
- Google OAuth app: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

New env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Public contracts

New endpoints:

- `POST /api/billing/webhook` (public, Stripe signature-verified, idempotent by `session_id`)
- `GET /api/billing/status?org_id`
- `POST /api/billing/checkout` (admin)
- `POST /api/whatsapp/enviar` (admin, 10/min)
- `GET /api/integracoes/calendar/auth-url` (real OAuth)
- `GET /api/integracoes/calendar/callback` (real token exchange)
- `POST /api/integracoes/calendar/sync` (admin)

New models: `Pagamento`, `StripeEvent`, `BillingStatusResponse`, `CheckoutRequest`, `WhatsAppEnvioRequest`, `WhatsAppEnvioResponse`, `NotificacaoLog`.

New tables:

- `pagamentos(id uuid pk, org_id uuid, user_id uuid, stripe_session_id text unique, stripe_customer_id text, status text, valor numeric, created_at timestamptz default now())` with RLS `is_org_member`.
- `notificacoes_log(id uuid pk, org_id uuid, cliente_id bigint, tipo text, canal text, status text, erro text, created_at timestamptz default now())` with RLS `is_org_member`.

Changed columns: `automacoes` + `canal text default 'interno' check (canal in ('interno','whatsapp'))`, `automacoes` + `template_id bigint references templates_whatsapp(id)`.

Test suites: `tests/test_billing.py`, `tests/test_whatsapp.py`, `tests/test_calendar.py`, plus expanded `test_rbac.py` and `test_org_isolation.py`.

## Phases

### Phase 1: Stripe foundation (schema + webhook + status)

Description: database + webhook receiver + status endpoint, fully functional but gracefully disabled when Stripe env vars are missing.

- [ ] Migration `supabase/migrations/008_fase3d_billing.sql`: `pagamentos` table + RLS + indexes.
- [ ] Models `Pagamento`, `StripeEvent`, `BillingStatusResponse` in `app/models.py`.
- [ ] `POST /api/billing/webhook` in `app/main.py`: verify `stripe.Webhook.construct_event` signature, idempotent upsert by `stripe_session_id`, map `checkout.session.completed` -> `active`, `customer.subscription.deleted` -> `canceled`, `invoice.payment_failed` -> `past_due`. Return 503 with friendly message if `STRIPE_SECRET_KEY` missing.
- [ ] `GET /api/billing/status?org_id` (member read) returning `{ plano: 'free'|'pro', status, stripe_customer_id? }`.
- [ ] Storage helpers: `registrar_pagamento`, `get_billing_status`.
- [ ] Tests `tests/test_billing.py`: webhook rejects bad signature, status requires auth, webhook happy path with mocked Stripe.
- [ ] Update `plan.md`/`context.md`/`README.md` env var docs.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`py_compile` + `node --check` + `pytest -q`). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: Stripe checkout + Conta UI

Description: user clicks "Assinar" and ends with an active subscription badge.

- [ ] `POST /api/billing/checkout` (admin): creates Stripe Checkout Session (subscription mode, `STRIPE_PRICE_ID`, `client_reference_id=org_id`, success/cancel URLs), returns `{ checkout_url }`.
- [ ] `Config -> Conta`: new "Assinatura" block - status badge (active: `bg-black text-white`; inactive: outline black), "Assinar DaviFlow" button -> `checkout_url`, "Gerenciar" (Stripe customer portal link, optional).
- [ ] Webhook from Phase 1 now flips the badge live.
- [ ] Neo-brutalist styling for all new UI (border-2 black, rounded-none, font-mono for values).
- [ ] Tests: mocked `stripe.checkout.Session.create` returns URL; 403 for member role.
- [ ] Verify the changes (per verification command). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed to the next phase until the user explicitly asks.

### Phase 3: WhatsApp configuration + manual send

Description: org configures Evolution/Meta credentials and can send a test message; foundation for automation.

- [ ] Reuse `integracoes` with `tipo='whatsapp'`, `config={provider, base_url, instance, token, phone_number_id?}`.
- [ ] Storage: `enviar_whatsapp(org_id, telefone_e164, mensagem)` via `httpx` (timeout 10s, generic errors, never log token).
- [ ] `POST /api/whatsapp/enviar` (admin, 10/min rate limit, validates phone `^55\d{10,11}$`).
- [ ] UI: `Config -> Geral` new "WhatsApp" section (provider select, base_url, instance, token password field, "Salvar", "Testar conexao", "Enviar teste").
- [ ] Models: `WhatsAppEnvioRequest`, `WhatsAppEnvioResponse`.
- [ ] Tests `tests/test_whatsapp.py`: mocked httpx success/failure, 403 member, invalid phone 422.
- [ ] Verify the changes (per verification command). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed to the next phase until the user explicitly asks.

### Phase 4: Automations dispatch WhatsApp automatically

Description: `run_automacoes()` and manual "Rodar agora" dispatch WhatsApp messages with templates, with dedupe log.

- [ ] Migration `009_fase_whatsapp_automacoes.sql`: `automacoes.canal` + `automacoes.template_id` + `notificacoes_log` table + RLS.
- [ ] Backend: when `canal='whatsapp'`, resolve org `templates_whatsapp` (fallback default per tipo), interpolate `{{nome}}/{{placa}}/{{valor}}/{{vencimento}}`, call `enviar_whatsapp`, insert `notificacoes_log` row (status sent/erro), skip if log entry <24h for same cliente+tipo.
- [ ] `Config -> Notificacoes`: per-automation channel select (`Interno` / `Interno + WhatsApp`) + template picker (filtered by vertical).
- [ ] Tests: run automations with mocked sender -> log rows created, no duplicates within 24h, missing WhatsApp config falls back to internal-only.
- [ ] Verify the changes (per verification command). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed to the next phase until the user explicitly asks.

### Phase 5: Real Google Calendar

Description: replace mock OAuth with real Google OAuth2 and activity->event sync.

- [ ] `GET /api/integracoes/calendar/auth-url`: real Google consent URL (scope `calendar.events`, state signed with org_id).
- [ ] `GET /api/integracoes/calendar/callback`: exchange code, store `access_token`/`refresh_token`/expiry in `integracoes.config` (never returned by GET endpoints).
- [ ] Storage: `calendar_criar_evento(org_id, atividade)` called from `POST /api/atividades` when calendar integration active; failure must not block activity creation (log only).
- [ ] `POST /api/integracoes/calendar/sync` (admin): push unsynced activities.
- [ ] UI: Integracoes modal "Google Calendar" button becomes real connect/disconnect with status.
- [ ] Tests `tests/test_calendar.py`: mocked Google token + events endpoints, failure tolerance, token refresh path.
- [ ] Verify the changes (per verification command). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed to the next phase until the user explicitly asks.

### Phase 6: QA consolidation

Description: harden tests and docs; no new features.

- [ ] Expand `tests/test_rbac.py`: member 403 on planos/etapas/tags/templates/automacoes/api-keys/vertical/billing/whatsapp.
- [ ] Expand `tests/test_org_isolation.py`: cross-org GET/PATCH on clientes/billing/notificacoes returns 403.
- [ ] Add auth-wall smoke: every protected route returns 401 without token (parameterized).
- [ ] `test_vertical.py`: `campos_custom` roundtrip (carros Mercosul plate regex).
- [ ] Verify: `py_compile` + `node --check app.js` + `pytest -q` all green; no leftover `console.log` in prod paths.
- [ ] Update `plan.md`, `context.md`, `README.md` with delivered phases.
- [ ] Verify the changes (per verification command). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages. Do NOT proceed further without user request.

## Next step

Implement Phase 1 (Stripe foundation: schema + webhook + status), pending Stripe account/env vars from the user.

Plan created by 🐢 💨 (Turbotuga™, [Codely](https://codely.com)'s mascot).
