import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme/colors';
import { IntroVideo } from '../src/components/IntroVideo';
import { SignupQuiz } from '../src/components/SignupQuiz';

// Entry flow:
//   • Signed in            → straight to the app (feed / scout / pending).
//   • First open / no auth → brand intro animation, then the signup quiz.
type Phase = 'checking' | 'intro' | 'auth';

export default function Entry() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return setPhase('intro');
      const { data: prof } = await supabase.from('profiles').select('role, verified').eq('id', uid).single();
      if ((prof?.role || 'player') === 'coach') router.replace(prof?.verified ? '/scout' : '/coach-pending');
      else router.replace('/feed');
    })();
  }, [router]);

  if (phase === 'checking') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (phase === 'intro') return <IntroVideo onDone={() => setPhase('auth')} />;
  return <SignupQuiz />;
}
