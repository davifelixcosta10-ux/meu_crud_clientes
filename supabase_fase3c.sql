-- ============================================================
-- DaviFlow — Fase 3C — Anexos + API Pública (API Keys)
-- Tabelas anexos (Storage) + api_keys + bucket anexos
-- Requer supabase_fix_recursion.sql já aplicado (is_org_member)
-- Executar no SQL Editor (service_role)
-- ============================================================

create extension if not exists "uuid-ossp";

-- 1. Bucket Storage anexos (privado, por org)
insert into storage.buckets (id, name, public)
values ('anexos','anexos', false)
on conflict (id) do nothing;

-- Policies Storage (apenas membros da org via is_org_member)
-- Nota: storage.objects tem owner e bucket_id; usamos prefixo org_id/cliente_id/filename
-- Política simples: permite tudo para membros (controle via backend + RLS tabela anexos)
-- Se já existir, recria
drop policy if exists "anexos_storage_member" on storage.objects;
create policy "anexos_storage_member" on storage.objects
  for all using (
    bucket_id = 'anexos'
    and (
      auth.role() = 'service_role'
      or is_org_member((string_to_array(name,'/'))[1]::uuid)
    )
  ) with check (
    bucket_id = 'anexos'
    and (
      auth.role() = 'service_role'
      or is_org_member((string_to_array(name,'/'))[1]::uuid)
    )
  );

-- 2. Tabela anexos (metadata)
create table if not exists anexos (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id bigint not null references clientes(id) on delete cascade,
  nome text not null,
  path text not null, -- storage path: org_id/cliente_id/filename
  tamanho int not null default 0, -- bytes
  mime text not null default 'application/octet-stream',
  created_at timestamptz not null default now()
);
create index if not exists idx_anexos_org on anexos(org_id);
create index if not exists idx_anexos_cliente on anexos(cliente_id);
create index if not exists idx_anexos_user on anexos(user_id);
alter table anexos enable row level security;
drop policy if exists "anexos_org_isolation" on anexos;
create policy "anexos_org_isolation" on anexos
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- 3. Tabela api_keys (chaves públicas para API)
create table if not exists api_keys (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  key_hash text not null unique, -- sha256 da chave
  prefix text not null, -- primeiros 8 chars para exibição
  ultimo_uso timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_api_keys_org on api_keys(org_id);
create index if not exists idx_api_keys_user on api_keys(user_id);
create index if not exists idx_api_keys_hash on api_keys(key_hash);
alter table api_keys enable row level security;
drop policy if exists "api_keys_org_isolation" on api_keys;
create policy "api_keys_org_isolation" on api_keys
  for all using ( is_org_member(org_id) or user_id = auth.uid() )
  with check ( is_org_member(org_id) or user_id = auth.uid() );

-- Backfill org_id para anexos/api_keys antigos se houver (não deve haver)
-- (nenhum)

select 'fase3c ok' as status;
