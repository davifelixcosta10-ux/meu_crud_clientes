# DaviFlow — Plano de Evolução Atualizado (2026-09-02)

> **Status `main@2670d3a` + `f267a98` + `56a5180`: Fase 1 ✅, 2A ✅, 2B ✅, 2C ✅, 3A-3C ✅, 4A-4C ✅. 3D pausado (Stripe). Próximo: Consolidação QA ou 2B refinamento.**

## Resumo Fase Atual (15 merges, 55+ rotas)

| Fase | Status | Branch → Main | Entrega |
|---|---|---|---|
| 1A-E | ✅ 2026-08-27 | `teste/fase1` → `197beb9` | Kanban, atividades, tags, financeiro, import |
| 2A 1-4 | ✅ 2026-08-30 | `feat/fase2a-*` → `eee7177..7999cbb` | Conversão, Receita, Churn, LTV (Chart.js) |
| 3A-2 | ✅ 2026-09-01 | `feat/fase3a-2-permissoes` → `654ab67` | `admin/membro` `403` + `opacity-50` |
| 3B | ✅ 2026-09-01 | `feat/fase3b-integracoes` → `f586f84` | Calendar/Zapier webhooks + `is_org_member` fix `42P17` |
| 3C | ✅ 2026-09-01 | `feat/fase3c-anexos-api` → `9257c23` | `bucket anexos` 10MB + `api_keys` HMAC |
| 4A | ✅ 2026-09-02 | `feat/fase4a-verticals` → `e0c2960` | 5 verticais + `campos_custom` multi-carro |
| 4B | ✅ 2026-09-02 | `feat/fase4b-sidebar` → `6888f8f` | `aside 240px` + 6 seções `#hash` |
| 4C | ✅ 2026-09-02 | `feat/fase4c-settings` → `dcf9f77` | 7 abas `Geral..Conta` |
| 2B | ✅ 2026-09-02 | `feat/fase2b-whatsapp` → `2670d3a` | `templates_whatsapp` + `wa.me` `{{placa}}` |
| 2C | ✅ 2026-09-02 | `feat/fase2c-automacoes` → `6e35f40` | `automacoes` + `pg_cron 09:00 UTC` |
| Security | ✅ 2026-09-02 | direto → `56a5180` | 22 fixes OWASP (F1-F21 Mega Brain) |
| Org | ✅ 2026-09-02 | direto → `f267a98` | `supabase/migrations 001-007` + `README` |

## Próximo Plano — Consolidação (1-2 dias) + 3D Backlog

### Consolidação QA (sem DB, 1 branch `feat/consolidacao-qa`)
- **Testes:** `tests/test_health.py` já, adicionar `test_rbac.py` (`membro` 403 em `planos/etapas/templates/automacoes`), `test_org_isolation.py` (`GET /api/clientes?org_id=B` com key de A → 403), `test_vertical_campos_custom` (carros jsonb roundtrip), `playwright` smoke `setSecao('kanban')` persists `#hash` + mobile drawer
- **Docs:** atualizar `plan.md` este arquivo + `context.md` já feito, `README` já, `supabase/README` ordem `001→007`, `vercel.json` CSP já
- **Perf:** Vercel Speed Insights antes `FCP 6.23s` → após `gru1` + `Cache-Control private` + `SRI` deve estar `85+`
- **Critério:** `py_compile` + `node --check` + `TestClient` `httpx` todos verdes, nenhum `console.log` em prod, nenhum `supabase/*.sql` em root

### 3D Monetização/PWA (quando Stripe liberar, pausado)
- `supabase_fase3d.sql` `pagamentos(id, user_id, org_id, status, valor, stripe_session_id)`, `POST /api/billing/webhook` (Stripe `constructEvent`), `GET /api/billing/status`, `Config → Conta` badge `Assinatura ativa` + botão `Pagar` + `manifest.json` + `service-worker.js` offline + `beforeinstallprompt`
- **Não fazer agora:** sem `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` em Vercel Env

### Ordem Recomendada (incremental, 1 branch + 1 Preview)
1. `feat/consolidacao-qa` → `merge --no-ff` (hoje/amanhã)
2. Quando Stripe tiver conta: `feat/fase3d-billing` → `supabase_fase3d.sql` → `api/billing/webhook` → `PWA`
3. Depois: refinamentos 4A (validação `placa` BR regex `/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/`, `dente` 1-32) ou novos verticais `custom`

## Critérios de Aceite (para merge 2B/2C já feitos)
- `wa.me` abre com `+ 55` + `{{nome}}` + `{{placa}}` do `carros[0]` sem XSS
- `pg_cron` `automacoes-diario` `0 9 * * *` existe (`select * from cron.job`), `POST /api/automacoes/run` como `admin` cria `🤖` em `Agenda` sem duplicar em 24h, como `membro` dá `403`
- `X-API-Key` `davi_...` HMAC `prefix` lookup + `is_org_member` em `GET /api/templates?org_id`

## Riscos Atuais Mitigados
- `42P17 infinite recursion` fix `is_org_member` SECURITY DEFINER + `revoke anon` (F21)
- `42804 date text` fix `data_cadastro::date` (fix_2c_data_cast)
- `42804 data date text` fix `current_date` sem `::text` (fix_automacoes)
- `PGRST205 api_keys` → `supabase_all.sql` + `NOTIFY pgrst, 'reload schema'`

## O Que NÃO Fazer Agora
- Não mover `vercel.json`, `api/index.py`, `dashboard.html`, `app.js`, `style.css` de root (Vercel root)
- Não reintroduzir `load_dotenv("data/arquivos.env")` (F18)
- Não expor `str(e)` em `detail` (F15)

---
*Plano gerado 2026-09-02 17:00 UTC — próximo branch `feat/consolidacao-qa`.*
