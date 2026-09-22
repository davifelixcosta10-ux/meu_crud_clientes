-- ============================================================
-- Fase 3D — Billing (Stripe): tabela pagamentos + RLS
-- Executar como service_role no Supabase SQL Editor.
-- Seguro rodar sem STRIPE_* env vars (backend responde 503 amigável).
-- ============================================================

create table if not exists public.pagamentos (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizacoes(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    stripe_session_id text unique,
    stripe_customer_id text,
    stripe_subscription_id text,
    status text not null default 'pending'
        check (status in ('pending','active','canceled','past_due')),
    plano text not null default 'pro',
    valor numeric(10,2),
    moeda text not null default 'brl',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists pagamentos_org_idx on public.pagamentos(org_id);
create index if not exists pagamentos_session_idx on public.pagamentos(stripe_session_id);
create index if not exists pagamentos_customer_idx on public.pagamentos(stripe_customer_id);

alter table public.pagamentos enable row level security;

-- Leitura: qualquer membro da org; escrita: apenas service_role (webhook)
drop policy if exists pagamentos_select on public.pagamentos;
create policy pagamentos_select on public.pagamentos
    for select to authenticated
    using (public.is_org_member(org_id));

-- Insert/update/delete: somente service_role (bypass RLS por padrão no papel service_role).
-- Nenhum policy de insert/update/delete para authenticated: backend usa service_role no webhook.
