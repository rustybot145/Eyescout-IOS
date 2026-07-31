import { supabase } from '../lib/supabase';

// Column list + row→object mapping ported from the web data layer (sb-data.js
// _SEL_PLAYER / _rowToPlayer) so the mobile app reads the EXACT same fields the
// web portal reads and the admin panel writes. Nothing here changes the schema.
const SEL_PLAYER =
  'id, athlete_first, athlete_last, sport, jersey, school, grad_year, position, club_team, ' +
  'height, weight, bio, profile_photo, delivered_photos, own_photos, own_clips, stats, prefs, ' +
  'purchased, grad_year, created_at, role';

const SEL_POST = 'id, author_id, author_name, author_jersey, sport, media_type, media_data, caption, tournament, created_at';

export type Player = {
  id: string;
  athleteFirst: string;
  athleteLast: string;
  sport: string;
  jersey: string;
  school: string;
  gradYear: string;
  position: string;
  clubTeam: string;
  height: string;
  weight: string;
  bio: string;
  profilePhoto: string | null;
  deliveredPhotos: string[];
  ownPhotos: { url?: string; dataUrl?: string }[];
  ownClips: { url?: string; dataUrl?: string }[];
  stats: { label: string; value: string }[];
  prefs: Record<string, any>;
  purchased: boolean;
};

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  authorJersey: string;
  sport: string;
  type: 'photo' | 'video';
  mediaData: string;
  caption: string;
  tournament: string | null;
  createdAt: string;
};

export type ProfileData = {
  player: Player;
  posts: Post[];
  followers: number;
  following: number;
  totalHype: number;
};

function rowToPlayer(r: any): Player {
  return {
    id: r.id,
    athleteFirst: r.athlete_first || '',
    athleteLast: r.athlete_last || '',
    sport: r.sport || '',
    jersey: r.jersey || '',
    school: r.school || '',
    gradYear: r.grad_year || '',
    position: r.position || '',
    clubTeam: r.club_team || '',
    height: r.height || '',
    weight: r.weight || '',
    bio: r.bio || '',
    profilePhoto: r.profile_photo || null,
    deliveredPhotos: Array.isArray(r.delivered_photos) ? r.delivered_photos : [],
    ownPhotos: Array.isArray(r.own_photos) ? r.own_photos : [],
    ownClips: Array.isArray(r.own_clips) ? r.own_clips : [],
    stats: Array.isArray(r.stats) ? r.stats : [],
    prefs: r.prefs || {},
    purchased: !!r.purchased,
  };
}

function rowToPost(r: any): Post {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name || '',
    authorJersey: r.author_jersey || '',
    sport: r.sport || '',
    type: (r.media_type as 'photo' | 'video') || 'photo',
    mediaData: r.media_data || '',
    caption: r.caption || '',
    tournament: r.tournament || null,
    createdAt: r.created_at,
  };
}

export async function fetchMyProfile(): Promise<ProfileData | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return null;
  return fetchProfileById(uid);
}

export async function fetchProfileById(playerId: string): Promise<ProfileData | null> {
  const { data: prow, error } = await supabase.from('profiles').select(SEL_PLAYER).eq('id', playerId).single();
  if (error || !prow) return null;
  const player = rowToPlayer(prow);

  // Posts by this player (their posted content + highlights + hype source)
  const { data: postRows } = await supabase
    .from('posts')
    .select(SEL_POST)
    .eq('author_id', playerId)
    .order('created_at', { ascending: false });
  const posts = (postRows || []).map(rowToPost);

  // Follower / following counts (head+count = no rows transferred)
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', playerId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', playerId),
  ]);

  // Total hype across all of this player's posts
  let totalHype = 0;
  const postIds = posts.map((p) => p.id);
  if (postIds.length) {
    const { count } = await supabase.from('hypes').select('*', { count: 'exact', head: true }).in('post_id', postIds);
    totalHype = count || 0;
  }

  return {
    player,
    posts,
    followers: followers || 0,
    following: following || 0,
    totalHype,
  };
}

// Is `followerId` currently following `followeeId`? Used by the player profile a
// coach opens, so the Follow button renders in the right state on arrival
// instead of flipping after the fact. head+count = no rows transferred.
export async function fetchIsFollowing(followerId: string, followeeId: string): Promise<boolean> {
  if (!followerId || !followeeId) return false;
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  return (count || 0) > 0;
}

export function formatHype(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 >= 100000 ? 1 : 0) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + 'K';
  return String(n);
}
