# Regras duras — DaviFlow

- Responder sempre em português.
- Nunca commitar direto em `main`: branch `feat/*`/`fix/*` → push → Preview Vercel → aprovação → `merge --no-ff`.
- Não alterar lógica de backend, auth, rotas, modelos Pydantic ou policies RLS sem pedido explícito. Mudanças visuais preservam ids, `data-*`, handlers e seletores.
- Não mover do root: `vercel.json`, `api/index.py`, `dashboard.html`, `app.js`, `style.css` (Vercel serve do root).
- Não reintroduzir `load_dotenv("data/arquivos.env")`; nunca expor `str(e)` em `detail`; JWT só via `supabase.auth.get_user` (nunca decodificar base64 manualmente).
- UI novo segue o design system neo-brutalista monocromático descrito em `.omp/AGENTS.md`.
- Migrations: `supabase/migrations/0NN_descricao.sql` numeradas e ordenadas; fixes pontuais em `supabase/archive/` (executar como `service_role`).
- Antes de todo commit: `py_compile` + `node --check` + `pytest -q` verdes.
- Nunca versionar `.env`, `venv/`, `.omo/`, `playwright-report/`, `test-results/`.
