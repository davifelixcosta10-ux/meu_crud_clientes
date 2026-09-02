-- Hotfix 2026-08-16 — corrige "already registered" sem precisar SUPABASE_SERVICE_ROLE_KEY em Vercel
-- Execute este arquivo no Supabase SQL Editor (1 vez) após supabase_fase3a.sql

create or replace function adicionar_membro_por_email(p_org_id uuid, p_email text, p_papel text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
begin
  if p_papel not in ('admin','membro') then
    raise exception 'Papel inválido';
  end if;
  select exists (
    select 1 from membros m where m.org_id = p_org_id and m.user_id = auth.uid() and m.papel = 'admin'
    union
    select 1 from organizacoes o where o.id = p_org_id and o.owner_id = auth.uid()
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode adicionar membros';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then
    return null;
  end if;
  insert into membros (org_id, user_id, papel) values (p_org_id, v_user_id, p_papel)
  on conflict (org_id, user_id) do nothing;
  return v_user_id;
end;
$$;
grant execute on function adicionar_membro_por_email(uuid, text, text) to authenticated, anon, service_role;
-- teste: select adicionar_membro_por_email('org-uuid','email@teste.com','membro');
