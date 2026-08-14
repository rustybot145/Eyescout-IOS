import { supabase } from '../lib/supabase';

// Notification writes, mirroring the web's _notifyNewMessage / _notifyNewFollow
// in sb-data.js.
//
// The app previously wrote NO notifications at all: sending a message or
// following someone from the phone left no row, so it never appeared in the
// recipient's activity feed on the web and never triggered the notification
// email. Anything the web writes on an action, the app must write on the same
// action, or the two halves of the product disagree about what happened.
//
// RLS only permits actor_id = the caller's own auth uid, so these can never
// speak for anyone but the signed-in user. All are fire-and-forget: a failed
// notification must never block the message or follow that triggered it.

/** Durable row so the email webhook has something to fire on. Carries no
 *  message text by design — the email never quotes the message. */
export function notifyNewMessage(threadId: string, targetId?: string | null, actorId?: string | null) {
  if (!threadId || !targetId || !actorId || targetId === actorId) return;
  supabase
    .from('notifications')
    .insert({
      id: `msg_${threadId}_${Date.now()}`,
      target_id: targetId,
      actor_id: actorId,
      type: 'message',
      read: false,
      created_at: new Date().toISOString(),
    })
    .then(undefined, () => {});
}

/** A coach following a player is 'coach_follow'; player-to-player is 'follow'.
 *  The type drives both the activity copy and whether an email is sent, so it
 *  is resolved from the follower's real profile rather than guessed from which
 *  screen the tap came from. Deterministic id dedupes re-follows, matching the
 *  web's fl_<follower>_<followee>. */
export async function notifyNewFollow(followerId?: string | null, followeeId?: string | null) {
  if (!followerId || !followeeId || followerId === followeeId) return;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role, athlete_first, athlete_last')
      .eq('id', followerId)
      .maybeSingle();

    const name = [data?.athlete_first, data?.athlete_last].filter(Boolean).join(' ');
    await supabase.from('notifications').insert({
      id: `fl_${followerId}_${followeeId}`,
      target_id: followeeId,
      actor_id: followerId,
      // actor_name is for in-app display only. The email function deliberately
      // ignores it and re-reads the real name, since clients can forge it.
      actor_name: name || null,
      type: data?.role === 'coach' ? 'coach_follow' : 'follow',
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Re-follow hits the duplicate id and throws; that is the dedupe working.
  }
}
