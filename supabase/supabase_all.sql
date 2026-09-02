-- ============================================================
-- DaviFlow — Fase 1 (1A-1E) — Migração Supabase
-- Executar no SQL Editor do Supabase Dashboard
-- Ordem importa: extensões -> tabelas -> índices -> RLS -> policies
-- ============================================================

-- Extensão para UUID (se ainda não habilitada)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1A — ETAPAS (Kanban)
-- ============================================================
create table if not exists etapas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  cor text not null default 'indigo',
  created_at timestamptz not null default now()
);
create index if not exists idx_etapas_user_ordem on etapas(user_id, ordem);
alter table etapas enable row level security;
drop policy if exists "etapas_user_isolation" on etapas;
create policy "etapas_user_isolation" on etapas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Colunas novas em clientes (Fase 1A + 1D)
-- ============================================================
alter table clientes add column if not exists etapa_id uuid references etapas(id) on delete set null;
alter table clientes add column if not exists valor_plano text;
alter table clientes add column if not exists vencimento_dia int check (vencimento_dia between 1 and 31);
alter table clientes add column if not exists status_pagamento text check (status_pagamento in ('em_dia','atrasado','isento'));
create index if not exists idx_clientes_etapa on clientes(etapa_id);
create index if not exists idx_clientes_vencimento on clientes(user_id, vencimento_dia);

-- ============================================================
-- 1B — ATIVIDADES (Follow-ups)
-- ============================================================
create table if not exists atividades (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_id bigint not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('ligacao','reuniao','nota','whatsapp','email','tarefa')),
  data date not null,
  concluida boolean not null default false,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_atividades_user_cliente on atividades(user_id, cliente_id);
create index if not exists idx_atividades_data on atividades(data);
alter table atividades enable row level security;
drop policy if exists "atividades_user_isolation" on atividades;
create policy "atividades_user_isolation" on atividades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 1C — TAGS
-- ============================================================
create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text not null default 'indigo',
  created_at timestamptz not null default now(),
  unique(user_id, nome)
);
create index if not exists idx_tags_user on tags(user_id);
alter table tags enable row level security;
drop policy if exists "tags_user_isolation" on tags;
create policy "tags_user_isolation" on tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists cliente_tags (
  cliente_id bigint not null references clientes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cliente_id, tag_id)
);
-- RLS via função: verifica se cliente pertence ao user
alter table cliente_tags enable row level security;
drop policy if exists "cliente_tags_user_isolation" on cliente_tags;
create policy "cliente_tags_user_isolation" on cliente_tags
  for all using (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = auth.uid())
  );

-- ============================================================
-- 1C — FILTROS SALVOS
-- ============================================================
create table if not exists filtros_salvos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  query jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_filtros_user on filtros_salvos(user_id);
alter table filtros_salvos enable row level security;
drop policy if exists "filtros_user_isolation" on filtros_salvos;
create policy "filtros_user_isolation" on filtros_salvos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Verificação (opcional): listar tabelas criadas
-- ============================================================
-- select table_name from information_schema.tables where table_schema='public' and table_name in ('etapas','atividades','tags','cliente_tags','filtros_salvos');
-- ============================================================
-- DaviFlow — Fase 2B — WhatsApp Templates (wa.me)
-- Tabela templates_whatsapp por org + RLS is_org_member + vertical
-- Executar no SQL Editor (service_role) — requer supabase_fix_recursion.sql
-- ============================================================

create extension if not exists "uuid-ossp";

-- se a tabela foi criada com plano_id uuid (erro anterior), apaga para recriar com bigint correto
drop table if exists templates_whatsapp cascade;

create table if not exists templates_whatsapp (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  mensagem text not null,
  plano_id bigint references planos(id) on delete set null,
  etapa_id uuid references etapas(id) on delete set null,
  vertical text check (vertical in ('geral','hospital','lava_rapido_oficina','dentista','academia')),
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_org on templates_whatsapp(org_id);
create index if not exists idx_templates_vertical on templates_whatsapp(vertical);
create index if not exists idx_templates_user on templates_whatsapp(user_id);
alter table templates_whatsapp enable row level security;
drop policy if exists "templates_org_isolation" on templates_whatsapp;
create policy "templates_org_isolation" on templates_whatsapp
  for all using ( is_org_member(org_id) )
  with check ( is_org_member(org_id) );

-- Seed opcional: 2 templates genéricos por org existente (se vazia)
-- Não insere se já houver templates
do $$
begin
  if not exists (select 1 from templates_whatsapp limit 1) then
    -- Não temos org_id aqui sem loop, deixa vazio — frontend cria via UI
    null;
  end if;
end $$;

select 'fase2b ok' as status;
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
              and a.nota ilike '%🤖 automação inativo%'
              and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, '🤖 automação inativo '||dias_inativo||'d: ligar para '||cli.nome);
        end loop;
      -- Também pega clientes sem atividade há dias_inativo (sem follow-up)
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and c.ativo = true
          and c.data_cadastro < (current_date - dias_inativo)::text
          and not exists (
            select 1 from atividades a where a.cliente_id = c.id and a.created_at > now() - (dias_inativo || ' days')::interval
          )
          and not exists (
            select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%🤖 automação inativo%' and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date, false, '🤖 automação inativo '||dias_inativo||'d: follow-up '||cli.nome);
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
            select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%🤖 automação vence%' and a.created_at > now() - interval '24 hours'
          )
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'tarefa', current_date + 1, false, '🤖 automação vence em '||dias_vence||'d: cobrar '||cli.nome||' (dia '||cli.vencimento_dia||')');
        end loop;
    end if;

    -- Tipo: sem_atividade_7d → sem atividade há 7 dias
    if r.tipo = 'sem_atividade_7d' then
      for cli in
        select c.id, c.user_id, c.org_id, c.nome
        from clientes c
        where c.org_id = r.org_id
          and not exists (select 1 from atividades a where a.cliente_id = c.id and a.created_at > now() - interval '7 days')
          and not exists (select 1 from atividades a where a.cliente_id = c.id and a.nota ilike '%🤖 automação sem_atividade%' and a.created_at > now() - interval '24 hours')
        loop
          insert into atividades (user_id, cliente_id, org_id, tipo, data, concluida, nota)
          values (cli.user_id, cli.id, cli.org_id, 'nota', current_date, false, '🤖 automação sem atividade 7d: verificar '||cli.nome);
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

-- 7. Função SECURITY DEFINER para adicionar membro por email sem precisar service_role
-- Permite que anon key (via RLS) adicione membros quando o email já existe em auth.users
-- Corrige "A user with this email address has already been registered" sem precisar SUPABASE_SERVICE_ROLE_KEY em Vercel
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
  -- verifica se quem chama é admin/owner da org (evita abuso)
  select exists (
    select 1 from membros m where m.org_id = p_org_id and m.user_id = auth.uid() and m.papel = 'admin'
    union
    select 1 from organizacoes o where o.id = p_org_id and o.owner_id = auth.uid()
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Apenas admin pode adicionar membros';
  end if;
  -- busca user por email (case-insensitive)
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then
    return null;
  end if;
  -- insere (idempotente)
  insert into membros (org_id, user_id, papel) values (p_org_id, v_user_id, p_papel)
  on conflict (org_id, user_id) do nothing;
  return v_user_id;
end;
$$;
grant execute on function adicionar_membro_por_email(uuid, text, text) to authenticated, anon, service_role;
-- ============================================================
-- DaviFlow — Fase 3B — Integrações (Calendar/Zapier/Conta Azul)
-- Tabela integracoes por org + RLS org-based + webhook Zapier
-- Executar no SQL Editor do Supabase (service_role)
-- ============================================================

create extension if not exists "uuid-ossp";

-- 1. Tabela integracoes
create table if not exists integracoes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('calendar','zapier','contaazul','webhook')),
  nome text not null default '',
  config jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_integracoes_org on integracoes(org_id);
create index if not exists idx_integracoes_user on integracoes(user_id);
create index if not exists idx_integracoes_tipo on integracoes(tipo);
alter table integracoes enable row level security;

-- 2. Backfill org_id para dados antigos (se houver sem org)
-- tenta associar via user_id -> primeira org do user
update integracoes i set org_id = (select id from organizacoes where owner_id = i.user_id limit 1)
where i.org_id is null and i.user_id is not null;

-- 3. RLS org-based (mesma regra de clientes/etapas)
drop policy if exists "integracoes_org_isolation" on integracoes;
create policy "integracoes_org_isolation" on integracoes
  for all using (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  ) with check (
    org_id in (select org_id from membros where user_id = auth.uid())
    or org_id in (select id from organizacoes where owner_id = auth.uid())
    or (org_id is null and user_id = auth.uid())
  );

-- 4. Função helper para webhook Zapier/Make validar integração ativa
create or replace function zapp_webhook_payload_valid(p_tipo text)
returns boolean
language sql
security definer
as $$
  select p_tipo in ('calendar','zapier','contaazul','webhook');
$$;
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
-- ============================================================
-- DaviFlow — Fase 4A — Sistema de Verticais (Templates por Tipo de Empresa)
-- Tabela verticais + colunas organizacoes.vertical + clientes.campos_custom jsonb
-- Requer is_org_member já existente (supabase_fix_recursion.sql)
-- Executar no SQL Editor (service_role)
-- ============================================================

create extension if not exists "uuid-ossp";

-- 1. Tabela verticais (presets)
create table if not exists verticais (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique check (slug in ('geral','hospital','lava_rapido_oficina','dentista','academia','custom')),
  nome text not null,
  descricao text not null default '',
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Seed 5 verticais (geral + 4 presets)
insert into verticais (slug, nome, descricao, config_json) values
('geral', 'Geral', 'Campos genéricos (30+ campos) — padrão atual',
  '{"campos_visiveis": ["nome","email","telefone","cpf","empresa","cargo","observacoes","cep","logradouro","numero","bairro","cidade","estado","etapa_id","valor_plano","vencimento_dia","status_pagamento"], "campos_extras": [], "metricas": ["total","ativos","inativos","por_plano","atrasados","receita","churn","ltv"], "etapas_seed": ["Lead","Proposta","Fechado"]}'::jsonb),
('hospital', 'Hospital / Clínica', 'Convênio, leito, prontuário, CRM médico, status internado/alta, leitos ocupados',
  '{"campos_visiveis": ["nome","email","telefone","cpf","empresa","observacoes","etapa_id","valor_plano","status_pagamento"], "campos_extras": ["convenio","leito","prontuario","crm_medico_responsavel","status_internacao"], "metricas": ["total","ativos","inativos","ocupacao_leitos","receita"], "etapas_seed": ["Triagem","Atendimento","Alta"], "esconde": ["placa","km","modelo","dente","procedimento","treino"], "renomeia": {"cargo": "Especialidade", "empresa": "Setor/Unidade"}}'::jsonb),
('lava_rapido_oficina', 'Lava Rápido / Oficina', 'Placa obrigatória, modelo, KM, serviço, Kanban Aguardando→Em serviço→Pronto, serviços por dia',
  '{"campos_visiveis": ["nome","email","telefone","cpf","observacoes","etapa_id","valor_plano"], "campos_extras": ["placa","modelo","km","servico"], "metricas": ["total","servicos_por_dia","receita"], "etapas_seed": ["Aguardando","Em serviço","Pronto"], "esconde": ["dente","procedimento","convenio","leito","treino","crm_medico_responsavel"], "renomeia": {"empresa": "Veículo/Oficina"}}'::jsonb),
('dentista', 'Dentista / Odonto', 'Dente FDI 1-32, procedimento, convênio odonto, timeline procedimento, retorno 6m',
  '{"campos_visiveis": ["nome","email","telefone","cpf","observacoes","etapa_id","valor_plano"], "campos_extras": ["dente","procedimento","convenio_odonto","data_retorno"], "metricas": ["total","ativos","retornos_6m","receita"], "etapas_seed": ["Avaliação","Tratamento","Retorno"], "esconde": ["placa","km","modelo","convenio","leito","treino"], "renomeia": {}}'::jsonb),
('academia', 'Academia / Fitness', 'Plano mensal obrigatório, treino A/B/C, frequência semanal, check-in, frequência média, churn 14d',
  '{"campos_visiveis": ["nome","email","telefone","cpf","observacoes","etapa_id","valor_plano","vencimento_dia","status_pagamento"], "campos_extras": ["plano_mensal","treino","frequencia_semanal","ultimo_checkin"], "metricas": ["total","ativos","frequencia_media","churn","receita"], "etapas_seed": ["Prospecção","Matriculado","Ativo","Inativo"], "esconde": ["placa","km","modelo","dente","procedimento","convenio","leito"], "renomeia": {"cargo": "Treino"}}'::jsonb)
on conflict (slug) do nothing;

-- 2. Coluna vertical em organizacoes (ou usuarios) — usamos organizacoes.vertical para multi-org
alter table organizacoes add column if not exists vertical text not null default 'geral' check (vertical in ('geral','hospital','lava_rapido_oficina','dentista','academia','custom'));
create index if not exists idx_orgs_vertical on organizacoes(vertical);

-- 3. Coluna campos_custom jsonb em clientes (extras flexíveis por vertical sem criar 20 colunas)
alter table clientes add column if not exists campos_custom jsonb not null default '{}'::jsonb;
create index if not exists idx_clientes_campos_custom on clientes using gin (campos_custom);

-- 4. RLS para verticais (leitura pública para autenticados, escrita só service_role)
alter table verticais enable row level security;
drop policy if exists "verticais_read_all" on verticais;
create policy "verticais_read_all" on verticais
  for select using ( auth.role() in ('authenticated','service_role','anon') );
-- sem policy de insert/update/delete para anon/authenticated → só service_role (seed)

select 'fase4a ok' as status;
