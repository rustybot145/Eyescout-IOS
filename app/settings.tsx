import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Image, Switch, ActivityIndicator,
} from 'react-native';
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
import { GRAD_YEARS } from '../src/theme/options';
import { fetchSettings, updateProfile, SettingsProfile } from '../src/data/settings';
import { getCurrentUserId } from '../src/data/user';
import { pickMedia } from '../src/lib/pickImage';
import { uploadToBucket } from '../src/data/media';
import { toast, confirm } from '../src/components/Overlays';
import { openTerms, openPrivacy, openSupport } from '../src/lib/legal';
import { getSubscription } from '../src/data/subscription';
import { supabase } from '../src/lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [p, setP] = useState<SettingsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserId();
      setUid(id);
      if (id) setP(await fetchSettings(id));
      setLoading(false);
    })();
  }, []);

  function set<K extends keyof SettingsProfile>(key: K, val: SettingsProfile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: val } : prev));
  }
  function setPref(key: string, val: boolean) {
    setP((prev) => (prev ? { ...prev, prefs: { ...prev.prefs, [key]: val } } : prev));
  }

  async function changePhoto() {
    if (!uid) return;
    try {
      const picked = await pickMedia({ videos: false, multiple: false });
      if (!picked.length) return;
      setPhotoBusy(true);
      const url = await uploadToBucket('avatars', uid, picked[0].uri, picked[0].mime);
      const { error } = await updateProfile(uid, { profile_photo: url });
      if (error) throw new Error(error.message);
      set('profilePhoto', url);
      toast('Profile photo updated');
    } catch (err: any) {
      toast(err?.message || 'Upload failed', 'err');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (!uid || !p) return;
    setSaving(true);
    // snake_case columns — same shape the web Settings page writes.
    const patch = {
      athlete_first: p.first || null,
      athlete_last: p.last || null,
      school: p.school || null,
      // sport is admin-controlled — never written from the app
      jersey: p.jersey || null,
      grad_year: p.gradYear || null,
      position: p.position || null,
      club_team: p.clubTeam || null,
      height: p.height || null,
      weight: p.weight || null,
      bio: p.bio || null,
      prefs: p.prefs || {},
    };
    const { error } = await updateProfile(uid, patch);
    setSaving(false);
    if (error) toast(error.message || 'Could not save', 'err');
    else toast('Your profile has been updated');
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function confirmDelete() {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'This permanently deletes your profile, posts, photos, and messages. This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    // Real deletion runs server-side (service role) — see supabase/functions/delete-user.
    const { error } = await supabase.functions.invoke('delete-user');
    if (error) {
      toast('Could not delete your account. Please try again or contact support.', 'err');
      return;
    }
    toast('Your account has been deleted');
    setTimeout(signOut, 900);
  }

  if (loading || !p) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  const initial = (p.first || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }} showsVerticalScrollIndicator={false}>
        {/* EyeScout Sports Pro */}
        <ProRow uid={uid} />

        {/* Profile Photo */}
        <Section title="Profile Photo">
          <View style={styles.photoRow}>
            <LinearGradient
              colors={gradient.colors}
              locations={gradient.locations}
              start={gradient.start}
              end={gradient.end}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                {p.profilePhoto ? (
                  <Image source={{ uri: p.profilePhoto }} style={styles.avatarImg} />
                ) : (
                  <GradientText style={styles.avatarInitial}>{initial}</GradientText>
                )}
              </View>
            </LinearGradient>
            <Pressable style={styles.photoBtn} onPress={changePhoto} disabled={photoBusy}>
              {photoBusy ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              ) : (
                <Ionicons name="camera-outline" size={16} color="rgba(255,255,255,0.8)" />
              )}
              <Text style={styles.photoBtnText}>{photoBusy ? 'Uploading…' : 'Change Photo'}</Text>
            </Pressable>
          </View>
        </Section>

        {/* Personal Info */}
        <Section title="Personal Info">
          <Field label="First Name">
            <TextField value={p.first} onChangeText={(v) => set('first', v)} placeholder="First name" />
          </Field>
          <Field label="Last Name">
            <TextField value={p.last} onChangeText={(v) => set('last', v)} placeholder="Last name" />
          </Field>
          <Field label="School">
            <TextField value={p.school} onChangeText={(v) => set('school', v)} placeholder="School" />
          </Field>
        </Section>

        {/* Athlete Info — Sport is admin-controlled; not editable here. */}
        <Section title="Athlete Info">
          <View style={styles.grid2}>
            <View style={styles.gridCol}>
              <Field label="Jersey #">
                <TextField value={p.jersey} onChangeText={(v) => set('jersey', v)} placeholder="00" keyboardType="number-pad" />
              </Field>
            </View>
            <View style={styles.gridCol}>
              <Field label="Class Of">
                <Select value={p.gradYear} placeholder="Year" options={GRAD_YEARS} onChange={(v) => set('gradYear', v)} />
              </Field>
            </View>
          </View>
          <Field label="Position">
            <TextField value={p.position} onChangeText={(v) => set('position', v)} placeholder="e.g. Point Guard" />
          </Field>
          <Field label="Club Team">
            <TextField value={p.clubTeam} onChangeText={(v) => set('clubTeam', v)} placeholder="Club / travel team" />
          </Field>
          <View style={styles.grid2}>
            <View style={styles.gridCol}>
              <Field label="Height">
                <TextField value={p.height} onChangeText={(v) => set('height', v)} placeholder={`e.g. 6'1"`} />
              </Field>
            </View>
            <View style={styles.gridCol}>
              <Field label="Weight">
                <TextField value={p.weight} onChangeText={(v) => set('weight', v)} placeholder="e.g. 185 lb" />
              </Field>
            </View>
          </View>
        </Section>

        {/* Bio */}
        <Section title="Bio">
          <TextField
            value={p.bio}
            onChangeText={(v) => set('bio', v)}
            placeholder="Tell coaches about yourself…"
            multiline
            style={styles.bio}
          />
        </Section>

        {/* Notifications — removed for the store release. These three switches
            wrote prefs that nothing ever read: expo-notifications is not
            installed, so no push is ever sent. Shipping toggles that silently do
            nothing invites a "broken functionality" rejection on both stores.
            Restore this Section once push is actually wired up. */}

        {/* Privacy */}
        <Section title="Privacy">
          <ToggleRow
            label="Show my contact info to coaches"
            value={p.prefs['priv-contact'] === true || p.prefs['priv-contact'] === 'true'}
            onValueChange={(v) => setPref('priv-contact', v)}
            last
          />
        </Section>

        <View style={{ height: 8 }} />
        <GradientButton label={saving ? 'Saving…' : 'Save Changes'} onPress={save} loading={saving} />

        {/* Account */}
        <Section title="Account" style={{ marginTop: 32 }}>
          <Pressable style={styles.accountRow} onPress={signOut}>
            <Ionicons name="log-out-outline" size={19} color={colors.muted} />
            <Text style={styles.accountText}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={17} color={colors.faint} style={{ marginLeft: 'auto' }} />
          </Pressable>
          <Pressable style={styles.accountRow} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={19} color="#ff6b6b" />
            <Text style={[styles.accountText, { color: '#ff6b6b' }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={17} color="rgba(255,107,107,0.5)" style={{ marginLeft: 'auto' }} />
          </Pressable>
        </Section>

        {/* App Review expects the EULA and privacy policy reachable from the app
            itself, not only from the paywall — Guideline 1.2 for user-generated
            content, and 5.1.1 for privacy. Support is here so reviewers (and
            users) always have a contact route. */}
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

// EyeScout Sports Pro status + upgrade entry point.
function ProRow({ uid }: { uid: string | null }) {
  const router = useRouter();
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      if (!uid) return;
      const sub = await getSubscription(uid);
      setActive(sub.status === 'active' || sub.status === 'cancelled');
    })();
  }, [uid]);

  return (
    <Pressable
      style={proStyles.wrap}
      onPress={active ? undefined : () => router.push({ pathname: '/paywall', params: { role: 'player' } })}
      disabled={!!active}
    >
      <View style={proStyles.badge}>
        <Ionicons name="star" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={proStyles.title}>EyeScout Sports Pro</Text>
        <Text style={proStyles.sub}>{active ? 'Your subscription is active' : 'Unlock everything'}</Text>
      </View>
      {active ? (
        <View style={proStyles.activePill}>
          <Text style={proStyles.activeText}>ACTIVE</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.blue} />
      )}
    </Pressable>
  );
}

const proStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, marginBottom: 16, borderRadius: 16,
    backgroundColor: 'rgba(30,144,255,0.06)', borderWidth: 1, borderColor: 'rgba(30,144,255,0.25)',
  },
  badge: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(30,144,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  sub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  activePill: { backgroundColor: 'rgba(57,211,83,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { color: '#39D353', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

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

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.toggleRowBorder]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.14)', true: 'rgba(30,144,255,0.6)' }}
        thumbColor={value ? colors.blue : '#f4f4f4'}
        ios_backgroundColor="rgba(255,255,255,0.14)"
      />
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
    color: colors.muted, marginBottom: 16, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarRing: { width: 72, height: 72, borderRadius: 36, padding: 2.5 },
  avatarInner: {
    flex: 1, borderRadius: 36, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 36 },
  avatarInitial: { fontFamily: fonts.display, fontSize: 28, color: colors.white, lineHeight: 34 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  photoBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  grid2: { flexDirection: 'row', gap: 12 },
  gridCol: { flex: 1 },
  bio: { minHeight: 96, textAlignVertical: 'top', paddingTop: 13 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13,
  },
  toggleRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  toggleLabel: { color: colors.white, fontSize: 14, flex: 1, marginRight: 12 },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  accountText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
