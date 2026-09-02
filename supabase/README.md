# Supabase Migrations — Ordem de Execução

Rode como `service_role` no SQL Editor, na ordem:

1. `migrations/001_fase1.sql` — etapas, atividades, tags, cliente_tags, filtros_salvos + colunas clientes
2. `migrations/002_fase2b_templates.sql` — templates_whatsapp
3. `migrations/003_fase2c_automacoes.sql` — automacoes + `run_automacoes()` + `pg_cron` (habilite `pg_cron` em Database → Extensions)
4. `migrations/004_fase3a_org.sql` — organizacoes, membros, org_id em 5 tabelas + RLS `org_id`
5. `migrations/005_fase3b_integracoes.sql` — integracoes
6. `migrations/006_fase3c_anexos.sql` — bucket `anexos` + anexos + api_keys
7. `migrations/007_fase4a_verticals.sql` — verticais + organizacoes.vertical + clientes.campos_custom

Se já tem dados e deu `42P17 infinite recursion` ou `PGRST205`, rode `archive/fix_*.sql`:
- `fix_recursion_is_org_member.sql` + `fix_security_anon.sql` (is_org_member SECURITY DEFINER)
- `fix_2c_data_cast.sql` (data_cadastro::date)
- `fix_planos_org.sql` (planos org-based)

Para fresh install, basta `cat supabase/migrations/*.sql > supabase_all.sql` e rodar uma vez.
