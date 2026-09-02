# DaviFlow — Project Summary

## Overview
Full-stack CRM multi-tenant para freelancers, clínicas, oficinas, dentistas e academias. Em produção `daviflow.vercel.app` + `daviflowgestoes.vercel.app` (main@6e35f40) com Fase 1 ✅, 2A ✅, 2B ✅, 2C ✅, 3A-3C ✅, 4A-4C ✅. 8 fases incrementais (15 branches Preview) sem monolito.

**Tagline:** Gestão de clientes sem planilhas — organize cadastros, métricas, planos e vertical em um painel Vercel-style.

## Architecture
- **Backend:** FastAPI 0.141, Python 3.12, 55+ rotas, rate limiter `slowapi` (5/min signup, 10/min login, 10/min webhook), JWT `supabase.auth.get_user` + `X-API-Key` HMAC, `is_org_member` SECURITY DEFINER, `pg_cron` 06:00 SP
- **Frontend:** `dashboard.html` (SPA 6 seções sidebar) + Vanilla JS + Tailwind CDN + Lucide + SortableJS + SheetJS + Chart.js 4.4.1 + SRI `sha384` + CSP/HSTS
- **Database:** Supabase Postgres + Auth + Storage (`anexos` bucket) + RLS `org_id` (15 tabelas + `clientes.campos_custom jsonb`, `clientes.valor_plano numeric`)
- **Deployment:** Vercel `gru1`, `api/index.py` 1024MB, `vercel.json` headers `CSP/HSTS/X-Frame/nosniff`, `supabase/migrations 001-007` + `supabase_all.sql`

## Backend (app/)

### Structure
```
app/
  main.py       # 55+ rotas, limiter, CORS (Bearer sem credentials), JWT+Cookie httpOnly, F1-4C + 2B/2C
  models.py     # Plano, Cliente (campos_custom), Etapa, Atividade, Tag, Filtro, Relatorio*, Organizacao, Integracao, Anexo, ApiKey, Vertical, Template, Automacao, UsuarioMe
  storage.py    # singleton supabase + CRUD org-based (_validar_uuid/_verificar_membro/_verificar_admin) + is_org_member
supabase/migrations/  # 001_fase1.sql → 007_fase4a.sql (ordem) + supabase_all.sql
supabase/archive/     # fix_*.sql já aplicados (recursion, planos_org, security_anon)
```

### Key Models
- **Auth:** `UserSignUp` (8 chars, block common), `UserLogin`, `TokenResponse` (httpOnly cookie `df_token`), `AlterarSenhaRequest`, `UsuarioMe/Update`
- **Plano:** `PlanoCreate` (nome max 80), `Plano` (8 cores, `org_id`)
- **Cliente:** `Cliente` leniente leitura, `ClienteCreate` estrito (CPF módulo 11, RG 7-12, telefone 10-15), `ClienteUpdate` estrito (F14 fix), `campos_custom jsonb` (4A: carros[], convenio/leito, dente, treino), `etapa_id`, `valor_plano numeric`, `vencimento_dia`, `status_pagamento`
- **Etapa/Atividade/Tag/Filtro:** Fase 1A-C + `org_id`
- **Relatórios:** `RelatorioConversao/Receita/Churn/Ltv` (Fase 2A, por `org_id` + `periodo`)
- **Org:** `Organizacao` (nome, `vertical`, `owner_id`), `ConviteCreate`, `Membros papel admin/membro`
- **Integração:** `Integracao` (calendar/zapier/contaazul/webhook, `org_id`)
- **Anexo/ApiKey:** `Anexo` (cliente_id bigint, `path org/cliente/uuid`, `mime allowlist`), `ApiKeyCreate` (nome, `key_hash` HMAC pepper)
- **Vertical:** `Vertical` (geral/hospital/oficina/dentista/academia, `config_json`), `VerticalUpdate`
- **Template:** `TemplateCreate` (nome, mensagem `{{nome}}{{placa}}`, `plano_id bigint`, `etapa_id uuid`, `vertical`)
- **Automação:** `Automacao` (tipo inativo_30d/vence_3d/sem_atividade_7d, `ativo`)

### API Endpoints (55+)
| Method | Endpoint | Notes |
|---|---|---|
| GET /api/health, /api | Health |
| POST /api/auth/signup | 5/min, cria org `Minha organização` |
| POST /api/auth/login | 10/min, seta `httpOnly Secure SameSite Strict` cookie `df_token` + Bearer |
| POST /api/auth/forgot-password | 5/min, Supabase SMTP |
| POST /api/auth/update-password | 5/min, só `get_user` verificado (F1 fix, sem base64 decode) |
| GET/POST/PATCH/DELETE /api/planos?org_id | `403` membro (F3) |
| GET/POST/PATCH/DELETE /api/etapas?org_id | `403` membro |
| GET/POST/PATCH/DELETE /api/tags?org_id | `403` membro |
| GET /api/clientes | `?org_id` org-based + `X-API-Key` fallback + `?org_id` validação UUID + `_verificar_membro` |
| POST /api/clientes | `campos_custom` jsonb |
| PATCH/DELETE /api/clientes/{id} | org check |
| GET/POST/PATCH/DELETE /api/atividades |  |
| GET /api/relatorios/conversao|receita|churn|ltv | `?periodo&org_id`, `detail` genérico (F15) |
| GET /api/orgs, POST /api/orgs, GET /api/orgs/{id}/membros, POST /api/orgs/{id}/convites, DELETE /api/orgs/{id}, DELETE /api/orgs/{id}/membros/{uid}, PATCH /api/orgs/{id} | F3A + `403` |
| GET/POST/PATCH/DELETE /api/integracoes?org_id | F3B |
| POST /api/webhooks/zapier?integracao_id=UUID | 10/min, exige UUID, não confia em payload org_id (F2) |
| GET /api/clientes/{id}/anexos?org_id, POST, DELETE /api/anexos/{id} | F3C 10MB, `mime` allowlist |
| GET/POST/DELETE /api/api-keys?org_id | HMAC pepper, `prefix` |
| GET /api/clientes-public?org_id | `X-API-Key` ou Bearer (F10 fix) |
| GET /api/verticais, GET/PATCH /api/orgs/{id}/vertical | F4A `403` membro |
| GET /api/usuarios/me, PATCH, POST /api/usuarios/alterar-senha, DELETE, GET /export | F4C |
| GET/POST/PATCH/DELETE /api/templates?org_id&vertical | F2B `403` membro |
| GET /api/automacoes?org_id, PATCH, POST /api/automacoes/run | F2C `pg_cron` |

### Authentication
- JWT `supabase.auth.get_user(token)` VERIFICADO (sem base64 fallback) + `df_token` httpOnly cookie fallback `re.search(r"df_token=...")`
- Rate limit via `_rate_limit_key` (X-Vercel-Forwarded-For, não X-Forwarded-For spoofável)
- CORS `allow_credentials=False` (Bearer, sem cookie), `allow_origin_regex` só em dev
- Password 8 chars + block `common` (F16)

### Storage (storage.py)
- Singleton `_supabase_client` (service_role `sb_secret_...` mas RLS via `is_org_member` SECURITY DEFINER)
- `_COLUNAS_CLIENTE` 27 cols (+ `campos_custom`), `carregar_clientes` valida `_verificar_membro` se `org_id`, sem `print` PII
- Helpers: `_validar_uuid`, `_verificar_membro`, `_verificar_admin`, `_ensure_org_id`, `_get_default_org_id`, `listar_organizacoes` (owner + membros)
- `verificar_api_key` → HMAC `pepper` + `hmac.compare_digest` via `prefix` lookup (F10)

## Frontend (/)

### Pages
- **index.html** — Landing + modais recovery (sem `console.log` prod)
- **dashboard.html** — SPA `flex` + `aside#sidebar w-[240px]` desktop + `drawer 280px` mobile + `header` compacto (`hamburger`, `org-select`, `vertical-select`, `api-status-badge hidden sm`), 6 seções `secao-overview|clientes|kanban|relatorios|agenda|config`, `secao-view-toggle` só em `clientes/kanban`, `footer-api-url` `hidden sm` com `hostname`
- **privacidade.html / termos.html / 404.html**

### Key Features (Todas Fases)
- **Multi-tenant 3A:** `org-select`, `modal-gerenciar-org` 3 abas, `membros` com `data-user-id` + `dataset` (F6 XSS), `isCurrentOrgAdmin()` → `opacity-50 disabled` para `Planos/Etapas/Tags/Integrações/Templates/Verticais/ApiKeys`
- **Planos Org 4a57b3b:** `planos.org_id` + backfill/duplica por org + `listar_planos(org_id)`
- **Permissões 3A-2 654ab67:** `planos/etapas/tags` `403` membro + frontend hide→disabled
- **Integrações 3B f586f84:** `Calendar` mock OAuth, `Zapier` webhook `.../api/webhooks/zapier/{uuid}` `10/min`, `Conta Azul` toggle — `is_org_member` fix `42P17`
- **Anexos 3C 9257c23:** `bucket anexos` private, `listar_anexos` por `cliente_id`, `criar_anexo` `base64` 10MB `mime` allowlist, `api_keys` HMAC, `modal-apikeys` (`davi_...` só uma vez), `detalhes-anexos` drag&drop
- **Verticals 4A e0c2960:** 5 presets `geral/hospital/oficina/dentista/academia` → `organizacoes.vertical` + `clientes.campos_custom` (`carros[]` multi-veículo, `convenio/leito`, `dente`, `plano_mensal`), `aplicarVertical()` renomeia labels + `adicionarCarro()` + `coletar/preencherCamposCustom`, `vertical-select` header + `modal-vertical`
- **Sidebar 4B 6888f8f:** `setSecao(secao)` com `localStorage daviflow_secao` + `#hash` + `history.pushState`, `toggleSidebarMobile`, `agenda-lista` timeline `carregarAtividadesAgenda()`, `breadcrumb`, `footer-api-url` hostname
- **Settings 4C dcf9f77:** `secao-config` 7 abas (`Geral` nome/empresa/vertical/tema, `Org` rename/membros/convite, `Planos/Etapas/Tags` inline com `dot` cor real, `Notificações` toggles, `Conta` senha/export/deletar), `PATCH /api/usuarios/me`, `POST /alterar-senha`, `GET /export`
- **WhatsApp 2B 6f87c34-a769326:** `templates_whatsapp` `plano_id bigint`, `modal-templates` CRUD, `wa.me/55{{telefone}}?text=` com `{{nome}}{{placa}}{{modelo}}{{dente}}` + `vertical` filter
- **Automações 2C 3cb9f71-546cbfe:** `automacoes` (`inativo_30d` 30d/14d academia, `vence_3d`, `sem_atividade_7d`) + `run_automacoes()` `SECURITY DEFINER` + `pg_cron 09:00 UTC` (06:00 SP), `Config → Notificações` com `carregarAutomacoes()` + `▶️ Rodar agora`
- **Paleta b8f3589/38ed255:** `slate-50→e0e7ff indigo-100`, `indigo-600` sóbrio, `dark .bg-white→var(--dash-surface)`, `body var(--dash-bg)`

### Styling (style.css)
- Tokens `slate-50→e0e7ff`, `indigo-500→indigo-600`, `dark slate-950 #020617`, `body var(--dash-bg) !important`, `metric-card:hover border-accent`, `.kanban-*`, `dark .bg-white` fix brancão, `skeleton`, `modal-box` 0.22s

### JavaScript (app.js 5000+ linhas)
- Globals: `clientesCache`, `planosCache`, `etapasCache`, `tagsCache`, `atividadesCache`, `filtrosCache`, `orgsCache/currentOrgId`, `verticaisCache/currentVertical`, `templatesCache`, `integracoesCache/anexosCache/apiKeysCache`, `viewMode`, `secaoAtiva`
- Init: `carregarOrgs→Verticais→VerticalOrg→Planos→Etapas→Tags→Filtros→Clientes→Integracoes→Templates` + `setSecao(hash||secaoAtiva)` + `hashchange` + `verificarStatusAPI` dupla `/health` + `/planos`
- Segurança: `escaparHTML` + `data-*` dataset (F6), `csvSanitize` `'=+-@` prefix `'` (F20), `fetchAuth` Bearer ou `Cookie df_token`

## Database (Supabase `supabase/migrations/`)
- `001_fase1.sql` — etapas, atividades (cliente_id bigint), tags, cliente_tags, filtros_salvos
- `002_fase2b_templates.sql` — templates_whatsapp (`plano_id bigint`)
- `003_fase2c_automacoes.sql` — automacoes + `run_automacoes()` + `pg_cron 09:00 UTC`
- `004_fase3a_org.sql` — organizacoes, membros, org_id em 5 tabelas + RLS `is_org_member`
- `005_fase3b_integracoes.sql` — integracoes
- `006_fase3c_anexos.sql` — bucket `anexos` private + anexos + api_keys (HMAC)
- `007_fase4a_verticals.sql` — verticais (5 presets) + organizacoes.vertical + clientes.campos_custom jsonb
- `supabase_all.sql` — cat 001-007 para fresh install
- `archive/` — 8 fixes já aplicados (`fix_recursion`, `fix_2c_data_cast`, `fix_security_anon` revoke `anon` em `is_org_member`)

## Histórico de Sessões (2026-08-30 → 2026-09-02)

### Fase 2B WhatsApp 6f87c34-a769326 (2026-09-02)
- Fix `plano_id uuid→bigint` `42804`, `DROP TABLE IF EXISTS` + `supabase/migrations/002`, `wa.me` com `carros[0].placa`

### Fase 2C Automações 3cb9f71-8d0a1dc-546cbfe (2026-09-02)
- `inativo_30d` (30d/14d academia) + `vence_3d` (dia 2-5) + `sem_atividade_7d`, `run_automacoes()` `::date` fix `42883` + `data::date` fix `42804`, `pg_cron` 09:00 UTC, `fix_automacoes.sql`, `Config → Notificações` `Rodar agora`

### Fase 3B Integrações f586f84 (2026-09-01)
- `integracoes` + `is_org_member` fix `42P17 infinite recursion` + `fix_security_anon` revoke `anon`

### Fase 3C Anexos 9257c23-e5e9c67
- `anexos` Storage `davi_...` HMAC, `api_keys` hide `plain_key`

### Fase 4A Verticals e0c2960-b3b36ba-e071845 (2026-09-02)
- 5 verticais, `campos_custom`, `multi-carro` `adicionarCarro`, `aplicarVertical` renomeia, `coletar/preencher`, `main@a964d10-d23f735` debug→limpo

### Fase 4B Sidebar 3a12de1-23a0c7e-4defad6-6888f8f-a341ca8 (2026-09-02)
- `aside 240px` + `drawer 280px`, `setSecao` `#hash` + `localStorage`, `view-toggle` só `clientes/kanban`, `mobile header compact` `hidden sm`

### Fase 4C Settings bc25de3-346180a-dcf9f77
- 7 abas `Geral/Org/Planos/Etapas/Tags/Notificações/Conta`, `GET/PATCH /api/usuarios/me`, cor `dot` fix

### Segurança Mega Brain 56a5180 (2026-09-02)
- F1 `update-password` sem `base64 decode`, F2 webhook `integracao_id` obrigatório + `10/min`, F3 IDOR `_verificar_membro` UUID, F4 deletes com `org_id`, F6 XSS `data-*`, F8 SRI `sha384`, F9 `httpOnly` cookie, F10 HMAC pepper, F11 CSP/HSTS, F12 rate `X-Vercel-Forwarded-For`, F14 validators strict, F15 `detail` generico, F16 senha 8 chars, F20 CSV `'`, F21 `revoke anon`

### Organização f267a98 (2026-09-02)
- `supabase/*.sql` → `migrations/001-007` + `archive/`, `__pycache__` limpo, `style.css` dark duplicado removido, `app.js` `salvarSessao`/`recarrregar`/`console.log` removidos, `index.html` recovery `console.log` comentado, `README.md` + `.env.example` + `tests/test_health.py` + `supabase/README.md` + `supabase_all.sql`

## Tech Stack (2026-09-02)
- FastAPI 0.141, Tailwind CDN + SRI, Supabase `sb_secret_...` service_role, `pg_cron`, `hmac`, `slowapi`, `httpx`, `pytest`

## Development
- `git checkout -b feat/xyz` → `push -u origin` → Preview `feat-xyz-xxx.vercel.app` → `merge --no-ff` em `main` (Vercel `gru1`)
- Env em Vercel: `SUPABASE_URL`, `SUPABASE_KEY` (`sb_secret_...`), `SITE_URL`, `ALLOWED_ORIGINS`, `API_KEY_PEPPER`

## Estado Atual (2026-09-02 17:00 UTC — main@2670d3a 2B + f267a98 org + 56a5180 security)
- **Produção:** `daviflow.vercel.app` + `davi-flow-*.vercel.app` Preview, `main@d23f735` 4A + `main@6e35f40` 2C + `main@2670d3a` 2B + `main@38ed255` paleta + `main@56a5180` security (22 fixes) — 55+ rotas, 6 seções sidebar, 1 tipo por org, `campos_custom` carros, `wa.me` templates, `pg_cron` 06:00, `httpOnly` cookie, `CSP`
- **Branches:** `feat/fase2c-automacoes` `feat/fase2b-whatsapp` merged, `main` estável, próximo `consolidação QA` ou `3D` quando Stripe liberar.

