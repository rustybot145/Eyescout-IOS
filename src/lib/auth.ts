import { supabase } from './supabase';

// Auth helpers, ported from the web portal's login.html handlers. Same Supabase
// Auth calls, same role-guard behaviour, same deliberately-vague error copy.

export type PlayerSignup = {
  athlete_first: string;
  athlete_last: string;
  email: string;
  phone: string;
  school: string;
  sport: string;
  jersey_number: string;
  grad_year: string;
  parent_first: string;
  parent_last: string;
  parent_email: string;
  parent_phone: string;
  zip: string;
  password: string;
};

export type CoachSignup = {
  first: string;
  last: string;
  university: string;
  division: string;
  sport: string;
  title: string;
  email: string;
  password: string;
};

export type AuthResult = { ok: true; role: 'player' | 'coach'; verified?: boolean } | { ok: false; error: string };

function friendlyError(msg: string): string {
  if (/already registered/i.test(msg)) return 'An account with this email already exists.';
  return msg;
}

export async function signUpPlayer(f: PlayerSignup): Promise<AuthResult> {
  const email = f.email.toLowerCase().trim();
  const { data, error } = await supabase.auth.signUp({ email, password: f.password });
  if (error) return { ok: false, error: friendlyError(error.message) };
  if (!data.session || !data.user) {
    return { ok: false, error: 'Please check your email to confirm your account before signing in.' };
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    athlete_first: f.athlete_first.trim(),
    athlete_last: f.athlete_last.trim(),
    phone: f.phone.trim(),
    school: f.school.trim(),
    sport: f.sport,
    jersey: f.jersey_number.trim(),
    grad_year: f.grad_year,
    parent_first: f.parent_first.trim(),
    parent_last: f.parent_last.trim(),
    parent_email: f.parent_email.trim(),
    parent_phone: f.parent_phone.trim(),
    zip: f.zip.trim(),
    role: 'player',
  });
  if (insertError) return { ok: false, error: 'We could not create your profile. Please try again.' };

  return { ok: true, role: 'player' };
}

export async function signUpCoach(f: CoachSignup): Promise<AuthResult> {
  const email = f.email.toLowerCase().trim();
  const { data, error } = await supabase.auth.signUp({ email, password: f.password });
  if (error) return { ok: false, error: friendlyError(error.message) };
  if (!data.session || !data.user) {
    return { ok: false, error: 'Please check your email to confirm your account before signing in.' };
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    athlete_first: f.first.trim(),
    athlete_last: f.last.trim(),
    school: f.university.trim(),
    sport: f.sport,
    title: f.title,
    division: f.division,
    verified: false,
    role: 'coach',
  });
  if (insertError) return { ok: false, error: 'We could not create your account. Please try again.' };

  return { ok: true, role: 'coach', verified: false };
}

// Shared sign-in with role guard. `expectedRole` is which form the user used;
// if the account's real role differs, we sign back out and report it so the UI
// can bounce them to the correct tab (mirrors the web behaviour).
export async function signIn(email: string, password: string, expectedRole: 'player' | 'coach'): Promise<AuthResult> {
  const cleanEmail = email.toLowerCase().trim();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
  if (error) return { ok: false, error: 'Incorrect email or password.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, verified')
    .eq('id', authData.user.id)
    .single();

  const actualRole = (profile?.role || 'player') as 'player' | 'coach';
  if (actualRole !== expectedRole) {
    await supabase.auth.signOut().catch(() => {});
    return {
      ok: false,
      error: actualRole === 'coach' ? 'That’s a coach account — sign in on the Coach tab.' : 'That’s a player account — sign in on the Player tab.',
    };
  }

  return { ok: true, role: actualRole, verified: profile?.verified };
}

// Quiz login: sign in and route by the account's ACTUAL role (no expected-role
// guard — the quiz login form doesn't ask player-vs-coach up front).
export async function signInAny(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.toLowerCase().trim();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
  if (error || !authData.user) return { ok: false, error: 'Incorrect email or password.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verified')
    .eq('id', authData.user.id)
    .single();

  return { ok: true, role: (profile?.role || 'player') as 'player' | 'coach', verified: profile?.verified };
}

export async function forgotPassword(email: string): Promise<void> {
  const clean = email.toLowerCase().trim();
  if (!clean) return;
  await supabase.auth.resetPasswordForEmail(clean);
}
