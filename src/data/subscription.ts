import { supabase } from '../lib/supabase';
import { FeedPost } from './feed';

// Access control for the app. EyeScout is free as of 2026-08-15, so this module
// is now mostly a record of how the paywall worked rather than a working one.
//
// What is still deployed on the server and untouched, so charging again is a
// client-side change plus one migration:
//   • _es_viewer_has_feed_access()  → the DB's own "is this viewer unlocked?"
//   • feed_preview()                → the DB-capped 2-post teaser for non-Pro
//
// See RESTORING-PRO.md in the eyescout-site repo, which covers both halves.

// Does the CURRENT signed-in user have full access? Yes — EyeScout is free.
//
// Ben's call (2026-08-15): Pro is switched off until there are enough users to
// charge. Signing in is the only requirement.
//
// This is THE gate for the whole app. Every screen reads it through
// useProAccess(), so returning true unlocks the feed, Activity, Scout, the coach
// inbox and posting at once, and every `hasPro === false` branch becomes
// unreachable. The web has the identical switch in _subHasAccess().
//
// NOTE FOR RESTORING: the database function _es_viewer_has_feed_access() is
// still deployed and still answers correctly — it was NOT dropped by the phase 9
// migration, which only removed RLS policies. Restoring the body below is
// therefore enough to re-gate the mobile app.
//
//   const [dbRes, entitled] = await Promise.all([
//     supabase.rpc('_es_viewer_has_feed_access'),
//     isProEntitled(),
//   ]);
//   if (entitled) return true;
//   return !dbRes.error && dbRes.data === true;
export async function fetchHasPro(): Promise<boolean> {
  return true;
}

// The 2-post teaser for a non-Pro user (DB-capped).
export async function fetchFeedPreview(uid: string | null): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc('feed_preview');
  if (error || !Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name || 'Player',
    authorJersey: r.author_jersey || '',
    authorPhoto: null, // preview doesn't join profiles
    authorGradYear: '',
    sport: r.sport || '',
    type: (r.media_type as 'photo' | 'video') || 'photo',
    mediaData: r.media_data || '',
    caption: r.caption || '',
    createdAt: r.created_at,
    hypeCount: 0,
    hyped: false,
    following: false,
    isMine: r.author_id === uid,
  }));
}
