-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — repair delete_my_account(). IT IS CURRENTLY BROKEN IN PRODUCTION.
--
-- ⚠️  RUN THIS. Account deletion fails 100% of the time until you do, and
--     deletion is required by App Store guideline 5.1.1(v) and Google Play's
--     user-data deletion policy. Apple tests this button during review.
--
-- WHAT BROKE. Migration 007 added, as the FIRST statement of the function:
--
--     delete from storage.objects where bucket_id in (...) and ...
--
-- Supabase has since blocked direct writes to the storage tables. That
-- statement now raises:
--
--     42501: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead.
--
-- Because it is the first statement, the whole function aborts and NOTHING is
-- deleted — not the files, not the rows, not the login. Verified live against
-- this project on 2026-08-30 with a throwaway account.
--
-- Worse, the app mapped 42501 to "Please sign in again, then retry", so the
-- person re-authenticated and hit the identical failure forever.
--
-- WHAT THIS CHANGES. The storage cleanup moves OUT of SQL and into the client,
-- which deletes the caller's own files through the supported Storage API before
-- invoking this function (see deleteAccountFlow in src/lib/account.ts). That is
-- the only route Supabase still permits, and a signed-in user has rights to
-- their own <uid>/ prefix — confirmed by test against the live project.
--
-- THE CHILD-SAFETY GUARANTEE IS PRESERVED, and still comes first. The client
-- deletes the files, RE-LISTS to confirm the prefix is empty, and only calls
-- this function once nothing is left. If any file survives, the account is NOT
-- deleted and the person is told. So the state migration 007 warned about —
-- an account gone while a minor's photos stay reachable by direct URL — cannot
-- occur. Read 007's header for why that matters; it is a real regression that
-- shipped once already.
--
-- HOW TO RUN: paste into the Supabase SQL editor and press Run. Replaces the
-- function in place. Idempotent, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- NOTE: uploaded files are NOT deleted here. Supabase blocks direct DELETE on
  -- storage.objects, and attempting it aborts this entire function. The client
  -- clears them via the Storage API and verifies they are gone BEFORE calling
  -- this. Do not reintroduce a `delete from storage.objects` statement — it is
  -- what broke deletion completely between 007 and 009.

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

  -- Push tokens must go too, or a deleted user's device keeps receiving
  -- notifications (see 006_push_notifications.sql).
  if to_regclass('public.push_tokens')   is not null then delete from public.push_tokens   where user_id    = v_uid; end if;

  -- The profile row carries own_photos / own_clips / delivered_photos as JSON
  -- columns, so those references go with it.
  if to_regclass('public.profiles')      is not null then delete from public.profiles      where id         = v_uid; end if;

  -- Finally the auth identity. Anything referencing auth.users with ON DELETE
  -- CASCADE goes with it.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Permanently deletes the CALLING user (auth.uid()) and their database rows. '
  'Uploaded files are cleared by the client through the Storage API BEFORE this '
  'is called, and verified gone — Supabase forbids deleting storage.objects '
  'from SQL. Takes no arguments by design, so it can never target another '
  'account. Required by App Store guideline 5.1.1(v) and Google Play.';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (run after):
--   -- the blocking statement is gone from the deployed function:
--   select position('storage.objects' in prosrc) = 0 as storage_write_removed
--     from pg_proc where proname = 'delete_my_account';
--   -- expect: true
--
-- Then delete a THROWAWAY account from the app and confirm both:
--   select count(*) from public.profiles where id = '<uid>';        -- expect 0
--   select count(*) from storage.objects
--    where (storage.foldername(name))[1] = '<uid>';                 -- expect 0
-- ═══════════════════════════════════════════════════════════════════════════
