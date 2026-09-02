-- Fix para permitir custom_xxx em verticais/organizacoes já criadas
alter table verticais drop constraint if exists verticais_slug_check;
alter table verticais add constraint verticais_slug_check check (slug ~ '^custom_[a-z0-9_]{2,30}$' or slug in ('geral','hospital','lava_rapido_oficina','dentista','academia','custom'));
alter table organizacoes drop constraint if exists organizacoes_vertical_check;
alter table organizacoes add constraint organizacoes_vertical_check check (vertical ~ '^custom_[a-z0-9_]{2,30}$' or vertical in ('geral','hospital','lava_rapido_oficina','dentista','academia','custom'));
drop policy if exists "verticais_insert_custom" on verticais;
create policy "verticais_insert_custom" on verticais
  for insert with check ( slug ~ '^custom_[a-z0-9_]{2,30}$' and auth.role() = 'authenticated' );
select 'fix vertical custom ok' as status;
