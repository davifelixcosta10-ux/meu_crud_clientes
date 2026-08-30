# Instruções de Operação — DaviFlow

## Orientação de Idioma
- Todas as respostas devem ser sempre criadas em **português**.

## Fluxo de Git — Obrigatório usar Branch + Preview (a partir de 2026-08-28)
**NUNCA commitar direto em `main`. Sempre:**

1. Criar branch nova a partir de `main` atualizada:
```bash
git checkout main && git pull origin main
git checkout -b fix/nome-da-tarefa  # ou feat/nome
```
2. Fazer alterações, testar local (`python -m py_compile`, `node --check`, `pytest` se houver)
3. Commit e push da branch:
```bash
git add .
git commit -m "tipo: descrição curta"
git push -u origin fix/nome-da-tarefa
```
4. Vercel gera automaticamente deploy **Preview** para a branch — testar no link Preview antes de merge
5. Só após aprovação no Preview, fazer merge para `main` via PR ou `git checkout main && git merge fix/nome-da-tarefa && git push`

**Obs:** Mensagem de commit gerada automaticamente conforme o que foi feito (ex: "fix: corrige validacao CPF leniente", "feat: adiciona relatorios").

## Fluxo Legado (mantido para referência)
Ao final de qualquer criação em branch, execute commit/push **na branch**, não em `main`.

## Resumo das Alterações
Após completar as alterações, adicione um resumo nesta seção da seguinte forma:

**Título**: Breve descrição do tipo de alteração (ex: "security", "feat", "fix", "docs")

**Descrição**: 3 a 4 linhas resumindo o que foi feito na sessão. Se houver alterações na mesma sessão, atualize o título e descrição para englobar todas as mudanças realizadas.

**Arquivos modificados**: Liste os arquivos principais alterados.

## Lembrete de Segurança
Caso sejam feitas alterações que possam ter risco de segurança (injeção, XSS, CSRF, exposição de dados, autenticação fraca, validação inadequada), execute a skill `use skill seguranca-test` ou `@seguranca-test` para identificar vulnerabilidades e sugerir correções.

## Fluxo de Desenvolvimento Incremental (a partir de 2026-08-27) — ATUALIZADO 2026-08-30: quebrar em pedaços pequenos
- **Parte por parte, nunca tudo de uma vez**: implementar uma sub-feature por vez (ex: Fase 1A → 1B → 1C...), testar e corrigir antes de avançar
- **Quebrar fases grandes em pedaços 1 branch + 1 Preview por pedaço** (lição Fase 2A): ex `2A-1 Conversão` `feat/fase2a-1-conversao` → Preview → merge; `2A-2 Receita` `feat/fase2a-2-receita`; `2A-3 Churn`; `2A-4 LTV`; Fase 3 em `3A Org`, `3B Integrações`, `3C Anexos/API`, `3D Monetização/PWA` — nunca monolito
- Cada pedaço: branch a partir de `main` atualizada, `python -m py_compile` + `node --check` + `TestClient` se backend, commit com `feat:`/`fix:` e `git push -u origin feat/...` para gerar Preview Vercel; só após aprovar Preview fazer `git checkout main && git merge --no-ff feat/... && git push`
- Cada pedaço deve ter commit e push separado com bateria de testes (imports, validações, RLS, rotas, frontend)
- Não quebrar `main` — produção estável; `feat/*` é a branch de validação antes de produção (legado `teste/fase1` descontinuado, usar `feat/*`)
- Ao final de cada pedaço: atualizar `plan.md` e `context.md` com o que foi entregue; ao final da fase marcar ✅ no `plan.md`

---

## Padrões Backend — Não Alterar

> **Regra crítica:** Lógica do backend e integrações **nunca** serem alteradas a menos que explicitamente solicitado.

- FastAPI (Python 3.12) — main.py, models.py, storage.py
- **Não modificar** rotas API, modelos Pydantic, lógica de autenticação sem pedido explícito
- Supabase (PostgreSQL + Auth) — CRUD de clientes e planos
- **Não modificar** policies RLS, estruturas de tabelas, queries de banco sem pedido
- Autenticação: JWT via Supabase Auth (`supabase.auth.get_user(token)` valida assinatura) — `app/main.py:obter_user_id` async, NÃO aceita UUID direto
- CORS: origens explícitas (`daviflowgestoes.vercel.app`, `daviflow.vercel.app` + localhost) + regex só para localhost com porta; `allow_methods`/`allow_headers` restritos
- Rate limiting: `slowapi` — 5/min signup, 10/min login (`app/main.py`)
- Error messages: genéricas, sem `str(e)` em produção

---

## Padrões de Dados Específicos
### Tabela `clientes` (Supabase)
- Campos obrigatórios: nome, email, plano, ativo
- 30+ campos opcionais: telefone, cpf, rg, data_nascimento, genero, empresa, cargo, observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado
- user_id para row-level security (RLS + filtro `eq("user_id", user_id)` em storage.py)
- Validações: CPF módulo 11, RG 7-12 dígitos, telefone 10-15 dígitos, data_nascimento ISO

### Tabela `planos` (Supabase)
- Campos: user_id, nome, cor, descricao, valor
- Planos dinâmicos por usuário (8 cores: indigo/cyan/emerald/amber/rose/purple/slate/orange)
- Padrão: "basico", ativo por padrão
- `MAPA_CORES_PLANO` em app.js mapeia cor → Tailwind classes

### Validações Obrigatórias (já em app/models.py)
- CPF: algoritmo módulo 11 completo (`validar_cpf` + `cpf_validator`)
- RG, telefone, data_nascimento: validadores Pydantic
- Frontend espelha CPF em `app.js:validarCPF` + sanitização ViaCEP

---

## Páginas e Rotas
- **index.html**: Landing page (hero com mockup + browser chrome, features 3 cards, how-it-works 3 passos sem step-line, about 3 pilares, CTA, navbar, modais, footer legal)
- **dashboard.html**: Painel administrativo (métricas 4 cards, toolbar busca+filtros, tabela desktop + cards mobile, FAB, modais criar/editar/deletar/planos/detalhes/logout)
- **privacidade.html**: Política LGPD 11 seções
- **termos.html**: Termos 15 seções
- **404.html**: Página de erro (links home/dashboard, footer legal)
- API base: `http://127.0.0.1:8000/api` (local, quando IS_LOCAL) ou `${origin}/api` (Vercel)

---

## Desenvolvimento Local
1. Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_KEY` (em `.env` ou `data/arquivos.env`, opcional `ALLOWED_ORIGINS`)
2. Rode backend: `uvicorn app.main:app --reload` (ou `pip install -r requirements.txt` antes)
3. Abra `index.html` — frontend conecta para `/api` (auto-detect IS_LOCAL)
4. Dashboard em `/dashboard.html` (requer auth; `fetchAuth` trata 401 → `/?login=true`)
5. Health: `GET /api/health` e `GET /api`

## Segurança Aplicada (pós auditoria 2026-08-26)
- Validação JWT server-side via `supabase.auth.get_user` (não decodificar base64 manualmente)
- `fetchAuth()` wrapper no frontend (10 usos) centraliza `Authorization: Bearer` e 401 handling
- `CLIENTES_DEMO` só existe se `IS_LOCAL` (nunca em produção)
- ViaCEP sanitizado (`replace(/[<>\"'&]/g,'')`, limite 200 chars, validação de campos)
- `escaparHTML()` em toda interpolação de dados do usuário (previne XSS)
- `slowapi` rate limiting em auth endpoints
- Mensagens de erro genéricas no backend

## Mudanças Recentes
- Páginas legais adicionadas (privacidade.html, termos.html)
- Correções de segurança aplicadas (JWT, CORS, rate limiting)
- Documentação adicionada nos módulos principais
