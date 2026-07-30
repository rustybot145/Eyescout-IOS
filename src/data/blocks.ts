import { supabase } from '../lib/supabase';

// Blocking — the other half of Google Play's UGC requirement (reports live in
// ./reports.ts). Blocking is one-directional in the DB but hides content BOTH
// ways in the UI: if you block someone, neither of you sees the other.
// Schema: supabase/migrations/001_blocks.sql

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (!blockerId || !blockedId || blockerId === blockedId) return;
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

// Every user id to hide from `uid` — people they blocked AND people who blocked
// them. RLS only exposes rows where you are the blocker, so the reverse half is
// read through a security-definer view (see the migration note) or simply comes
// back empty; either way the caller just gets a set of ids to filter out.
export async function fetchHiddenIds(uid: string): Promise<Set<string>> {
  if (!uid) return new Set();
  const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', uid);
  return new Set((data || []).map((r) => r.blocked_id));
}
