import { supabase } from './supabase';
import { confirm, toast } from '../components/Overlays';
import { hapticError, hapticWarn } from './haptics';

// Account deletion — App Store guideline 5.1.1(v). Shared by the player Settings
// screen and the coach Settings screen so both roles behave identically and
// there is exactly one place this logic can rot.
//
// Two steps, in this order, and the order is a child-safety requirement:
//
//   1. Delete the person's uploaded files through the Storage API, then RE-LIST
//      to confirm the prefix is empty.
//   2. Only then call delete_my_account(), a SECURITY DEFINER function taking no
//      arguments that derives its target from auth.uid(), so it can only ever
//      delete the caller. See supabase/migrations/009_*.sql.
//
// Storage cleanup used to live inside that SQL function. Supabase now blocks
// direct DELETE on storage.objects, so the statement raised 42501 and — being
// the function's first statement — aborted the whole thing. Deletion failed
// completely, every time, while the app told people to "sign in again."
//
// Doing files first means the state migration 007 warned about in capitals —
// the account gone while a minor's photos stay reachable by public URL — cannot
// happen. If a file will not delete, we stop and keep the account.

// Every upload is written to <bucket>/<uid>/<file> (uploadToBucket in
// src/data/media.ts prefixes each path with the owner's id), so a user's files
// are exactly the objects under their own uid folder.
const MEDIA_BUCKETS = ['posts', 'avatars', 'banners'] as const;

async function listOwnFiles(bucket: string, uid: string): Promise<string[]> {
  const paths: string[] = [];
  // Paginate: someone with a long history can exceed one page, and a missed
  // page is a file left behind.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(uid, { limit: 100, offset });
    if (error) throw new Error(`Could not read your ${bucket}: ${error.message}`);
    if (!data || data.length === 0) break;
    paths.push(...data.map((f) => `${uid}/${f.name}`));
    if (data.length < 100) break;
  }
  return paths;
}

/**
 * Remove every file this user uploaded, then prove the folders are empty.
 * Throws if anything survives — the caller must not delete the account then.
 */
async function deleteOwnFiles(uid: string): Promise<void> {
  for (const bucket of MEDIA_BUCKETS) {
    const paths = await listOwnFiles(bucket, uid);
    if (paths.length) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) throw new Error(`Could not delete your ${bucket}: ${error.message}`);
    }
    // Verify rather than trust. A partial remove() reports no error for the
    // files it did handle, and a silently-surviving photo is the exact
    // regression this ordering exists to prevent.
    const left = await listOwnFiles(bucket, uid);
    if (left.length) {
      throw new Error(`${left.length} file(s) in ${bucket} could not be removed`);
    }
  }
}

// Turn a Supabase error into something that tells us WHY. The old mapping sent
// 42501 to "sign in again", which was actively misleading: the real 42501 was
// the storage-write block, and re-authenticating could never fix it.
function deleteErrorMessage(error: { code?: string; message?: string }): string {
  // PGRST202 = function not in the schema cache, i.e. it does not exist.
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
    return 'Account deletion is not set up on the server yet. Please contact support.';
  }
  if (/storage tables is not allowed/i.test(error.message || '')) {
    return 'Account deletion needs a server update. Please contact support.';
  }
  if (error.code === '42501') {
    return 'We do not have permission to finish deleting your account. Please contact support.';
  }
  return 'Could not delete your account. Please try again or contact support.';
}

/**
 * Confirm with the user, then permanently delete their account.
 * Returns true only if the account is really gone — the caller signs out then.
 */
export async function deleteAccountFlow(): Promise<boolean> {
  const ok = await confirm({
    title: 'Delete your account?',
    message:
      'This permanently deletes your profile, posts, photos, and messages. This cannot be undone.',
    confirmText: 'Delete',
    destructive: true,
  });
  if (!ok) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) {
    hapticError();
    toast('Please sign in again, then retry deleting your account.', 'err');
    return false;
  }

  // Files first. Failing here leaves the account fully intact, which is the
  // safe direction to fail in.
  try {
    await deleteOwnFiles(uid);
  } catch (err: any) {
    hapticError();
    toast('Could not delete your photos, so your account was kept. Please try again.', 'err');
    console.warn('[delete_my_account] storage cleanup failed:', err?.message);
    return false;
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    hapticError();
    toast(deleteErrorMessage(error), 'err');
    // Surfaced in dev/EAS logs so a support ticket has something to go on.
    console.warn('[delete_my_account]', error.code, error.message);
    return false;
  }

  hapticWarn();
  toast('Your account has been deleted');
  return true;
}
