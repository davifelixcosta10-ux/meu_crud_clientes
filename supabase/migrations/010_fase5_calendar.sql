-- ============================================================
-- DaviFlow — Fase 5 — Google Calendar OAuth real
-- 1) atividades.google_event_id (text): id do evento criado no Google Calendar.
--    Atividades sem google_event_id são "pendentes" para o sync manual admin.
-- Sem RLS novo (herda RLS de atividades, por org_id). Executar como service_role. Idempotente.
-- Requer migrations 001-009.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna google_event_id em atividades
-- ------------------------------------------------------------
alter table public.atividades
    add column if not exists google_event_id text;

-- ------------------------------------------------------------
-- 2. Índice de org em atividades (garantia; 001 normalmente já cria)
-- ------------------------------------------------------------
create index if not exists idx_atividades_org on public.atividades(org_id);
