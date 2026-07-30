import { supabase } from '../lib/supabase';

// DMs read/write the SAME messages table the web portal uses. A thread is one
// row keyed by (player_id, coach_id) with the conversation stored as a `thread`
// JSON array — identical to sb-data.js (_rowToThread / _threadToRow). Sending
// appends to the array and upserts, so a coach on the web sees it immediately.

export type ChatMsg = { from: 'player' | 'coach'; text: string; timestamp: string; read?: boolean };

export type Thread = {
  id: string;
  playerId: string;
  coachId: string | null;
  coachName: string;
  coachTitle: string;
  coachSchool: string;
  messages: ChatMsg[];
};

const SEL_THREAD = 'id, player_id, coach_id, coach_name, coach_title, coach_school, thread';

export async function fetchThreads(playerId: string): Promise<Thread[]> {
  const { data } = await supabase.from('messages').select(SEL_THREAD).eq('player_id', playerId);
  return (data || [])
    .map((r: any) => ({
      id: r.id,
      playerId: r.player_id,
      coachId: r.coach_id || null,
      coachName: r.coach_name || '',
      coachTitle: r.coach_title || '',
      coachSchool: r.coach_school || '',
      messages: Array.isArray(r.thread) ? r.thread : [],
    }))
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1]?.timestamp || '';
      const lb = b.messages[b.messages.length - 1]?.timestamp || '';
      return lb.localeCompare(la);
    });
}

function threadToRow(t: Thread) {
  return {
    id: t.id,
    player_id: t.playerId,
    coach_id: t.coachId || null,
    coach_name: t.coachName || null,
    coach_title: t.coachTitle || null,
    coach_school: t.coachSchool || null,
    thread: t.messages,
    updated_at: new Date().toISOString(),
  };
}

// Persist a thread (used after sending / marking read). Awaitable so the caller
// can reflect success; the web fires-and-forgets, but awaiting is harmless.
export async function saveThread(t: Thread): Promise<{ error: any }> {
  const { error } = await supabase.from('messages').upsert(threadToRow(t));
  return { error };
}

export function deleteThread(id: string) {
  supabase.from('messages').delete().eq('id', id).then(undefined, () => {});
}

// ── Coach side of DMs ────────────────────────────────────────────────────────
// A coach's inbox is the same messages rows, keyed by coach_id. Threads also
// carry the player's name/photo (looked up from profiles) so the coach sees who
// they're talking to.
export type CoachThread = Thread & { playerName: string; playerPhoto: string | null; playerSport: string };

export async function fetchCoachThreads(coachId: string): Promise<CoachThread[]> {
  const { data } = await supabase.from('messages').select(SEL_THREAD).eq('coach_id', coachId);
  const base: Thread[] = (data || []).map((r: any) => ({
    id: r.id,
    playerId: r.player_id,
    coachId: r.coach_id || null,
    coachName: r.coach_name || '',
    coachTitle: r.coach_title || '',
    coachSchool: r.coach_school || '',
    messages: Array.isArray(r.thread) ? r.thread : [],
  }));

  // attach player identity
  const ids = [...new Set(base.map((t) => t.playerId).filter(Boolean))];
  const players = new Map<string, any>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, athlete_first, athlete_last, sport, profile_photo')
      .in('id', ids);
    (profs || []).forEach((p: any) => players.set(p.id, p));
  }

  return base
    .map((t) => {
      const p = players.get(t.playerId) || {};
      return {
        ...t,
        playerName: `${p.athlete_first || ''} ${p.athlete_last || ''}`.trim() || 'Player',
        playerPhoto: p.profile_photo || null,
        playerSport: p.sport || '',
      };
    })
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1]?.timestamp || '';
      const lb = b.messages[b.messages.length - 1]?.timestamp || '';
      return lb.localeCompare(la);
    });
}

// Deterministic id so a coach↔player pair always maps to one thread (matches the
// web's find-or-create behavior).
export function coachThreadId(coachId: string, playerId: string) {
  return `${coachId}__${playerId}`;
}

// Coach sends a message to a player — find-or-create the thread, append, upsert.
export async function sendCoachMessage(
  coach: { id: string; firstName: string; lastName: string; title: string; school: string },
  playerId: string,
  text: string
): Promise<{ error: any }> {
  const id = coachThreadId(coach.id, playerId);
  const { data } = await supabase.from('messages').select('thread').eq('id', id).maybeSingle();
  const existing: ChatMsg[] = Array.isArray(data?.thread) ? data!.thread : [];
  const msgs = [...existing, { from: 'coach' as const, text, timestamp: new Date().toISOString(), read: false }];
  const row = {
    id,
    player_id: playerId,
    coach_id: coach.id,
    coach_name: `${coach.firstName} ${coach.lastName}`.trim() || null,
    coach_title: coach.title || null,
    coach_school: coach.school || null,
    thread: msgs,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('messages').upsert(row);
  return { error };
}
