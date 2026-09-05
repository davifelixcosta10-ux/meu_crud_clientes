-- Fix 2C run_automacoes: operator does not exist: timestamp/text
-- data_cadastro no clientes é date (ou text ISO) — comparar como date, não text
create or replace function run_automacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  cli record;
  dias_inativo int;
  dias_vence int := 3;
begin
  for r in select * from automacoes where ativo = true loop
    dias_inativo := 30;
    begin
      select case when vertical = 'academia' then 14 else 30 end into dias_inativo
      from organizacoes where id = r.org_id;
    exception when others then dias_inativo := 30;
    end;

    if r.tipo = 'inativo_30d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and c.ativo = false
          and not exists (
            select 1 from atividades a
            where a.cliente_id = c.id
              and a.tipo = 'tarefa'
              and a.nota ilike '%Automação inativo%'
              and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, 'Automação inativo '||dias_inativo||'d: ligar para '||cli.nome);
        end loop;
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and c.ativo = true
          and c.data_cadastro::date < current_date - dias_inativo
          and not exists (
            select 1 from atividades a where a.cliente_id = c.id and a.created_at > now() - (dias_inativo || ' days')::interval
          )
          and not exists (
            select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação inativo%' and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, 'Automação inativo '||dias_inativo||'d: follow-up '||cli.nome);
        end loop;
    end if;

    if r.tipo = 'vence_3d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome, c.vencimento_dia
        from clientes c
        where c.org_id = r.org_id
          and c.vencimento_dia is not null
          and c.status_pagamento = 'em_dia'
          and (
            c.vencimento_dia between extract(day from current_date)::int and extract(day from current_date)::int + dias_vence
            or (extract(day from current_date)::int + dias_vence > 31 and c.vencimento_dia <= (extract(day from current_date)::int + dias_vence - 31))
          )
          and not exists (
            select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação vence%' and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date + 1, false, 'Automação vence em '||dias_vence||'d: cobrar '||cli.nome||' (dia '||cli.vencimento_dia||')');
        end loop;
    end if;

    if r.tipo = 'sem_atividade_7d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and not exists (select 1 from atividades a where a.cliente_id = c.id and a.created_at > now() - interval '7 days')
          and not exists (select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação sem atividade%' and a.created_at > now() - interval '24 hours')
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'nota', current_date, false, 'Automação sem atividade 7d: verificar '||cli.nome);
        end loop;
    end if;

  end loop;
end;
$$;

select 'fix automacoes ok' as status;
