import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../src/lib/supabase';
import { ensureProfile } from '../src/lib/auth';
import { colors } from '../src/theme/colors';
import { IntroVideo } from '../src/components/IntroVideo';
import { SignupQuiz } from '../src/components/SignupQuiz';

// Entry flow:
//   • eyescout://#access_token=…&refresh_token=…  → adopt the session and go
//     straight to the feed. This is the email-confirm handoff: signup happens
//     here, the confirmation link opens login.html in Safari, that page calls
//     verifyOtp and then bounces back carrying the session it just minted —
//     so the person ends up signed in, in the app, without retyping anything.
//   • Signed in already    → straight to the app (feed / scout / pending).
//   • First open / no auth → brand intro animation, then the signup quiz.
type Phase = 'checking' | 'intro' | 'auth';

// Parse the token fragment out of a deep-link URL. Tolerates both #fragment and
// ?query forms — Safari and mail clients occasionally rewrite one into the other.
function tokensFromUrl(url: string | null): { access_token: string; refresh_token: string } | null {
  if (!url || !url.startsWith('eyescout://')) return null;
  const raw = url.split(/[#?]/).slice(1).join('&');
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

export default function Entry() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');

  const routeByRole = useCallback(async (uid: string) => {
    const { data: prof } = await supabase.from('profiles').select('role, verified').eq('id', uid).single();
    if ((prof?.role || 'player') === 'coach') router.replace(prof?.verified ? '/scout' : '/coach-pending');
    else router.replace('/feed');
  }, [router]);

  useEffect(() => {
    let adopted = false;

    // Take a session offered by the confirm page. The profiles row may not exist
    // yet — signup ran with email confirmation on, so the app never got to write
    // it — which is why ensureProfile runs before routing (routeByRole reads the
    // role from that row). Any failure falls through to the normal flow rather
    // than stranding the person on a blank screen.
    const adopt = async (url: string | null): Promise<boolean> => {
      const t = tokensFromUrl(url);
      if (!t || adopted) return false;
      try {
        const { data, error } = await supabase.auth.setSession(t);
        if (error || !data.session) return false;
        adopted = true;
        await ensureProfile(data.session.user);
        await routeByRole(data.session.user.id);
        return true;
      } catch {
        return false;
      }
    };

    // Warm start: the app was already open (usually sitting on this very screen
    // waiting for the person to confirm) when Safari bounced back to it.
    const sub = Linking.addEventListener('url', (e) => { void adopt(e.url); });

    (async () => {
      if (await adopt(await Linking.getInitialURL())) return;
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return setPhase('intro');
      routeByRole(uid);
    })();

    return () => sub.remove();
  }, [routeByRole]);

  if (phase === 'checking') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (phase === 'intro') return <IntroVideo onDone={() => setPhase('auth')} />;
  return <SignupQuiz />;
}
