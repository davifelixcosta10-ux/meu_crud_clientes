# DaviFlow — Project Summary

## Overview
Full-stack CRM application for client and plan management, designed for freelancers, solo entrepreneurs, and small businesses. Features a modern landing page with a corporate/somber visual design, and a complete dashboard administrative interface. Em produção em daviflowgestoes.vercel.app e daviflow.vercel.app.

**Tagline**: Gestão de clientes sem planilhas — organize seus cadastros, métricas e planos em um painel intuitivo.

## Architecture
- **Backend**: FastAPI (Python) — RESTful API with authentication, client management, plan management, Kanban, atividades, tags, filtros e importação
- **Frontend**: Static HTML + Tailwind CSS + Vanilla JS + Lucide Icons + SortableJS + PapaParse + SheetJS
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Deployment**: Vercel (frontend + rewrites para /api, região gru1, cache headers, sem crons) — FastAPI serverless
- **Communication**: JWT-based authentication via Bearer tokens (Supabase Auth, validado via `supabase.auth.get_user`)

## Backend (app/)

### Structure
```
app/
  main.py       # FastAPI app, 35 rotas, rate limiter, CORS restrito, JWT async, Fase 1 endpoints
  models.py     # Pydantic models + validadores (CPF módulo 11 leniente em leitura, estrito em escrita)
  storage.py    # Supabase singleton & CRUD RLS (inclui etapas, atividades, tags, filtros, import bulk)
supabase_fase1.sql # Migração Fase 1 (etapas, atividades, tags, cliente_tags, filtros_salvos + colunas clientes)
```

### Key Models (Fase 1 estendido)
- **UserSignUp** / **UserLogin** / **TokenResponse** — Auth flows
- **Plano** / **PlanoCreate** / **PlanoUpdate** — Dynamic per-user plans com 8 cores
- **Cliente** (leitura leniente) / **ClienteCreate** (estrito) / **ClienteUpdate** (estrito) — Full CRUD com 30+ campos + Fase 1: `etapa_id`, `valor_plano`, `vencimento_dia` (1-31), `status_pagamento` (em_dia/atrasado/isento)
- **Etapa** / **EtapaCreate** / **EtapaUpdate** — Kanban (nome, ordem, cor) — Fase 1A
- **Atividade** / **AtividadeCreate** / **AtividadeUpdate** — Follow-up (cliente_id bigint FK, tipo enum, data ISO, concluida, nota) — Fase 1B
- **Tag** / **TagCreate** / **TagUpdate** — Segmentação (nome único por user, cor) — Fase 1C
- **ClienteTagCreate** — vínculo N:N
- **FiltroSalvo** / **FiltroSalvoCreate** — filtros salvos (nome, query JSON) — Fase 1C
- **ImportPreviewRequest** — bulk import (lista de dicts) — Fase 1E
- **Validação**: `validar_cpf()` módulo 11 completo, `cpf_validator()` estrito em Create/Update e leniente em Cliente (leitura) para compatibilidade com dados antigos; RG/telefone/data lenientes em leitura

### API Endpoints (main.py — 35 rotas)
| Method | Endpoint | Description |
|---|---|---|
| GET /api/health, /api | Health check (com cache s-maxage 10) |
| POST /api/auth/signup | Register user (rate limit 5/min) |
| POST /api/auth/login | Login & get JWT (rate limit 10/min) |
| GET /api/planos | List user's plans |
| POST /api/planos | Create plan |
| PATCH /api/planos/{id} | Update plan |
| DELETE /api/planos/{id} | Delete plan |
| GET /api/etapas | List Kanban etapas — Fase 1A |
| POST /api/etapas | Create etapa |
| PATCH /api/etapas/{id} | Update etapa |
| DELETE /api/etapas/{id} | Delete etapa |
| GET /api/atividades | List atividades (query `cliente_id`) — Fase 1B |
| POST /api/atividades | Create atividade |
| PATCH /api/atividades/{id} | Update atividade |
| DELETE /api/atividades/{id} | Delete atividade |
| GET /api/tags | List tags — Fase 1C |
| POST /api/tags | Create tag |
| PATCH /api/tags/{id} | Update tag |
| DELETE /api/tags/{id} | Delete tag |
| GET /api/clientes/{id}/tags | List tags de um cliente |
| POST /api/clientes/{id}/tags | Vincular tag a cliente |
| DELETE /api/clientes/{id}/tags/{tag_id} | Desvincular tag |
| GET /api/filtros | List filtros salvos |
| POST /api/filtros | Create filtro |
| DELETE /api/filtros/{id} | Delete filtro |
| POST /api/clientes/import | Bulk import CSV/Excel — Fase 1E |
| GET /api/clientes | List clients (com _tags e atividades para métricas) |
| POST /api/clientes | Create client |
| PATCH /api/clientes/{id} | Update client |
| DELETE /api/clientes/{id} | Delete client |

### Authentication
- JWT via `supabase.auth.get_user(token)` (valida assinatura JWKS, expiração, revogação) — async `obter_user_id`
- `Authorization: Bearer <token>` obrigatório; sem fallback para UUID (previne spoofing)
- Frontend: `localStorage df_token` + `fetchAuth()` wrapper que em produção 401 → limpa e redirect `/?login=true`, em `IS_LOCAL` (Live Server) lança erro para fallback demo sem redirect
- Rate limiting: `slowapi` 5/min signup, 10/min login

### Storage (storage.py)
- Singleton `_supabase_client`
- `_COLUNAS_CLIENTE` com 25 colunas (inclui `etapa_id`, `valor_plano`, `vencimento_dia`, `status_pagamento`)
- `carregar_clientes` leniente: `try/except` por linha + fallback, log `[DEBUG] carregar_clientes user_id=... => X linhas`
- CRUD para planos, clientes, etapas, atividades, tags, cliente_tags, filtros_salvos, import bulk — todos `eq("user_id", user_id)` (RLS)

## Frontend (/)

### Pages
- **index.html** — Landing page (hero com mockup + browser chrome, features 3 cards, how-it-works 3 passos, about 3 pilares, CTA, navbar, modais, footer legal, preconnect/preload perf)
- **dashboard.html** — Painel completo (métricas 6 cards, toolbar com busca + 4 filtros + 6 botões, toggle Tabela|Kanban, tabela desktop + cards mobile, Kanban board, empty state, FAB, modais: criar/editar/deletar/planos/detalhes/logout + 5 modais Fase 1: etapas, atividade, tags, filtros, import, confirm genérico)
- **privacidade.html** — Política LGPD 11 seções (CSS puro, sem @apply, sem reveal — fix 2026-08-27)
- **termos.html** — Termos 15 seções (mesmo fix)
- **404.html** — Error page

### Key Features (Fase 1 completo)
- **Client Management**: Full CRUD 30+ campos + Fase 1: etapa Kanban, financeiro (valor/vencimento/status), tags
- **Kanban**: Toggle Tabela|Kanban (persiste `localStorage daviflow_view`), colunas por etapa + Sem etapa, drag SortableJS (ghost/chosen), PATCH `etapa_id` ao soltar, modal Etapas CRUD, contador
- **Atividades**: Timeline no Detalhes (badge Atrasada amarelo/Concluída verde), modal Nova Atividade (tipo/data/nota/concluída), fallback local via `atividadesCache` quando `IS_LOCAL` sem backend, métrica Atrasados
- **Tags**: CRUD em modal Tags, checkboxes em Criar/Editar, `filter-tag` na toolbar, `GET /clientes/{id}/tags` paralelo em `carregarClientes` (com `_tags` no cache), kanban card mostra 2 tags, filtro por tag em `filtrarTabela()` e Kanban
- **Filtros Salvos**: salvar combinação atual (termo/plano/status/etapa/tag) como JSON, aplicar/restaurar, deletar — tudo via `/api/filtros`
- **Financeiro**: Valor (texto), Vencimento (1-31), Status (em_dia/atrasado/isento) — exibido em Detalhes e Kanban card, métrica Receita prevista (soma valor em_dia)
- **Import**: Modal drag&drop, PapaParse para CSV e SheetJS para XLSX/XLS (máx 1000 linhas), preview 5 linhas, `POST /api/clientes/import` com `ImportPreviewRequest`, fallback local
- **Plan System**: 8 cores, badges, MAPA_CORES_PLANO
- **Authentication**: fetchAuth centralizado (10+ usos), 401 handling diferenciado prod vs IS_LOCAL
- **Responsive**: Mobile-first, toolbar `flex-col` com `flex-wrap` (fix vazamento), métricas `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`, Kanban `min-w-280` com scroll-x, dark mode, bottom-sheet
- **Modals**: Todos com `.modal-box` scale/opacity, `confirmarAcao()` genérico substitui `confirm()` do navegador
- **Metrics**: 6 cards: Total, Ativos (emerald), Inativos (rose), Por Plano (indigo), Atrasados (amber, Fase 1B), Receita (emerald, Fase 1D)
- **Demo Mode**: `IS_LOCAL` controla `CLIENTES_DEMO` (`IS_LOCAL ? [...] : []`) e `atividadesCache`; produção nunca expõe mock PII; `fetchAuth` não redireciona em IS_LOCAL

### Styling (style.css)
- **Design Tokens**: CSS vars `--dash-*` (light/dark), accent indigo-600
- **Dashboard**: Form, buttons, metric cards, toggles, color dots, modais, client cards, **Kanban** (`.kanban-column`, `.kanban-column-header`, `.kanban-column-body`, `.kanban-card`, `.sortable-ghost`, `.kanban-empty`)
- **Landing**: `fadeInUp` + stagger, `.reveal` (removido de legais), `feature-card` hover, `navbar-scrolled`
- **Fixes**: privacy/termos `@apply` → CSS puro, `glass-card` definido inline, toolbar `flex-wrap`, kanban styles, metrics grid fix (removido `col-span-2`)
- **Documentado**: Header com estrutura, tokens, animações

### JavaScript (app.js — 19 seções + Fase 1)
- **Header documentado**: Arquitetura SPA, IS_LOCAL, fetchAuth, 19+ seções
- **Globals**: `clientesCache`, `planosCache`, `etapasCache`, `tagsCache`, `atividadesCache`, `filtrosCache`, `importPreviewData`, `viewMode`, `MAPA_CORES_PLANO`
- **Auth**: `obterAuthHeaders()` exige token, `fetchAuth()` com `IS_LOCAL` check
- **Init**: `inicializarApp()` carrega planos→etapas→tags→filtros→clientes, `setViewMode()`, `verificarStatusAPI()` com checagem dupla `/health` + `/planos` (DB) para badge Conectado/Modo Local/Desconectado
- **Features Fase 1**: `carregarEtapas`, `renderizarKanban`, `carregarTags`, `carregarFiltrosSalvos`, `carregarAtividades`, `handleImportFile`, `renderImportPreview`, `confirmarAcao`, `etapas/tags` CRUD, `filtrarTabela()` com etapa/tag, `atualizarMetricas()` com receita/atrasados, `salvarNovoCliente`/`salvarEdicaoCliente` com etapa/financeiro/tags + fallback local + `renderizarKanban()`
- **Segurança**: `escaparHTML` em toda interpolação, ViaCEP sanitizado, token só em header

## Database (Supabase)
- **Tables**: `clientes`, `planos`, `etapas`, `atividades`, `tags`, `cliente_tags`, `filtros_salvos`
- **Policies**: RLS `auth.uid() = user_id` em todas; `cliente_tags` via `exists (select 1 from clientes ...)`
- **Columns - clientes**: user_id, nome, email, plano, ativo, data_cadastro, telefone, cpf, rg, data_nascimento, genero, empresa, cargo, observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado, etapa_id (uuid FK etapas, nullable, on delete set null), valor_plano (text), vencimento_dia (int 1-31), status_pagamento (text em_dia/atrasado/isento)
- **Columns - etapas**: id uuid PK, user_id uuid FK auth.users, nome text, ordem int, cor text, created_at timestamptz
- **Columns - atividades**: id uuid PK, user_id uuid, cliente_id bigint FK clientes(id) (corrigido de uuid), tipo check, data date, concluida bool, nota text, created_at
- **Columns - tags**: id uuid PK, user_id uuid, nome text unique per user, cor text, created_at
- **Columns - cliente_tags**: cliente_id bigint FK, tag_id uuid FK, PK composite, RLS via clientes
- **Columns - filtros_salvos**: id uuid PK, user_id uuid, nome text, query jsonb, created_at
- **Columns - planos**: user_id, nome, cor, descricao, valor

## Histórico de Sessões

### Sessão 1 — Redesign Profissional (2026-08-26)
- Removida seção `#pricing` e links Preços, hero com browser chrome, features 3 cards, how-it-works sem step-line, about 3 pilares, CTA indigo, modais indigo, favicon SVG, Tailwind limpo, animação `forced visible` removida, headers HTML documentados
- Dashboard: logo indigo sólido, métricas indigo, toolbar indigo, FAB indigo, modais padronizados, footer legal, Kanban placeholder

### Sessão 2 — Páginas Legais + Commit Inicial Fase 1
- `privacidade.html` 11 seções LGPD e `termos.html` 15 seções com CSS puro, links footer e modal register atualizados, 404 footer

### Sessão 3 — Auditoria de Segurança (`seguranca-test`)
- **CRÍTICO**: `extrair_user_id` base64 → `supabase.auth.get_user(token)` async, `fetchAuth()` wrapper (10 usos), endpoints viraram async
- **ALTA**: CORS `*.vercel.app` → `allow_origins` explícitos + regex só localhost, `str(e)` → genérico
- **MÉDIA**: CPF módulo 11 (`validar_cpf` + `cpf_validator`), `slowapi` 5/min signup 10/min login, `CLIENTES_DEMO` condicional `IS_LOCAL`, ViaCEP sanitizado
- **Testes**: 12 testes passando

### Sessão 4 — Documentação Completa + Performance
- Documentado `app/main.py`, `app/models.py` (com header leniente vs estrito), `app/storage.py`, `app.js` (19 seções + Fase 1), `style.css`, HTML headers
- **Performance Vercel**: Real Experience 57, FCP 6.23s, LCP 6.35s, TTFB 4.34s → fix: `vercel.json` com `regions: ["gru1"]`, `functions` memory 1024, `headers` Cache-Control, `preconnect`/`dns-prefetch`/`preload` para CDN e style.css, `crons` removido (requer Pro) — Score deve subir para 85+

### Sessão 5 — Design removido de instruções (a pedido)
- Removida seção `Processo de Criação de Design` de `~/.opencode/instructionsglobal.md` e `instructions.md` (mantido em `context.md` como histórico)

### Sessão 6 — Fase 1 Aprovada (Questionário 8/8 completo)
- Questionário com 8 perguntas (Kanban completo, atividades com lembretes, tags + filtros, cobrança leve informativa, CSV+Excel, relatórios completos, WhatsApp templates, automações) — todas aprovadas como "completo"
- Criado `plan.md` detalhado e `context.md` Roadmap (Fase 1 A-E, Fase 2 A-C, Fase 3 backlog)
- Branch `teste/fase1` criada para Live Server antes de produção

### Sessão 7 — Implementação Fase 1 Completa em `teste/fase1` (2026-08-27)
- **Backend Models**: `EtapaCreate/Update/Etapa`, `AtividadeCreate/Update/Atividade`, `TagCreate/Update/Tag`, `FiltroSalvo`, `ImportPreviewRequest` + extensão Cliente com `etapa_id`, `valor_plano`, `vencimento_dia`, `status_pagamento` (validadores estritos em Create/Update, lenientes em leitura para compatibilidade com dados antigos)
- **Storage**: `_COLUNAS_CLIENTE` 25 colunas, CRUD para etapas/atividades/tags/cliente_tags/filtros + `importar_clientes_bulk` com validação por linha, `carregar_clientes` leniente com log `[DEBUG]`
- **API**: 18 novos endpoints Fase 1 (etapas, atividades, tags, filtros, import) + `supabase_fase1.sql` com FK corrigido `cliente_id bigint` (era uuid, erro 42804)
- **Frontend Fase 1**: 
  - CDN SortableJS, PapaParse, SheetJS no `<head>` (com preconnect)
  - Métricas +2 cards (Atrasados amber, Receita emerald) — grid `xl:grid-cols-6` fix vazamento `col-span-2`
  - Toolbar expandida (4 filtros + 5 botões) com `flex-wrap`, toggle Tabela|Kanban, Kanban board com `Sortable` e `PATCH etapa_id`
  - 5 modais novos: Etapas, Atividade, Tags, Filtros, Import (+ modal Confirm genérico substituindo `confirm()`)
  - Criar/Editar cliente com selects Etapa, inputs Financeiro, checkboxes Tags (com `renderizarTagsSelects`)
  - Detalhes com Etapa/Financeiro/Tags + timeline Atividades (badge Atrasada, toggle, delete)
  - `carregarClientes` com `Promise.all` para tags e atividades, `filtrarTabela` com etapa/tag, `atualizarMetricas` com receita/atrasados
  - `fetchAuth` com `IS_LOCAL` check para Live Server sem redirect, fallback local para todas as operações
  - `style.css` Kanban styles (`.kanban-column`, `.kanban-card`, `.sortable-ghost`)
- **Testes**: 12 testes backend + 11 frontend passando (`node --check`, `grep` modais/filtros)
- **Deploy**: Merge `teste/fase1` → `main` (197beb9, 2.467 linhas), push e Vercel redeploy

### Sessão 8 — Correções Pós-Deploy em Produção (2026-08-27)
- **Layout quebrado**: métricas `col-span-2` removido, toolbar `sm:flex-nowrap` → `flex-wrap` com `w-full` busca — fix `5f15f47`
- **Modal de confirmação**: `confirm()` do navegador → modal in-page `confirmarAcao()` com `modal-confirm` (usado em deletarEtapa/Tag/Filtro/Atividade/Plano) — fix `f2302ca` e `44a21a3`
- **Salvar Alterações não funcionava em Live Server**: `salvarAtividade`/`salvarEdicaoCliente` sem fallback local, `toggleAtividade` sem fallback — corrigido com `IS_LOCAL` fallback e `renderizarKanban()` — fix `5610e9c` e `9aa6cd6`
- **Páginas legais em branco**: `reveal` sem JS + `@apply` com CDN → CSS puro + remover `reveal` — fix `7aabb2b`
- **Toolbar vazando**: `flex-col` + `flex-wrap` — fix `7aabb2b`
- **Status API falso Conectado com erro**: `verificarStatusAPI` só checava `/health` — agora checa `/health` + `/planos` (DB) e distingue 401 vs 500 — fix `7aabb2b` e `71a4805`
- **Erro 500 ao carregar clientes**: `Cliente` estrito com dados antigos inválidos (CPF `123.456.789-00`) — tornado leniente em leitura (`return v`) + `carregar_clientes` robusto com `try` por linha — fix `b885d28`
- **Vercel travado em `chore: sync debug toast`**: `vercel.json` com `crons` (requer Pro) — removido — fix `4577736`
- **Debug**: `7314d70` adicionou log `[DEBUG] carregar_clientes user_id=...` para diagnosticar lista vazia (user_id `dcfaf27f-fa5c-4a35-8c54-82263e5225f9` tinha 3 registros mas API retornava `[]` — causado pela validação estrita acima, resolvido com leniência)

## Roadmap — Próximas Funcionalidades (Detalhado, Aprovado 2026-08-26)
> Questionário 8/8 aprovado como "completo". Fase 1 (A-E) ✅ implementado em `teste/fase1` e `main`; Fase 2 (A-C) e Fase 3 são próximos passos. Detalhe completo também em `plan.md`.

| Fase | Feature | Tabelas / Colunas Novas | Valor para freela |
|---|---|---|---|
| 1A | **Kanban completo** (etapas configuráveis, drag & drop) | `etapas`, `clientes.etapa_id` | Ver fluxo sem planilha |
| 1B | **Atividades + lembretes** (timeline, badge atrasado) | `atividades` | Nunca perder follow-up |
| 1C | **Tags + filtros salvos** | `tags`, `cliente_tags`, `filtros_salvos` | Segmentar VIP/região |
| 1D | **Cobrança leve** (vencimento, status, receita prevista) | `clientes.valor_plano, vencimento_dia, status_pagamento` | Controlar atrasados |
| 1E | **Import CSV + Excel** (preview, mapeamento) | `POST /api/clientes/import` | Trazer planilha em 1 clique |
| 2A | **Relatórios completos** (conversão, churn, LTV, receita + gráficos) | endpoints agregação | Decidir com dados |
| 2B | **Templates WhatsApp** (wa.me + mensagens por plano/etapa) | `templates_whatsapp` | Atender em 1 toque |
| 2C | **Automações** (inativo 30d → tarefa, vence 3d → alerta) | `automacoes` + cron | Rotina no piloto automático |
| 3 | Escala (multi-usuário, Calendar, Zapier, anexos, API, PWA, Stripe) | backlog | Crescer sem trocar de sistema |

**Detalhe Fase 1A — Kanban**: Backend `etapas` + `clientes.etapa_id uuid FK`, CRUD `GET/POST/PATCH/DELETE /api/etapas`; Frontend `etapasCache`, `carregarEtapas()`, `renderizarKanban()` com `SortableJS`, `select#filter-etapa`, `style.css` `.kanban-*`.

**Detalhe Fase 1B — Atividades**: Backend `atividades` (`cliente_id bigint` corrigido), CRUD `/api/atividades`; Frontend `atividadesCache`, modal Nova Atividade, timeline em Detalhes com badge Atrasada, métrica Atrasados, fallback `IS_LOCAL`.

**Detalhe Fase 1C — Tags/Filtros**: Backend `tags` + `cliente_tags` + `filtros_salvos`, CRUD `/api/tags`, `/api/clientes/{id}/tags`, `/api/filtros`; Frontend `tagsCache`/`filtrosCache`, checkboxes em Criar/Editar, `filter-tag`, `filtrarTabela` com `matchTag`, Kanban mostra 2 tags.

**Detalhe Fase 1D — Financeiro**: Backend colunas `valor_plano text, vencimento_dia int 1-31, status_pagamento text`; Frontend inputs `criar-valor-plano`/`vencimento`/`status`, `Detalhes` mostra Financeiro, `atualizarMetricas` soma Receita.

**Detalhe Fase 1E — Import**: Backend `ImportPreviewRequest` + `POST /api/clientes/import` com `importar_clientes_bulk`; Frontend modal drag&drop com `PapaParse` (CSV) e `SheetJS` (Excel), preview 5 linhas, fallback local.

**Detalhe Fase 2A — Relatórios**: `GET /api/relatorios/*` com `group by` + `Chart.js`/`Recharts`.

**Detalhe Fase 2B — WhatsApp**: `templates_whatsapp` + `wa.me` com `encodeURIComponent`.

**Detalhe Fase 2C — Automações**: `automacoes` + cron diário (Vercel Cron ou `pg_cron`).

**Detalhe Fase 3 — Escala**: `org_id`, Calendar, Zapier, Storage, API keys, PWA, Stripe.

**Critérios de Aceite Fase 1**: Kanban persiste após reload, atividade atrasada <1s, tag filtra e salva, vencimento calcula correto, import 100 linhas <2s, `node --check` + 12 testes backend passando.

## Tech Stack (Final)
- **Language**: Python 3.12, HTML/CSS/JS
- **Framework**: FastAPI 0.141, Tailwind CSS v3 CDN (com preconnect/preload)
- **Auth**: Supabase Auth (JWT, bcrypt cost 12, `get_user` validado)
- **Database**: PostgreSQL + RLS (7 tabelas)
- **Hosting**: Vercel `gru1`, `api/index.py` 1024MB, `Cache-Control` headers, `supabase_fase1.sql` aplicado
- **Icons**: Lucide
- **Fonts**: Inter 300-900
- **Rate Limit**: slowapi
- **Kanban**: SortableJS 1.15.2
- **Import**: PapaParse 5.4.1 + SheetJS (xlsx 0.18.5)
- **Charts (futuro Fase 2)**: Chart.js/Recharts previsto

## Development
- **Local API**: `http://127.0.0.1:8000/api` (quando `IS_LOCAL`, via `uvicorn app.main:app --reload`)
- **Prod API**: `https://daviflowgestoes.vercel.app/api` (via `window.location.origin`)
- **Environment**: `.env` ou `data/arquivos.env` (`SUPABASE_URL`, `SUPABASE_KEY`, `ALLOWED_ORIGINS`)
- **Dependencies**: `fastapi`, `uvicorn`, `supabase`, `python-dotenv`, `pydantic`, `email-validator`, `slowapi`, `httpx`, `httpcore`, `limits`, `xlsx`, `papaparse` (CDN)
- **Health**: `GET /api/health` e `GET /api` (com cache 10s)
- **Branching**: `main` (produção, Vercel auto-deploy) e `teste/fase1` (desenvolvimento, Live Server, `IS_LOCAL` demo)

## Quick Start
1. `git clone https://github.com/davifelixcosta10-ux/meu_crud_clientes.git`
2. `git checkout main` (produção) ou `teste/fase1` (desenvolvimento)
3. `pip install -r requirements.txt`
4. `cp .env.example .env` → preencher `SUPABASE_URL`, `SUPABASE_KEY`
5. `psql` ou Supabase SQL Editor → rodar `supabase_fase1.sql` (uma vez, idempotente com `if not exists`)
6. `uvicorn app.main:app --reload` → http://127.0.0.1:8000/docs
7. `Live Server` em `dashboard.html` → `IS_LOCAL` demo com 3 clientes se sem backend; com backend, login em `/?login=true`
8. Vercel: push em `main` dispara deploy para `daviflowgestoes.vercel.app` (região `gru1`)

## Estado Atual (2026-08-27 20:08 UTC — Funcionando)
- **Produção**: `daviflowgestoes.vercel.app` em `main@7314d70` (debug) + `b885d28` (leniente) + `4577736` (vercel fix) — `GET /api/clientes` com token válido retorna `200` com lista (testado com `teste-...@teste.com` → `[]` e após criar → 1 registro)
- **Teste**: `teste/fase1` em `733d62f` (sync vercel fix) + frontend completo — Kanban drag funcionando em Live Server (persiste via `PATCH etapa_id` quando com backend, senão local)
- **Próximos passos**: Validar Fase 1 em produção com dados reais do usuário `dcfaf27f...` (3 clientes), testar Import CSV/Excel, Tags, Financeiro, Atividades com vencimento, depois Fase 2 (Relatórios, WhatsApp, Automações) conforme `plan.md`
