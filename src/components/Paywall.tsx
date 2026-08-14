import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { colors, gradient } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GradientText } from './GradientText';
import { GradientButton } from './GradientButton';
import { Orbs } from './Orbs';
import { useProUpgrade, ProCelebration } from './ProUpgrade';
import { PRO_PRICE } from '../data/subscription';
import { openTerms, openPrivacy } from '../lib/legal';

// EyeScout Sports Pro is sold through Apple In-App Purchase (see src/lib/iap.ts).
// Every upgrade CTA below opens the native purchase sheet directly (which shows
// the price) via `useProUpgrade` — there is no separate checkout screen.

type Role = 'player' | 'coach';

const PLAYER_PERKS = [
  'Get seen by college coaches',
  'Post unlimited highlights & photos',
  'The full feed, stories & messaging',
  'See who viewed & followed you',
];
const COACH_PERKS = [
  'Scout & search every athlete',
  'Message any player directly',
  'Save & manage your recruit list',
  'Full profiles, highlights & news feed',
];

const HERO: Record<Role, { headline: string; sub: string }> = {
  player: {
    headline: 'Get Recruited',
    sub: 'Put your highlights in front of the college coaches who are looking.',
  },
  coach: {
    headline: 'Scout Smarter',
    sub: 'Find, message, and track the best talent in your sport.',
  },
};

const CheckIcon = () => (
  <LinearGradient
    colors={gradient.colors}
    locations={gradient.locations}
    start={gradient.start}
    end={gradient.end}
    style={styles.check}
  >
    <Ionicons name="checkmark" size={14} color="#fff" />
  </LinearGradient>
);

const STAR = require('../../assets/hype-star.png');

const ProBadge = ({ size }: { size: number }) => (
  <View style={[styles.badgeGlow, { borderRadius: size * 0.3 }]}>
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      start={gradient.start}
      end={gradient.end}
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3 }]}
    >
      <Image source={STAR} style={{ width: size * 0.5, height: size * 0.5, tintColor: '#fff' }} resizeMode="contain" />
    </LinearGradient>
  </View>
);

// Bare purple hype star that "boosts" in when the paywall opens (mounts) and
// re-boosts on tap — the same energetic pop the hype action feels like.
function BoostStar({ size }: { size: number }) {
  const scale = useSharedValue(0.5);
  const op = useSharedValue(0);

  const boost = () => {
    scale.value = withSequence(
      withTiming(0.8, { duration: 90 }),
      withSpring(1, { damping: 5, stiffness: 170, mass: 0.7 }),
    );
  };

  useEffect(() => {
    op.value = withDelay(200, withTiming(1, { duration: 220 }));
    scale.value = withDelay(200, withSpring(1, { damping: 5, stiffness: 150, mass: 0.7 }));
  }, []);

  const aStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: scale.value }] }));

  return (
    <Pressable onPress={boost} hitSlop={16} style={styles.boostWrap}>
      <Animated.View style={aStyle}>
        <Image source={STAR} resizeMode="contain" style={[styles.boostStar, { width: size, height: size }]} />
      </Animated.View>
    </Pressable>
  );
}

// ── Full-screen blocker ───────────────────────────────────────────────────────
export function PaywallScreen({
  role,
  title,
  welcome,
  onClose,
}: {
  role: Role;
  uid?: string | null;
  title?: string;
  welcome?: string;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const perks = role === 'coach' ? COACH_PERKS : PLAYER_PERKS;
  const hero = HERO[role];
  const { busy, upgrade, restore, celebrating, finish, error } = useProUpgrade(role);

  return (
    <View style={styles.root}>
      <Orbs />
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { top: insets.top + 6 }]}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        ) : null}

        {welcome ? (
          <View style={styles.welcomePill}>
            <Ionicons name="checkmark-circle" size={15} color="#39D353" />
            <Text style={styles.welcomeText}>{welcome}</Text>
          </View>
        ) : null}

        <BoostStar size={82} />

        <GradientText style={styles.eyebrow}>EYESCOUT SPORTS PRO</GradientText>
        <Text style={styles.headline}>{hero.headline}</Text>
        <Text style={styles.sub}>{title || hero.sub}</Text>

        <View style={styles.perks}>
          {perks.map((p) => (
            <View key={p} style={styles.perkRow}>
              <CheckIcon />
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.priceAmt}>${PRO_PRICE}</Text>
          <Text style={styles.pricePer}>/month</Text>
        </View>
        <Text style={styles.priceSub}>Cancel anytime</Text>

        <View style={{ width: '100%', marginTop: 22 }}>
          <GradientButton label="Upgrade to Pro" onPress={upgrade} loading={busy} />
          {error ? <Text style={styles.purchaseError}>{error}</Text> : null}
        </View>

        {/* Apple Guideline 3.1.2: restore path + auto-renew disclosure + legal links */}
        <Pressable onPress={restore} hitSlop={8} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </Pressable>
        <Text style={styles.disclosure}>
          Auto-renews at ${PRO_PRICE}/month until cancelled. Manage or cancel anytime in your App Store settings.
        </Text>
        <View style={styles.legalLinks}>
          <Text style={styles.legalLink} onPress={openTerms}>Terms of Use</Text>
          <Text style={styles.legalSep}>·</Text>
          <Text style={styles.legalLink} onPress={openPrivacy}>Privacy Policy</Text>
        </View>
      </ScrollView>
      <ProCelebration visible={celebrating} role={role} onDone={finish} />
    </View>
  );
}

// ── Inline card (below the 2-post feed teaser) — a compact nudge ──────────────
// "Upgrade to Pro" opens the full paywall page (the same one on the gated tabs),
// which owns the native purchase.
export function PaywallCard({ role }: { role: Role; uid?: string | null }) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <ProBadge size={54} />
      <GradientText style={styles.cardTitle}>EYESCOUT SPORTS PRO</GradientText>
      <Text style={styles.cardBody}>
        {role === 'coach'
          ? `You've reached the free preview. Go Pro to scout players, message athletes, and see the full feed.`
          : `You've reached the free preview. Go Pro to see the full feed, post highlights, and get discovered.`}
      </Text>
      <View style={{ width: '100%', marginTop: 4 }}>
        <GradientButton label="Upgrade to Pro" onPress={() => router.push({ pathname: '/paywall', params: { role } })} />
      </View>
      <Text style={styles.cardFine}>${PRO_PRICE}/month · Cancel anytime</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flexGrow: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, zIndex: 5, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  welcomePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(57,211,83,0.1)', borderWidth: 1, borderColor: 'rgba(57,211,83,0.3)',
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, marginBottom: 22,
  },
  welcomeText: { color: '#39D353', fontFamily: fonts.condBold, fontSize: 12.5, letterSpacing: 1, textTransform: 'uppercase' },

  badgeGlow: {
    marginBottom: 22,
    shadowColor: '#1E90FF', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
  },
  badge: { alignItems: 'center', justifyContent: 'center' },

  boostWrap: { marginBottom: 22, alignItems: 'center', justifyContent: 'center' },
  boostStar: { tintColor: '#a855f7' },

  eyebrow: { fontFamily: fonts.condBold, fontSize: 13, letterSpacing: 3, marginBottom: 12 },
  headline: {
    fontFamily: fonts.display, fontSize: 42, lineHeight: 48, letterSpacing: 0.5, paddingTop: 4,
    textTransform: 'uppercase', color: colors.white, textAlign: 'center',
  },
  sub: { color: colors.muted, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginTop: 12, marginBottom: 30, maxWidth: 330 },

  perks: { alignSelf: 'stretch', gap: 17, paddingHorizontal: 12 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  perkText: { color: 'rgba(255,255,255,0.9)', fontSize: 15.5, flex: 1 },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 32 },
  priceAmt: { fontFamily: fonts.display, fontSize: 46, lineHeight: 54, color: colors.white },
  pricePer: { color: colors.muted, fontSize: 17, fontWeight: '700', marginLeft: 5, marginBottom: 9 },
  priceSub: { color: colors.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6 },

  purchaseError: {
    color: '#ff6b6b', fontSize: 12.5, lineHeight: 18, textAlign: 'center',
    marginTop: 10, paddingHorizontal: 8,
  },
  restoreBtn: { marginTop: 18, paddingVertical: 6, alignItems: 'center' },
  restoreText: { color: colors.muted, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  disclosure: { color: colors.faint, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16, maxWidth: 330 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  legalLink: { color: colors.muted, fontSize: 11.5, textDecorationLine: 'underline' },
  legalSep: { color: colors.faint, fontSize: 11.5 },

  // ── inline card ──
  card: {
    backgroundColor: 'rgba(30,144,255,0.05)', borderWidth: 1, borderColor: 'rgba(30,144,255,0.22)',
    borderRadius: 18, padding: 24, alignItems: 'center', marginTop: 4,
  },
  cardTitle: { fontFamily: fonts.display, fontSize: 21, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' },
  cardBody: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 10, marginBottom: 18 },
  cardFine: { color: colors.faint, fontSize: 11.5, marginTop: 12 },
});
