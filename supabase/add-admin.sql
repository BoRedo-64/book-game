-- Daily page limit, admin account, ban button and suspicious-activity log.
-- Run once in Supabase → SQL Editor (schema.sql includes it too). Safe to run again.
-- Last line: put YOUR trainer name in it to make yourself the admin.

-- Admins: no policies, so nobody can make themselves admin from the app.
create table if not exists public.admins (
  profile_id uuid primary key references public.profiles on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Suspicious activity. Keeps the trainer name even after a ban deletes the account.
create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete set null,
  username text not null,
  kind text not null, -- over_50 | over_limit | wrong_day | xp_jump | pages_jump | banned
  day date,
  pages int,
  times int not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists flags_once_a_day on public.flags (user_id, day, kind);
create index if not exists flags_time on public.flags (created_at desc);
alter table public.flags enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where profile_id = my_pid())
$$;

drop policy if exists p_read on public.flags;
drop policy if exists p_delete on public.flags;
create policy p_read on public.flags for select to authenticated using ((select public.is_admin()));
create policy p_delete on public.flags for delete to authenticated using ((select public.is_admin()));
revoke all on public.flags from anon, authenticated;
grant select, delete on public.flags to authenticated;

create or replace function public.flag(p_user uuid, p_kind text, p_day date, p_pages int) returns void
language sql security definer set search_path = public as $$
  insert into flags (user_id, username, kind, day, pages)
    select id, username, p_kind, p_day, p_pages from profiles where id = p_user
  on conflict (user_id, day, kind) do update set
    pages = greatest(flags.pages, excluded.pages), times = flags.times + 1, created_at = now()
$$;
revoke execute on function public.flag(uuid, text, date, int) from public, anon, authenticated;

-- ---------- 100 pages a day ----------
-- A blocked log is skipped (not an error) so the flag about it is still saved.
create or replace function public.check_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if new.day not between current_date - 1 and current_date + 1 then
    perform flag(new.user_id, 'wrong_day', new.day, new.pages);
    return null;
  end if;
  select coalesce(sum(pages), 0) + new.pages into v_total
    from logs where user_id = new.user_id and day = new.day and id <> new.id;
  if v_total > 100 then
    perform flag(new.user_id, 'over_limit', new.day, v_total);
    return null;
  end if;
  if v_total > 50 then perform flag(new.user_id, 'over_50', new.day, v_total); end if;
  return new;
end $$;
drop trigger if exists check_log on public.logs;
create trigger check_log before insert or update on public.logs
  for each row execute function public.check_log();

-- ---------- stats edited outside the app ----------
-- Reading 100 pages earns at most ~170 XP, so bigger jumps mean someone edited the numbers by hand.
create or replace function public.check_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'monsters' then
    if new.xp - (case when tg_op = 'INSERT' then 0 else old.xp end) > 200 then
      perform flag(new.owner, 'xp_jump', current_date, new.xp - (case when tg_op = 'INSERT' then 0 else old.xp end));
    end if;
  elsif new.total_pages - old.total_pages > 100 then
    perform flag(new.id, 'pages_jump', current_date, new.total_pages - old.total_pages);
  end if;
  return new;
end $$;
drop trigger if exists check_stats on public.monsters;
create trigger check_stats before insert or update on public.monsters
  for each row execute function public.check_stats();
drop trigger if exists check_stats on public.profiles;
create trigger check_stats before update on public.profiles
  for each row execute function public.check_stats();

-- ---------- ban = delete the account and everything in it ----------
create or replace function public.admin_ban(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only the admin can do that.'; end if;
  if p_id = my_pid() then raise exception 'You can’t ban yourself.'; end if;
  insert into flags (user_id, username, kind, day)
    select id, username, 'banned', null from profiles where id = p_id;
  delete from profiles where id = p_id;
end $$;

revoke execute on function public.is_admin(), public.admin_ban(uuid) from public, anon;
grant execute on function public.is_admin(), public.admin_ban(uuid) to authenticated;

-- Make yourself admin: register in the app first, then put your trainer name here and run.
insert into public.admins (profile_id)
  select id from public.profiles where username = 'YOUR_TRAINER_NAME'
on conflict do nothing;
