-- One-off migration for an existing database: allow the Rock and Poison families.
-- Run once in Supabase → SQL Editor. (schema.sql already includes them for fresh installs.)
alter table public.monsters drop constraint if exists monsters_element_check;
alter table public.monsters add constraint monsters_element_check
  check (element in ('fire', 'water', 'plant', 'tornado', 'rock', 'poison'));
