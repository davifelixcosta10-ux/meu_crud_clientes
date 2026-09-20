# CONTEXTO DaviFlow — para Kimi K3

> Gerado 2026-09-20 por leitura completa do repo. Cole este arquivo como contexto inicial no Kimi K3.

## 1. O que é
**DaviFlow** — CRM multi-tenant "Gestão de clientes sem planilhas" para freelancers, clínicas, oficinas, dentistas e academias. Produção: `daviflow.vercel.app` + `daviflowgestoes.vercel.app`. Repo: `meu_crud_clientes`. Estado: `main@56a5180` estável, Fases 1, 2A/2B/2C, 3A/3B/3C, 4A/4B/4C ✅. 3D (Stripe) pausado.

## 2. Stack
- **Backend:** FastAPI 0.141.1, Python 3.12, `uvicorn`, `supabase>=2.30`, `slowapi`, `pydantic 2.13`, `sentry-sdk[fastapi]`
- **Frontend:** `dashboard.html` (2213 linhas) + `app.js` (5150 linhas, ~277KB) Vanilla JS + Tailwind CDN + Lucide + SortableJS 1.15.2 + PapaParse 5.4.1 + SheetJS xlsx 0.18.5 + Chart.js 4.4.1 lazy + `style.css` (625 linhas). Total ~8643 linhas / ~530KB.
- **DB:** Supabase Postgres + Auth + Storage (bucket privado `anexos`). RLS por `org_id`.
- **Deploy:** Vercel `gru1`, `api/index.py` (7 linhas, só `from app.main import app`), `vercel.json` com rewrites `/api/*` → index.py, headers CSP/HSTS/X-Frame-DENY/nosniff.

## 3. Estrutura
```
app/main.py (1476 linhas, 74 rotas) | app/models.py (1125 linhas, 54 modelos) | app/storage.py (2639 linhas, ~70 funções)
api/index.py (entry Vercel)
dashboard.html + app.js + style.css (SPA, sem build, root — NÃO mover)
index.html (landing 655 linhas) | privacidade.html | termos.html | 404.html
supabase/migrations/001_fase1.sql → 007_fase4a.sql (ordem obrigatória) + supabase_all.sql (674 linhas, fresh install) + archive/fix_*.sql (8 fixes já aplicados)
tests/test_health.py, test_rbac.py, test_org_isolation.py, test_vertical.py
.env.example | vercel.json | requirements.txt | plan.md | context.md | instructions.md
```

## 4. Backend — `app/main.py`
- **CORS:** `allow_credentials=False` (Bearer), origins `daviflow*.vercel.app` + localhost, methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Authorization,Content-Type,X-API-Key`.
- **Rate limit** (key anti-spoof `x-vercel-forwarded-for` > `x-real-ip`): signup 5/min, login 10/min, forgot/update-password 5/min, webhook zapier 10/min, clientes-public 20/min.
- **Auth `obter_user_id`:** Bearer ou cookie `df_token` httpOnly → `supabase.auth.get_user(token)` (valida assinatura, nunca aceita UUID direto). Sem token → 401.
- **Auth `obter_user_id_com_api_key`:** se `X-API-Key: davi_...` → HMAC-SHA256 com `API_KEY_PEPPER` + `compare_digest` via lookup `prefix`, senão fallback JWT.
- **Rotas (74):** `GET /api/health, /api` | `POST /api/auth/signup|login|forgot-password|update-password` | CRUD `/api/planos|etapas|atividades|tags` + `clientes/{id}/tags` + `/api/filtros` + `POST /api/clientes/import` | `GET /api/relatorios/conversao|receita|churn|ltv` | orgs: `GET/POST /api/orgs`, `GET membros, POST convites, DELETE org, DELETE membros/{uid}, PATCH org` | integrações CRUD + `POST /api/webhooks/zapier[?integracao_id|/{id}]` público + `calendar/auth-url|callback` mock | anexos `GET/POST /api/clientes/{id}/anexos`, `DELETE /api/anexos/{id}` | `GET/POST/DELETE /api/api-keys`, `GET /api/clientes-public` | verticais `GET/POST /api/verticais`, `GET/PATCH /api/orgs/{id}/vertical` | usuários `GET/PATCH /api/usuarios/me`, `POST alterar-senha`, `DELETE me`, `GET export` | templates CRUD | automações `GET`, `PATCH {id}`, `POST /run` (admin) | clientes `GET/POST/PATCH/DELETE`.
- **RBAC:** escrita em planos/etapas/tags/integrações/templates/anexos-delete/api-keys/vertical/automações exige `admin` da org → 403 membro.

## 5. Modelos — `app/models.py` (54)
Auth: `UserSignUp` (senha ≥8, blocklist), `UserLogin`, `TokenResponse`. `PlanoCreate/Update/Plano` (8 cores). `Cliente` leniente leitura / `ClienteCreate/Update` estrito (CPF módulo 11, RG 7-12, tel 10-15, `vencimento_dia` 1-31, `campos_custom` valida placa Mercosul, KM 0-1M, dente 1-32, CRM). `Etapa`, `Atividade` (6 tipos), `Tag`, `FiltroSalvo`, relatórios `Conversao/Receita/Churn/Ltv`, `Organizacao`, `ConviteCreate`, `Integracao`, `Anexo`, `ApiKey` (plain só na criação), `Vertical` (slug `custom_*`), `UsuarioMe`, `TemplateCreate` (`{{nome}}{{placa}}`), `Automacao` (`inativo_30d|vence_3d|sem_atividade_7d`).

## 6. Storage — `app/storage.py`
Singleton `get_supabase_client()` + `get_supabase_admin_client()`. Guards: `_validar_uuid`, `_verificar_membro` (nega cross-org), `_verificar_admin`, `_ensure_org_id` (auto-cria "Minha organização"), `_get_default_org_id`. `_COLUNAS_CLIENTE` 25 cols. Funções: auth, planos, clientes (conversão `"R$ 1.500,00"→float`), etapas, atividades, tags N:N, filtros, import bulk (auto-cria planos), relatórios calculados em Python, orgs (convite ~120 linhas com fallback RPC), webhook zapier (exige UUID), anexos (10MB, magic-bytes PDF/PNG/JPEG/GIF/WEBP/XLSX), api-keys (`davi_+token_urlsafe`), verticais, templates, `run_automacoes_manual` (rpc), usuários.

## 7. Frontend — `app.js` + `dashboard.html`
- **6 seções SPA** via `setSecao()` + `#hash` + `localStorage daviflow_secao`: `overview` (4 metric-cards), `clientes` (toolbar+tabela/cards), `kanban` (Sortable drag → PATCH etapa), `relatorios` (Chart.js lazy), `agenda` (timeline atividades), `config` (7 abas: Geral nome/empresa/vertical/tema, Org rename/membros/convite, Planos/Etapas/Tags inline, Notificações toggles+automacoes, Conta senha/export/deletar).
- **Globals:** `clientesCache, planosCache, etapasCache, tagsCache, atividadesCache, filtrosCache, orgsCache/currentOrgId, verticaisCache/currentVertical, templatesCache, integracoesCache/anexosCache/apiKeysCache, viewMode, secaoAtiva`.
- **Init:** `carregarOrgs→Verticais→VerticalOrg→Planos→Etapas→Tags→Filtros→Clientes→Integracoes→Templates` + `verificarStatusAPI` dupla + polling 15s.
- **Segurança FE:** `escaparHTML()` em toda interpolação, `data-*` dataset (anti-XSS), `csvSanitize` prefix `'`, `fetchAuth` Bearer, 401 → `/?login=true`.
- **Verticais (5 presets):** `geral, hospital, lava_rapido_oficina/oficina, dentista, academia` + customs → `organizacoes.vertical` + `clientes.campos_custom jsonb` (`carros[]` multi-veículo, convenio/leito, dente, treino). `aplicarVertical()` renomeia labels, `adicionarCarro()`.
- **WhatsApp:** `templates_whatsapp`, `wa.me/55{{telefone}}?text=` com `{{nome}}{{placa}}{{modelo}}{{dente}}`.
- **Automações:** `Config→Notificações`, `carregarAutomacoes()` + `▶️ Rodar agora` (só admin).
- **19 modais** padrão `modal-container+modal-box`: criar, editar, deletar, detalhes, planos, etapas, atividade, tags, filtros, import, org, convite, gerenciar-org, vertical, apikeys, templates, integrações, logout.
- **Libs CDN:** `cdn.tailwindcss.com`, `unpkg lucide`, `jsdelivr sortablejs+papaparse+xlsx` com SRI, Chart.js lazy, Google Fonts Inter.

## 8. Banco — `supabase/migrations/`
`001_fase1` (etapas, atividades, tags, cliente_tags, filtros + cols clientes) → `002_2b_templates` (templates_whatsapp, plano_id bigint) → `003_2c_automacoes` (automacoes + `run_automacoes()` + `pg_cron '0 9 * * *'` 06h SP) → `004_3a_org` (organizacoes, membros, org_id em 5 tabelas, RLS org) → `005_3b_integracoes` → `006_3c_anexos` (bucket + anexos + api_keys) → `007_4a_verticals` (verticais 5 seeds + `organizacoes.vertical` + `campos_custom jsonb+GIN`). ~15 tabelas. Funções `is_org_member/is_org_admin` SECURITY DEFINER (fix `42P17` recursion + `REVOKE anon` F21). `run_automacoes()` idempotente 24h. `archive/` 8 fixes já aplicados — não reaplicar.

### Tabelas (~15)
`clientes` (id bigint + `etapa_id, org_id, campos_custom, plano, vencimento`), `planos` (+`org_id`), `etapas`, `atividades`, `tags` + `cliente_tags`, `filtros_salvos`, `templates_whatsapp`, `automacoes` (UNIQUE org+tipo), `organizacoes` (+`vertical`), `membros` (PK org+user, papel admin/membro), `integracoes`, `anexos`, `api_keys`, `verticais`.

## 9. Env / comandos
Env Vercel: `SUPABASE_URL`, `SUPABASE_KEY` (`sb_secret_...` service_role, não anon), `SUPABASE_SERVICE_ROLE_KEY` (fallback), `SITE_URL`, `ALLOWED_ORIGINS`, `API_KEY_PEPPER`. Local: `python3 -m venv venv && pip install -r requirements.txt && cp .env.example .env && uvicorn app.main:app --reload`. Testes: `python3 -m py_compile app/main.py app/storage.py && node --check app.js`.

## 10. Regras duras (não quebrar)
- Nunca commit direto em `main` — branch `feat/*` → Preview Vercel → `merge --no-ff`.
- Não mover `vercel.json, api/index.py, dashboard.html, app.js, style.css` do root.
- Não reintroduzir `load_dotenv("data/arquivos.env")`, não expor `str(e)` em `detail`, não decodificar JWT via base64.
- Backend Pydantic/RLS só muda com pedido explícito.
- Docs fonte: `README.md`, `plan.md`, `context.md`, `instructions.md`, `supabase/README.md`.
