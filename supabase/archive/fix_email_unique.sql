-- ============================================================
-- Fix: clientes.email deve ser único por usuário, não global
-- Problema: constraint clientes_email_key (UNIQUE email) impede
-- dois usuários terem o mesmo cliente (ex: importar dados de teste
-- para conta do pai falha com 23505 duplicate key)
-- Solução: drop global unique, cria unique por (user_id, email)
-- Executar no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Remove constraint global se existir
alter table clientes drop constraint if exists clientes_email_key;

-- 2. Remove índice antigo se existir (algumas instalações criam índice, não constraint)
drop index if exists clientes_email_key;

-- 3. Cria índice único por usuário (permite mesmo email em usuários diferentes)
create unique index if not exists clientes_user_email_unique on clientes(user_id, email);

-- 4. Verificação (opcional)
-- select conname, contype from pg_constraint where conrelid = 'clientes'::regclass;
-- select indexname, indexdef from pg_indexes where tablename = 'clientes';

-- Após rodar, teste: exportar da conta teste e importar na conta do pai deve dar 3/3
