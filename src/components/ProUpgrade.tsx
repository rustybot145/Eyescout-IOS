import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GradientButton } from './GradientButton';
import { fetchHasPro } from '../data/subscription';
import { purchasePro, restorePro } from '../lib/iap';
import { hapticSuccess } from '../lib/haptics';
import { toast } from './Overlays';

type Role = 'player' | 'coach';

// Shared "Upgrade to Pro" flow. Every CTA in the app uses this: tapping it opens
// the native Apple In-App Purchase sheet (which shows the real $15/mo price from
// the App Store product). On success we re-check the DB and play the unlock
// reveal, then land the now-Pro user on their home feed (which refreshes on
// focus and shows unlocked content).
export function useProUpgrade(role: Role) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const upgrade = useCallback(async () => {
    setBusy(true);
    const result = await purchasePro();
    setBusy(false);
    if (result === 'success' && (await fetchHasPro())) {
      hapticSuccess(); // the unlock reveal deserves the one big confirmation buzz
      setCelebrating(true);
    }
  }, []);

  // Apple requires a Restore Purchases path on every subscription paywall.
  const restore = useCallback(async () => {
    setBusy(true);
    const result = await restorePro();
    setBusy(false);
    if (result === 'success' && (await fetchHasPro())) {
      hapticSuccess();
      setCelebrating(true);
    } else if (result !== 'unavailable') toast('No active subscription found to restore', 'err');
  }, []);

  const finish = useCallback(() => {
    setCelebrating(false);
    router.replace(role === 'coach' ? '/(coach)/news' : '/(tabs)/feed');
  }, [role, router]);

  return { busy, upgrade, restore, celebrating, finish };
}

export function ProCelebration({ visible, role, onDone }: { visible: boolean; role: Role; onDone: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <UnlockReveal role={role} onDone={onDone} />
    </Modal>
  );
}

// ── Unlock reveal ─────────────────────────────────────────────────────────────
// Closed padlock cross-fades to an open padlock with a bounce, a green glow
// blooms, then the copy + button stagger in. All opacity/transform (native).
function UnlockReveal({ role, onDone }: { role: Role; onDone: () => void }) {
  const crossfade = useRef(new Animated.Value(0)).current; // 0 closed → 1 open
  const pop = useRef(new Animated.Value(0.7)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const titleO = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(16)).current;
  const subO = useRef(new Animated.Value(0)).current;
  const btnO = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.delay(220),
      Animated.parallel([
        Animated.timing(crossfade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.stagger(150, [
        Animated.parallel([
          Animated.timing(titleO, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(titleY, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.timing(subO, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(btnO, { toValue: 1, duration: 360, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const closedOpacity = crossfade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.overlay}>
      <View style={styles.lockStage}>
        <Animated.View style={[styles.glowRing, { opacity: glow }]} />
        <LinearGradient
          colors={gradient.colors}
          locations={gradient.locations}
          start={gradient.start}
          end={gradient.end}
          style={styles.badgeRing}
        >
          <Animated.View style={[styles.badgeInner, { transform: [{ scale: pop }] }]}>
            <Animated.View style={[styles.lockAbs, { opacity: closedOpacity }]}>
              <Ionicons name="lock-closed" size={40} color="rgba(255,255,255,0.5)" />
            </Animated.View>
            <Animated.View style={[styles.lockAbs, { opacity: crossfade }]}>
              <Ionicons name="lock-open" size={40} color="#39D353" />
            </Animated.View>
          </Animated.View>
        </LinearGradient>
      </View>

      <Animated.Text style={[styles.successTitle, { opacity: titleO, transform: [{ translateY: titleY }] }]}>
        YOU'RE PRO!
      </Animated.Text>
      <Animated.Text style={[styles.successSub, { opacity: subO }]}>
        Your EyeScout Sports Pro membership is active. Everything is unlocked.
      </Animated.Text>
      <Animated.View style={{ opacity: btnO, width: '100%', maxWidth: 280, marginTop: 30 }}>
        <GradientButton label={role === 'coach' ? 'Start Scouting' : 'Go to Feed'} onPress={onDone} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36,
  },
  lockStage: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 34 },
  glowRing: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(57,211,83,0.08)', borderWidth: 2, borderColor: 'rgba(57,211,83,0.35)',
    shadowColor: '#39D353', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  badgeRing: { width: 84, height: 84, borderRadius: 42, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  badgeInner: { flex: 1, width: '100%', borderRadius: 42, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center' },
  lockAbs: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  successTitle: {
    fontFamily: fonts.display, fontSize: 44, letterSpacing: 1, textTransform: 'uppercase',
    color: colors.white, textAlign: 'center',
  },
  successSub: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12, maxWidth: 340 },
});
