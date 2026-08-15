import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput, Image, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { GradientButton } from '../src/components/GradientButton';
import { GridVideo, ViewerVideo } from '../src/components/video';
import { pickMedia } from '../src/lib/pickImage';
import {
  uploadToBucket, createPost, fetchTournaments, fetchProfileMedia,
  TournamentOption, PickableMedia,
} from '../src/data/media';
import { getCurrentUser, CurrentUser } from '../src/data/user';
import { toast } from '../src/components/Overlays';

const GAP = 8;
const H_PAD = 16;
const COLS = 3;
const TILE = (Dimensions.get('window').width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;

// What the user chose to post: either an existing profile photo (already a public
// URL — no re-upload) or a fresh file picked from the device library (needsUpload).
type Selected = { uri: string; kind: 'photo' | 'video'; needsUpload: boolean; mime?: string };

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [media, setMedia] = useState<PickableMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [caption, setCaption] = useState('');
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [tournament, setTournament] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setMe(user);
      if (user) {
        try {
          setMedia(await fetchProfileMedia(user.id));
        } catch {
          /* leave empty */
        }
      }
      setLoadingMedia(false);
      const t = await fetchTournaments();
      setTournaments(user?.sport ? t.filter((x) => !x.sport || x.sport === user.sport) : t);
    })();
  }, []);

  async function uploadFromLibrary() {
    try {
      const res = await pickMedia({ videos: true, multiple: false });
      if (res.length) setSelected({ uri: res[0].uri, kind: res[0].kind, needsUpload: true, mime: res[0].mime });
    } catch (err: any) {
      toast(err?.message || 'Could not open library', 'err');
    }
  }

  async function publish() {
    if (!me || !selected) return;
    setPosting(true);
    try {
      const url = selected.needsUpload
        ? await uploadToBucket('posts', me.id, selected.uri, selected.mime || 'image/jpeg')
        : selected.uri;
      const { error } = await createPost({
        authorId: me.id,
        authorName: `${me.first} ${me.last}`.trim(),
        authorJersey: me.jersey,
        sport: me.sport,
        type: selected.kind,
        mediaData: url,
        caption: caption.trim(),
        tournament,
      });
      if (error) throw new Error(error.message || 'Could not publish');
      setDone(true);
      setTimeout(() => router.replace('/feed'), 1100);
    } catch (err: any) {
      toast(err?.message || 'Post failed', 'err');
      setPosting(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={styles.doneIcon}>
          <Ionicons name="checkmark" size={34} color="#39D353" />
        </View>
        <Text style={styles.doneTitle}>Posted!</Text>
        <Text style={styles.doneBody}>Your post is now live in the feed.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {selected ? (
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>New Post</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: H_PAD, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {selected ? (
          // ── Step 2: preview + caption + tournament ──
          <>
            <View style={styles.previewWrap}>
              {selected.kind === 'photo' ? (
                <Image source={{ uri: selected.uri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.preview}>
                  <ViewerVideo uri={selected.uri} />
                </View>
              )}
              <Pressable style={styles.changeBtn} onPress={() => setSelected(null)}>
                <Ionicons name="swap-horizontal" size={16} color="#fff" />
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Caption</Text>
            <TextInput
              style={styles.caption}
              value={caption}
              onChangeText={setCaption}
              placeholder="Write something about this…"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={220}
            />

            <Text style={styles.label}>
              Tournament <Text style={styles.optional}>— optional</Text>
            </Text>
            {tournaments.length ? (
              <View style={styles.tournList}>
                {tournaments.map((t) => {
                  const active = tournament === t.name;
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.tournPill, active && styles.tournPillActive]}
                      onPress={() => setTournament(active ? null : t.name)}
                    >
                      <Text style={[styles.tournText, active && styles.tournTextActive]}>{t.name}</Text>
                      {active ? <Ionicons name="checkmark-circle" size={17} color={colors.blue} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noTourn}>No tournaments available right now.</Text>
            )}

            <View style={{ height: 24 }} />
            {posting ? (
              <View style={styles.posting}>
                <ActivityIndicator color={colors.white} />
                <Text style={styles.postingText}>Posting…</Text>
              </View>
            ) : (
              <GradientButton label="Share Post" onPress={publish} />
            )}
          </>
        ) : (
          // ── Step 1: pick a photo from the profile ──
          <>
            <Text style={styles.pickTitle}>Choose a photo</Text>
            <Text style={styles.pickSub}>Pick one of your profile photos to share.</Text>

            {loadingMedia ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.blue} />
              </View>
            ) : media.length ? (
              <View style={styles.grid}>
                {media.map((m) => (
                  <Pressable
                    key={m.uri}
                    style={styles.tile}
                    onPress={() => setSelected({ uri: m.uri, kind: m.kind, needsUpload: false })}
                  >
                    {m.kind === 'photo' ? (
                      <Image source={{ uri: m.uri }} style={styles.tileImg} />
                    ) : (
                      <>
                        <GridVideo uri={m.uri} active />
                        <View style={styles.videoBadge}>
                          <Ionicons name="play" size={11} color="#fff" />
                        </View>
                      </>
                    )}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.noPhotos}>
                <View style={styles.noPhotosIcon}>
                  <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.3)" />
                </View>
                <Text style={styles.noPhotosTitle}>No photos on your profile yet</Text>
                <Text style={styles.noPhotosBody}>
                  Add photos on your profile first, or upload one from your library below.
                </Text>
              </View>
            )}

            <Pressable style={styles.uploadBtn} onPress={uploadFromLibrary}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.blue} />
              <Text style={styles.uploadText}>Upload from library</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.condBold, fontSize: 16, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.white },

  // pick step
  pickTitle: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white, marginBottom: 6 },
  pickSub: { color: colors.muted, fontSize: 14, marginBottom: 22 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { width: TILE, height: TILE, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0d0d0d' },
  tileImg: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  noPhotos: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  noPhotosIcon: {
    width: 60, height: 60, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  noPhotosTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14.5, fontWeight: '700', marginBottom: 6 },
  noPhotosBody: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22,
    paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(30,144,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.25)',
  },
  uploadText: { color: colors.blue, fontSize: 14, fontWeight: '700' },

  // caption step
  previewWrap: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', height: 300, backgroundColor: '#0d0d0d' },
  changeBtn: {
    position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  changeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  label: {
    fontSize: 11.5, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase',
    color: colors.muted, marginBottom: 10,
  },
  optional: { fontWeight: '400', letterSpacing: 0, textTransform: 'none', fontSize: 11 },
  caption: {
    backgroundColor: colors.field, borderWidth: 1, borderColor: colors.fieldBorder, borderRadius: 10,
    padding: 14, color: colors.white, fontSize: 14.5, minHeight: 96, textAlignVertical: 'top', marginBottom: 24,
  },
  tournList: { gap: 8 },
  tournPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 15, paddingVertical: 13, borderRadius: 10,
    backgroundColor: colors.field, borderWidth: 1, borderColor: colors.fieldBorder,
  },
  tournPillActive: { borderColor: 'rgba(30,144,255,0.5)', backgroundColor: 'rgba(30,144,255,0.08)' },
  tournText: { color: colors.white, fontSize: 14 },
  tournTextActive: { fontWeight: '700' },
  noTourn: { color: colors.muted, fontSize: 13 },
  posting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  postingText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  doneIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(57,211,83,0.12)',
    borderWidth: 1, borderColor: 'rgba(57,211,83,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  doneTitle: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white, marginBottom: 8 },
  doneBody: { color: colors.muted, fontSize: 14 },
});
