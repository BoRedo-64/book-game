-- Turns one account into a maxed-out test/admin account, for checking the app.
-- 1. Sign up in the app with the trainer name you want (e.g. "tester") and pick any egg.
-- 2. Put that name on the next line and run this in Supabase → SQL Editor. Safe to run again.
do $$
declare
  v_name text := 'YOUR_TEST_NAME';  -- <-- trainer name of the test account
  v_id uuid;
  v_max_xp int := 10060;           -- xpForLevel(MAX_LEVEL) in js/game.js = level 60, final form
  el text;
begin
  select id into v_id from public.profiles where username = v_name;
  if v_id is null then raise exception 'No trainer called %. Sign up in the app first.', v_name; end if;

  -- skip the cheat detector while we hand out stats
  alter table public.monsters disable trigger check_stats;
  alter table public.profiles disable trigger check_stats;

  -- one monster of every family (keeps any the account already has)
  foreach el in array array['fire', 'water', 'plant', 'tornado', 'rock', 'poison'] loop
    if not exists (select 1 from public.monsters where owner = v_id and element = el) then
      insert into public.monsters (owner, element, name) values (v_id, el, initcap(el));
    end if;
  end loop;
  update public.monsters set xp = v_max_xp where owner = v_id;

  update public.profiles set
    coins = 10000,
    energy = 5,
    active_monster = coalesce(active_monster, (select id from public.monsters where owner = v_id limit 1)),
    state = jsonb_set(state, '{habitats}', '["library", "sunset", "crystal", "clouds"]')
  where id = v_id;

  alter table public.monsters enable trigger check_stats;
  alter table public.profiles enable trigger check_stats;

  insert into public.admins (profile_id) values (v_id) on conflict do nothing;
  raise notice 'Done: % now has 10,000 coins, every monster at level 60 and admin rights.', v_name;
end $$;
