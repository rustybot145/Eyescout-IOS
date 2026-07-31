import { supabase } from './supabase';
import { confirm, toast } from '../components/Overlays';

// Account deletion — App Store guideline 5.1.1(v). Shared by the player Settings
// screen and the coach Settings screen so both roles behave identically and
// there is exactly one place this logic can rot.
//
// The real work is a SECURITY DEFINER function that takes no arguments and
// derives its target from auth.uid(), so it can only ever delete the caller.
// See supabase/migrations/002_production_setup.sql.

// Turn a Supabase error into something that tells us WHY, because the failure
// mode we actually hit is "the migration was never run" and the old code
// reported that identically to a network blip — a button that silently does
// nothing, with no way to tell which problem you had.
function deleteErrorMessage(error: { code?: string; message?: string }): string {
  // PGRST202 = function not in the schema cache, i.e. it does not exist.
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
    return 'Account deletion is not set up on the server yet. Please contact support.';
  }
  if (error.code === '42501') return 'Please sign in again, then retry deleting your account.';
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

  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    toast(deleteErrorMessage(error), 'err');
    // Surfaced in dev/EAS logs so a support ticket has something to go on.
    console.warn('[delete_my_account]', error.code, error.message);
    return false;
  }

  toast('Your account has been deleted');
  return true;
}
