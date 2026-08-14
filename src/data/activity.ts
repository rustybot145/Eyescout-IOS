import { supabase } from '../lib/supabase';

// Activity reads the SAME notifications table the web reads (populated by the
// admin, by follows, and by hype milestones) plus derives "message" items from
// unread coach threads — exactly like activity.html. No schema change.

// Every type the platform writes, not just the ones this screen was built for.
// The web writes follow / coach_follow / message / hype_milestone; the admin
// panel writes post_removed / admin_message. Missing one used to crash the
// screen, so anything new must be added here AND given a case in activity.tsx —
// which now has a default arm as a backstop either way.
export type NotifType =
  | 'follow'
  | 'coach_follow'
  | 'message'
  | 'admin_message'
  | 'hype_milestone'
  | 'post_removed';

export type Notif = {
  id: string;
  type: NotifType;
  actorId: string | null;
  actorName: string;
  targetId: string;
  createdAt: string;
  read: boolean;
  // message-only extras
  text?: string;
  coachSchool?: string;
};

const SEL_NOTIF = 'id, type, actor_id, actor_name, target_id, created_at, read';

export async function fetchNotifications(uid: string): Promise<Notif[]> {
  const [notifRes, threadRes, followRes] = await Promise.all([
    supabase
      .from('notifications')
      .select(SEL_NOTIF)
      .eq('target_id', uid)
      .order('created_at', { ascending: false })
      .limit(100),
    // Unread coach messages become "sent you a message" activity items.
    supabase.from('messages').select('id, coach_id, coach_name, coach_school, thread').eq('player_id', uid),
    // Who this user already follows — drives the Follow Back button state.
    supabase.from('follows').select('followee_id').eq('follower_id', uid),
  ]);

  const following = new Set((followRes.data || []).map((f) => f.followee_id));

  // Message notifications exist in the table so the email webhook has a row to
  // fire on — they are NOT for display here. This screen builds richer message
  // items (with a preview) from the threads below, so keeping the rows too would
  // show every message twice.
  const SYNTHESIZED_FROM_THREADS = new Set(['message', 'admin_message']);

  const base: Notif[] = (notifRes.data || [])
    .filter((r) => !SYNTHESIZED_FROM_THREADS.has(r.type))
    .map((r) => ({
    id: r.id,
    type: r.type,
    actorId: r.actor_id || null,
    actorName: r.actor_name || '',
    targetId: r.target_id,
    createdAt: r.created_at,
    read: !!r.read,
  }));

  const msgNotifs: Notif[] = [];
  (threadRes.data || []).forEach((t: any) => {
    const msgs: any[] = Array.isArray(t.thread) ? t.thread : [];
    const lastCoach = [...msgs].reverse().find((m) => m.from === 'coach');
    if (!lastCoach) return;
    const anyUnread = msgs.some((m) => m.from === 'coach' && !m.read);
    msgNotifs.push({
      id: 'msg_' + t.id,
      type: 'message',
      actorId: t.coach_id || null,
      actorName: t.coach_name || 'Coach',
      targetId: uid,
      createdAt: lastCoach.timestamp || new Date().toISOString(),
      read: !anyUnread,
      text: lastCoach.text || '',
      coachSchool: t.coach_school || '',
    });
  });

  const all = [...base, ...msgNotifs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // stash the following-set on a symbol-free property so the screen can read it
  (all as any)._following = following;
  return all;
}

export function isFollowingActor(notifs: Notif[], actorId: string): boolean {
  const set: Set<string> | undefined = (notifs as any)._following;
  return !!set && set.has(actorId);
}

// Mark every notification for this user read (matches _sbMarkNotifsRead).
export function markAllRead(uid: string) {
  supabase.from('notifications').update({ read: true }).eq('target_id', uid).then(undefined, () => {});
}
