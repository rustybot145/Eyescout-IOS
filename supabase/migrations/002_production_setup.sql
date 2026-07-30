-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — production setup for the App Store / Play Store build
--
-- WHAT THIS DOES. Two store-mandated features are already coded in the app but
-- have nothing behind them in the database, so today both buttons silently do
-- nothing:
--
--   1. public.blocks              — Apple 1.2 / Play UGC: users must be able to
--                                   block each other.
--   2. public.delete_my_account() — Apple 5.1.1(v): account deletion must be
--                                   possible from inside the app.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and press Run.
-- Idempotent — safe to run more than once.
--
-- (This replaces the supabase/functions/delete-user Edge Function. Doing it in
-- SQL means no CLI login, no Deno deploy, and no second copy of the
-- service-role key. The app calls supabase.rpc('delete_my_account').)
--
-- Every column name below was verified against src/data/*.ts before writing.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Blocking ─────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- The feed filters by "authors I blocked", so look-ups are always by blocker.
create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
-- Messages hide both directions, so the reverse look-up needs an index too.
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- A row is only ever readable/writable by the person who created it. Nobody can
-- see who blocked them, which is the point.
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks
  for select using (auth.uid() = blocker_id);

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks
  for insert with check (auth.uid() = blocker_id);

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks
  for delete using (auth.uid() = blocker_id);

-- RLS decides which rows; the role still needs the table privilege itself.
grant select, insert, delete on public.blocks to authenticated;


-- ── 2. Account deletion ─────────────────────────────────────────────────────
-- SECURITY DEFINER so it can reach auth.users, but it derives its target from
-- auth.uid() and takes NO arguments — there is deliberately no way to ask it to
-- delete somebody else. A logged-out caller is rejected outright.
--
-- search_path is pinned: without it a caller could create a schema shadowing
-- `public` and make this definer-rights function operate on their own tables.
create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'must be signed in to delete your account'
      using errcode = '42501';
  end if;

  -- Moderation records are ANONYMISED, not deleted. Otherwise anyone reported
  -- for harassment could erase the evidence by deleting their account. The
  -- report keeps its content; the personal identifiers come off.
  if to_regclass('public.reports') is not null then
    update public.reports
       set reporter_id = null, reporter_name = null
     where reporter_id = v_uid;
  end if;

  -- Child rows. Each predicate is scoped to the caller, so this can never touch
  -- another user's data. to_regclass guards let the function keep working if a
  -- table doesn't exist in this project instead of aborting mid-deletion.
  if to_regclass('public.hypes')         is not null then delete from public.hypes         where user_id    = v_uid; end if;
  if to_regclass('public.follows')       is not null then delete from public.follows       where follower_id = v_uid or followee_id = v_uid; end if;
  if to_regclass('public.notifications') is not null then delete from public.notifications where target_id  = v_uid or actor_id   = v_uid; end if;
  if to_regclass('public.messages')      is not null then delete from public.messages      where player_id  = v_uid or coach_id   = v_uid; end if;
  if to_regclass('public.blocks')        is not null then delete from public.blocks        where blocker_id = v_uid or blocked_id = v_uid; end if;
  if to_regclass('public.coach_saved')   is not null then delete from public.coach_saved   where coach_id   = v_uid or player_id  = v_uid; end if;
  if to_regclass('public.seen_stories')  is not null then delete from public.seen_stories  where user_id    = v_uid; end if;
  if to_regclass('public.subscriptions') is not null then delete from public.subscriptions where user_id    = v_uid; end if;
  if to_regclass('public.posts')         is not null then delete from public.posts         where author_id  = v_uid; end if;

  -- The profile row carries own_photos / own_clips / delivered_photos as JSON
  -- columns, so those go with it.
  if to_regclass('public.profiles')      is not null then delete from public.profiles      where id         = v_uid; end if;

  -- Finally the auth identity. Anything referencing auth.users with ON DELETE
  -- CASCADE goes with it.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Permanently deletes the CALLING user (auth.uid()) and their data. Takes no '
  'arguments by design, so it can never target another account. Required by '
  'App Store guideline 5.1.1(v).';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (optional, run after):
--   select to_regclass('public.blocks');   -- expect: blocks
--   select proname from pg_proc
--    where proname in ('delete_my_account','shared_post','create_share_link');
--   -- expect all three
-- ═══════════════════════════════════════════════════════════════════════════
