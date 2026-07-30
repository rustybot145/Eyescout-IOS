import { supabase } from '../lib/supabase';

// Settings reads the current user's full editable profile and writes changes back
// to the SAME profiles row the web Settings page edits. Column names match the
// web (snake_case) so an edit here is indistinguishable from an edit on the web.

export type SettingsProfile = {
  first: string;
  last: string;
  school: string;
  sport: string;
  jersey: string;
  gradYear: string;
  position: string;
  clubTeam: string;
  height: string;
  weight: string;
  bio: string;
  profilePhoto: string | null;
  prefs: Record<string, any>;
};

const SEL =
  'athlete_first, athlete_last, school, sport, jersey, grad_year, position, club_team, height, weight, bio, profile_photo, prefs';

export async function fetchSettings(uid: string): Promise<SettingsProfile | null> {
  const { data, error } = await supabase.from('profiles').select(SEL).eq('id', uid).single();
  if (error || !data) return null;
  return {
    first: data.athlete_first || '',
    last: data.athlete_last || '',
    school: data.school || '',
    sport: data.sport || '',
    jersey: data.jersey || '',
    gradYear: data.grad_year || '',
    position: data.position || '',
    clubTeam: data.club_team || '',
    height: data.height || '',
    weight: data.weight || '',
    bio: data.bio || '',
    profilePhoto: data.profile_photo || null,
    prefs: data.prefs || {},
  };
}

// Patch keys are snake_case profiles columns. Returns { error } like supabase-js.
export async function updateProfile(uid: string, patch: Record<string, any>): Promise<{ error: any }> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  return { error };
}
