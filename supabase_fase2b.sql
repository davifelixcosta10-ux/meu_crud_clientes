-- ============================================================
-- DaviFlow — Fase 2B — WhatsApp Templates (wa.me)
-- Tabela templates_whatsapp por org + RLS is_org_member + vertical
-- Executar no SQL Editor (service_role) — requer supabase_fix_recursion.sql
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists templates_whatsapp (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  mensagem text not null,
  plano_id uuid references planos(id) on delete set null,
  etapa_id uuid references etapas(id) on delete set null,
  vertical text check (vertical in ('geral','hospital','lava_rapido_oficina','dentista','academia')),
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_org on templates_whatsapp(org_id);
create index if not exists idx_templates_vertical on templates_whatsapp(vertical);
create index if not exists idx_templates_user on templates_whatsapp(user_id);
alter table templates_whatsapp enable row level security;
drop policy if exists "templates_org_isolation" on templates_whatsapp;
create policy "templates_org_isolation" on templates_whatsapp
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Seed opcional: 2 templates genéricos por org existente (se vazia)
-- Não insere se já houver templates
do $$
begin
  if not exists (select 1 from templates_whatsapp limit 1) then
    -- Não temos org_id aqui sem loop, deixa vazio — frontend cria via UI
    null;
  end if;
end $$;

select 'fase2b ok' as status;
