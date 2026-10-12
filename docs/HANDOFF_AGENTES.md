# DaviFlow — Handoff para Time de Agentes de IA

> Documento consolidado: **o que já foi feito** e **o que será feito**, com as regras que qualquer agente deve seguir.
> Atualizado em 2026-10-07 após migração de usuário (`davifelixcosta` → `davifc`), limpeza de worktrees e configuração nativa do omp.
> Contexto de arquitetura detalhado: `CONTEXTO_KIMI.md` (mesma raiz). Regras duras e design system: `.omp/AGENTS.md` + `.omp/RULES.md` (fonte de verdade atual — este arquivo é histórico).

---

## 1. O que é o DaviFlow (resumo)

CRM multi-tenant open-source para freelancers, clínicas, oficinas, dentistas e academias. Produção: `daviflow.vercel.app` + `daviflowgestoes.vercel.app`. Repositório: `davifelixcosta10-ux/meu_crud_clientes`.

- **Backend:** FastAPI 0.141 + Python 3.12 + Supabase (Postgres/Auth/Storage) (`app/main.py`, `app/models.py`, `app/storage.py`)
- **Frontend:** SPA vanilla JS sem build (`dashboard.html` + `app.js` + `style.css`), Tailwind via CDN
- **Deploy:** Vercel `gru1` (`api/index.py` → `app.main:app`)
- **Estado na `main`:** `main@4523016`

## 2. Estado real das fases (2026-10-07) — ✅ corrigido

> ⚠️ O snapshot de 2026-09-20 listava Fases 2 e 3 como pendentes. **Elas já foram mergeadas na `main`** (branches `feat/fase2-checkout-conta-ui` e `feat/fase3-whatsapp-config`). Worktrees legados (`wt-build/medio/scout`) foram removidos — os branches `build`/`medio`/`scout` continuam no repo, 100% mergeados.

| Fase | Status | Onde |
|---|---|---|
| 1A-E, 2A-1..4, 2B, 2C, 3A-1/2, 3B, 3C, 4A, 4B, 4C, Neo-Brutalista | ✅ mergeado | `main` |
| 3D-1 Stripe fundação (migration 008, webhook, `/api/billing/status`) | ✅ mergeado | `feat/fase3d-billing-fundacao` |
| 3D-2 Checkout + UI Conta (Assinatura em Config→Conta) | ✅ mergeado | `feat/fase2-checkout-conta-ui` |
| Fase 3 WhatsApp config + envio manual (`/api/whatsapp/enviar`) | ✅ mergeado | `feat/fase3-whatsapp-config` |
| **Fase 4 — WhatsApp automático** (`notificacoes_log`, templates, dedupe 24h, migration 009) | ✅ mergeado | `main` |
| Fase 5 — Google Calendar OAuth real | ✅ mergeado | `main` |
| Fase 6 — Consolidação QA | ⬜ **próxima** | — |

Plano detalhado (fonte da verdade das próximas fases): `.agents/plans/2026_09_20-billing-whatsapp-calendar-qa/2026_09_20-billing-whatsapp-calendar-qa-plan.md`.

## 3. O que SERÁ feito

### Fase 4 — Automações → WhatsApp automático
✅ Entregue (2026-10-10)
- Migration `009_fase_whatsapp_automacoes.sql`: `automacoes.canal` (`interno|whatsapp`), `automacoes.template_id`, tabela `notificacoes_log` (RLS por org).
- `run_automacoes()`: quando `canal='whatsapp'`, resolve template da org, interpola `{{nome}}/{{placa}}/{{valor}}/{{vencimento}}`, envia e registra em `notificacoes_log`; **dedupe de 24h** por cliente+tipo.
- `Config → Notificações`: seletor de canal + template por automação.
- Fallback: sem config de WhatsApp, cai para atividade interna (comportamento atual).
- **Depende de:** Fase 3 mergeada ✅; credenciais Evolution/Meta salvas na org.

### Fase 5 — Google Calendar real
✅ Implementada (`feat/fase5-calendar`, aguardando Preview)
- Migration `010_fase5_calendar.sql`: `atividades.google_event_id` (text) + índice por org.
- `app/storage.py` (seção FASE 5): `calendar_auth_url` (consent URL com state assinado HMAC via `API_KEY_PEPPER`), `calendar_callback` (troca code→tokens, upsert uma row calendar por org em `integracoes.config`), `calendar_get_access_token` (renova via refresh_token), `calendar_criar_evento` (silencioso, all-day se data sem hora, fuso -03:00 fixo), `calendar_sync_pendentes` (30 dias, limite 200, admin only).
- `app/main.py`: rotas reais no lugar dos mocks — `GET /api/integracoes/calendar/auth-url` (503 amigável sem env), `GET /api/integracoes/calendar/callback` (sem Depends; redirect `?calendar=ok|erro`), `POST /api/integracoes/calendar/sync` (5/min, admin). `POST /api/atividades` cria evento best-effort (nunca bloqueia 201).
- `listar_integracoes` sanitiza config (`token`/`access_token`/`refresh_token` nunca voltam em GET — vale para WhatsApp também).
- UI: card Google Calendar sem "em breve", botão "Sincronizar agora" (admin), status "Conectado" derivado de `integracoesCache`, toasts do callback.
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (obrigatórias), `GOOGLE_REDIRECT_URI` (opcional; deriva de `SITE_URL`). Sem elas → 503 amigável.
- Testes: `tests/test_calendar.py` (10 cenários: 503, auth-url real, state inválido, callback ok, tolerância a falha, sync admin/membro, sanitização, 401).

### Fase 6 — Consolidação QA
- Ampliar `test_rbac.py` (membro 403 em todas rotas de escrita), `test_org_isolation.py` (cross-org), `test_vertical.py` (roundtrip `campos_custom`, placa Mercosul), smoke 401 auth-wall em todas as rotas protegidas.
- Gate final: `py_compile` + `node --check` + `pytest -q` verdes; zero `console.log` em prod; docs atualizados.

### Fora de escopo (de propósito)
E-mail transacional (Resend exige domínio próprio — decidido pelo dono), Pix/Asaas/MercadoPago, portal do cliente, PWA, command palette, audit log.

## 4. Regras duras para qualquer agente

1. **Nunca commitar direto em `main`.** Branch `feat/<nome>` → push → Preview Vercel → aprovação → `merge --no-ff`.
2. **Não alterar lógica/auth/RLS sem pedido explícito.** Mudanças visuais mantêm ids, `data-*`, handlers e seletores.
3. Não mover do root: `vercel.json`, `api/index.py`, `dashboard.html`, `app.js`, `style.css`.
4. Não reintroduzir `load_dotenv("data/arquivos.env")`; não expor `str(e)` em `detail`; JWT só via `supabase.auth.get_user` (nunca base64).
5. Design visual novo: seguir `.omp/AGENTS.md` §design system (neo-brutalista monocromático).
6. Migrations em `supabase/migrations/0NN_descricao.sql`, ordenadas; fixes pontuais em `supabase/archive/` (rodar como `service_role`).
7. Ao fim de cada fase: atualizar `plan.md` e `context.md`; marcar ✅ no plano.
8. Responder sempre em português.

## 5. Comandos de verificação (obrigatórios antes de commit)

```bash
python3 -m py_compile app/main.py app/storage.py app/models.py
node --check app.js
venv/bin/python -m pytest tests/ -q
```

✅ 2026-10-07: venv reconstruído (`venv/`, Python 3.14) — **23/23 testes passando**. venv não é versionado.

## 6. Env vars (Vercel → Settings → Environment Variables)

| Var | Obrigatória | Uso |
|---|---|---|
| `SUPABASE_URL` | sim | URL do projeto Supabase |
| `SUPABASE_KEY` | sim | service_role (`sb_secret_...`), não anon |
| `SITE_URL` | sim | `https://daviflow.vercel.app` |
| `ALLOWED_ORIGINS` | sim | origens CORS separadas por vírgula |
| `API_KEY_PEPPER` | recomendado | HMAC das `api_keys` |
| `SENTRY_DSN` | opcional | observabilidade (SDK já instalado) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Fase 3D | sem elas, `/api/billing/webhook` responde 503 amigável |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Fase 5 | OAuth Calendar real |

## 7. Multi-agentes com omp (adicionado 2026-10-07)

- Config nativa em `.omp/` — carregada automaticamente em toda sessão omp na raiz do repo (prioridade máxima sobre `AGENTS.md`/`CLAUDE.md` soltos).
- **Subagentes do projeto** (`.omp/agents/`): `vertical-implementer` (implementa uma fatia num branch próprio), `qa-gate` (roda a bateria de verificação), `fase-reviewer` (revisa PR contra as regras duras).
- **Fluxo paralelo recomendado:** sessão principal planeja → despacha fatias independentes num batch `tasks[]` (uma fase-pedaço por task com `vertical-implementer`) → `qa-gate` ao final de cada uma → `fase-reviewer` antes do merge → dono aprova no Preview Vercel → `merge --no-ff`.
- **Worktrees só** se dois agentes forem editar os mesmos arquivos ao vivo (ex: `app.js` em duas fases simultâneas): `git worktree add ../DaviFlow-<branch> <branch>`; ao terminar `git worktree remove` + merge. Subagentes omp no mesmo checkout não precisam disso — o isolamento é por escopo de tarefa.
