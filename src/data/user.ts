import { supabase } from '../lib/supabase';

// The signed-in user's core identity — used to filter the feed to their sport,
// stamp new posts with author info, and scope messages/notifications. Reads the
// SAME profiles columns the web portal reads; no schema change.
export type CurrentUser = {
  id: string;
  first: string;
  last: string;
  sport: string;
  sports: string[]; // all their sports (multi-sport aware, like the web feed)
  jersey: string;
  gradYear: string;
  school: string;
  profilePhoto: string | null;
  role: string;
  prefs: Record<string, any>;
};

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, athlete_first, athlete_last, sport, sports, jersey, grad_year, school, profile_photo, role, prefs')
    .eq('id', uid)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    first: data.athlete_first || '',
    last: data.athlete_last || '',
    sport: data.sport || '',
    sports:
      Array.isArray(data.sports) && data.sports.length ? data.sports : data.sport ? [data.sport] : [],
    jersey: data.jersey || '',
    gradYear: data.grad_year || '',
    school: data.school || '',
    profilePhoto: data.profile_photo || null,
    role: data.role || 'player',
    prefs: data.prefs || {},
  };
}
