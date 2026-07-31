import { supabase } from '../lib/supabase';
import { isProEntitled } from '../lib/iap';
import { FeedPost } from './feed';

// EyeScout Sports Pro — $15/month. Access is enforced at the DATABASE level by
// the same functions the web paywall uses; this module just reads them so the UI
// can show the right thing:
//   • _es_viewer_has_feed_access()  → true for a Pro player, or a verified + paid
//     coach. Drives every "is this unlocked?" decision.
//   • feed_preview()                → the exactly-2-post teaser a non-Pro user
//     may see (the cap lives in the DB function, so it can't be bypassed).
// No client can self-grant Pro; a real subscription is written only by the
// server after PayPal confirms payment.

export const PRO_PRICE = 15;

// Does the CURRENT signed-in user have Pro / feed access right now?
//
// Two independent sources, either of which unlocks:
//   • the DATABASE (_es_viewer_has_feed_access) — the durable record the web app
//     and RLS use, written server-side by the RevenueCat webhook.
//   • the STORE (RevenueCat entitlement) — receipt-validated on RevenueCat's
//     servers, available the instant a purchase completes.
//
// The store check exists because the webhook is asynchronous: without it, a user
// who just paid through Apple's sheet would bounce off the paywall until the
// webhook landed. Checked in parallel so this stays one round-trip of latency.
export async function fetchHasPro(): Promise<boolean> {
  const [dbRes, entitled] = await Promise.all([
    supabase.rpc('_es_viewer_has_feed_access'),
    isProEntitled(),
  ]);
  if (entitled) return true;
  return !dbRes.error && dbRes.data === true;
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

export type Subscription = {
  status: 'active' | 'cancelled' | 'none';
  nextBillingDate: string | null;
  price: number;
};

// The current user's own subscription row (for display in Settings/Profile).
export async function getSubscription(uid: string): Promise<Subscription> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, expires_at, started_at, price')
    .eq('user_id', uid)
    .maybeSingle();
  if (!data) return { status: 'none', nextBillingDate: null, price: PRO_PRICE };
  return {
    status: (data.status as any) || 'none',
    nextBillingDate: data.expires_at || null,
    price: data.price || PRO_PRICE,
  };
}
