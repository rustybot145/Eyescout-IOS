import { supabase } from '../lib/supabase';
import { notifyNewFollow } from './notify';
import { fetchHiddenIds } from './blocks';

// The feed reads the SAME tables the web portal reads and the admin writes:
//   posts (author's content) + profiles (author identity) + hypes + follows.
// Writes (hype / follow) use the EXACT same row shapes as sb-data.js
// (_sbToggleHype / _sbToggleFollow), so nothing about the live web app changes.

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorJersey: string;
  authorPhoto: string | null;
  authorGradYear: string;
  sport: string;
  type: 'photo' | 'video';
  mediaData: string;
  caption: string;
  createdAt: string;
  hypeCount: number;
  hyped: boolean;
  following: boolean;
  isMine: boolean;
};

const SEL_POST =
  'id, author_id, author_name, author_jersey, sport, media_type, media_data, caption, tournament, created_at';

// Fetch the feed for a user. Mirrors the web: strictly your sport(s), newest
// first. Multi-sport aware — a two-sport athlete sees both, exactly like the
// web feed's getPlayerSports filter. Empty array = no sport filter.
export async function fetchFeed(uid: string, mySports: string[]): Promise<FeedPost[]> {
  const { data: postRows } = await supabase
    .from('posts')
    .select(SEL_POST)
    .order('created_at', { ascending: false })
    .limit(100);

  let posts = postRows || [];
  const lc = mySports.map((s) => (s || '').toLowerCase()).filter(Boolean);
  if (lc.length) posts = posts.filter((p) => lc.includes((p.sport || '').toLowerCase()));
  // Blocked authors never reach the feed (Play UGC policy).
  const hidden = await fetchHiddenIds(uid);
  if (hidden.size) posts = posts.filter((p) => !hidden.has(p.author_id));
  if (!posts.length) return [];

  const authorIds = [...new Set(posts.map((p) => p.author_id).filter(Boolean))];
  const postIds = posts.map((p) => p.id);

  const [authorsRes, hypesRes, myHypesRes, followsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, athlete_first, athlete_last, jersey, sport, grad_year, profile_photo')
      .in('id', authorIds),
    supabase.from('hypes').select('post_id').in('post_id', postIds),
    supabase.from('hypes').select('post_id').eq('user_id', uid).in('post_id', postIds),
    supabase.from('follows').select('followee_id').eq('follower_id', uid),
  ]);

  const authors = new Map((authorsRes.data || []).map((a) => [a.id, a]));
  const hypeCounts: Record<string, number> = {};
  (hypesRes.data || []).forEach((h) => {
    hypeCounts[h.post_id] = (hypeCounts[h.post_id] || 0) + 1;
  });
  const mine = new Set((myHypesRes.data || []).map((h) => h.post_id));
  const following = new Set((followsRes.data || []).map((f) => f.followee_id));

  return posts.map((p) => {
    const a: any = authors.get(p.author_id) || {};
    const name =
      p.author_name || [a.athlete_first, a.athlete_last].filter(Boolean).join(' ') || 'Player';
    return {
      id: p.id,
      authorId: p.author_id,
      authorName: name,
      authorJersey: p.author_jersey || a.jersey || '',
      authorPhoto: a.profile_photo || null,
      authorGradYear: a.grad_year || '',
      sport: p.sport || a.sport || '',
      type: (p.media_type as 'photo' | 'video') || 'photo',
      mediaData: p.media_data || '',
      caption: p.caption || '',
      createdAt: p.created_at,
      hypeCount: hypeCounts[p.id] || 0,
      hyped: mine.has(p.id),
      following: following.has(p.author_id),
      isMine: p.author_id === uid,
    };
  });
}

// Fire-and-forget hype toggle — identical shape to the web's _sbToggleHype.
export function toggleHype(postId: string, userId: string, nowHyped: boolean) {
  if (nowHyped) supabase.from('hypes').upsert({ post_id: postId, user_id: userId }).then(undefined, () => {});
  else supabase.from('hypes').delete().match({ post_id: postId, user_id: userId }).then(undefined, () => {});
}

// Fire-and-forget follow toggle — identical shape to the web's _sbToggleFollow.
export function toggleFollow(followerId: string, followeeId: string, nowFollowing: boolean) {
  if (nowFollowing) {
    supabase.from('follows').upsert({ follower_id: followerId, followee_id: followeeId }).then(undefined, () => {});
    // Every follow in the app routes through here, so this is the one place the
    // notification needs to be written — matching the web's _notifyNewFollow.
    notifyNewFollow(followerId, followeeId);
  } else supabase.from('follows').delete().match({ follower_id: followerId, followee_id: followeeId }).then(undefined, () => {});
}
