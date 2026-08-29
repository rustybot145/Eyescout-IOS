import { supabase } from './supabase';
import { logOutPurchases } from './iap';

// Auth helpers, ported from the web portal's login.html handlers. Same Supabase
// Auth calls, same role-guard behaviour, same deliberately-vague error copy.

export type PlayerSignup = {
  athlete_first: string;
  athlete_last: string;
  email: string;
  phone: string;
  school: string;
  sport: string; // primary sport — sports[0]. Still what coach scouting matches on.
  sports: string[]; // up to 2, matches the web signup exactly (login.html)
  jersey_number: string;
  grad_year: string;
  birth_date: string; // ISO 'YYYY-MM-DD' — real age assurance, see SignupQuiz
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

export type AuthResult =
  | { ok: true; role: 'player' | 'coach'; verified?: boolean }
  // Signup succeeded but Supabase's "Confirm email" gate is on: no session until
  // the link is tapped. The quiz shows its waiting screen off this, not an error.
  | { ok: false; needsConfirm: true; email: string }
  | { ok: false; error: string };

function friendlyError(msg: string): string {
  if (/already registered/i.test(msg)) return 'An account with this email already exists.';
  return msg;
}

// With Supabase's "Confirm email" setting ON, signUp returns a user but NO
// session, so the profile row cannot be inserted here — it would run as anon and
// RLS would reject it. Park the row in user_metadata (it rides in the JWT, so it
// survives confirming on a different device) and let ensureProfile() insert it on
// the first successful sign-in. Same trick the web portal uses in login.html.
//
// Without this the account is created in auth but never in `profiles`, and the
// role guard below then reads no row, assumes 'player', and permanently refuses
// every coach that signed up on mobile.
async function signUpWith(email: string, password: string, profileRow: Record<string, any>): Promise<
  { ok: true; needsConfirm: boolean } | { ok: false; error: string }
> {
  // No emailRedirectTo here on purpose. It was tried, and it reaches the email
  // template only as {{ .RedirectTo }} — a variable Supabase's Go template does
  // not define, which made every confirmation email fail to render and silently
  // never send. Returning mobile users to the app is handled on the web side
  // instead: login.html detects iOS after confirming and offers `eyescout://`.
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { es_signup: profileRow } },
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  if (!data.user) return { ok: false, error: 'We could not create your account. Please try again.' };
  if (!data.session) return { ok: true, needsConfirm: true };

  const { error: insertError } = await insertProfile(data.user.id, profileRow);
  if (insertError) return { ok: false, error: 'We could not create your profile. Please try again.' };
  return { ok: true, needsConfirm: false };
}

async function insertProfile(id: string, row: Record<string, any>): Promise<{ error: any }> {
  const { error } = await supabase.from('profiles').insert({ ...row, id });
  // 23505 = the row is already there (the web confirm handler beat us to it).
  if (error && error.code === '23505') return { error: null };
  if (!error) {
    // profiles holds this now, so drop the copy. It carries a minor's phone, zip
    // and parent contact details, and user_metadata lives in auth.users forever.
    supabase.auth.updateUser({ data: { es_signup: null } }).then(undefined, () => {});
  }
  return { error };
}

// Creates the profile row a confirm-email signup could not write. No-op when the
// row already exists or there is nothing parked in user_metadata. Exported
// because the entry screen also needs it: a session arriving via the eyescout://
// deep link (from the email-confirm page) belongs to an account whose row may
// not exist yet.
export async function ensureProfile(user: { id: string; user_metadata?: Record<string, any> | null }): Promise<void> {
  const pending = user.user_metadata?.es_signup;
  if (pending) await insertProfile(user.id, pending);
}

export async function signUpPlayer(f: PlayerSignup): Promise<AuthResult> {
  const email = f.email.toLowerCase().trim();
  const res = await signUpWith(email, f.password, {
    email,
    athlete_first: f.athlete_first.trim(),
    athlete_last: f.athlete_last.trim(),
    phone: f.phone.trim(),
    school: f.school.trim(),
    sport: f.sport,
    sports: f.sports,
    jersey: f.jersey_number.trim(),
    grad_year: f.grad_year,
    birth_date: f.birth_date,
    parent_first: f.parent_first.trim(),
    parent_last: f.parent_last.trim(),
    parent_email: f.parent_email.trim(),
    parent_phone: f.parent_phone.trim(),
    zip: f.zip.trim(),
    role: 'player',
  });
  if (!res.ok) return res;
  if (res.needsConfirm) return { ok: false, needsConfirm: true, email };
  return { ok: true, role: 'player' };
}

export async function signUpCoach(f: CoachSignup): Promise<AuthResult> {
  const email = f.email.toLowerCase().trim();
  const res = await signUpWith(email, f.password, {
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
  if (!res.ok) return res;
  if (res.needsConfirm) return { ok: false, needsConfirm: true, email };
  return { ok: true, role: 'coach', verified: false };
}

// Shared sign-in with role guard. `expectedRole` is which form the user used;
// if the account's real role differs, we sign back out and report it so the UI
// can bounce them to the correct tab (mirrors the web behaviour).
export async function signIn(email: string, password: string, expectedRole: 'player' | 'coach'): Promise<AuthResult> {
  const cleanEmail = email.toLowerCase().trim();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
  if (error) {
    // GoTrue says "Email not confirmed" — telling that person their password is
    // wrong sends them to reset it, which cannot help. Name the real problem.
    if (/not confirmed/i.test(error.message)) {
      return { ok: false, error: 'Please confirm your email first — tap the link we sent you, then log in.' };
    }
    return { ok: false, error: 'Incorrect email or password.' };
  }

  const readProfile = () => supabase
    .from('profiles')
    .select('id, role, verified')
    .eq('id', authData.user.id)
    .single();

  let { data: profile } = await readProfile();
  if (!profile) {
    // First sign-in after confirming an email — the row is still parked in
    // user_metadata. Write it now, then read it back.
    await ensureProfile(authData.user);
    ({ data: profile } = await readProfile());
  }
  if (!profile) {
    // No row and nothing to recover it from. Guessing a role here is what used
    // to tell coaches they had a player account and lock them out for good.
    await signOutEverywhere();
    return { ok: false, error: 'We could not finish setting up your account. Please contact support.' };
  }

  const actualRole = profile.role as 'player' | 'coach';
  if (actualRole !== expectedRole) {
    await signOutEverywhere();
    return {
      ok: false,
      error: actualRole === 'coach' ? 'That’s a coach account — sign in on the Coach tab.' : 'That’s a player account — sign in on the Player tab.',
    };
  }

  return { ok: true, role: actualRole, verified: profile?.verified };
}

// The ONLY way the app should sign out. Six screens used to call
// supabase.auth.signOut() directly and none of them detached RevenueCat, so the
// device kept the previous account's entitlements and the next person to log in
// on the same phone got Pro for free. Routing every exit through here means a
// new sign-out button cannot reintroduce that.
export async function signOutEverywhere(): Promise<void> {
  // Before Supabase, while the SDK still knows who is leaving.
  await logOutPurchases().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
}

// (signInAny was removed — the login screen now has a Player/Coach tab switcher
// like the web portal, so every sign-in states its expected role and goes
// through the guard in signIn above.)

export async function forgotPassword(email: string): Promise<void> {
  const clean = email.toLowerCase().trim();
  if (!clean) return;
  await supabase.auth.resetPasswordForEmail(clean);
}
