import { supabase } from '../lib/supabase';

// Coach-side data layer. Reads/writes the SAME tables as the web coach pages:
//   profiles (role='coach' for the coach, role='player' for scouting),
//   coach_saved (the coach's recruit list). No schema change; row shapes match
//   sb-data.js (_rowToCoach / _sbToggleCoachSaved).

export type Coach = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  sport: string;
  school: string;
  division: string;
  bio: string;
  profilePhoto: string | null;
  bannerPhoto: string | null;
  verified: boolean;
  // Same JSONB blob the web writes; holds the notif_* email opt-outs.
  prefs: Record<string, any>;
};

const SEL_COACH =
  'id, athlete_first, athlete_last, title, sport, school, division, bio, profile_photo, banner_photo, verified, role, prefs';

function rowToCoach(r: any): Coach {
  return {
    id: r.id,
    firstName: r.athlete_first || '',
    lastName: r.athlete_last || '',
    title: r.title || '',
    sport: r.sport || '',
    school: r.school || '',
    division: r.division || '',
    bio: r.bio || '',
    profilePhoto: r.profile_photo || null,
    bannerPhoto: r.banner_photo || null,
    verified: !!r.verified,
    prefs: r.prefs || {},
  };
}

export async function getCurrentCoach(): Promise<Coach | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from('profiles').select(SEL_COACH).eq('id', uid).single();
  if (error || !data) return null;
  return rowToCoach(data);
}

// Re-check verification (Pending screen "Check status" button).
export async function refreshCoachVerified(uid: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('verified').eq('id', uid).single();
  return !!data?.verified;
}

export async function updateCoachProfile(uid: string, patch: Record<string, any>): Promise<{ error: any }> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  return { error };
}

// ── Player scouting ──────────────────────────────────────────────────────────
export type PlayerCard = {
  id: string;
  first: string;
  last: string;
  sport: string;
  jersey: string;
  school: string;
  gradYear: string;
  position: string;
  height: string;
  weight: string;
  clubTeam: string;
  bio: string;
  profilePhoto: string | null;
  stats: { label: string; value: string }[];
};

const SEL_PLAYER_CARD =
  'id, athlete_first, athlete_last, sport, jersey, school, grad_year, position, height, weight, club_team, bio, profile_photo, stats';

// Fetch all players; the Scout screen filters to the coach's sport client-side
// (case-insensitive, like the web's applyFilters) so casing differences in the
// stored sport value don't hide anyone.
export async function fetchPlayers(): Promise<PlayerCard[]> {
  const { data } = await supabase.from('profiles').select(SEL_PLAYER_CARD).eq('role', 'player').limit(300);
  return (data || []).map((r: any) => ({
    id: r.id,
    first: r.athlete_first || '',
    last: r.athlete_last || '',
    sport: r.sport || '',
    jersey: r.jersey || '',
    school: r.school || '',
    gradYear: r.grad_year || '',
    position: r.position || '',
    height: r.height || '',
    weight: r.weight || '',
    clubTeam: r.club_team || '',
    bio: r.bio || '',
    profilePhoto: r.profile_photo || null,
    stats: Array.isArray(r.stats) ? r.stats : [],
  }));
}

export async function fetchSavedPlayerIds(coachId: string): Promise<Set<string>> {
  const { data } = await supabase.from('coach_saved').select('player_id').eq('coach_id', coachId);
  return new Set((data || []).map((r: any) => r.player_id));
}

// Fire-and-forget save/unsave — same shape as the web's _sbToggleCoachSaved.
export function toggleSavePlayer(coachId: string, playerId: string, nowSaved: boolean) {
  if (nowSaved) supabase.from('coach_saved').upsert({ coach_id: coachId, player_id: playerId }).then(undefined, () => {});
  else supabase.from('coach_saved').delete().match({ coach_id: coachId, player_id: playerId }).then(undefined, () => {});
}
