import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInRight,
  FadeInLeft,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolateColor,
} from 'react-native-reanimated';
import { colors, gradient } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Orbs } from './Orbs';
import { GradientButton } from './GradientButton';
import { Select } from './Select';
import { SportMultiSelect } from './SportMultiSelect';
import { TextField, PasswordField, FieldLabel, ErrorMsg } from './fields';
import { SPORTS, COACH_SPORTS, GRAD_YEARS, DIVISIONS, TITLES, BIRTH_MONTHS, BIRTH_DAYS, BIRTH_YEARS } from '../theme/options';
import { signUpPlayer, signUpCoach, signIn, forgotPassword, ensureProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { RoleSwitch } from './RoleSwitch';
import { toast } from './Overlays';

const logo = require('../../assets/brand/logo.png');
const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v.trim());

type Role = 'player' | 'coach';

const emptyPlayer = {
  athlete_first: '', athlete_last: '', email: '', phone: '', school: '', sports: [] as string[], jersey_number: '',
  grad_year: '', birth_month: '', birth_day: '', birth_year: '',
  parent_first: '', parent_last: '', parent_email: '', parent_phone: '', zip: '',
  password: '', confirm: '',
};
const emptyCoach = { first: '', last: '', university: '', division: '', sport: '', title: '', email: '', password: '', confirm: '' };

const PLAYER_STEPS = 7;
const COACH_STEPS = 5;
const MIN_AGE = 13; // Apple/COPPA — below this, EyeScout requires a parent-operated signup, not self-serve.

// null = incomplete date. Age is computed against real time, not just year
// arithmetic, so someone whose birthday is later this year is still counted
// at their current (younger) age.
function computeAge(year: string, month: string, day: string): number | null {
  if (!year || !month || !day) return null;
  const dob = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function SignupQuiz() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [login, setLogin] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dir = useRef(1); // 1 = advancing, -1 = going back — drives the slide direction

  const [pf, setPf] = useState(emptyPlayer);
  const [cf, setCf] = useState(emptyCoach);
  const setP = (k: keyof typeof pf) => (v: string) => setPf((p) => ({ ...p, [k]: v }));
  const setC = (k: keyof typeof cf) => (v: string) => setCf((p) => ({ ...p, [k]: v }));

  const total = role === 'coach' ? COACH_STEPS : PLAYER_STEPS;

  // Animated progress fill (0..1) — retweens whenever the step changes.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(role ? (step + 1) / total : 0, { duration: 300 });
  }, [role, step, total, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // Background lights bloom in from black on first mount — smooth handoff from
  // the intro's black frame to the role screen. Shared-value (not layout entering)
  // so it always runs and never sticks invisible.
  const orbsFade = useSharedValue(0);
  const orbsScale = useSharedValue(0.9);
  useEffect(() => {
    orbsFade.value = withDelay(280, withTiming(1, { duration: 1000 }));
    orbsScale.value = withDelay(280, withTiming(1, { duration: 1400 }));
  }, [orbsFade, orbsScale]);
  const orbsStyle = useAnimatedStyle(() => ({ opacity: orbsFade.value, transform: [{ scale: orbsScale.value }] }));

  // Role screen starts pure black (seamless with the intro's black frame), then
  // the app's dark bg fades up as the color comes in.
  const bgFade = useSharedValue(0);
  useEffect(() => {
    bgFade.value = withDelay(180, withTiming(1, { duration: 900 }));
  }, [bgFade]);
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(bgFade.value, [0, 1], ['#000000', colors.bg]),
  }));

  const [agree13, setAgree13] = useState(false);
  // Set when signup succeeded but the email is unconfirmed — swaps the quiz for
  // the "enter your code" screen.
  const [waiting, setWaiting] = useState<null | { email: string; role: Role }>(null);

  function validateStep(): string {
    if (role === 'player') {
      switch (step) {
        case 0: return pf.athlete_first.trim() && pf.athlete_last.trim() ? '' : 'Please enter your first and last name.';
        case 1: {
          const age = computeAge(pf.birth_year, pf.birth_month, pf.birth_day);
          if (age === null) return 'Please enter a complete date of birth.';
          if (age < MIN_AGE) return `EYESCOUT_UNDER_AGE`; // handled specially — see the blocked-age panel below
          return '';
        }
        case 2: return !isEmail(pf.email) ? 'Please enter a valid email.' : !pf.phone.trim() ? 'Please enter your phone number.' : '';
        case 3: return pf.school.trim() && pf.sports.length ? '' : 'Please add your school and sport.';
        case 4: return pf.jersey_number.trim() && pf.grad_year ? '' : 'Please add your jersey number and graduation year.';
        case 5:
          if (!(pf.parent_first.trim() && pf.parent_last.trim() && pf.parent_phone.trim() && pf.zip.trim())) return 'Please complete the parent/guardian details.';
          return isEmail(pf.parent_email) ? '' : 'Please enter a valid parent email.';
        case 6:
          if (pf.password.length < 8) return 'Password must be at least 8 characters.';
          if (pf.password !== pf.confirm) return 'Passwords do not match.';
          // Same gate the web signup enforces, in the same words. The birthday
          // step already computes the age; this is the athlete's explicit
          // attestation on top of it, which our App Review notes promise.
          return agree13 ? '' : 'Please confirm you are 13 or older.';
      }
    } else {
      switch (step) {
        case 0: return cf.first.trim() && cf.last.trim() ? '' : 'Please enter your first and last name.';
        case 1: return cf.university.trim() ? '' : 'Please enter your university or college.';
        case 2: return cf.division && cf.sport && cf.title ? '' : 'Please select your division, sport, and title.';
        case 3: return isEmail(cf.email) ? '' : 'Please enter a valid email.';
        case 4:
          if (cf.password.length < 8) return 'Password must be at least 8 characters.';
          return cf.password === cf.confirm ? '' : 'Passwords do not match.';
      }
    }
    return '';
  }

  async function submit() {
    setBusy(true);
    if (role === 'player') {
      const { birth_month, birth_day, birth_year, ...rest } = pf;
      const birth_date = `${birth_year}-${birth_month}-${birth_day}`;
      // Primary sport is whichever was picked first — same rule the web signup
      // uses (login.html: sport = signupSports[0]). Coach scouting matches on
      // this single column; `sports` (both picks) is additive, for the
      // player's own feed personalization only.
      const res = await signUpPlayer({ ...rest, sport: rest.sports[0], birth_date });
      if (!res.ok) {
        setBusy(false);
        if ('needsConfirm' in res) return setWaiting({ email: res.email, role: 'player' });
        return setErr(res.error);
      }
      // Used to drop the brand-new player onto the Pro offer. Nothing is sold
      // now, so signup goes straight where that screen's X button went anyway.
      toast("You're in — your profile is live");
      router.replace('/(tabs)/profile');
    } else {
      const res = await signUpCoach(cf);
      if (!res.ok) {
        setBusy(false);
        if ('needsConfirm' in res) return setWaiting({ email: res.email, role: 'coach' });
        return setErr(res.error);
      }
      toast('Account created — pending verification');
      router.replace('/coach-pending');
    }
  }

  function next() {
    const e = validateStep();
    // The under-13 block has its own panel drawn live in the step itself
    // (see case 1 below) — surfacing the raw sentinel here would show literal
    // "EYESCOUT_UNDER_AGE" text, and the point is to block silently, not nag.
    if (e === 'EYESCOUT_UNDER_AGE') return;
    if (e) return setErr(e);
    setErr('');
    dir.current = 1;
    if (step < total - 1) setStep(step + 1);
    else submit();
  }

  function back() {
    setErr('');
    dir.current = -1;
    if (step > 0) setStep(step - 1);
    else setRole(null);
  }

  const lastStep = step === total - 1;
  const cta = lastStep ? (role === 'coach' ? 'Create Coach Account' : 'Create Profile') : 'Continue';

  /* ── Waiting for the confirmation email to be tapped ── */
  if (waiting) return <ConfirmEmailView {...waiting} onBack={() => setWaiting(null)} />;

  /* ── Login view (returning users) ── */
  if (login) return <LoginView onBack={() => setLogin(false)} />;

  /* ── Role picker ── */
  if (!role) {
    return (
      <Animated.View style={[styles.root, bgStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, orbsStyle]} pointerEvents="none">
          <Orbs />
        </Animated.View>
        <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
          <Animated.View entering={FadeIn.delay(350).duration(650)} style={styles.roleHeader}>
            <Image source={logo} style={styles.logo} />
            <Text style={styles.kicker}>Welcome to EyeScout Sports</Text>
            <Text style={styles.bigQ}>Let's get you set up</Text>
            <Text style={styles.sub}>First — which one are you?</Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(550).duration(650)} style={{ gap: 14 }}>
            <RoleCard
              icon="videocam"
              title="I'm a Player"
              blurb="Build your profile, post highlights, and get scouted by verified coaches."
              onPress={() => { dir.current = 1; setRole('player'); setStep(0); }}
            />
            <RoleCard
              icon="search"
              title="I'm a Coach"
              blurb="Discover and recruit the next generation of athletes on the platform."
              onPress={() => { dir.current = 1; setRole('coach'); setStep(0); }}
            />
          </Animated.View>

          <Animated.View entering={FadeIn.delay(750).duration(550)}>
            <Pressable style={styles.loginLink} onPress={() => setLogin(true)}>
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <Text style={styles.loginAction}>Log in</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    );
  }

  /* ── Quiz steps ── */
  return (
    <View style={styles.root}>
      <Orbs />

      {/* Header: back + animated progress */}
      <View style={[styles.stepHeader, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={back} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.track}>
          <Animated.View style={[styles.fillWrap, barStyle]}>
            <LinearGradient
              colors={gradient.colors}
              locations={gradient.locations}
              start={gradient.start}
              end={gradient.end}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        <Text style={styles.counter}>{step + 1}/{total}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View key={`${role}-${step}`} entering={(dir.current > 0 ? FadeInRight : FadeInLeft).duration(300)}>
            {renderStep()}
            <ErrorMsg>{err}</ErrorMsg>
            <View style={{ height: 8 }} />
            <GradientButton label={cta} onPress={next} loading={busy} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  function renderStep() {
    if (role === 'player') {
      switch (step) {
        case 0:
          return (
            <Step q="What's your name?" s="This is how coaches will find you.">
              <Field label="First Name"><TextField placeholder="Tyler" value={pf.athlete_first} onChangeText={setP('athlete_first')} autoCapitalize="words" /></Field>
              <Field label="Last Name" last><TextField placeholder="Smith" value={pf.athlete_last} onChangeText={setP('athlete_last')} autoCapitalize="words" /></Field>
            </Step>
          );
        case 1: {
          const age = computeAge(pf.birth_year, pf.birth_month, pf.birth_day);
          const blocked = age !== null && age < MIN_AGE;
          return (
            <Step q="When's your birthday?" s="We ask so parent consent and safety settings match your age.">
              <Row>
                <Half><Field label="Month"><Select placeholder="Month" options={BIRTH_MONTHS} value={pf.birth_month} onChange={setP('birth_month')} /></Field></Half>
                <Half><Field label="Day"><Select placeholder="Day" options={BIRTH_DAYS} value={pf.birth_day} onChange={setP('birth_day')} /></Field></Half>
              </Row>
              <Field label="Year" last><Select placeholder="Year" options={BIRTH_YEARS} value={pf.birth_year} onChange={setP('birth_year')} /></Field>
              {blocked ? (
                <View style={styles.blockedPanel}>
                  <Text style={styles.blockedTitle}>A parent needs to help with this one</Text>
                  <Text style={styles.blockedBody}>
                    EyeScout requires a parent or guardian to create an account for athletes under 13. Have a parent
                    reach out to <Text style={styles.blockedStrong}>info@eyescoutsports.com</Text> to get set up.
                  </Text>
                </View>
              ) : null}
            </Step>
          );
        }
        case 2:
          return (
            <Step q="How can we reach you?" s="We'll use this to keep your account secure.">
              <Field label="Email"><TextField placeholder="tyler@email.com" value={pf.email} onChangeText={setP('email')} keyboardType="email-address" autoCapitalize="none" /></Field>
              <Field label="Phone Number" last><TextField placeholder="(602) 555-0123" value={pf.phone} onChangeText={setP('phone')} keyboardType="phone-pad" /></Field>
            </Step>
          );
        case 3:
          return (
            <Step q="Where do you play?" s="Your school and sport power your profile.">
              <Field label="School / High School"><TextField placeholder="Desert Ridge High School" value={pf.school} onChangeText={setP('school')} autoCapitalize="words" /></Field>
              <Field label="Sport(s)" last>
                <SportMultiSelect
                  placeholder="Select sport(s)"
                  options={SPORTS}
                  values={pf.sports}
                  onChange={(v) => setPf((p) => ({ ...p, sports: v }))}
                />
              </Field>
            </Step>
          );
        case 4:
          return (
            <Step q="Tell us about your game" s="A couple details for your player card.">
              <Field label="Jersey Number"><TextField placeholder="12" value={pf.jersey_number} onChangeText={setP('jersey_number')} keyboardType="number-pad" maxLength={3} /></Field>
              <Field label="H.S. Graduation Year" last><Select placeholder="Select year" options={GRAD_YEARS} value={pf.grad_year} onChange={setP('grad_year')} /></Field>
            </Step>
          );
        case 5:
          return (
            <Step q="Parent or guardian info" s="Required for athletes — they'll co-sign your account.">
              <Row>
                <Half><Field label="Parent First"><TextField placeholder="John" value={pf.parent_first} onChangeText={setP('parent_first')} autoCapitalize="words" /></Field></Half>
                <Half><Field label="Parent Last"><TextField placeholder="Smith" value={pf.parent_last} onChangeText={setP('parent_last')} autoCapitalize="words" /></Field></Half>
              </Row>
              <Field label="Parent Email"><TextField placeholder="john@email.com" value={pf.parent_email} onChangeText={setP('parent_email')} keyboardType="email-address" autoCapitalize="none" /></Field>
              <Row last>
                <Half><Field label="Parent Phone"><TextField placeholder="(602) 555-0124" value={pf.parent_phone} onChangeText={setP('parent_phone')} keyboardType="phone-pad" /></Field></Half>
                <Half><Field label="Zip Code"><TextField placeholder="85001" value={pf.zip} onChangeText={setP('zip')} keyboardType="number-pad" maxLength={10} /></Field></Half>
              </Row>
            </Step>
          );
        case 6:
          return (
            <Step q="Secure your account" s="Almost there — set a password.">
              <Field label="Password"><PasswordField placeholder="Min. 8 characters" value={pf.password} onChangeText={setP('password')} /></Field>
              <Field label="Confirm Password" last><PasswordField placeholder="Re-enter password" value={pf.confirm} onChangeText={setP('confirm')} /></Field>
              <Pressable
                style={styles.agreeRow}
                onPress={() => setAgree13(!agree13)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agree13 }}
                accessibilityLabel="I confirm I am 13 years of age or older"
              >
                <Ionicons
                  name={agree13 ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={agree13 ? '#1E90FF' : colors.muted}
                />
                <Text style={styles.agreeText}>
                  I confirm I am <Text style={styles.agreeStrong}>13 years of age or older</Text>.
                </Text>
              </Pressable>
            </Step>
          );
      }
    } else {
      switch (step) {
        case 0:
          return (
            <Step q="What's your name?" s="How athletes and staff will see you.">
              <Field label="First Name"><TextField placeholder="John" value={cf.first} onChangeText={setC('first')} autoCapitalize="words" /></Field>
              <Field label="Last Name" last><TextField placeholder="Smith" value={cf.last} onChangeText={setC('last')} autoCapitalize="words" /></Field>
            </Step>
          );
        case 1:
          return (
            <Step q="Where do you coach?" s="Your program's school or university.">
              <Field label="University / College" last><TextField placeholder="Arizona State University" value={cf.university} onChangeText={setC('university')} autoCapitalize="words" /></Field>
            </Step>
          );
        case 2:
          return (
            <Step q="Your program" s="Helps us route the right athletes to you.">
              <Field label="Division Level"><Select placeholder="Select division" options={DIVISIONS} value={cf.division} onChange={setC('division')} /></Field>
              <Row last>
                <Half><Field label="Sport You Coach"><Select placeholder="Select sport" options={COACH_SPORTS} value={cf.sport} onChange={setC('sport')} /></Field></Half>
                <Half><Field label="Title"><Select placeholder="Select title" options={TITLES} value={cf.title} onChange={setC('title')} /></Field></Half>
              </Row>
            </Step>
          );
        case 3:
          return (
            <Step q="Your email" s="Use your school or program email if you have one.">
              <Field label="Email" last><TextField placeholder="coach@university.edu" value={cf.email} onChangeText={setC('email')} keyboardType="email-address" autoCapitalize="none" /></Field>
            </Step>
          );
        case 4:
          return (
            <Step q="Secure your account" s="Set a password to finish. We'll verify your account before you scout.">
              <Field label="Password"><PasswordField placeholder="Min. 8 characters" value={cf.password} onChangeText={setC('password')} /></Field>
              <Field label="Confirm Password" last><PasswordField placeholder="Re-enter password" value={cf.confirm} onChangeText={setC('confirm')} /></Field>
            </Step>
          );
      }
    }
    return null;
  }
}

/* ─────────────────────────── Login view ─────────────────────────── */
// Player and Coach are separate logins, matching the web portal (login.html vs
// coach-login.html). The tab picks which account type you're signing in as, and
// `signIn` enforces it: a coach's credentials on the Player tab are rejected
// with a message telling them to switch, rather than silently logging them into
// the wrong side of the app.
// Shown after signup while the account is unconfirmed — the mobile twin of the
// web's confirm-email.html. The email carries a 6-digit code; typing it here
// runs verifyOtp, which confirms the account and returns a session IN this app,
// so nothing ever leaves for Safari and bounces back. (The old link handoff is
// what kept breaking: Safari → login.html → eyescout:// → adopt, four hops that
// each had a way to fail. The code is one hop.) The email also keeps a small
// fallback link — if someone taps that instead, Entry's deep-link listener still
// adopts the session and this screen unmounts on its own.
function ConfirmEmailView({ email, role, onBack }: {
  email: string; role: Role; onBack: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Starts counting down: the signup email just went out, and Supabase will
  // refuse another to this address for 60 seconds.
  const [cooldown, setCooldown] = useState(60);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autoTimer.current) clearTimeout(autoTimer.current); }, []);

  // Confirmed → make sure the profiles row exists → route by the row's role
  // (not the tab they signed up on — the row is the truth).
  const walkIn = React.useCallback(async (user: { id: string; user_metadata?: Record<string, any> | null }) => {
    await ensureProfile(user).catch(() => {});
    const { data: prof } = await supabase
      .from('profiles').select('role, verified').eq('id', user.id).single();
    const r = (prof?.role as Role) || role;
    if (r === 'coach') router.replace(prof?.verified ? '/scout' : '/coach-pending');
    else router.replace('/feed');
  }, [role, router]);

  // `quiet` = fired by typing rather than the button. Those stay silent on
  // failure: the code length is a Supabase project setting (6-10 digits), so a
  // short code is someone mid-type, not an error. Hard-coding 6 is what
  // rejected a valid 8-digit code the instant the sixth digit landed.
  async function verify(raw?: string, quiet = false) {
    const token = (raw ?? code).replace(/\D/g, '');
    if (token.length < 6) {
      if (!quiet) setNote('Enter the code from the email.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      // If they tapped the email's fallback link first, the session is already
      // here — the code was spent confirming, so don't fail them for that.
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) return await walkIn(sess.session.user);
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
      if (error || !data.session) {
        if (!quiet) setNote('That code didn’t match — check the newest email and try again.');
        return;
      }
      await walkIn(data.session.user);
    } catch {
      if (!quiet) setNote('Could not verify — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!cooldown) return;
    const id = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Supabase refuses a second email to the same address within 60 seconds
  // (429 over_email_send_rate_limit), and the SIGNUP email already started that
  // clock — which is why this starts counting down on mount rather than
  // offering a button that cannot work yet. On a refusal we count down the
  // server's own "after N seconds" instead of stacking a fresh minute on top.
  async function resend() {
    if (cooldown) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      const m = /after (\d+) second/i.exec(error.message || '');
      const wait = m ? parseInt(m[1], 10) : 60;
      setCooldown(wait);
      setNote(`Please wait ${wait}s before asking for another code.`);
      return;
    }
    setCooldown(60);
    setNote('Sent — check your inbox for the newest code.');
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.container, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24, alignItems: 'center' }]}>
        <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <Ionicons name="mail-unread-outline" size={54} color="#1E90FF" style={{ marginBottom: 18 }} />
          <Text style={[styles.bigQ, { textAlign: 'center' }]}>Check your email</Text>
          <Text style={[styles.sub, { textAlign: 'center', marginTop: 10 }]}>
            Enter the code we sent to
          </Text>
          <Text style={styles.confirmEmail}>{email}</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 10);
              setCode(digits);
              // Auto-verify shortly after typing stops, so the last digit signs
              // you in without a tap — and a pause at six digits inside a longer
              // code fails silently instead of shouting.
              if (autoTimer.current) clearTimeout(autoTimer.current);
              if (digits.length >= 6) {
                autoTimer.current = setTimeout(() => void verify(digits, true), 650);
              }
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="000000"
            placeholderTextColor="rgba(255,255,255,0.18)"
            accessibilityLabel="Verification code from your email"
            editable={!busy}
          />
          <View style={{ height: 20 }} />
          <GradientButton label={busy ? 'Verifying…' : 'Verify & Continue'} onPress={() => void verify()} disabled={busy} />
          {note ? <Text style={styles.confirmNote}>{note}</Text> : null}
          <Pressable onPress={resend} disabled={!!cooldown} style={{ marginTop: 22 }}>
            <Text style={[styles.forgot, cooldown ? { opacity: 0.45 } : null]}>
              {cooldown ? `Resend code (${cooldown}s)` : 'Resend code'}
            </Text>
          </Pressable>
          <Pressable onPress={onBack} style={{ marginTop: 14 }}>
            <Text style={styles.forgot}>Wrong email? Go back</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function LoginView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [role, setRole] = useState<Role>('player');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    setBusy(true);
    const res = await signIn(email, password, role);
    setBusy(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Please confirm your email first.');
    if (res.role === 'coach') router.replace(res.verified ? '/scout' : '/coach-pending');
    else router.replace('/feed');
  }

  return (
    <View style={styles.root}>
      <Orbs />
      <View style={[styles.stepHeader, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(300)}>
            <Image source={logo} style={[styles.logo, { alignSelf: 'center', marginBottom: 16 }]} />
            <Text style={[styles.bigQ, { textAlign: 'center' }]}>Welcome back</Text>
            <Text style={[styles.sub, { textAlign: 'center' }]}>Log in to your account.</Text>

            {/* Clearing the error on switch stops a stale "that's a coach
                account" warning from sitting under the tab that fixes it. */}
            <RoleSwitch
              role={role}
              onChange={(r) => {
                setRole(r);
                setErr('');
              }}
            />
            <View style={{ height: 24 }} />

            <Field label="Email"><TextField placeholder="you@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></Field>
            <Field label="Password" last><PasswordField placeholder="Your password" value={password} onChangeText={setPassword} /></Field>
            <Pressable style={styles.forgotWrap} onPress={() => onForgot(email)}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>
            <ErrorMsg>{err}</ErrorMsg>
            <View style={{ height: 8 }} />
            <GradientButton label={role === 'coach' ? 'Log In as Coach' : 'Log In as Player'} onPress={submit} loading={busy} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function onForgot(email: string) {
  if (!email.trim()) return toast('Type your email above first', 'err');
  forgotPassword(email);
  toast('If an account exists, a reset link is on its way');
}

/* ─────────────────────────── Building blocks ─────────────────────────── */
function RoleCard({ icon, title, blurb, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; blurb: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient colors={gradient.colors} locations={gradient.locations} start={gradient.start} end={gradient.end} style={styles.roleIconRing}>
        <View style={styles.roleIconInner}><Ionicons name={icon} size={24} color={colors.white} /></View>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleBlurb}>{blurb}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.faint} />
    </Pressable>
  );
}

function Step({ q, s, children }: { q: string; s: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.bigQ}>{q}</Text>
      <Text style={[styles.sub, { marginBottom: 24 }]}>{s}</Text>
      {children}
    </View>
  );
}
function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 20 : 16 }}>
      <FieldLabel required>{label}</FieldLabel>
      {children}
    </View>
  );
}
function Row({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return <View style={[styles.row, { marginBottom: last ? 4 : 0 }]}>{children}</View>;
}
function Half({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  roleHeader: { alignItems: 'center' },
  logo: { width: 72, height: 72, borderRadius: 36, resizeMode: 'contain', marginBottom: 14 },
  kicker: { fontFamily: fonts.cond, fontSize: 12, letterSpacing: 2.4, textTransform: 'uppercase', color: colors.muted, marginBottom: 10 },
  bigQ: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.white, textAlign: 'left', letterSpacing: 0.5 },
  sub: { fontFamily: fonts.condRegular, fontSize: 15, color: colors.muted, marginTop: 6 },

  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 15,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.fieldBorder,
    borderRadius: 18, padding: 18,
    // layered, color-tinted shadow for elevation (guardrails: no flat shadows)
    shadowColor: '#1E90FF', shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
  },
  roleCardPressed: { borderColor: colors.blueSoft, backgroundColor: '#1a1a1a' },
  roleIconRing: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  roleIconInner: { width: 47, height: 47, borderRadius: 23.5, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { fontFamily: fonts.condBold, fontSize: 19, letterSpacing: 1, textTransform: 'uppercase', color: colors.white },
  roleBlurb: { fontFamily: fonts.condRegular, fontSize: 13.5, color: colors.muted, marginTop: 3, lineHeight: 18 },

  loginLink: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8 },
  loginPrompt: { color: colors.muted, fontSize: 13 },
  loginAction: { color: colors.white, fontSize: 13, fontFamily: fonts.condBold, textDecorationLine: 'underline' },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 14 },
  backBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fillWrap: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  counter: { fontFamily: fonts.cond, fontSize: 13, color: colors.muted, minWidth: 34, textAlign: 'right' },

  row: { flexDirection: 'row', gap: 14 },

  blockedPanel: {
    marginTop: 20, padding: 16, borderRadius: 12,
    backgroundColor: 'rgba(255,85,85,0.08)', borderWidth: 1, borderColor: 'rgba(255,85,85,0.3)',
  },
  blockedTitle: { color: colors.white, fontFamily: fonts.condBold, fontSize: 15, letterSpacing: 0.3, marginBottom: 6 },
  blockedBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  blockedStrong: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },

  forgotWrap: { alignSelf: 'flex-end', marginBottom: 8, marginTop: -4 },
  forgot: { fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18, paddingRight: 8 },
  agreeText: { flex: 1, fontFamily: fonts.condRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 1 },
  agreeStrong: { color: colors.white, fontFamily: fonts.cond },
  confirmEmail: { fontFamily: fonts.cond, fontSize: 17, color: colors.white, marginTop: 4, letterSpacing: 0.3 },
  // Sized for the longest code Supabase can issue (10 digits), so a project set
  // to 8 does not overflow the box.
  codeInput: {
    alignSelf: 'center', width: 290, marginTop: 24, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(30,144,255,0.45)',
    backgroundColor: 'rgba(30,144,255,0.08)', color: colors.white,
    fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 6,
  },
  confirmNote: { fontFamily: fonts.condRegular, fontSize: 14, color: '#1E90FF', marginTop: 14, textAlign: 'center' },
});
