import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { GradientText } from '../../src/components/GradientText';
import { HypeStar } from '../../src/components/HypeStar';
import { Cover, Stat, EmptyState, MediaGrid } from '../../src/components/ProfilePieces';
import { MediaViewer } from '../../src/components/MediaViewer';
import { ComposeMessage } from '../../src/components/ComposeMessage';
import { confirm, toast } from '../../src/components/Overlays';
import {
  fetchProfileById, fetchIsFollowing, formatHype, ProfileData, Player,
} from '../../src/data/profile';
import { toggleFollow } from '../../src/data/feed';
import { getCurrentCoach, Coach, fetchSavedPlayerIds, toggleSavePlayer } from '../../src/data/coach';
import { sendCoachMessage } from '../../src/data/messages';
import { blockUser } from '../../src/data/blocks';
import { getCurrentUser } from '../../src/data/user';
import { hapticTap, hapticSuccess, hapticError, hapticWarn } from '../../src/lib/haptics';

// A player's profile as seen by SOMEONE ELSE — this is what opens when a coach
// taps a card on the Scout screen. Before this existed, tapping a player showed
// a small info sheet with no highlights and no way to follow, which meant the
// scouting flow stopped exactly where a coach would want to go deeper.
//
// Read-only on purpose: no upload, no delete, no edit. It reads through the same
// fetchProfileById() the player's own profile tab uses, so a coach sees exactly
// what the athlete published — Content, Highlights, Info and Stats.

type Tile = { uri: string; kind: 'photo' | 'video' };
type TabKey = 'content' | 'highlights' | 'info' | 'stats';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'content', label: 'Content' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'info', label: 'Info' },
  { key: 'stats', label: 'Stats' },
];

const mediaUri = (m: { url?: string; dataUrl?: string }) => m.url || m.dataUrl || '';

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<ProfileData | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [following, setFollowing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('content');
  const [media, setMedia] = useState<Tile | null>(null);
  const [composing, setComposing] = useState(false);
  const [focused, setFocused] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [profile, me] = await Promise.all([fetchProfileById(id), getCurrentUser()]);
    setData(profile);
    setViewerId(me?.id ?? null);
    if (!me) return;

    setFollowing(await fetchIsFollowing(me.id, id));

    // Message and Save-to-recruit-list are coach tools; Follow is for everyone.
    // getCurrentCoach() would happily return a row for a player too, so the role
    // on the profile is what decides, not the shape of the row.
    if (me.role !== 'coach') {
      setCoach(null);
      return;
    }
    const c = await getCurrentCoach();
    setCoach(c);
    if (c) setSaved((await fetchSavedPlayerIds(c.id)).has(id));
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Pause inline Highlights videos when this screen loses focus.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function onToggleFollow() {
    if (!viewerId || !id) return;
    const next = !following;
    hapticTap();
    setFollowing(next); // optimistic — the write is fire-and-forget, like the feed
    toggleFollow(viewerId, id, next);
    // Keep the follower count honest without a full refetch.
    setData((d) => (d ? { ...d, followers: Math.max(0, d.followers + (next ? 1 : -1)) } : d));
  }

  function onToggleSave() {
    if (!coach || !id) return;
    const next = !saved;
    hapticTap();
    setSaved(next);
    toggleSavePlayer(coach.id, id, next);
    toast(next ? 'Added to your recruit list' : 'Removed from your recruit list');
  }

  async function onSend(text: string) {
    if (!coach || !id) return;
    const { error } = await sendCoachMessage(coach, id, text);
    setComposing(false);
    if (error) hapticError();
    else hapticSuccess();
    toast(error ? 'Could not send' : `Message sent to ${data?.player.athleteFirst || 'player'}`, error ? 'err' : 'ok');
  }

  // Play UGC / Apple 1.2: any profile showing user content needs a way out.
  async function onBlock() {
    if (!viewerId || !id) return;
    const who = `${data?.player.athleteFirst ?? ''} ${data?.player.athleteLast ?? ''}`.trim();
    const ok = await confirm({
      title: `Block ${who || 'this user'}?`,
      message: "You won't see each other's posts or messages. You can undo this later.",
      confirmText: 'Block',
      destructive: true,
    });
    if (!ok) return;
    try {
      await blockUser(viewerId, id);
      hapticWarn();
      toast('Blocked');
      router.back();
    } catch {
      toast('Could not block right now', 'err');
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, styles.center, { paddingHorizontal: 40 }]}>
        <Text style={styles.missing}>This profile isn't available.</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const p = data.player;
  const name = `${p.athleteFirst} ${p.athleteLast}`.trim();
  const handle = `${p.sport}${p.position ? ' · ' + p.position : ''}`;
  const isMe = viewerId === p.id;

  const contentMedia: Tile[] = [
    ...p.deliveredPhotos.map((uri) => ({ uri, kind: 'photo' as const })),
    ...p.ownPhotos.map((m) => ({ uri: mediaUri(m), kind: 'photo' as const })),
    ...p.ownClips.map((m) => ({ uri: mediaUri(m), kind: 'video' as const })),
  ].filter((t) => t.uri);

  const highlightMedia: Tile[] = data.posts
    .filter((po) => po.type === 'video' && po.mediaData)
    .map((po) => ({ uri: po.mediaData, kind: 'video' as const }));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.topbarTitle} numberOfLines={1}>{name || 'PLAYER'}</Text>
          {isMe ? (
            <View style={styles.iconBtn} />
          ) : (
            <Pressable onPress={onBlock} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <Cover />

        <View style={styles.section}>
          <LinearGradient
            colors={gradient.colors}
            locations={gradient.locations}
            start={gradient.start}
            end={gradient.end}
            style={styles.avatarWrap}
          >
            <View style={styles.avatarInner}>
              {p.profilePhoto ? (
                <Image source={{ uri: p.profilePhoto }} style={styles.avatarImg} />
              ) : (
                <GradientText style={styles.jersey}>{`#${p.jersey || '—'}`}</GradientText>
              )}
            </View>
          </LinearGradient>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{name || 'Player Name'}</Text>
            <View style={styles.hype}>
              <HypeStar size={19} color="#a855f7" style={styles.hypeGlow} />
              <Text style={styles.hypeNum}>{formatHype(data.totalHype)}</Text>
            </View>
          </View>
          <Text style={styles.handle}>{handle}</Text>

          {p.school ? (
            <View style={styles.schoolLine}>
              <Ionicons name="school-outline" size={15} color={colors.muted} />
              <Text style={styles.schoolText}>{p.school}</Text>
            </View>
          ) : null}

          {/* Viewing your own profile from a link — no self-follow, no self-DM. */}
          {isMe ? null : (
            <View style={styles.actions}>
              <Pressable
                style={[styles.btnPrimary, following && styles.btnFollowing]}
                onPress={onToggleFollow}
              >
                <Ionicons
                  name={following ? 'checkmark' : 'add'}
                  size={16}
                  color={following ? 'rgba(255,255,255,0.75)' : '#fff'}
                />
                <Text style={[styles.btnPrimaryText, following && styles.btnFollowingText]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>

              {coach ? (
                <>
                  <Pressable style={styles.btnOutline} onPress={() => setComposing(true)}>
                    <Ionicons name="chatbubble-outline" size={15} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.btnOutlineText}>Message</Text>
                  </Pressable>
                  <Pressable style={styles.btnIcon} onPress={onToggleSave}>
                    <Ionicons
                      name={saved ? 'bookmark' : 'bookmark-outline'}
                      size={18}
                      color={saved ? colors.blue : 'rgba(255,255,255,0.75)'}
                    />
                  </Pressable>
                </>
              ) : null}
            </View>
          )}

          <View style={styles.statsRow}>
            <Stat num={contentMedia.length} label="Posts" />
            <Stat num={data.followers} label="Followers" />
            <Stat num={data.following} label="Following" />
            <Stat num={p.gradYear || '—'} label="Class" />
            {p.clubTeam ? <Stat num={p.clubTeam} label="Club" /> : null}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, active && styles.tabActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.tabContent}>
          {tab === 'content' &&
            (contentMedia.length ? (
              <MediaGrid tiles={contentMedia} onPressItem={(i) => setMedia(contentMedia[i])} />
            ) : (
              <EmptyState label="No content yet" />
            ))}
          {tab === 'highlights' &&
            (highlightMedia.length ? (
              <MediaGrid
                tiles={highlightMedia}
                onPressItem={(i) => setMedia(highlightMedia[i])}
                autoplayVideos
                videosActive={focused}
              />
            ) : (
              <EmptyState label="No highlights yet" />
            ))}
          {tab === 'info' && <InfoTab player={p} />}
          {tab === 'stats' && <StatsTab player={p} />}
        </View>
      </ScrollView>

      {/* canDelete is deliberately absent — you can never delete someone else's media. */}
      <MediaViewer item={media} onClose={() => setMedia(null)} />

      <ComposeMessage
        visible={composing}
        toName={name || 'Player'}
        onClose={() => setComposing(false)}
        onSend={onSend}
      />
    </View>
  );
}

function InfoTab({ player }: { player: Player }) {
  const rows: [string, string][] = [
    ['Sport', player.sport],
    ['Position', player.position],
    ['Class Of', player.gradYear],
    ['School', player.school],
    ['Club Team', player.clubTeam],
    ['Height', player.height],
    ['Weight', player.weight],
    ['Jersey', player.jersey ? `#${player.jersey}` : ''],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <View>
      {player.bio ? <Text style={styles.bio}>{player.bio}</Text> : null}
      {rows.length === 0 && !player.bio ? (
        <EmptyState label="No info added yet" />
      ) : (
        <View style={styles.infoCard}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.infoRow, i < rows.length - 1 && styles.infoRowBorder]}>
              <Text style={styles.infoKey}>{k}</Text>
              <Text style={styles.infoVal}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatsTab({ player }: { player: Player }) {
  if (!player.stats || !player.stats.length) return <EmptyState label="No stats added yet" />;
  return (
    <View style={styles.infoCard}>
      {player.stats.map((s, i) => (
        <View key={i} style={[styles.infoRow, i < player.stats.length - 1 && styles.infoRowBorder]}>
          <Text style={styles.infoKey}>{s.label}</Text>
          <Text style={styles.infoVal}>{s.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.muted, fontSize: 15, textAlign: 'center', marginBottom: 18 },
  backPill: {
    paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  backPillText: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, fontWeight: '700' },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.bg,
  },
  topbarTitle: {
    flex: 1, textAlign: 'center', marginHorizontal: 8,
    fontFamily: fonts.condBold, fontSize: 14, letterSpacing: 2, color: colors.muted, textTransform: 'uppercase',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16 },
  avatarWrap: {
    width: 110, height: 110, borderRadius: 55, padding: 3,
    backgroundColor: colors.blue, marginTop: -55, marginBottom: 16,
  },
  avatarInner: {
    flex: 1, borderRadius: 55, backgroundColor: '#1a1a1a',
    borderWidth: 3, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 55 },
  jersey: { fontFamily: fonts.display, fontSize: 34, color: colors.white, lineHeight: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  name: { fontFamily: fonts.display, fontSize: 34, letterSpacing: 1, textTransform: 'uppercase', color: colors.white },
  hype: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hypeGlow: { shadowColor: '#a855f7', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  hypeNum: { fontSize: 16, fontWeight: '800', color: colors.white },
  handle: { fontSize: 15, fontWeight: '700', color: colors.white, marginTop: 6, marginBottom: 14 },
  schoolLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 16 },
  schoolText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 20, alignItems: 'center' },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 22, borderRadius: 10, backgroundColor: colors.blue,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnFollowing: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnFollowingText: { color: 'rgba(255,255,255,0.75)' },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnOutlineText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  btnIcon: {
    width: 40, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  statsRow: {
    flexDirection: 'row', gap: 28, paddingVertical: 20, flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tabBar: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tab: { paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.blue },
  tabText: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  tabTextActive: { color: colors.white },
  tabContent: { padding: 16 },
  bio: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 22, marginBottom: 18 },
  infoCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  infoKey: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  infoVal: { fontSize: 14, color: colors.white, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
