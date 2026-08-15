import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { GradientText } from '../../src/components/GradientText';
import { HypeStar } from '../../src/components/HypeStar';
import { Cover, Stat, EmptyState, MediaGrid } from '../../src/components/ProfilePieces';
import { MediaViewer } from '../../src/components/MediaViewer';
import { fetchMyProfile, formatHype, ProfileData, Player } from '../../src/data/profile';
import { pickMedia } from '../../src/lib/pickImage';
import {
  uploadToBucket, addOwnMedia, deleteDeliveredPhoto, deleteOwnMedia, deletePostById,
} from '../../src/data/media';
import { toast } from '../../src/components/Overlays';
import { useProAccess } from '../../src/lib/useProAccess';
import { hapticSuccess, hapticError } from '../../src/lib/haptics';
import { supabase } from '../../src/lib/supabase';
import { signOutEverywhere } from '../../src/lib/auth';

// A grid item plus where it lives, so the owner can delete the right thing.
type MediaSource =
  | { type: 'delivered'; url: string }
  | { type: 'own'; mediaKind: 'photo' | 'video'; url: string }
  | { type: 'post'; postId: string };
type ProfileMedia = { uri: string; kind: 'photo' | 'video'; source: MediaSource };

type TabKey = 'content' | 'posted' | 'highlights' | 'info' | 'stats';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'content', label: 'Content' },
  { key: 'posted', label: 'Posted' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'info', label: 'Info' },
  { key: 'stats', label: 'Stats' },
];

const mediaUri = (m: { url?: string; dataUrl?: string }) => m.url || m.dataUrl || '';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasPro } = useProAccess();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<TabKey>('content');
  const [viewer, setViewer] = useState<ProfileMedia | null>(null);
  const [focused, setFocused] = useState(true);

  const load = useCallback(async () => {
    const res = await fetchMyProfile();
    if (!res) {
      router.replace('/');
      return;
    }
    setData(res);
  }, [router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Pull fresh admin-controlled data whenever the profile tab regains focus, and
  // track focus so inline Highlights videos pause when you leave the tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      load();
      return () => setFocused(false);
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function signOut() {
    await signOutEverywhere();
    router.replace('/');
  }

  // Add Photos — pick from library, upload to the SAME Supabase `posts` bucket the
  // web + admin use, then append to own_photos/own_clips (shows in Content).
  //
  // Pro-only. Free players still get everything the ADMIN delivers to them
  // (delivered_photos from a shoot) — this gates uploading your OWN media, which
  // is the paid perk. `hasPro === null` means the check is still in flight, so we
  // send them to the paywall rather than opening a picker whose upload may fail.
  async function addPhotos() {
    if (!data) return;
    if (!hasPro) {
      router.push({ pathname: '/paywall', params: { role: 'player' } });
      return;
    }
    try {
      const picked = await pickMedia({ videos: true, multiple: true });
      if (!picked.length) return;
      setUploading(true);
      const uploaded: { url: string; kind: 'photo' | 'video' }[] = [];
      for (const item of picked) {
        const url = await uploadToBucket('posts', data.player.id, item.uri, item.mime);
        uploaded.push({ url, kind: item.kind });
      }
      await addOwnMedia(data.player.id, uploaded);
      await load();
      hapticSuccess();
      toast(`Added ${uploaded.length} ${uploaded.length === 1 ? 'item' : 'items'} to your content`);
    } catch (err: any) {
      hapticError();
      toast(err?.message || 'Upload failed', 'err');
    } finally {
      setUploading(false);
    }
  }

  // Delete the item currently open in the viewer (owner only). Routes to the
  // right store: delivered_photos / own_photos / own_clips / posts.
  async function deleteViewerItem() {
    if (!viewer || !data) return;
    const uid = data.player.id;
    const src = viewer.source;
    const res =
      src.type === 'delivered'
        ? await deleteDeliveredPhoto(uid, src.url)
        : src.type === 'own'
        ? await deleteOwnMedia(uid, src.mediaKind, src.url)
        : await deletePostById(src.postId);
    if (res.error) {
      toast('Could not delete', 'err');
      return;
    }
    setViewer(null);
    await load();
    toast('Deleted');
  }

  if (loading || !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  const p = data.player;
  const name = `${p.athleteFirst} ${p.athleteLast}`.trim();
  const handle = `${p.sport}${p.position ? ' · ' + p.position : ''}`;

  const contentMedia: ProfileMedia[] = [
    ...p.deliveredPhotos.map((uri) => ({ uri, kind: 'photo' as const, source: { type: 'delivered' as const, url: uri } })),
    ...p.ownPhotos.map((m) => {
      const uri = mediaUri(m);
      return { uri, kind: 'photo' as const, source: { type: 'own' as const, mediaKind: 'photo' as const, url: uri } };
    }),
    ...p.ownClips.map((m) => {
      const uri = mediaUri(m);
      return { uri, kind: 'video' as const, source: { type: 'own' as const, mediaKind: 'video' as const, url: uri } };
    }),
  ].filter((t) => t.uri);

  const postedMedia: ProfileMedia[] = data.posts
    .filter((po) => (po.type === 'photo' || po.type === 'video') && po.mediaData)
    .map((po) => ({ uri: po.mediaData, kind: po.type, source: { type: 'post' as const, postId: po.id } }));

  const highlightMedia: ProfileMedia[] = data.posts
    .filter((po) => po.type === 'video' && po.mediaData)
    .map((po) => ({ uri: po.mediaData, kind: 'video' as const, source: { type: 'post' as const, postId: po.id } }));

  const postCount = contentMedia.length;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* top row: title + settings gear */}
        <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.topbarTitle}>MY PROFILE</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.gear}>
            <Ionicons name="settings-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <Cover />

        <View style={styles.section}>
          {/* Avatar */}
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

          {/* Name + hype + handle */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name || 'Player Name'}</Text>
            <View style={styles.hype}>
              <HypeStar size={19} color="#a855f7" style={styles.hypeGlow} />
              <Text style={styles.hypeNum}>{formatHype(data.totalHype)}</Text>
            </View>
          </View>
          <Text style={styles.handle}>{handle}</Text>

          {/* School — shown right under the handle, above the action buttons */}
          {p.school ? (
            <View style={styles.schoolLine}>
              <Ionicons name="school-outline" size={15} color={colors.muted} />
              <Text style={styles.schoolText}>{p.school}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.btnOutline} onPress={() => router.push('/settings')}>
              <Ionicons name="create-outline" size={15} color="rgba(255,255,255,0.75)" />
              <Text style={styles.btnOutlineText}>Edit Profile</Text>
            </Pressable>
            <Pressable style={styles.btnOutline} onPress={addPhotos} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.75)" />
              ) : (
                <Ionicons
                  name={hasPro ? 'add' : 'lock-closed'}
                  size={hasPro ? 17 : 14}
                  color="rgba(255,255,255,0.75)"
                />
              )}
              <Text style={styles.btnOutlineText}>{uploading ? 'Uploading…' : 'Add Photos'}</Text>
            </Pressable>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <Stat num={postCount} label="Posts" />
            <Stat num={data.followers} label="Followers" />
            <Stat num={data.following} label="Following" />
            <Stat num={p.gradYear || '—'} label="Class" />
            {p.clubTeam ? <Stat num={p.clubTeam} label="Club" /> : null}
          </View>
        </View>

        {/* Tab bar */}
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

        {/* Tab content */}
        <View style={styles.tabContent}>
          {tab === 'content' &&
            (contentMedia.length ? (
              <MediaGrid tiles={contentMedia} onPressItem={(i) => setViewer(contentMedia[i])} />
            ) : (
              <EmptyState
                label={
                  hasPro
                    ? 'No content yet — tap Add Photos to upload.'
                    : 'No content yet. Go Pro to upload your own photos and clips.'
                }
              />
            ))}
          {tab === 'posted' &&
            (postedMedia.length ? (
              <MediaGrid
                tiles={postedMedia}
                onPressItem={(i) => setViewer(postedMedia[i])}
                autoplayVideos
                videosActive={focused}
              />
            ) : (
              <EmptyState label="No posted content yet" />
            ))}
          {tab === 'highlights' &&
            (highlightMedia.length ? (
              <MediaGrid
                tiles={highlightMedia}
                onPressItem={(i) => setViewer(highlightMedia[i])}
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

      {/* Fullscreen viewer — expands a tapped photo/video; owner can delete via ··· */}
      <MediaViewer
        item={viewer ? { uri: viewer.uri, kind: viewer.kind } : null}
        canDelete
        onClose={() => setViewer(null)}
        onDelete={deleteViewerItem}
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
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg,
  },
  topbarTitle: { fontFamily: fonts.condBold, fontSize: 14, letterSpacing: 2, color: colors.muted },
  gear: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  section: { paddingHorizontal: 16 },
  avatarWrap: {
    width: 110, height: 110, borderRadius: 55, padding: 3,
    backgroundColor: colors.blue,
    marginTop: -55, marginBottom: 16,
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
  hypeGlow: {
    shadowColor: '#a855f7', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  hypeNum: { fontSize: 16, fontWeight: '800', color: colors.white },
  handle: { fontSize: 15, fontWeight: '700', color: colors.white, marginTop: 6, marginBottom: 14 },
  schoolLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 16 },
  schoolText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnOutlineText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
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
