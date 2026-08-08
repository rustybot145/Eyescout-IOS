-- ═══════════════════════════════════════════════════════════════════════════
-- EyeScout — delete a user's UPLOADED FILES along with their account.
--
-- ⚠️  THIS IS A CHILD-SAFETY REGRESSION FIX. Read before running.
--
-- WHAT WENT WRONG. The Play security review logged this as its one Critical
-- finding: deleting an account removed the database rows but left every photo
-- and video the user ever uploaded sitting in public storage buckets, still
-- reachable by direct URL forever. For an app whose users are minors, that is
-- the worst possible thing to leave behind.
--
-- It was fixed at the time inside the supabase/functions/delete-user Edge
-- Function. Migration 002 then replaced that Edge Function with the SQL
-- delete_my_account() — deliberately, to avoid a Deno deploy and a second copy
-- of the service-role key — but the storage cleanup did NOT come across. So the
-- fix silently reverted, and the review still reads "Fixed".
--
-- This restores it, in SQL, as part of the same transaction as the rest of the
-- deletion.
--
-- HOW IT WORKS. Uploads are written to <bucket>/<uid>/<file> (see uploadToBucket
-- in src/data/media.ts, which prefixes every path with the user's id), so every
-- object belonging to a user is exactly the set whose first path segment is
-- their uid. storage.foldername() splits that path for us.
--
-- Removing the storage.objects row is what makes the file unreachable — the
-- Storage API resolves every public URL through that table, so a deleted row
-- is a dead URL immediately. (The underlying bytes are reaped separately by
-- Supabase; nothing stays downloadable.)
--
-- HOW TO RUN: paste into the Supabase SQL editor and press Run. It replaces
-- delete_my_account() in place — no app change, the client keeps calling the
-- same RPC. Idempotent, safe to re-run.
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

  -- ── Uploaded files ────────────────────────────────────────────────────────
  -- FIRST, before the profile row goes: if a later step fails and the
  -- transaction rolls back, we must not have already orphaned the files.
  -- Scoped to this caller's own <uid>/ prefix, so it can never reach another
  -- user's media even though the function runs with definer rights.
  delete from storage.objects
   where bucket_id in ('posts', 'avatars', 'banners')
     and (storage.foldername(name))[1] = v_uid::text;

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

  -- Added after 002: push tokens must go too, or a deleted user's device keeps
  -- receiving notifications (see 006_push_notifications.sql).
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
  'Permanently deletes the CALLING user (auth.uid()), their data, AND their '
  'uploaded files in the posts/avatars/banners buckets. Takes no arguments by '
  'design, so it can never target another account. Required by App Store '
  'guideline 5.1.1(v) and Google Play user-data deletion policy.';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (optional, run after):
--   -- storage cleanup is present in the deployed function:
--   select position('storage.objects' in prosrc) > 0 as cleans_storage
--     from pg_proc where proname = 'delete_my_account';
--   -- expect: true
--
--   -- after deleting a test account that had uploaded a photo, expect 0 rows:
--   select count(*) from storage.objects
--    where (storage.foldername(name))[1] = '<the-deleted-uid>';
-- ═══════════════════════════════════════════════════════════════════════════
