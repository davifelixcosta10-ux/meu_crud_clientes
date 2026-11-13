-- Migration 011: índices de performance para consultas frequentes (Davi Flow)
--
-- Contexto: as listagens do painel filtram por org_id/user_id e ordenam por
-- data/ordem/created_at. Com os índices de coluna única que já existiam
-- (idx_clientes_org, idx_atividades_org, ...), o Postgres acha as linhas mas
-- ainda precisa ordenar o resultado. Índices compostos (filtro + ordenação)
-- eliminam esse sort e são o ganho real de tempo de resposta.
--
-- Todos usam IF NOT EXISTS e são aditivos: nenhuma coluna/tabela é alterada.
-- Aplicar no Supabase com `supabase db push` ou pelo SQL Editor.

-- ── planos: não tinha nenhum índice além da PK/RLS ──────────────
CREATE INDEX IF NOT EXISTS idx_planos_org_created ON planos (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_planos_user_created ON planos (user_id, created_at);

-- ── etapas: listagem do Kanban ordena por ordem dentro da org ──
CREATE INDEX IF NOT EXISTS idx_etapas_org_ordem ON etapas (org_id, ordem);
CREATE INDEX IF NOT EXISTS idx_etapas_user_ordem2 ON etapas (user_id, ordem);

-- ── atividades: filtro por org/cliente + ordem por data ────────
CREATE INDEX IF NOT EXISTS idx_atividades_org_data ON atividades (org_id, data);
CREATE INDEX IF NOT EXISTS idx_atividades_user_data ON atividades (user_id, data);
CREATE INDEX IF NOT EXISTS idx_atividades_cliente_data ON atividades (cliente_id, data);
-- pendentes são a maioria das consultas do painel (follow-up do dia)
CREATE INDEX IF NOT EXISTS idx_atividades_pendentes
  ON atividades (org_id, data) WHERE concluida = false;

-- ── tags: ordenadas por nome na listagem ───────────────────────
CREATE INDEX IF NOT EXISTS idx_tags_org_nome ON tags (org_id, nome);
CREATE INDEX IF NOT EXISTS idx_tags_user_nome ON tags (user_id, nome);

-- ── clientes: listagem ordena por created_at, filtros comuns ───
CREATE INDEX IF NOT EXISTS idx_clientes_org_created ON clientes (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_user_created ON clientes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_org_status ON clientes (org_id, status_pagamento);

-- ── membros: checagem de papel por (org, user) em quase todo request ──
CREATE INDEX IF NOT EXISTS idx_membros_org_user ON membros (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_membros_user_org ON membros (user_id, org_id);

-- ── filtros salvos, integrações e anexos: filtro + ordenação ───
CREATE INDEX IF NOT EXISTS idx_filtros_org_created ON filtros_salvos (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_integracoes_org_tipo ON integracoes (org_id, tipo);
CREATE INDEX IF NOT EXISTS idx_anexos_org_created ON anexos (org_id, created_at DESC);
