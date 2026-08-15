import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { GradientText } from '../src/components/GradientText';
import { GradientButton } from '../src/components/GradientButton';
import { TextField, FieldLabel } from '../src/components/fields';
import { Select } from '../src/components/Select';
import { COACH_SPORTS, DIVISIONS, TITLES } from '../src/theme/options';
import { Coach, getCurrentCoach, updateCoachProfile } from '../src/data/coach';
import { pickMedia } from '../src/lib/pickImage';
import { uploadToBucket } from '../src/data/media';
import { toast } from '../src/components/Overlays';
import { deleteAccountFlow } from '../src/lib/account';
import { openTerms, openPrivacy, openSupport } from '../src/lib/legal';
import { supabase } from '../src/lib/supabase';
import { signOutEverywhere } from '../src/lib/auth';

export default function CoachSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [c, setC] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setC(await getCurrentCoach());
      setLoading(false);
    })();
  }, []);

  function set<K extends keyof Coach>(key: K, val: Coach[K]) {
    setC((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  async function changeImage(kind: 'avatar' | 'banner') {
    if (!c) return;
    const setBusy = kind === 'avatar' ? setPhotoBusy : setBannerBusy;
    try {
      const picked = await pickMedia({ videos: false, multiple: false });
      if (!picked.length) return;
      setBusy(true);
      const bucket = kind === 'avatar' ? 'avatars' : 'banners';
      const url = await uploadToBucket(bucket, c.id, picked[0].uri, picked[0].mime);
      const col = kind === 'avatar' ? 'profile_photo' : 'banner_photo';
      const { error } = await updateCoachProfile(c.id, { [col]: url });
      if (error) throw new Error(error.message);
      if (kind === 'avatar') set('profilePhoto', url);
      else set('bannerPhoto', url);
    } catch (err: any) {
      toast(err?.message || 'Upload failed', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!c) return;
    setSaving(true);
    const patch = {
      athlete_first: c.firstName || null,
      athlete_last: c.lastName || null,
      title: c.title || null,
      sport: c.sport || null,
      school: c.school || null,
      division: c.division || null,
      bio: c.bio || null,
    };
    const { error } = await updateCoachProfile(c.id, patch);
    setSaving(false);
    if (error) toast(error.message || 'Could not save', 'err');
    else toast('Your profile has been updated');
  }

  async function signOut() {
    await signOutEverywhere();
    router.replace('/');
  }

  async function confirmDelete() {
    if (await deleteAccountFlow()) setTimeout(signOut, 900);
  }

  if (loading || !c) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  const initial = (c.firstName || 'C').charAt(0).toUpperCase();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        {/* Photos */}
        <Section title="Profile & Banner">
          <View style={styles.photoRow}>
            <LinearGradient colors={gradient.colors} locations={gradient.locations} start={gradient.start} end={gradient.end} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                {c.profilePhoto ? (
                  <Image source={{ uri: c.profilePhoto }} style={styles.avatarImg} />
                ) : (
                  <GradientText style={styles.avatarInitial}>{initial}</GradientText>
                )}
              </View>
            </LinearGradient>
            <View style={{ gap: 8 }}>
              <Pressable style={styles.photoBtn} onPress={() => changeImage('avatar')} disabled={photoBusy}>
                {photoBusy ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" /> : <Ionicons name="camera-outline" size={16} color="rgba(255,255,255,0.8)" />}
                <Text style={styles.photoBtnText}>{photoBusy ? 'Uploading…' : 'Change Photo'}</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => changeImage('banner')} disabled={bannerBusy}>
                {bannerBusy ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" /> : <Ionicons name="image-outline" size={16} color="rgba(255,255,255,0.8)" />}
                <Text style={styles.photoBtnText}>{bannerBusy ? 'Uploading…' : 'Change Banner'}</Text>
              </Pressable>
            </View>
          </View>
        </Section>

        {/* Coach info */}
        <Section title="Coach Info">
          <Field label="First Name">
            <TextField value={c.firstName} onChangeText={(v) => set('firstName', v)} placeholder="First name" />
          </Field>
          <Field label="Last Name">
            <TextField value={c.lastName} onChangeText={(v) => set('lastName', v)} placeholder="Last name" />
          </Field>
          <Field label="Title">
            <Select value={c.title} placeholder="Select title" options={TITLES} onChange={(v) => set('title', v)} />
          </Field>
          <Field label="Sport">
            <Select value={c.sport} placeholder="Select sport" options={COACH_SPORTS} onChange={(v) => set('sport', v)} />
          </Field>
          <Field label="Division">
            <Select value={c.division} placeholder="Select division" options={DIVISIONS} onChange={(v) => set('division', v)} />
          </Field>
          <Field label="School / University">
            <TextField value={c.school} onChangeText={(v) => set('school', v)} placeholder="e.g. Arizona State University" />
          </Field>
        </Section>

        {/* Bio */}
        <Section title="About">
          <TextField value={c.bio} onChangeText={(v) => set('bio', v)} placeholder="Tell athletes about your program…" multiline style={styles.bio} />
        </Section>

        <View style={{ height: 8 }} />
        <GradientButton label={saving ? 'Saving…' : 'Save Changes'} onPress={save} loading={saving} />

        <Section title="Account" style={{ marginTop: 32 }}>
          <Pressable style={styles.accountRow} onPress={signOut}>
            <Ionicons name="log-out-outline" size={19} color={colors.muted} />
            <Text style={styles.accountText}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={17} color={colors.faint} style={{ marginLeft: 'auto' }} />
          </Pressable>
          {/* Guideline 5.1.1(v) applies to every account type, not just players —
              a coach must be able to delete their account from inside the app. */}
          <Pressable style={styles.accountRow} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={19} color="#ff6b6b" />
            <Text style={[styles.accountText, { color: '#ff6b6b' }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={17} color="rgba(255,107,107,0.5)" style={{ marginLeft: 'auto' }} />
          </Pressable>
        </Section>

        {/* Same legal/support routes the player settings screen exposes. */}
        <Section title="About" style={{ marginTop: 32 }}>
          <Pressable style={styles.accountRow} onPress={openTerms}>
            <Ionicons name="document-text-outline" size={19} color={colors.muted} />
            <Text style={styles.accountText}>Terms of Use</Text>
            <Ionicons name="open-outline" size={16} color={colors.faint} style={{ marginLeft: 'auto' }} />
          </Pressable>
          <Pressable style={styles.accountRow} onPress={openPrivacy}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.muted} />
            <Text style={styles.accountText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color={colors.faint} style={{ marginLeft: 'auto' }} />
          </Pressable>
          <Pressable style={styles.accountRow} onPress={openSupport}>
            <Ionicons name="help-circle-outline" size={19} color={colors.muted} />
            <Text style={styles.accountText}>Help &amp; Support</Text>
            <Ionicons name="open-outline" size={16} color={colors.faint} style={{ marginLeft: 'auto' }} />
          </Pressable>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
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
  section: {
    backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: colors.hairline,
    borderRadius: 16, padding: 16, marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.condBold, fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase',
    color: colors.muted, marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarRing: { width: 72, height: 72, borderRadius: 36, padding: 2.5 },
  avatarInner: { flex: 1, borderRadius: 36, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%', borderRadius: 36 },
  avatarInitial: { fontFamily: fonts.display, fontSize: 28, color: colors.white, lineHeight: 34 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  photoBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  bio: { minHeight: 96, textAlignVertical: 'top', paddingTop: 13 },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  accountText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
