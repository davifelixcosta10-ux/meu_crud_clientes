-- Migration 011: índices de performance para consultas frequentes (Davi Flow refinement)
-- Otimiza filtros por organização, etapa, status de pagamento e vencimento.

CREATE INDEX IF NOT EXISTS idx_clientes_org_id ON clientes(org_id);
CREATE INDEX IF NOT EXISTS idx_clientes_etapa_id ON clientes(etapa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_status_pagamento ON clientes(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_clientes_vencimento_dia ON clientes(vencimento_dia);
CREATE INDEX IF NOT EXISTS idx_atividades_cliente_id ON atividades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atividades_org_id ON atividades(org_id);
CREATE INDEX IF NOT EXISTS idx_planos_org_id ON planos(org_id);
CREATE INDEX IF NOT EXISTS idx_etapas_org_id ON etapas(org_id);
CREATE INDEX IF NOT EXISTS idx_tags_org_id ON tags(org_id);
CREATE INDEX IF NOT EXISTS idx_integracoes_org_id ON integracoes(org_id);
CREATE INDEX IF NOT EXISTS idx_anexos_cliente_id ON anexos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_organizacao_membros_user_id ON organizacao_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_organizacao_membros_org_id ON organizacao_membros(org_id);
