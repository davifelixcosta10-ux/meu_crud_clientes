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
  cliente_id uuid not null references clientes(id) on delete cascade,
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
  cliente_id uuid not null references clientes(id) on delete cascade,
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
