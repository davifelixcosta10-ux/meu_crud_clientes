-- ============================================================
-- DaviFlow — Fase 3A-1 — Organizações + Migração Limpa + RLS org
-- Executar no SQL Editor do Supabase Dashboard (service_role)
-- Ordem: tabelas -> colunas -> migração -> índices -> RLS -> policies
-- ============================================================

create extension if not exists "uuid-ossp";

-- 1. Organizações
create table if not exists organizacoes (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_orgs_owner on organizacoes(owner_id);
alter table organizacoes enable row level security;

-- 2. Membros
create table if not exists membros (
  org_id uuid not null references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('admin','membro')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists idx_membros_user on membros(user_id);
create index if not exists idx_membros_org on membros(org_id);
alter table membros enable row level security;

-- Policies org/membros (após ambas as tabelas existirem)
drop policy if exists "orgs_member_isolation" on organizacoes;
create policy "orgs_member_isolation" on organizacoes
  for all using (
    owner_id = auth.uid() or exists (select 1 from membros m where m.org_id = organizacoes.id and m.user_id = auth.uid())
  ) with check (owner_id = auth.uid());
drop policy if exists "membros_isolation" on membros;
create policy "membros_isolation" on membros
  for all using (
    user_id = auth.uid() or exists (select 1 from membros m2 where m2.org_id = membros.org_id and m2.user_id = auth.uid())
    or exists (select 1 from organizacoes o where o.id = membros.org_id and o.owner_id = auth.uid())
  ) with check (
    exists (select 1 from organizacoes o where o.id = membros.org_id and o.owner_id = auth.uid())
    or exists (select 1 from membros m2 where m2.org_id = membros.org_id and m2.user_id = auth.uid() and m2.papel = 'admin')
  );

-- 3. Colunas org_id (nullable primeiro para migração)
alter table clientes add column if not exists org_id uuid references organizacoes(id) on delete set null;
alter table etapas add column if not exists org_id uuid references organizacoes(id) on delete set null;
alter table atividades add column if not exists org_id uuid references organizacoes(id) on delete set null;
alter table tags add column if not exists org_id uuid references organizacoes(id) on delete set null;
alter table filtros_salvos add column if not exists org_id uuid references organizacoes(id) on delete set null;
create index if not exists idx_clientes_org on clientes(org_id);
create index if not exists idx_etapas_org on etapas(org_id);
create index if not exists idx_atividades_org on atividades(org_id);
create index if not exists idx_tags_org on tags(org_id);
create index if not exists idx_filtros_org on filtros_salvos(org_id);

-- 4. MIGRAÇÃO LIMPA: 1 org por user existente (solo → org)
-- Cria org para cada user que tem cliente sem org
insert into organizacoes (nome, owner_id)
select 'Minha organização', user_id from (select distinct user_id from clientes where org_id is null) q
on conflict do nothing;

-- Cria membro admin para cada org recém criada (owner)
insert into membros (org_id, user_id, papel)
select o.id, o.owner_id, 'admin' from organizacoes o
where not exists (select 1 from membros m where m.org_id = o.id and m.user_id = o.owner_id)
on conflict do nothing;

-- Backfill org_id nos dados existentes (clientes → org do owner)
update clientes c set org_id = (select id from organizacoes where owner_id = c.user_id limit 1) where c.org_id is null and c.user_id is not null;
update etapas e set org_id = (select id from organizacoes where owner_id = e.user_id limit 1) where e.org_id is null and e.user_id is not null;
update atividades a set org_id = (select id from organizacoes where owner_id = a.user_id limit 1) where a.org_id is null and a.user_id is not null;
update tags t set org_id = (select id from organizacoes where owner_id = t.user_id limit 1) where t.org_id is null and t.user_id is not null;
update filtros_salvos f set org_id = (select id from organizacoes where owner_id = f.user_id limit 1) where f.org_id is null and f.user_id is not null;

-- 5. Tornar not null após backfill (garante migração limpa)
-- Só se não houver nulos restantes
do $$ begin
  if not exists (select 1 from clientes where org_id is null) then
    alter table clientes alter column org_id set not null;
  end if;
  if not exists (select 1 from etapas where org_id is null) then
    alter table etapas alter column org_id set not null;
  end if;
  if not exists (select 1 from atividades where org_id is null) then
    alter table atividades alter column org_id set not null;
  end if;
  if not exists (select 1 from tags where org_id is null) then
    alter table tags alter column org_id set not null;
  end if;
  if not exists (select 1 from filtros_salvos where org_id is null) then
    alter table filtros_salvos alter column org_id set not null;
  end if;
end $$;

-- 6. RLS org-based (substitui user_id = auth.uid() por org membership)
-- Clientes
drop policy if exists "clientes_user_isolation" on clientes;
drop policy if exists "clientes_org_isolation" on clientes;
create policy "clientes_org_isolation" on clientes
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  );

-- Etapas
drop policy if exists "etapas_user_isolation" on etapas;
drop policy if exists "etapas_org_isolation" on etapas;
create policy "etapas_org_isolation" on etapas
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  );

-- Atividades
drop policy if exists "atividades_user_isolation" on atividades;
drop policy if exists "atividades_org_isolation" on atividades;
create policy "atividades_org_isolation" on atividades
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  );

-- Tags
drop policy if exists "tags_user_isolation" on tags;
drop policy if exists "tags_org_isolation" on tags;
create policy "tags_org_isolation" on tags
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  );

-- Filtros
drop policy if exists "filtros_user_isolation" on filtros_salvos;
drop policy if exists "filtros_org_isolation" on filtros_salvos;
create policy "filtros_org_isolation" on filtros_salvos
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
  );

-- cliente_tags herda via clientes (org já filtrado)
