import { supabase } from '../lib/supabase';

// Media writes mirror the web exactly:
//   • uploads go to the SAME public Storage buckets (posts / avatars),
//   • "Add Photos" appends to profiles.own_photos / own_clips (handleOwnPhotos),
//   • "Post" inserts a posts row (_postToRow / submitPost).
// The admin can add the same media to a player, and it shows here on refresh.

// Upload a local file URI (from expo-image-picker) to a public bucket and return
// its public CDN URL. RN has no File object, so we fetch the URI into an
// ArrayBuffer and hand that to supabase-js (the supported RN upload path).
export async function uploadToBucket(
  bucket: string,
  keyPrefix: string,
  uri: string,
  mime: string
): Promise<string> {
  const ext = (mime && mime.split('/')[1]) || uri.split('.').pop() || 'jpg';
  const path = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage.from(bucket).upload(path, arraybuffer, {
    contentType: mime || 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Upload failed');
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export type OwnMedia = { url: string; kind: 'photo' | 'video' };

// Append uploaded media to the player's own_photos / own_clips (Content tab).
export async function addOwnMedia(uid: string, items: OwnMedia[]): Promise<void> {
  const { data } = await supabase.from('profiles').select('own_photos, own_clips').eq('id', uid).single();
  const photos: any[] = Array.isArray(data?.own_photos) ? data!.own_photos.slice() : [];
  const clips: any[] = Array.isArray(data?.own_clips) ? data!.own_clips.slice() : [];
  const now = new Date().toISOString();
  items.forEach((it) => {
    if (it.kind === 'video') clips.push({ url: it.url, uploadedAt: now });
    else photos.push({ url: it.url, uploadedAt: now });
  });
  const { error } = await supabase.from('profiles').update({ own_photos: photos, own_clips: clips }).eq('id', uid);
  if (error) throw new Error(error.message);
}

// Create a post row — same columns the web's submitPost writes.
export async function createPost(p: {
  authorId: string;
  authorName: string;
  authorJersey: string;
  sport: string;
  type: 'photo' | 'video';
  mediaData: string;
  caption: string;
  tournament: string | null;
}): Promise<{ error: any }> {
  const row = {
    id: Date.now().toString(),
    author_id: p.authorId,
    author_name: p.authorName || null,
    author_jersey: p.authorJersey || null,
    sport: p.sport || null,
    media_type: p.type || 'photo',
    media_data: p.mediaData || null,
    caption: p.caption || null,
    tournament: p.tournament || null,
    likes: 0,
    likes_data: [],
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('posts').upsert(row);
  return { error };
}

export type TournamentOption = { id: string; name: string; sport: string };

export async function fetchTournaments(): Promise<TournamentOption[]> {
  const { data } = await supabase
    .from('tournaments')
    .select('id, name, sport, status')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []).map((t: any) => ({ id: t.id, name: t.name, sport: t.sport || '' }));
}

// ── Deletes (owner only — all scoped to the signed-in user's own row/post) ────
const urlOf = (m: any): string => (typeof m === 'string' ? m : m?.url || m?.dataUrl || '');

// Remove a delivered photo (by url) from the player's delivered_photos array.
export async function deleteDeliveredPhoto(uid: string, url: string): Promise<{ error: any }> {
  const { data } = await supabase.from('profiles').select('delivered_photos').eq('id', uid).single();
  const arr = (Array.isArray(data?.delivered_photos) ? data!.delivered_photos : []).filter((m: any) => urlOf(m) !== url);
  const { error } = await supabase.from('profiles').update({ delivered_photos: arr }).eq('id', uid);
  return { error };
}

// Remove an own photo/clip (by url) from own_photos / own_clips.
export async function deleteOwnMedia(uid: string, kind: 'photo' | 'video', url: string): Promise<{ error: any }> {
  const col = kind === 'video' ? 'own_clips' : 'own_photos';
  const { data } = await supabase.from('profiles').select(col).eq('id', uid).single();
  const cur = (data as any)?.[col];
  const arr = (Array.isArray(cur) ? cur : []).filter((m: any) => urlOf(m) !== url);
  const { error } = await supabase.from('profiles').update({ [col]: arr }).eq('id', uid);
  return { error };
}

// Delete one of the player's posts (Posted / Highlights). RLS restricts this to
// the author, same as the web's _sbDeletePost.
export async function deletePostById(postId: string): Promise<{ error: any }> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return { error };
}

// ── Profile media for the post picker ─────────────────────────────────────────
// Everything on the player's profile they can re-share: photos (own + delivered)
// AND video highlights (own clips from Content + the player's video posts, which
// are the profile's Highlights tab). Deduped by URL.
export type PickableMedia = { uri: string; kind: 'photo' | 'video' };

export async function fetchProfileMedia(uid: string): Promise<PickableMedia[]> {
  const out: PickableMedia[] = [];
  const seen = new Set<string>();
  const add = (uri: string, kind: 'photo' | 'video') => {
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      out.push({ uri, kind });
    }
  };

  // Content: delivered/own photos + own clips (videos)
  const { data } = await supabase
    .from('profiles')
    .select('own_photos, delivered_photos, own_clips')
    .eq('id', uid)
    .single();
  (Array.isArray(data?.delivered_photos) ? data!.delivered_photos : []).forEach((p: any) => add(urlOf(p), 'photo'));
  (Array.isArray(data?.own_photos) ? data!.own_photos : []).forEach((p: any) => add(urlOf(p), 'photo'));
  (Array.isArray(data?.own_clips) ? data!.own_clips : []).forEach((c: any) => add(urlOf(c), 'video'));

  // Highlights: the player's own video posts.
  const { data: posts } = await supabase
    .from('posts')
    .select('media_type, media_data, created_at')
    .eq('author_id', uid)
    .eq('media_type', 'video')
    .order('created_at', { ascending: false });
  (posts || []).forEach((po: any) => add(po.media_data, 'video'));

  return out;
}
