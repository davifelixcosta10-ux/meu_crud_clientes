# DaviFlow — Project Summary

## Overview
Full-stack CRM application for client and plan management, designed for freelancers, solo entrepreneurs, and small businesses. Features a modern landing page with a corporate/somber visual design, and a complete dashboard administrative interface.

**Tagline**: Gestão de clientes sem planilhas — organize seus cadastros, métricas e planos em um painel intuitivo.

## Architecture
- **Backend**: FastAPI (Python) — RESTful API with authentication, client management, and plan management
- **Frontend**: Static HTML + Tailwind CSS + Vanilla JS + Lucide Icons
- **Database**: Supabase (PostgreSQL + Auth)
- **Deployment**: Vercel (frontend + rewrites para /api), FastAPI serverless
- **Communication**: JWT-based authentication via Bearer tokens (Supabase Auth)

## Backend (app/)

### Structure
```
app/
  main.py       # FastAPI app, routes, rate limiter, CORS, JWT dependency (get_user)
  models.py     # Pydantic models + validadores (CPF módulo 11, RG, telefone, data)
  storage.py    # Supabase client singleton & CRUD operations (RLS por user_id)
```

### Key Models
- **UserSignUp** / **UserLogin** / **TokenResponse** — Auth flows
- **Plano** / **PlanoCreate** / **PlanoUpdate** — Dynamic per-user plans com color themes
- **Cliente** / **ClienteCreate** / **ClienteUpdate** — Full CRUD com 30+ campos
- **Validação**: `validar_cpf()` módulo 11, `cpf_validator()`, RG 7-12 dígitos, telefone 10-15 dígitos, data_nascimento ISO

### API Endpoints (main.py)
| Method | Endpoint | Description |
|---|---|---|
| GET /api/health, /api | Health check |
| POST /api/auth/signup | Register user (rate limit 5/min) |
| POST /api/auth/login | Login & get JWT (rate limit 10/min) |
| GET /api/planos | List user's plans |
| POST /api/planos | Create plan |
| PATCH /api/planos/{id} | Update plan |
| DELETE /api/planos/{id} | Delete plan |
| GET /api/clientes | List clients (authenticated) |
| POST /api/clientes | Create client |
| PATCH /api/clientes/{id} | Update client |
| DELETE /api/clientes/{id} | Delete client |

### Authentication
- JWT tokens via Supabase Auth (`supabase.auth.get_user(token)` valida assinatura, expiração, revogação)
- `Authorization: Bearer <token>` header required for protected routes
- `obter_user_id` (async) depende de `get_user`; NÃO aceita UUID direto (previne spoofing)
- Frontend: `localStorage df_token` + `fetchAuth()` wrapper trata 401 → limpa sessão e redirect `/?login=true`

### Storage (storage.py)
- Singleton Supabase client (`_supabase_client`)
- CRUD para planos e clientes sempre filtrado por `user_id` (RLS + defesa em profundidade)
- `_COLUNAS_CLIENTE` lista explícita de colunas
- `is not None` preserva falsy válidos (ativo=False) em PATCH
- Default plan: "basico", default ativo: `True`

## Frontend (/)

### Pages
- **index.html** — Landing page (hero com mockup, features 3 cards, how-it-works 3 passos, about corporativo, CTA final, navbar, modais login/register, footer legal)
- **dashboard.html** — Painel administrativo (métricas 4 cards, toolbar busca+filtros, tabela desktop + cards mobile, FAB, modais criar/editar/deletar/planos/detalhes/logout)
- **privacidade.html** — Política de Privacidade LGPD (11 seções)
- **termos.html** — Termos de Serviço (15 seções)
- **404.html** — Error page com links para home/dashboard

### Key Features
- **Client Management**: Full CRUD com 30+ campos, máscaras, validação, busca CEP (ViaCEP sanitizado)
- **Plan System**: Dinâmico por usuário, 8 cores (indigo/cyan/emerald/amber/rose/purple/slate/orange), badges
- **Authentication**: Signup/login via Supabase, fetchAuth centralizado, token obrigatório
- **Responsive**: Mobile-first, dark mode, bottom-sheet nos modais, min-height 42px nos botões
- **Modals**: Login, register, cliente criar/editar/detalhes/deletar, planos, logout
- **Metrics**: Real-time stats (total, ativos, inativos, por plano)
- **Demo Mode**: `IS_LOCAL` controla `CLIENTES_DEMO`; produção nunca expõe mock PII

### Styling (style.css)
- **Design Tokens**: CSS vars `--dash-*` (light/dark), accent indigo-600 (#4f46e5)
- **Dashboard**: Form, buttons (primary/ghost/danger), metric cards, toggles, color dots, modais, client cards
- **Landing**: `fadeInUp` + stagger, `.reveal` via IntersectionObserver, `feature-card` hover, `navbar-scrolled` blur
- **Removido**: `.gradient-text`, `.btn-glow`, blob, shimmer, `.pricing-highlight`, `.step-line`, pulse-slow
- **Documentado**: Header explicando estrutura, tokens, animações cubic-bezier(0.16,1,0.3,1)

### JavaScript (app.js)
- **Cabeçalho documentado**: Arquitetura SPA, 19 seções, segurança, performance
- **Env**: `IS_LOCAL` + `API_BASE_URL` auto-detect
- **Auth**: `obterAuthHeaders()` exige token, `fetchAuth()` trata 401
- **Estado**: `clientesCache`, `planosCache`, `modoDemo`, `MAPA_CORES_PLANO`
- **Features**: Tema, status API (polling 15s), planos CRUD, clientes CRUD, métricas, filtragem, badges, avatar, ViaCEP sanitizado, máscaras, validações (CPF módulo 11), toasts
- **Segurança**: `escaparHTML` em toda interpolação, token só em header, ViaCEP sanitizado, demo só local

## Database (Supabase)
- **Tables**: `clientes`, `planos`
- **Policies**: RLS por `user_id` ( `auth.uid() = user_id` )
- **Columns - clientes**: user_id, nome, email, plano, ativo, data_cadastro, telefone, cpf, rg, data_nascimento, genero, empresa, cargo, observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado
- **Columns - planos**: user_id, nome, cor, descricao, valor

## Recent Refactoring — Redesign Profissional (2026-08-26)
**Goal**: Remover vibecoding, atingir visual corporate sóbrio + correções de segurança + legal + docs

### Landing Page (index.html)
- Removida seção `#pricing` completa + links "Preços" no navbar (desktop/mobile) e footer
- Hero redesenhado: headline "Gestão de clientes sem planilhas.", copy enxuta, CTAs indigo-600, mockup com browser chrome, social proof com sistema online / +500 / 99.9%
- Features: 4 → 3 cards (Gestão Centralizada, Métricas em Tempo Real, Segurança Corporativa), sem "Saiba mais", ícones indigo-400
- How It Works: removido `.step-line`, badges indigo-600 sólidos, copy simplificada, CTA indigo
- About: novo layout 3 pilares (Segurança por Design, Performance Real, Feito para Escalar) + borda indigo
- CTA Final: borda indigo, botão hover indigo-500
- Modais login/register: bordas indigo 15%, focus indigo, checkbox/links indigo, typo `fg-` → `bg-` corrigido
- Favicon SVG inline (indigo + check) em index/dashboard/404/privacidade/termos
- Tailwind config limpo: removido cyan/emerald e animation pulse-slow
- Animação: removido `forced visible` no DOMContentLoaded que quebrava scroll reveal; agora reveal funciona via IntersectionObserver
- Comentário header HTML adicionado

### Dashboard (dashboard.html)
- Header logo: `from-cyan-to-emerald` → `bg-indigo-600` sólido
- Metric cards: Total blue → indigo, Por Plano purple → indigo
- Toolbar: search focus ring cyan → indigo, ícones planos/export emerald → slate
- FAB mobile: gradient cyan-emerald → indigo-600
- Modais: headers padronizados indigo-600/15 (criar/editar), já indigo em planos/logout
- Color picker: 8 cores mantidas (indigo/cyan/emerald/amber/rose/purple/slate/orange)
- Footer expandido com links Política/Termos
- Comentário header HTML adicionado

### Páginas Legais (novas)
- `privacidade.html`: 11 seções LGPD (coleta, uso, armazenamento RLS/JWT/bcrypt/TLS, compartilhamento, direitos Art. 18, retenção, cookies, subprocessadores, transferência internacional, alterações, contato DPO)
- `termos.html`: 15 seções (aceitação, descrição, elegibilidade, cobrança gratuito → futuro pago com aviso 30d, uso aceitável, dados, IP, disponibilidade, suspensão, isenção, limitação, indenização, foro SP, disposições, contato)
- Links atualizados em index footer, 404 footer, dashboard footer, modal register checkbox

### Style (style.css)
- Removido: `.pricing-highlight`, `.step-line::after`, pulse-slow
- Documentado header com estrutura e tokens
- Mantido: fadeInUp, stagger, reveal, feature-card hover, navbar-scrolled

### Segurança (auditoria `seguranca-test` + correções)
- **CRÍTICO 1**: `extrair_user_id` com base64 sem validar assinatura → substituído por `supabase.auth.get_user(token)` async (valida assinatura JWKS, expiração, revogação); endpoints viraram `async`
- **CRÍTICO 2**: `obterAuthHeaders() || obterUserId()` fallback → removido; agora lança erro se token ausente; criado `fetchAuth()` wrapper que trata 401 + redirect `/?login=true` (10 ocorrências migradas)
- **ALTA 1**: CORS regex permissivo `*.vercel.app` → restrito a `allow_origins=[daviflowgestoes, daviflow]` + regex só localhost com porta
- **ALTA 2**: `detail=f"Erro: {str(e)}"` vazando stack → mensagens genéricas "Erro interno..."
- **MÉDIA 1**: CPF só checava 11 dígitos/sequência → implementado `validar_cpf()` módulo 11 completo (2 dígitos verificadores) + `cpf_validator()` reaproveitado em Cliente/ClienteCreate/ClienteUpdate
- **MÉDIA 2**: Sem rate limiting → adicionado `slowapi` (Limiter + `app.state.limiter`), `5/min` signup, `10/min` login, `slowapi>=0.1.9` em requirements
- **MÉDIA 3**: `CLIENTES_DEMO` exposto em produção → condicional `IS_LOCAL ? [...] : []`, `carregarClientes` só usa demo se `IS_LOCAL && cache vazio`
- **BAIXA 1**: ViaCEP sem validação → sanitização `replace(/[<>\"'&]/g,'')`, limite 200 chars, validação de campos esperados

### Documentação (docs)
- `app/main.py`: Header de módulo, rate limiter, CORS, JWT obtendo user_id, Status, Auth, Planos, Clientes (docstrings completas)
- `app/models.py`: Header, `validar_cpf` passo a passo, `cpf_validator`, docstrings de User*, Plano*, Cliente* com validações
- `app/storage.py`: Header, singleton, auth, planos/clientes com RLS e `is not None`
- `app.js`: Header de arquitetura (19 seções + segurança + performance) e comentários expandidos em cada seção (0-19)
- `style.css`: Header de design system
- HTML headers: `index.html`, `dashboard.html`, `privacidade.html`, `termos.html`, `404.html`
- Fix: `404.html` favicon + footer legal, `dashboard.html` favicon, `index.html` favicon

## Tech Stack
- **Language**: Python 3.12 (backend), HTML/CSS/JS (frontend)
- **Framework**: FastAPI 0.141, Tailwind CSS v3 (CDN)
- **Auth**: Supabase Auth (JWT, bcrypt cost 12)
- **Database**: PostgreSQL (via Supabase) + RLS
- **Hosting**: Vercel (frontend + rewrites), Supabase (backend)
- **Icons**: Lucide (createIcons)
- **Fonts**: Google Fonts — Inter 300-900
- **Rate Limit**: slowapi 0.1.10 + limits

## Development
- **Local API**: `http://127.0.0.1:8000/api`
- **Environment**: `.env` ou `data/arquivos.env` (SUPABASE_URL, SUPABASE_KEY, opcional ALLOWED_ORIGINS)
- **Dependencies**: `fastapi`, `uvicorn`, `supabase`, `python-dotenv`, `pydantic`, `email-validator`, `slowapi`, `httpx`, `httpcore`, `limits`
- **Scripts**: `app.js` auto-detecta localhost vs Vercel (`IS_LOCAL`, `API_BASE_URL`)
- **Health**: GET /api/health e GET /api
- **Security headers**: Bearer JWT obrigatório, CORS restrito, rate limit auth
- **Security tests**: CPF módulo 11, imports, rotas — todos passando (2026-08-26)

## Roadmap — Próximas Funcionalidades (Aprovado 2026-08-26)
> Baseado em benchmark de Agendor, RD Station, Pipedrive, HubSpot, Salesforce. Questionário 8/8 aprovado como "completo".
> Detalhe completo em `plan.md`. Fase 1 e 2 totalmente aprovadas; Fase 3 é backlog.

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

**Site**: Landing ganha dobras Pipeline Kanban + Rotina (timeline/WhatsApp); Dashboard ganha toggle Tabela|Kanban (SortableJS), timeline no drawer, barra de tags, métricas Follow-ups/Receita/Churn, botão Importar, gráficos Chart.js.
**Exclusões**: Nenhuma das 8 features foi rejeitada; PIX/boleto real e multi-usuário ficam para Fase 3.

## Quick Start
1. Set env vars: `SUPABASE_URL`, `SUPABASE_KEY` (e opcional `ALLOWED_ORIGINS`)
2. Install: `pip install -r requirements.txt`
3. Run backend: `uvicorn app.main:app --reload`
4. Open `index.html` — frontend conecta em `/api` (detecta local vs Vercel)
5. Full dashboard em `/dashboard.html` (requer auth; sem token redirect para `/?login=true`)
6. Páginas legais: `/privacidade.html`, `/termos.html`
7. Roadmap detalhado: `plan.md`
