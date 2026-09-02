-- Fix: clientes.plano deve permitir null para "Sem plano"
-- Antes dava 23502 null value violates not-null quando toggle plano off
alter table clientes alter column plano drop not null;

-- Verifica
-- select column_name, is_nullable from information_schema.columns where table_name='clientes' and column_name='plano';
