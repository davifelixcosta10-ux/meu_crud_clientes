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
