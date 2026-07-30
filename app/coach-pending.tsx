import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { GradientText } from '../src/components/GradientText';
import { GradientButton } from '../src/components/GradientButton';
import { Orbs } from '../src/components/Orbs';
import { getCurrentCoach, refreshCoachVerified } from '../src/data/coach';
import { toast } from '../src/components/Overlays';
import { supabase } from '../src/lib/supabase';

export default function CoachPendingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // If they're already verified when this screen mounts, go straight in.
  useEffect(() => {
    (async () => {
      const c = await getCurrentCoach();
      if (!c) {
        router.replace('/');
        return;
      }
      setUid(c.id);
      if (c.verified) router.replace('/scout');
    })();
  }, [router]);

  async function checkStatus() {
    if (!uid) return;
    setChecking(true);
    const verified = await refreshCoachVerified(uid);
    setChecking(false);
    if (verified) {
      toast("You're verified — welcome!");
      router.replace('/scout');
    } else {
      toast('Still pending — check back soon', 'err');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <View style={styles.root}>
      <Orbs />
      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="hourglass-outline" size={34} color={colors.blue} />
        </View>

        <GradientText style={styles.title}>Account Pending</GradientText>
        <Text style={styles.body}>
          Your coach account is awaiting admin approval. We'll verify your credentials shortly — once you're approved
          you'll be able to scout players and send messages.
        </Text>

        <View style={styles.steps}>
          <Step done label="Account created" />
          <Step pending label="Awaiting admin approval" />
          <Step label="Start scouting" />
        </View>

        <View style={{ width: '100%', marginTop: 8 }}>
          {checking ? (
            <View style={styles.checking}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : (
            <GradientButton label="Check Status" onPress={checkStatus} />
          )}
        </View>

        <Pressable onPress={signOut} hitSlop={8} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Step({ label, done, pending }: { label: string; done?: boolean; pending?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.dot, done && styles.dotDone, pending && styles.dotPending]}>
        {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
      </View>
      <Text style={[styles.stepLabel, (done || pending) && styles.stepLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 28, alignItems: 'center' },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(30,144,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center', marginBottom: 14 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 30 },
  steps: { alignSelf: 'stretch', gap: 16, marginBottom: 34, paddingHorizontal: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: '#39D353' },
  dotPending: { backgroundColor: colors.blue },
  stepLabel: { color: colors.faint, fontSize: 14 },
  stepLabelActive: { color: colors.white, fontWeight: '600' },
  checking: { height: 52, alignItems: 'center', justifyContent: 'center' },
  signOut: { marginTop: 22 },
  signOutText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
