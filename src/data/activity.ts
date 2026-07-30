import { supabase } from '../lib/supabase';

// Activity reads the SAME notifications table the web reads (populated by the
// admin, by follows, and by hype milestones) plus derives "message" items from
// unread coach threads — exactly like activity.html. No schema change.

export type Notif = {
  id: string;
  type: 'follow' | 'message' | 'hype_milestone' | 'post_removed';
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

  const base: Notif[] = (notifRes.data || []).map((r) => ({
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
