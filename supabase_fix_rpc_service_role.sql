-- Fix RPC para permitir service_role (usado pelo backend sem JWT)
create or replace function adicionar_membro_por_email(p_org_id uuid, p_email text, p_papel text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_role text;
begin
  if p_papel not in ('admin','membro') then
    raise exception 'Papel inválido';
  end if;
  -- permite service_role sem checar auth.uid()
  v_role := coalesce(auth.role(), '');
  if v_role = 'service_role' then
    v_is_admin := true;
  else
    select exists (
      select 1 from membros m where m.org_id = p_org_id and m.user_id = auth.uid() and m.papel = 'admin'
      union
      select 1 from organizacoes o where o.id = p_org_id and o.owner_id = auth.uid()
    ) into v_is_admin;
  end if;
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
