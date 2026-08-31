-- ============================================================
-- DaviFlow — Fase 3B — Integrações (Calendar/Zapier/Conta Azul)
-- Tabela integracoes por org + RLS org-based + webhook Zapier
-- Executar no SQL Editor do Supabase (service_role)
-- ============================================================

create extension if not exists "uuid-ossp";

-- 1. Tabela integracoes
create table if not exists integracoes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('calendar','zapier','contaazul','webhook')),
  nome text not null default '',
  config jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_integracoes_org on integracoes(org_id);
create index if not exists idx_integracoes_user on integracoes(user_id);
create index if not exists idx_integracoes_tipo on integracoes(tipo);
alter table integracoes enable row level security;

-- 2. Backfill org_id para dados antigos (se houver sem org)
-- tenta associar via user_id -> primeira org do user
update integracoes i set org_id = (select id from organizacoes where owner_id = i.user_id limit 1)
where i.org_id is null and i.user_id is not null;

-- 3. RLS org-based (mesma regra de clientes/etapas)
drop policy if exists "integracoes_org_isolation" on integracoes;
create policy "integracoes_org_isolation" on integracoes
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

-- 4. Função helper para webhook Zapier/Make validar integração ativa
create or replace function zapp_webhook_payload_valid(p_tipo text)
returns boolean
language sql
security definer
as $$
  select p_tipo in ('calendar','zapier','contaazul','webhook');
$$;
