-- ============================================================
-- DaviFlow — Fase 4 — WhatsApp automático (canal de notificação)
-- 1) automacoes.canal ('interno'|'whatsapp') + automacoes.template_id (uuid → templates_whatsapp)
-- 2) Tabela notificacoes_log (fila de envio WhatsApp, status pendente/enviado/erro) + RLS select-only
-- 3) run_automacoes() reescrita: canal WhatsApp registra candidato em notificacoes_log
--    (mensagem interpolada pelo backend Python, que lê rows status='pendente')
--    Sem integração WhatsApp ativa OU canal interno → comportamento atual (atividade interna).
-- Executar no SQL Editor do Supabase (service_role) — idempotente.
-- Requer migrations 001-008 (is_org_member de fix_recursion_is_org_member.sql).
-- NÃO mexe no agendamento: cron 'automacoes-diario' (09:00 UTC) continua chamando run_automacoes().
-- ============================================================

-- ------------------------------------------------------------
-- 0. Relaxa check de integracoes.tipo para aceitar 'whatsapp'
-- (005 criou check sem 'whatsapp'; sem isso a integração WhatsApp do backend não salva
--  e tem_wa nunca seria true). Drop+add é idempotente; lista é superconjuesto da original.
-- ------------------------------------------------------------
alter table public.integracoes drop constraint if exists integracoes_tipo_check;
alter table public.integracoes
    add constraint integracoes_tipo_check
    check (tipo in ('calendar','zapier','contaazul','webhook','whatsapp'));

-- ------------------------------------------------------------
-- 1. Colunas novas em automacoes
-- ------------------------------------------------------------
alter table public.automacoes
    add column if not exists canal text not null default 'interno'
        check (canal in ('interno','whatsapp'));

-- templates_whatsapp.id é uuid (ver 002) — template_id precisa ser uuid, não bigint
alter table public.automacoes
    add column if not exists template_id uuid
        references public.templates_whatsapp(id) on delete set null;

-- automacoes é minúscula (1 row por org+tipo): não justifica index novo em canal.
-- idx_automacoes_org (003) continua atendendo o loop por org.

-- ------------------------------------------------------------
-- 2. Tabela notificacoes_log (fila de envio; service_role escreve, backend lê pendentes)
-- ------------------------------------------------------------
create table if not exists public.notificacoes_log (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizacoes(id) on delete cascade,
    cliente_id bigint not null references public.clientes(id) on delete cascade,
    tipo text not null check (tipo in ('inativo_30d','vence_3d','sem_atividade_7d')),
    canal text not null default 'whatsapp',
    status text not null default 'pendente' check (status in ('pendente','enviado','erro')),
    mensagem text,
    erro text,
    created_at timestamptz not null default now(),
    sent_at timestamptz
);

-- Dedupe 24h por org+cliente+tipo e lookup por org (padrão da casa)
create index if not exists idx_notificacoes_log_dedupe
    on public.notificacoes_log(org_id, cliente_id, tipo, created_at);
create index if not exists idx_notificacoes_log_org
    on public.notificacoes_log(org_id);
-- Backend faz polling de pendentes (status + created_at)
create index if not exists idx_notificacoes_log_status
    on public.notificacoes_log(status, created_at);

alter table public.notificacoes_log enable row level security;

-- Leitura: qualquer membro da org; escrita: apenas service_role (bypass RLS),
-- igual ao padrão de pagamentos (008) — nenhuma policy de insert/update/delete.
drop policy if exists notificacoes_log_select on public.notificacoes_log;
create policy notificacoes_log_select on public.notificacoes_log
    for select to authenticated
    using (public.is_org_member(org_id));

-- ------------------------------------------------------------
-- 3. run_automacoes() reescrita com canal WhatsApp
--    - tem_wa: existe integração tipo='whatsapp' ativa para a org do automation
--    - usar_wa := r.canal='whatsapp' AND tem_wa → registra candidato em notificacoes_log
--      (status='pendente', mensagem NULL — backend Python interpola o template e envia)
--      Dedupe: pula se já houver row notificacoes_log mesma org+cliente+tipo em 24h.
--    - Senão: comportamento atual idêntico (atividade interna, mesmos textos/dedupes).
--    Mantém idempotência diária e SECURITY DEFINER; cron inalterado.
-- ------------------------------------------------------------
create or replace function public.run_automacoes()
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
  tem_wa boolean;
  usar_wa boolean;
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

    -- Integração WhatsApp ativa para esta org?
    select exists (
      select 1 from integracoes i
      where i.org_id = r.org_id
        and i.tipo = 'whatsapp'
        and i.ativo = true
    ) into tem_wa;

    -- Canal efetivo: WhatsApp só se a automação pedir E houver integração ativa
    usar_wa := (r.canal = 'whatsapp' and tem_wa is true);

    -- Tipo: inativo_30d (ou 14d para academia) — cliente.ativo = false
    if r.tipo = 'inativo_30d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and c.ativo = false
          and (
            (usar_wa and not exists (
              select 1 from notificacoes_log n
              where n.org_id = r.org_id
                and n.cliente_id = c.id
                and n.tipo = r.tipo
                and n.created_at > now() - interval '24 hours'
            ))
            or (not usar_wa and not exists (
              select 1 from atividades a
              where a.cliente_id = c.id
                and a.tipo = 'tarefa'
                and a.nota ilike '%Automação inativo%'
                and a.created_at > now() - interval '24 hours'
            ))
          )
        loop
          if usar_wa then
            insert into notificacoes_log (org_id, cliente_id, tipo, canal, status)
            values (r.org_id, cli.id, r.tipo, 'whatsapp', 'pendente');
          else
            insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
            values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, 'Automação inativo '||dias_inativo||'d: ligar para '||cli.nome);
          end if;
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
          and (
            (usar_wa and not exists (
              select 1 from notificacoes_log n
              where n.org_id = r.org_id
                and n.cliente_id = c.id
                and n.tipo = r.tipo
                and n.created_at > now() - interval '24 hours'
            ))
            or (not usar_wa and not exists (
              select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação inativo%' and a.created_at > now() - interval '24 hours'
            ))
          )
        loop
          if usar_wa then
            insert into notificacoes_log (org_id, cliente_id, tipo, canal, status)
            values (r.org_id, cli.id, r.tipo, 'whatsapp', 'pendente');
          else
            insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
            values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, 'Automação inativo '||dias_inativo||'d: follow-up '||cli.nome);
          end if;
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
          and (
            c.vencimento_dia between extract(day from current_date)::int and extract(day from current_date)::int + dias_vence
            or (extract(day from current_date)::int + dias_vence > 31 and c.vencimento_dia <= (extract(day from current_date)::int + dias_vence - 31))
          )
          and (
            (usar_wa and not exists (
              select 1 from notificacoes_log n
              where n.org_id = r.org_id
                and n.cliente_id = c.id
                and n.tipo = r.tipo
                and n.created_at > now() - interval '24 hours'
            ))
            or (not usar_wa and not exists (
              select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação vence%' and a.created_at > now() - interval '24 hours'
            ))
          )
        loop
          if usar_wa then
            insert into notificacoes_log (org_id, cliente_id, tipo, canal, status)
            values (r.org_id, cli.id, r.tipo, 'whatsapp', 'pendente');
          else
            insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
            values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date + 1, false, 'Automação vence em '||dias_vence||'d: cobrar '||cli.nome||' (dia '||cli.vencimento_dia||')');
          end if;
        end loop;
    end if;

    -- Tipo: sem_atividade_7d → sem atividade há 7 dias
    if r.tipo = 'sem_atividade_7d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and not exists (select 1 from atividades a where a.cliente_id = c.id and a.created_at > now() - interval '7 days')
          and (
            (usar_wa and not exists (
              select 1 from notificacoes_log n
              where n.org_id = r.org_id
                and n.cliente_id = c.id
                and n.tipo = r.tipo
                and n.created_at > now() - interval '24 hours'
            ))
            or (not usar_wa and not exists (
              select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%Automação sem atividade%' and a.created_at > now() - interval '24 hours'
            ))
          )
        loop
          if usar_wa then
            insert into notificacoes_log (org_id, cliente_id, tipo, canal, status)
            values (r.org_id, cli.id, r.tipo, 'whatsapp', 'pendente');
          else
            insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
            values (cli.user_id, cli.id, cli.org_id, 'nota', current_date, false, 'Automação sem atividade 7d: verificar '||cli.nome);
          end if;
        end loop;
    end if;

  end loop;
end;
$$;

-- Cron 'automacoes-diario' (09:00 UTC, 003) continua chamando run_automacoes() — sem alteração.
-- Sem seeds novos.

select 'fase4 whatsapp ok — automacoes.canal/template_id + notificacoes_log + run_automacoes canal' as status;
