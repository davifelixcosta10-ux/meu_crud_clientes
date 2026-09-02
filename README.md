# DaviFlow — Gestão de Clientes sem Planilhas

Painel em `daviflow.vercel.app` + `daviflowgestoes.vercel.app` — FastAPI + Supabase + Vanilla JS + Tailwind.

## Stack
- **Backend:** FastAPI 0.141, Python 3.12, Supabase (Postgres + Auth + Storage), `uvicorn`
- **Frontend:** `dashboard.html` + `app.js` (Vanilla) + Tailwind CDN + Lucide + SortableJS + SheetJS + Chart.js 4.4.1
- **Deploy:** Vercel `gru1`, `api/index.py` (rewrites em `vercel.json`)

## Quick Start
```bash
git clone https://github.com/davifelixcosta10-ux/meu_crud_clientes.git
cd meu_crud_clientes
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # preencha SUPABASE_URL, SUPABASE_KEY (service_role sb_secret_...), SITE_URL
# Supabase SQL Editor → rode em ordem supabase/migrations/001_*.sql → 007_*.sql (service_role)
# Se já tem dados, rode supabase/archive/fix_*.sql conforme necessário (is_org_member, planos_org, etc)
uvicorn app.main:app --reload  # http://127.0.0.1:8000/docs
# Live Server em dashboard.html → IS_LOCAL demo
```

Env Vars (Vercel → Settings → Environment Variables):
- `SUPABASE_URL` — `https://xxx.supabase.co`
- `SUPABASE_KEY` — `sb_secret_...` (service_role, não anon)
- `SUPABASE_SERVICE_ROLE_KEY` — opcional, fallback para `SUPABASE_KEY`
- `SITE_URL` — `https://daviflow.vercel.app`
- `ALLOWED_ORIGINS` — `https://daviflow.vercel.app,https://daviflowgestoes.vercel.app`
- `API_KEY_PEPPER` — segredo para HMAC de `api_keys` (opcional)

## Estrutura
- `app/` — `main.py` (39+ rotas), `models.py`, `storage.py` (supabase singleton + RLS org-based)
- `api/index.py` — Vercel entry (`from app.main import app`)
- `dashboard.html` + `app.js` + `style.css` — SPA sem build (6 seções Vercel-style: Overview|Clientes|Kanban|Relatórios|Agenda|Config)
- `supabase/migrations/` — 001_fase1 → 007_fase4a (ordem de execução), `supabase/archive/` — fixes já aplicados
- `data/arquivos.env` — **gitignored**, segredos locais

## Fase Atual
`main@56a5180` — Fase 1 ✅, 2A (4 relatórios) ✅, 3A-2 (permissões) ✅, 3B (Calendar/Zapier) ✅, 3C (Anexos/API Keys) ✅, 4A (Verticals) ✅, 4B (Sidebar) ✅, 4C (Settings 7 abas) ✅, 2B (WhatsApp Templates) ✅, 2C (Automações pg_cron) ✅. 3D (Stripe) pausado.

## Branch Workflow
`instructions.md:6` + `~/.opencode/skills/instrucoes-gerais/SKILL.md` — nunca direto em `main`; `git checkout -b feat/xyz` → `push -u origin` → Preview Vercel → `merge --no-ff` após validar.

## Testes
```bash
python3 -m py_compile app/main.py app/storage.py
node --check app.js
# TestClient (exemplo em context.md)
```

## Licença
Privado — DaviFlow Gestões.
