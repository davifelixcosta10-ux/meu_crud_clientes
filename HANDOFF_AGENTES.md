# DaviFlow — Handoff para Time de Agentes de IA

> Documento consolidado: **o que já foi feito** e **o que será feito**, com as regras que qualquer agente deve seguir. Gerado em 2026-09-20.
> Contexto de arquitetura detalhado: ler também `CONTEXTO_KIMI.md` (mesma raiz).

---

## 1. O que é o DaviFlow (resumo)

CRM multi-tenant open-source para freelancers, clínicas, oficinas, dentistas e academias. Produção: `daviflow.vercel.app` + `daviflowgestoes.vercel.app`. Repositório: `davifelixcosta10-ux/meu_crud_clientes`.

- **Backend:** FastAPI 0.141 + Python 3.12 + Supabase (Postgres/Auth/Storage) (`app/main.py`, `app/models.py`, `app/storage.py`)
- **Frontend:** SPA vanilla JS sem build (`dashboard.html` + `app.js` + `style.css`), Tailwind via CDN
- **Deploy:** Vercel `gru1` (`api/index.py` → `app.main:app`)
- **Estado na `main`:** `main@5637fc8`

---

## 2. O que JÁ foi feito (sessões recentes)

### 2.1 Tema Neo-Brutalista Monocromático (✅ merged em `main@9ad5981`, 2026-09-20)

Refatoração visual **completa** (frontend inteiro) para estética neo-brutalista monocromática. **Nenhuma lógica foi alterada** (ids, `data-*`, handlers, integrações Supabase intactos).

Regras adotadas (vale para TODO código visual novo):

- **60-30-10:** fundo `zinc-50` (#fafafa) / superfícies brancas; estrutura e divisórias `zinc-800`; destaque/CTAs **preto puro** (#000). Dark mode: `zinc-950/900` com accent branco.
- **Zero vibecode:** `rounded-none` em tudo (exceto dots circulares pequenos e avatares), sem blur, sem gradientes, sem sombras suaves.
- **Bordas:** estruturais `border-2 border-black`; internas `border-b border-zinc-200/300`. Sempre `box-border` em blocos com borda grossa.
- **Sombras:** apenas duras offset — `shadow-[4px_4px_0_0_#000]`, `shadow-[8px_8px_0_0_#000]` (dark: `rgba(255,255,255,0.25)`).
- **Tipografia:** `font-mono` em números, contadores, valores monetários, porcentagens, IDs, datas e CNPJ/telefone.
- **Status:** Ativo → chip `bg-black text-white`; Inativo → `border border-black text-zinc-600 bg-white`.
- Arquivos tocados: `index.html`, `dashboard.html`, `app.js`, `style.css`, `privacidade.html`, `termos.html`, `404.html`.
- `MAPA_CORES_PLANO` (app.js) agora é uma **rampa em escala de cinza** (as 8 chaves `indigo/cyan/emerald/amber/rose/purple/slate/orange` permanecem — são chaves de dados gravadas no banco). Gráficos Chart.js na rampa `#000 → #e4e4e7`.
- `style.css`: tokens `--dash-*` monocromáticos, radius `0`, e bloco `html:not(.dark)` que neutraliza qualquer `indigo-*` residual.

Exceção consciente: os **color-dots do picker de plano/etapa/tag** em `dashboard.html` mantêm cores (são o seletor; o badge resultante é cinza).

### 2.2 Documentação de contexto

- `CONTEXTO_KIMI.md` — snapshot de arquitetura (74 rotas, 54 modelos, ~70 funções de storage, 7 migrations, convenções).
- Plano de trabalho aprovado: `.agents/plans/2026_09_20-billing-whatsapp-calendar-qa/2026_09_20-billing-whatsapp-calendar-qa-plan.md` (fonte da verdade das próximas fases; conteúdo em inglês por convenção da skill).

### 2.3 Fase 3D-1 — Stripe fundação (🟡 branch `feat/fase3d-billing-fundacao`, aguardando Preview/merge)

- Migration `supabase/migrations/008_fase3d_billing.sql`: tabela `pagamentos` (org/user, `stripe_session_id` único, status `pending|active|canceled|past_due`, valor/moeda) + RLS `is_org_member` (leitura membro, escrita só `service_role`).
- `POST /api/billing/webhook`: público, assinatura verificada com a lib `stripe`, idempotente por `stripe_session_id`, mapeia `checkout.session.completed→active` / `customer.subscription.deleted→canceled` / `invoice.payment_failed→past_due`. Retorna **503 amigável** se `STRIPE_*` não estiver configurado.
- `GET /api/billing/status?org_id`: membro lê; responde `{ plano: free|pro, status, assinatura_ativa }` (funciona sem Stripe configurado).
- Storage: `registrar_pagamento` (upsert idempotente), `atualizar_pagamento_status_por_customer`, `get_billing_status`.
- Models: `Pagamento`, `BillingStatusResponse`, `CheckoutRequest` (este último adiantado p/ Fase 2).
- `requirements.txt` + `stripe`.
- Testes: `tests/test_billing.py` (6 casos). Suite completa: **15/15 OK** (venv local em `venv/` está quebrado por mudança de pasta; usar venv novo — ver §5).

---

## 3. O que SERÁ feito (plano aprovado)

Ordem das fases (cada uma: branch `feat/*` → Preview Vercel → aprovação → `merge --no-ff` na `main`). Detalhes completos e checklist: o arquivo de plano em `.agents/plans/2026_09_20-billing-whatsapp-calendar-qa/`.

### Fase 2 — Stripe checkout + UI Conta
- `POST /api/billing/checkout` (admin): cria Checkout Session (subscription, `STRIPE_PRICE_ID`, `client_reference_id=org_id`) e retorna `checkout_url`.
- `Config → Conta`: bloco "Assinatura" neo-brutalista (badge ativo/inativo, botão Assinar/Gerenciar).
- `automacoes` testes: mock `stripe.checkout.Session.create`.
- **Depende de:** migration 008 aplicada + env vars `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` na Vercel.

### Fase 3 — WhatsApp: configuração + envio manual
- Reusa `integracoes` (`tipo='whatsapp'`, `config={provider: 'evolution'|'meta', base_url, instance, token}`).
- Storage `enviar_whatsapp(org_id, telefone_e164, mensagem)` via `httpx` (timeout 10s, nunca logar token).
- `POST /api/whatsapp/enviar` (admin, 10/min, valida `^55\d{10,11}$`).
- UI: `Config → Geral`, seção WhatsApp (salvar credenciais, "Testar conexão", "Enviar teste").
- Testes: `tests/test_whatsapp.py` (mock httpx, 403 membro, telefone inválido 422).

### Fase 4 — Automações → WhatsApp automático
- Migration `009_fase_whatsapp_automacoes.sql`: `automacoes.canal` (`interno|whatsapp`), `automacoes.template_id`, tabela `notificacoes_log` (RLS por org).
- `run_automacoes()`: quando `canal='whatsapp'`, resolve template da org, interpola `{{nome}}/{{placa}}/{{valor}}/{{vencimento}}`, envia e registra em `notificacoes_log`; **dedupe de 24h** por cliente+tipo.
- `Config → Notificações`: seletor de canal + template por automação.
- Fallback: sem config de WhatsApp, cai para atividade interna (comportamento atual).

### Fase 5 — Google Calendar real
- OAuth real: `GET /api/integracoes/calendar/auth-url` (consent URL com state assinado) + `GET /api/integracoes/calendar/callback` (troca code, salva tokens em `integracoes.config` — nunca retornados em GET).
- Sync: `POST /api/atividades` → se integração ativa, cria evento no Google (falha não bloqueia criação). `POST /api/integracoes/calendar/sync` manual (admin).
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Testes: `tests/test_calendar.py` (mocks Google).

### Fase 6 — Consolidação QA
- Ampliar `test_rbac.py` (membro 403 em todas rotas de escrita), `test_org_isolation.py` (cross-org), `test_vertical.py` (roundtrip `campos_custom`, placa Mercosul), smoke 401 auth-wall em todas as rotas protegidas.
- Gate final: `py_compile` + `node --check` + `pytest -q` verdes; zero `console.log` em prod; docs atualizados.

### Fora de escopo (de propósito)
E-mail transacional (Resend exige domínio próprio — decidido pelo dono), Pix/Asaas/MercadoPago, portal do cliente, PWA, command palette, audit log.

---

## 4. Regras duras para qualquer agente

1. **Nunca commitar direto em `main`.** Branch `feat/<nome>` → push → Preview Vercel → aprovação → `merge --no-ff`.
2. **Não alterar lógica/auth/RLS sem pedido explícito.** Mudanças visuais mantêm ids, `data-*`, handlers e seletores.
3. Não mover do root: `vercel.json`, `api/index.py`, `dashboard.html`, `app.js`, `style.css`.
4. Não reintroduzir `load_dotenv("data/arquivos.env")`; não expor `str(e)` em `detail`; JWT só via `supabase.auth.get_user` (nunca base64).
5. Design visual novo: seguir §2.1 (neo-brutalista monocromático).
6. Migrations em `supabase/migrations/0NN_descricao.sql`, ordenadas; fixes pontuais em `supabase/archive/` (rodar como `service_role`).
7. Ao fim de cada fase: atualizar `plan.md` e `context.md`; marcar ✅ no plano.
8. Responder sempre em português.

## 5. Comandos de verificação (obrigatórios antes de commit)

```bash
python3 -m py_compile app/main.py app/storage.py app/models.py
node --check app.js
python3 -m pytest tests/ -q
```

⚠️ O `venv/` versionado está quebrado (caminho antigo `meu_crud_clientes`). Criar venv novo para testes, ex:
`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest`

## 6. Env vars (Vercel → Settings → Environment Variables)

| Var | Obrigatória | Uso |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_KEY` | sim | service_role (`sb_secret_...`), não anon |
| `SUPABASE_SERVICE_ROLE_KEY` | opcional | fallback |
| `SITE_URL` | sim | `https://daviflow.vercel.app` |
| `ALLOWED_ORIGINS` | sim | origens CORS separadas por vírgula |
| `API_KEY_PEPPER` | recomendado | HMAC das `api_keys` |
| `SENTRY_DSN` | opcional | observabilidade (SDK já instalado) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Fase 3D | sem elas, `/api/billing/webhook` responde 503 amigável |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Fase 5 | OAuth Calendar real |
