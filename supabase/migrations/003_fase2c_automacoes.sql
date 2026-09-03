-- ============================================================
-- DaviFlow — Fase 2C — Automações (inativo 30d → tarefa, vence 3d → alerta)
-- 1 tipo por org (vertical fixa) para simplificar — cada org tem 1 vertical em organizacoes.vertical
-- Tabela automacoes + função run_automacoes() + pg_cron diário 09:00 UTC (06:00 America/Sao_Paulo)
-- Executar no SQL Editor (service_role) — requer supabase_fix_recursion.sql (is_org_member)
-- PASSO SUPABASE UI OBRIGATÓRIO: Database → Extensions → habilitar pg_cron (se ainda não estiver)
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron" with schema pg_catalog;

create table if not exists automacoes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('inativo_30d','vence_3d','sem_atividade_7d')),
  ativo boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(org_id, tipo)
);
create index if not exists idx_automacoes_org on automacoes(org_id);
alter table automacoes enable row level security;
drop policy if exists "automacoes_org_isolation" on automacoes;
create policy "automacoes_org_isolation" on automacoes
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Função que roda diariamente e cria atividades (idempotente: não duplica no mesmo dia)
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
  ja_existe boolean;
begin
  -- Para cada org que tem automação ativa
  for r in select * from automacoes where ativo = true loop
    -- Define dias_inativo por vertical (1 tipo por org) — academia 14d, demais 30d
    dias_inativo := 30;
    begin
      select case when vertical = 'academia' then 14 else 30 end into dias_inativo
      from organizacoes where id = r.org_id;
    exception when others then dias_inativo := 30;
    end;

    -- Tipo: inativo_30d (ou 14d para academia) → cria atividade tarefa se cliente.ativo = false ou sem atividade recente?
    -- Regra MVP: cliente.ativo = false OU data_cadastro < now() - dias_inativo
    if r.tipo = 'inativo_30d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and c.ativo = false
          -- evita criar todo dia para mesmo cliente: só se não houver atividade de automação nas últimas 24h
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
      -- Também pega clientes sem atividade há dias_inativo (sem follow-up)
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

    -- Tipo: vence_3d → cliente com vencimento_dia nos próximos 3 dias e status em_dia
    if r.tipo = 'vence_3d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome, c.vencimento_dia
        from clientes c
        where c.org_id = r.org_id
          and c.vencimento_dia is not null
          and c.status_pagamento = 'em_dia'
          -- calcula se vence em 3 dias (aproximação: dia do mês)
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

    -- Tipo: sem_atividade_7d → sem atividade há 7 dias
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

-- Agenda o cron diário 09:00 UTC = 06:00 America/Sao_Paulo
-- Se já existir, remove e recria
select cron.unschedule('automacoes-diario') where exists (select 1 from cron.job where jobname = 'automacoes-diario');
select cron.schedule('automacoes-diario', '0 9 * * *', 'select run_automacoes();');

-- Seed: cria 2 automações (inativo_30d e vence_3d) para cada org existente, ativas
insert into automacoes (org_id, tipo, ativo)
select id, 'inativo_30d', true from organizacoes
on conflict (org_id, tipo) do nothing;
insert into automacoes (org_id, tipo, ativo)
select id, 'vence_3d', true from organizacoes
on conflict (org_id, tipo) do nothing;

select 'fase2c ok — automacoes + pg_cron 09:00 UTC' as status;
