-- Fix F21: Revoga anon em funções SECURITY DEFINER que permitem enumeração
revoke execute on function is_org_member(uuid) from anon, public;
revoke execute on function is_org_admin(uuid) from anon, public;
grant execute on function is_org_member(uuid) to authenticated, service_role;
grant execute on function is_org_admin(uuid) to authenticated, service_role;

revoke execute on function adicionar_membro_por_email(uuid, text, text) from anon, public;
grant execute on function adicionar_membro_por_email(uuid, text, text) to authenticated, service_role;

-- Também revoga is_org_member overload se existir com outro nome
do $$ begin
  revoke execute on function is_org_member(uuid) from anon;
exception when others then null; end $$;

select 'fix anon revoke ok' as status;
