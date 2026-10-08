# DaviFlow — Contexto do Projeto (para agentes)

> CRM multi-tenant open-source: "Gestão de clientes sem planilhas" para freelancers, clínicas, oficinas, dentistas e academias.
> Produção: `daviflow.vercel.app` + `daviflowgestoes.vercel.app` · Repo GitHub: `davifelixcosta10-ux/meu_crud_clientes`
> Snapshot: 2026-10-07, `main@f0a35cf`.

## Stack

- **Backend:** FastAPI 0.141 + Python 3.12 — `app/main.py` (55+ rotas), `app/models.py` (Pydantic), `app/storage.py` (CRUD org-based). Rate limiting `slowapi`, JWT via `supabase.auth.get_user` + cookie httpOnly `df_token`, `X-API-Key` HMAC.
- **Frontend:** SPA vanilla JS **sem build** — `dashboard.html` + `app.js` (~290KB) + `style.css`. Tailwind via CDN, Lucide, SortableJS, SheetJS, Chart.js 4.4.1 (lazy).
- **DB:** Supabase Postgres + Auth + Storage (bucket privado `anexos`). RLS por `org_id`, `is_org_member` SECURITY DEFINER. Migrations em `supabase/migrations/001-008` (008 = billing Stripe).
- **Deploy:** Vercel `gru1` — `api/index.py` importa `app.main:app`; `vercel.json` faz rewrite `/api/*` + headers CSP/HSTS.

## Estado das fases (2026-10-07)

| Fase | Status |
|---|---|
| 1A-E, 2A-1..4, 2B, 2C, 3A-1/2, 3B, 3C, 4A, 4B, 4C | ✅ mergeado na `main` |
| 3D-1 Stripe fundação (migration 008, webhook, status) | ✅ mergeado — `feat/fase3d-billing-fundacao` |
| 3D-2 Checkout + UI Conta | ✅ mergeado — `feat/fase2-checkout-conta-ui` |
| Fase 3 WhatsApp (config + envio manual) | ✅ mergeado — `feat/fase3-whatsapp-config` |
| Fase 4 WhatsApp automático (`notificacoes_log`, templates, dedupe 24h) | ⬜ próxima |
| Fase 5 Google Calendar OAuth real | ⬜ |
| Fase 6 Consolidação QA | ⬜ |

Plano detalhado: `.agents/plans/2026_09_20-billing-whatsapp-calendar-qa/2026_09_20-billing-whatsapp-calendar-qa-plan.md` (fonte da verdade das fases, em inglês por convenção).
Histórico/decisões: `plan.md`, `context.md`, `CONTEXTO_KIMI.md` (snapshot de arquitetura 74 rotas/54 modelos).

## Design system — Neo-Brutalista Monocromático (obrigatório em todo UI novo)

- **60-30-10:** fundo `zinc-50` (#fafafa) / superfícies brancas; estrutura `zinc-800`; destaque/CTA **preto puro**. Dark: `zinc-950/900` + accent branco.
- **Zero vibecode:** `rounded-none` em tudo (exceção: dots circulares pequenos e avatares), sem blur, sem gradientes, sem sombras suaves.
- **Bordas:** estruturais `border-2 border-black`; internas `border-b border-zinc-200/300`; sempre `box-box` com borda grossa.
- **Sombras:** apenas duras offset — `shadow-[4px_4px_0_0_#000]`, `shadow-[8px_8px_0_0_#000]`.
- **Tipografia:** `font-mono` em números, contadores, valores monetários, %, IDs, datas, CNPJ/telefone.
- **Status:** Ativo → chip `bg-black text-white`; Inativo → `border border-black text-zinc-600 bg-white`.
- `MAPA_CORES_PLANO` (app.js) é rampa em escala de cinza; as 8 chaves de cor (`indigo/cyan/...`) são **dados gravados no banco** — nunca renomear.
- Color-dots do picker de plano/etapa/tag mantêm cores (é o seletor; o badge resultante é cinza).

## Fluxo de Git (obrigatório)

1. **Nunca commitar direto em `main`.** Branch `feat/<nome>` ou `fix/<nome>` a partir de `main` atualizada.
2. Push da branch → Vercel gera **Preview** → testar no link Preview → aprovação → `git merge --no-ff` na `main`.
3. Pedaços pequenos: uma sub-feature por branch (lição Fase 2A). Nunca monolito.
4. Ao fim de cada fase: atualizar `plan.md` e `context.md`; marcar ✅ no plano.

## Verificação antes de commit (obrigatória)

```bash
python3 -m py_compile app/main.py app/storage.py app/models.py
node --check app.js
python3 -m pytest tests/ -q
```

Ambiente: `python3 -m venv venv && venv/bin/pip install -r requirements.txt pytest` (venv não é versionado — `.gitignore`).

## Env vars (Vercel)

`SUPABASE_URL` + `SUPABASE_KEY` (service_role) e `SITE_URL`, `ALLOWED_ORIGINS` são obrigatórias. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` (Fase 3D; sem elas o webhook responde 503 amigável). `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` (Fase 5). `API_KEY_PEPPER` (HMAC api_keys), `SENTRY_DSN` opcionais.

## Multi-agentes (como este repo usa omp)

- **Uma sessão omp na raiz** do repo coordena. Ela NÃO precisa de worktrees para trabalho paralelo: os subagentes nativos (`task`) rodam no mesmo checkout e isolam por escopo de tarefa.
- **Worktrees** (`git worktree add ../DaviFlow-<branch> <branch>`) apenas quando dois agentes precisam editar **os mesmos arquivos** simultaneamente — ex: `app.js` em duas fases ao vivo. Ao terminar: `git worktree remove` + merge da branch.
- **Subagentes omp** (dispatch via `task`): `scout` para mapeamento read-only do código, `task` para fatias autocontidas (uma fase/pedaço por task), `reviewer` para revisão de PR antes do merge, `security-reviewer` para auditoria de rotas novas. Paralelize fatias independentes no mesmo `tasks[]` batch.
- **Branch por subagente:** cada fatia = 1 branch `feat/*` própria. Merge só após Preview aprovado.
- Skills/hooks locais em `.omp/` (nativo, prioridade máxima); o omp também lê `AGENTS.md` da raiz e `instructions.md` não — manter este arquivo como fonte única e apontar os demais para cá quando defasados.
