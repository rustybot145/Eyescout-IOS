import React, { useCallback, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { GradientText } from '../../src/components/GradientText';
import { Coach, getCurrentCoach } from '../../src/data/coach';
import { fetchHasPro } from '../../src/data/subscription';
import { supabase } from '../../src/lib/supabase';

export default function CoachProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [hasPro, setHasPro] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const c = await getCurrentCoach();
    if (!c) {
      router.replace('/');
      return;
    }
    setCoach(c);
    setHasPro(await fetchHasPro());
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading || !coach) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  const name = `${coach.firstName} ${coach.lastName}`.trim();
  const initial = (coach.firstName || 'C').charAt(0).toUpperCase();
  const infoRows: [string, string][] = [
    ['Title', coach.title],
    ['Sport', coach.sport],
    ['School', coach.school],
    ['Division', coach.division],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
      >
        <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topbarTitle}>MY PROFILE</Text>
          <Pressable onPress={() => router.push('/coach-settings')} hitSlop={8} style={styles.gear}>
            <Ionicons name="settings-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Banner */}
        <View style={styles.banner}>
          {coach.bannerPhoto ? (
            <Image source={{ uri: coach.bannerPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#0d0b14', '#0e1520', '#0a0d10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={gradient.colors}
            locations={gradient.locations}
            start={gradient.start}
            end={gradient.end}
            style={styles.bannerBar}
          />
        </View>

        <View style={styles.section}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatarInner}>
              {coach.profilePhoto ? (
                <Image source={{ uri: coach.profilePhoto }} style={styles.avatarImg} />
              ) : (
                <GradientText style={styles.avatarInitial}>{initial}</GradientText>
              )}
            </View>
          </View>

          {/* Name + verified */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name || 'Coach'}</Text>
            {coach.verified ? (
              <View style={styles.verified}>
                <Ionicons name="checkmark-circle" size={18} color={colors.blue} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : (
              <View style={styles.pendingBadge}>
                <Ionicons name="time-outline" size={14} color="#ffc832" />
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            )}
          </View>
          <Text style={styles.subline}>
            {[coach.title, coach.school].filter(Boolean).join(' · ') || 'Coach'}
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.btnOutline} onPress={() => router.push('/coach-settings')}>
              <Ionicons name="create-outline" size={15} color="rgba(255,255,255,0.75)" />
              <Text style={styles.btnOutlineText}>Edit Profile</Text>
            </Pressable>
            <Pressable style={styles.btnOutline} onPress={signOut}>
              <Ionicons name="log-out-outline" size={16} color="rgba(255,255,255,0.75)" />
              <Text style={styles.btnOutlineText}>Sign Out</Text>
            </Pressable>
          </View>

          {/* EyeScout Sports Pro */}
          {hasPro === false ? (
            <Pressable
              style={styles.proBanner}
              onPress={() => router.push({ pathname: '/paywall', params: { role: 'coach' } })}
            >
              <View style={styles.proBadge}>
                <Ionicons name="star" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.proTitle}>EyeScout Sports Pro</Text>
                <Text style={styles.proSub}>Scout, message & more</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.blue} />
            </Pressable>
          ) : hasPro ? (
            <View style={[styles.proBanner, { borderColor: 'rgba(57,211,83,0.3)', backgroundColor: 'rgba(57,211,83,0.06)' }]}>
              <View style={[styles.proBadge, { backgroundColor: 'rgba(57,211,83,0.15)', borderColor: 'rgba(57,211,83,0.3)' }]}>
                <Ionicons name="checkmark" size={20} color="#39D353" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.proTitle}>EyeScout Sports Pro</Text>
                <Text style={styles.proSub}>Your subscription is active</Text>
              </View>
            </View>
          ) : null}

          {coach.bio ? (
            <>
              <Text style={styles.blockTitle}>About</Text>
              <Text style={styles.bio}>{coach.bio}</Text>
            </>
          ) : null}

          {infoRows.length ? (
            <>
              <Text style={styles.blockTitle}>Coach Info</Text>
              <View style={styles.infoCard}>
                {infoRows.map(([k, v], i) => (
                  <View key={k} style={[styles.infoRow, i < infoRows.length - 1 && styles.infoRowBorder]}>
                    <Text style={styles.infoKey}>{k}</Text>
                    <Text style={styles.infoVal}>{v}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg,
  },
  topbarTitle: { fontFamily: fonts.condBold, fontSize: 14, letterSpacing: 2, color: colors.muted },
  gear: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  banner: { height: 150, position: 'relative', overflow: 'hidden' },
  bannerBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  section: { paddingHorizontal: 16 },
  avatarWrap: {
    width: 96, height: 96, borderRadius: 48, padding: 3, backgroundColor: colors.blue,
    marginTop: -48, marginBottom: 14,
  },
  avatarInner: {
    flex: 1, borderRadius: 48, backgroundColor: '#1a1a1a',
    borderWidth: 3, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 48 },
  avatarInitial: { fontFamily: fonts.display, fontSize: 34, color: colors.white, lineHeight: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  name: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.white },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(30,144,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,200,50,0.1)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { color: '#ffc832', fontSize: 12, fontWeight: '700' },
  subline: { fontSize: 14.5, fontWeight: '600', color: colors.muted, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnOutlineText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  proBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, marginTop: 18, borderRadius: 16,
    backgroundColor: 'rgba(30,144,255,0.06)', borderWidth: 1, borderColor: 'rgba(30,144,255,0.25)',
  },
  proBadge: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(30,144,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  proTitle: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  proSub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  blockTitle: {
    fontFamily: fonts.condBold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
    color: colors.muted, marginTop: 24, marginBottom: 12,
  },
  bio: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 22 },
  infoCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  infoKey: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  infoVal: { fontSize: 14, color: colors.white, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
