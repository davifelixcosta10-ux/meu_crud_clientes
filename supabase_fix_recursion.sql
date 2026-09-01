-- ============================================================
-- Fix: infinite recursion in membros RLS (42P17)
-- Causa: policy "membros_isolation" referencia a própria tabela membros (m2)
--        e políticas org-based (clientes/tags/etc) fazem SELECT em membros,
--        que dispara a policy recursiva → 500
-- Solução: funções SECURITY DEFINER que bypassam RLS para checar membership
-- Executar no SQL Editor (service_role) — idempotente
-- ============================================================

-- 1. Funções helper SECURITY DEFINER (bypass RLS)
create or replace function is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from membros m where m.org_id = p_org_id and m.user_id = auth.uid()
  ) or exists (
    select 1 from organizacoes o where o.id = p_org_id and o.owner_id = auth.uid()
  );
$$;

create or replace function is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from membros m where m.org_id = p_org_id and m.user_id = auth.uid() and m.papel = 'admin'
  ) or exists (
    select 1 from organizacoes o where o.id = p_org_id and o.owner_id = auth.uid()
  );
$$;

grant execute on function is_org_member(uuid) to authenticated, anon, service_role;
grant execute on function is_org_admin(uuid) to authenticated, anon, service_role;

-- 2. Recria policy membros SEM self-reference recursiva
drop policy if exists "membros_isolation" on membros;
-- Permite: ver própria linha, ou se for membro/admin da org via função helper (bypass)
create policy "membros_isolation" on membros
  for all using (
    user_id = auth.uid()
    or is_org_member(org_id)
  ) with check (
    is_org_admin(org_id)
  );

-- 3. Recria políticas org-based usando funções helper (evita SELECT direto em membros)
-- Clientes
drop policy if exists "clientes_org_isolation" on clientes;
create policy "clientes_org_isolation" on clientes
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Etapas
drop policy if exists "etapas_org_isolation" on etapas;
create policy "etapas_org_isolation" on etapas
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Atividades
drop policy if exists "atividades_org_isolation" on atividades;
create policy "atividades_org_isolation" on atividades
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Tags
drop policy if exists "tags_org_isolation" on tags;
create policy "tags_org_isolation" on tags
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Filtros
drop policy if exists "filtros_org_isolation" on filtros_salvos;
create policy "filtros_org_isolation" on filtros_salvos
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Planos (adicionado em fase fix)
drop policy if exists "planos_org_isolation" on planos;
create policy "planos_org_isolation" on planos
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Integrações
drop policy if exists "integracoes_org_isolation" on integracoes;
create policy "integracoes_org_isolation" on integracoes
  for all using ( is_org_member(org_id) or (org_id is null and user_id = auth.uid()) )
  with check ( is_org_member(org_id) or (org_id is null and user_id = auth.uid()) );

-- Organizações (mantém mas usa helper para evitar recursion)
drop policy if exists "orgs_member_isolation" on organizacoes;
create policy "orgs_member_isolation" on organizacoes
  for all using (
    owner_id = auth.uid() or is_org_member(id)
  ) with check (owner_id = auth.uid());

-- Verifica
select 'fix recursion ok' as status;
