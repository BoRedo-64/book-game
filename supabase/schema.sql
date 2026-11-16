-- Pagelings database. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run again: it only creates what is missing.
--
-- Login model: every browser signs in anonymously (Supabase gives it a user id),
-- then register()/login() link that browser to a trainer profile after checking
-- the trainer name + password. No emails involved.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  coins int not null default 50,
  energy int not null default 3,
  streak int not null default 0,
  best_streak int not null default 0,
  last_read date,
  freezes int not null default 0,
  trophies int not null default 0,
  wins int not null default 0,
  total_pages int not null default 0,
  books_done int not null default 0,
  daily_goal int not null default 20,
  active_monster uuid,
  habitat text not null default 'default',
  state jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Password hashes and browser links: no policies, so only the functions below can touch them.
create table if not exists public.accounts (
  profile_id uuid primary key references public.profiles on delete cascade,
  pass_hash text not null,
  failed int not null default 0,
  locked_until timestamptz
);
create table if not exists public.devices (
  uid uuid primary key,
  profile_id uuid not null references public.profiles on delete cascade
);

create table if not exists public.monsters (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles on delete cascade,
  element text not null check (element in ('fire', 'water', 'plant', 'tornado', 'rock', 'poison')),
  name text not null check (char_length(name) between 1 and 20),
  xp int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '',
  cover_url text,
  total_pages int not null check (total_pages between 1 and 20000),
  current_page int not null default 0,
  status text not null default 'reading' check (status in ('reading', 'finished', 'wishlist')),
  rating int,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  book_id uuid references public.books on delete set null,
  pages int not null check (pages between 1 and 2000),
  day date not null,
  created_at timestamptz not null default now()
);
create index if not exists logs_user_day on public.logs (user_id, day);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_user_time on public.events (user_id, created_at desc);

create table if not exists public.cheers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  unique (event_id, user_id)
);

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references public.profiles on delete cascade,
  opponent uuid not null references public.profiles on delete cascade,
  days int not null,
  prize int not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'done')),
  start_day date,
  end_day date,
  winner uuid,
  claimed_c boolean not null default false,
  claimed_o boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  attacker uuid not null references public.profiles on delete cascade,
  defender uuid references public.profiles on delete cascade,
  won boolean not null,
  a_mon jsonb not null,
  d_mon jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- who am I ----------
create or replace function public.my_pid() returns uuid
language sql stable security definer set search_path = public as $$
  select profile_id from devices where uid = auth.uid()
$$;

create or replace function public.register(p_username text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := lower(trim(p_username));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not connected. Reload and try again.'; end if;
  if v_name !~ '^[a-z0-9_]{3,16}$' then
    raise exception 'Trainer names are 3–16 characters: letters, numbers and _ only.';
  end if;
  if char_length(p_password) < 6 then raise exception 'Password needs at least 6 characters.'; end if;
  if exists (select 1 from profiles where username = v_name) then
    raise exception 'That trainer name is taken.';
  end if;
  insert into profiles (username) values (v_name) returning id into v_id;
  insert into accounts (profile_id, pass_hash) values (v_id, crypt(p_password, gen_salt('bf')));
  insert into devices (uid, profile_id) values (auth.uid(), v_id)
    on conflict (uid) do update set profile_id = excluded.profile_id;
  return v_id;
end $$;

create or replace function public.login(p_username text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_acc accounts;
begin
  if auth.uid() is null then raise exception 'Not connected. Reload and try again.'; end if;
  select id into v_id from profiles where username = lower(trim(p_username));
  if v_id is null then raise exception 'Wrong trainer name or password.'; end if;
  select * into v_acc from accounts where profile_id = v_id;
  if v_acc.locked_until is not null and v_acc.locked_until > now() then
    raise exception 'Too many wrong passwords. Try again in a few minutes.';
  end if;
  if v_acc.pass_hash <> crypt(p_password, v_acc.pass_hash) then
    update accounts set
      failed = failed + 1,
      locked_until = case when failed + 1 >= 8 then now() + interval '5 minutes' end
    where profile_id = v_id;
    return null; -- the app shows "wrong name or password" (raising would undo the counter)
  end if;
  update accounts set failed = 0, locked_until = null where profile_id = v_id;
  insert into devices (uid, profile_id) values (auth.uid(), v_id)
    on conflict (uid) do update set profile_id = excluded.profile_id;
  return v_id;
end $$;

create or replace function public.logout() returns void
language sql security definer set search_path = public as $$
  delete from devices where uid = auth.uid()
$$;

-- ---------- access rules ----------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.devices enable row level security;
alter table public.monsters enable row level security;
alter table public.books enable row level security;
alter table public.logs enable row level security;
alter table public.friendships enable row level security;
alter table public.events enable row level security;
alter table public.cheers enable row level security;
alter table public.duels enable row level security;
alter table public.battles enable row level security;

do $$
declare
  t text;
  owner_col text;
begin
  -- drop our policies so this file can be re-run
  for t in select unnest(array['profiles','monsters','books','logs','friendships','events','cheers','duels','battles']) loop
    execute format('drop policy if exists p_read on public.%I', t);
    execute format('drop policy if exists p_insert on public.%I', t);
    execute format('drop policy if exists p_update on public.%I', t);
    execute format('drop policy if exists p_delete on public.%I', t);
  end loop;

  -- everyone signed in can read; you can only write rows you own
  for t, owner_col in select * from (values
    ('monsters', 'owner'), ('books', 'owner'), ('logs', 'user_id'),
    ('events', 'user_id'), ('cheers', 'user_id')) v
  loop
    execute format('create policy p_read on public.%I for select to authenticated using (true)', t);
    execute format('create policy p_insert on public.%I for insert to authenticated with check (%I = (select public.my_pid()))', t, owner_col);
    execute format('create policy p_update on public.%I for update to authenticated using (%I = (select public.my_pid())) with check (%I = (select public.my_pid()))', t, owner_col, owner_col);
    execute format('create policy p_delete on public.%I for delete to authenticated using (%I = (select public.my_pid()))', t, owner_col);
  end loop;
end $$;

create policy p_read on public.profiles for select to authenticated using (true);
create policy p_update on public.profiles for update to authenticated
  using (id = (select public.my_pid())) with check (id = (select public.my_pid()));

create policy p_read on public.friendships for select to authenticated
  using ((select public.my_pid()) in (requester, addressee));
create policy p_insert on public.friendships for insert to authenticated
  with check (requester = (select public.my_pid()) and status = 'pending');
create policy p_update on public.friendships for update to authenticated
  using (addressee = (select public.my_pid()));
create policy p_delete on public.friendships for delete to authenticated
  using ((select public.my_pid()) in (requester, addressee));

create policy p_read on public.duels for select to authenticated
  using ((select public.my_pid()) in (challenger, opponent));
create policy p_insert on public.duels for insert to authenticated
  with check (challenger = (select public.my_pid()) and status = 'pending');
create policy p_update on public.duels for update to authenticated
  using ((select public.my_pid()) in (challenger, opponent));
create policy p_delete on public.duels for delete to authenticated
  using ((select public.my_pid()) in (challenger, opponent));

create policy p_read on public.battles for select to authenticated using (true);
create policy p_insert on public.battles for insert to authenticated
  with check (attacker = (select public.my_pid()));

-- ---------- permissions ----------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.profiles, public.monsters, public.books, public.logs, public.friendships,
  public.events, public.cheers, public.duels, public.battles
  to authenticated;
revoke all on public.accounts, public.devices from authenticated;
revoke execute on function public.my_pid(), public.register(text, text), public.login(text, text), public.logout() from public, anon;
grant execute on function public.my_pid(), public.register(text, text), public.login(text, text), public.logout() to authenticated;
