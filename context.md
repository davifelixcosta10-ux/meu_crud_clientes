# DaviFlow — Project Summary

## Overview
Full-stack CRM application for client and plan management, designed for freelancers, solo entrepreneurs, and small businesses. Features a modern landing page with a corporate/somber visual design, and a complete dashboard administrative interface.

**Tagline**: Gestão de clientes sem planilhas — organize seus cadastros, métricas e planos em um painel intuitivo.

## Architecture
- **Backend**: FastAPI (Python) — RESTful API with authentication, client management, and plan management
- **Frontend**: Static HTML + Tailwind CSS + Vanilla JS + Lucide Icons
- **Database**: Supabase (PostgreSQL + Auth)
- **Deployment**: Vercel (frontend), custom FastAPI deployment
- **Communication**: JWT-based authentication via Bearer tokens

## Backend (app/)

### Structure
```
app/
  main.py       # FastAPI app, routes, authentication dependency
  models.py     # Pydantic models (User, Client, Plan)
  storage.py    # Supabase client & CRUD operations
```

### Key Models
- **UserSignUp** / **UserLogin** / **TokenResponse** — Auth flows
- **Plano** / **PlanoCreate** / **PlanoUpdate** — Dynamic per-user plans with color themes
- **Cliente** / **ClienteCreate** / **ClienteUpdate** — Full CRUD with 30+ fields (name, contact, address, notes)

### API Endpoints (main.py)
| Method | Endpoint | Description |
|---|---|---|
| GET /api/health | Health check |
| POST /api/auth/signup | Register user |
| POST /api/auth/login | Login & get JWT |
| GET /api/planos | List user's plans |
| POST /api/planos | Create plan |
| PATCH /api/planos/{id} | Update plan |
| DELETE /api/planos/{id} | Delete plan |
| GET /api/clientes | List client (authenticated) |
| POST /api/clientes | Create client |
| PATCH /api/clientes/{id} | Update client |
| DELETE /api/clientes/{id} | Delete client |

### Authentication
- JWT tokens via Supabase Auth
- `Authorization: Bearer <token>` header required for protected routes
- `obter_user_id` dependency extracts user UUID from token

### Storage (storage.py)
- Singleton Supabase client
- CRUD for plans (user-scoped by `user_id`)
- CRUD for clients (user-scoped by `user_id`)
- Default plan: "basico", default active: `True`

## Frontend (/)

### Pages
- **index.html** — Landing page (hero, features, pricing, about, CTA, navbar, modals)
- **dashboard.html** — Administrative dashboard (client list, CRUD operations, plan management)
- **404.html** — Error page

### Key Features
- **Client Management**: Full CRUD with all contact/personal/address fields
- **Plan System**: Dynamic per-user plans with color-coded badges
- **Authentication**: Signup/login with Supabase, protected routes
- **Responsive**: Mobile-first, dark mode support
- **Modals**: Login, register, client create/edit/details, plan management
- **Metrics**: Real-time stats cards, per-plan breakdowns

### Styling (style.css)
- **Design Tokens**: CSS variables for dashboard theme (light/dark mode)
- **Dashboard**: Form elements, buttons, metric cards, toggle switches, modals
- **Landing**: Custom utilities, animations (fade-in-up stagger), reveal effects
- **Removed**: `.gradient-text`, `.btn-glow`, blob animations, gradient effects — replaced with solid colors

### JavaScript (app.js)
- API integration with automatic online/offline detection
- Local demo mode when API unavailable
- Client CRUD operations
- Plan management
- Status toggling
- CEP lookup (ViaCEP)
- Form validation
- Theme switching (dark/light)

## Database (Supabase)
- **Tables**: `clientes`, `planos`
- **policies**: Row-level security by `user_id`
- **Columns - clientes**: user_id, nome, email, plano, ativo, data_cadastro, telefone, cpf, rg, data_nascimento, genero, empresa, cargo, observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado
- **Columns - planos**: user_id, nome, cor, descricao, valor

## Recent Design System Refactoring (context.md focus)
**Goal**: Remove AI/vibecoding clichés, achieve corporate sober visual

### Changes Made
- **Colors**: Solid `indigo-600` (#2563EB) for CTA buttons; removed all purple/cyan gradients
- **Effects**: Removed `.btn-glow`, blob animations, shimmer, gradient text
- **Components**: Simplified badges, borders, hover states
- **Preserved**: Dark theme, font Inter, Lucide Icons, layout structure, all backend logic

### Files Modified
- `index.html` — Landing page visual update
- `style.css` — Removed gradient-text, btn-glow, blob, shimmer animations

### Not Modified
- ✅ Backend FastAPI logic
- ✅ Supabase integrations  
- ✅ Theme dark class
- ✅ Navigation structure
- ✅ Modal functionality
- ✅ Dashboard components (app.js)
- ✅ Font Inter & Tailwind config
- ✅ Lucide Icons
- ✅ Routing/pages

## Tech Stack
- **Language**: Python 3.12 (backend), HTML/CSS/JS (frontend)
- **Framework**: FastAPI, Tailwind CSS v3
- **Auth**: Supabase Auth (JWT)
- **Database**: PostgreSQL (via Supabase)
- **Hosting**: Vercel
- **Icons**: Lucide
- **Fonts**: Google Fonts — Inter

## Development
- **Local API**: `http://127.0.0.1:8000/api`
- **Environment**: `.env` or `data/arquivos.env` (SUPABASE_URL, SUPABASE_KEY)
- **Dependencies**: `fastapi`, `uvicorn`, `supabase`, `python-dotenv`, `pydantic`
- **Scripts**: `app.js` auto-detects localhost vs Vercel deployment
- **Security fixes applied**:
  - Error messages genericized to avoid exposing internal details (`app/main.py`)
  - Input validation for CPF, RG, telefone and data_nascimento format (`app/models.py`)
  - CORS methods/headers restricted instead of wildcards (`app/main.py`)
  - Password minimum length validation in `UserSignUp` model (`app/models.py`)
  - Fixed toggleStatusCliente toast displaying correct client ID (`app.js`)

## Quick Start
1. Set env vars: `SUPABASE_URL`, `SUPABASE_KEY`
2. Run backend: `uvicorn app.main:app --reload`
3. Open `index.html` — frontend connects to `/api`
4. Full dashboard at `/dashboard` route (requires auth)