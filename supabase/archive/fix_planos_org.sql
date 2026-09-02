-- Fix planos para multi-org (Rafael não vê planos do Davi)
-- Adiciona org_id, backfill, e RLS org-based

-- 1. Coluna org_id (nullable para migração)
alter table planos add column if not exists org_id uuid references organizacoes(id) on delete set null;
create index if not exists idx_planos_org on planos(org_id);
create index if not exists idx_planos_user on planos(user_id);

-- 2. Backfill: cada plano vai para a org padrão do dono (primeira org do user_id)
update planos p set org_id = (select id from organizacoes where owner_id = p.user_id order by created_at limit 1)
where p.org_id is null and p.user_id is not null;

-- 3. Se ainda houver planos sem org (owner sem org), cria org para ele e vincula
do $$
declare r record;
begin
  for r in select distinct user_id from planos where org_id is null loop
    insert into organizacoes (nome, owner_id) values ('Minha organização', r.user_id) on conflict do nothing;
    insert into membros (org_id, user_id, papel)
    select id, owner_id, 'admin' from organizacoes where owner_id = r.user_id
    on conflict do nothing;
    update planos set org_id = (select id from organizacoes where owner_id = r.user_id limit 1) where user_id = r.user_id and org_id is null;
  end loop;
end $$;

-- 4. Duplica planos do dono para todas as orgs dele (para Rafael ver Vip em Clínica Maia também)
-- Se Davi tem 2 orgs e 1 plano em 1 org, cria o mesmo plano na outra org
insert into planos (user_id, nome, cor, descricao, valor, org_id)
select p.user_id, p.nome, p.cor, p.descricao, p.valor, o.id
from planos p
join organizacoes o on o.owner_id = p.user_id
left join planos p2 on p2.org_id = o.id and p2.nome = p.nome and p2.user_id = p.user_id
where p2.id is null
on conflict do nothing;

-- 5. Tornar not null se não houver nulos
do $$ begin
  if not exists (select 1 from planos where org_id is null) then
    alter table planos alter column org_id set not null;
  end if;
end $$;

-- 6. RLS org-based (substitui user_id = auth.uid())
alter table planos enable row level security;
drop policy if exists "planos_user_isolation" on planos;
drop policy if exists "planos_org_isolation" on planos;
create policy "planos_org_isolation" on planos
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or user_id = auth.uid()
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or user_id = auth.uid()
  );
