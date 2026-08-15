import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator, AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../src/theme/colors';
import { fonts } from '../src/theme/fonts';
import { GradientText } from '../src/components/GradientText';
import { GradientButton } from '../src/components/GradientButton';
import { TextField, FieldLabel, ToggleRow } from '../src/components/fields';
import { Select } from '../src/components/Select';
import { GRAD_YEARS } from '../src/theme/options';
import { fetchSettings, updateProfile, SettingsProfile } from '../src/data/settings';
import { getCurrentUserId } from '../src/data/user';
import { pickMedia } from '../src/lib/pickImage';
import { uploadToBucket } from '../src/data/media';
import { toast } from '../src/components/Overlays';
import { hapticSuccess, hapticError } from '../src/lib/haptics';
import { deleteAccountFlow } from '../src/lib/account';
import { openTerms, openPrivacy, openSupport } from '../src/lib/legal';
import { isProEntitled, openManageSubscription } from '../src/lib/iap';
import { supabase } from '../src/lib/supabase';
import { signOutEverywhere } from '../src/lib/auth';

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
  // Absent means ON — accounts that predate these toggles have no notif_* key and
  // must keep getting their mail. Only an explicit false switches an email off,
  // which is exactly the test the edge function applies.
  const notifOn = (key: string) => p?.prefs?.[key] !== false;

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
      hapticSuccess();
      toast('Profile photo updated');
    } catch (err: any) {
      hapticError();
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
    if (error) {
      hapticError();
      toast(error.message || 'Could not save', 'err');
    } else {
      hapticSuccess();
      toast('Your profile has been updated');
    }
  }

  async function signOut() {
    await signOutEverywhere();
    router.replace('/');
  }

  async function confirmDelete() {
    if (await deleteAccountFlow()) setTimeout(signOut, 900);
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
        {/* Only renders for a legacy subscriber Apple is still billing. */}
        <LegacySubscriptionRow />

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

        {/* Email Notifications.
            The old push toggles were pulled for the store release because
            expo-notifications isn't installed and nothing read the prefs. These
            are different: each row maps 1:1 onto a type the notify-email edge
            function actually sends (message | coach_follow | admin_message), it
            reads profiles.prefs, and the same keys back the web Settings page.
            Still no push — the labels say email so nothing here overpromises. */}
        <Section title="Email Notifications">
          <ToggleRow
            label="New messages"
            value={notifOn('notif_message')}
            onValueChange={(v) => setPref('notif_message', v)}
          />
          <ToggleRow
            label="When a coach follows you"
            value={notifOn('notif_coach_follow')}
            onValueChange={(v) => setPref('notif_coach_follow', v)}
          />
          <ToggleRow
            label="Messages from EyeScout"
            value={notifOn('notif_admin_message')}
            onValueChange={(v) => setPref('notif_admin_message', v)}
            last
          />
        </Section>

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
            itself — Guideline 1.2 for user-generated content, and 5.1.1 for
            privacy. These used to also be linked from the paywall, which is gone,
            so this screen is now the only route to them. Support is here so
            reviewers (and users) always have a contact route. */}
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

// Shown ONLY to someone Apple is still billing for the old Pro subscription.
//
// EyeScout is free, but removing a product from sale never cancels an existing
// subscriber — Apple keeps charging until THEY cancel. Saying nothing would mean
// quietly taking money for something everyone else now gets free, so anyone with
// a live entitlement gets told, and gets a one-tap route to Apple's cancel page.
//
// Everyone else — which is almost everyone — sees nothing at all here.
//
// The store, not our database, is the source of truth for this: the DB row can
// be stale or missing, while `isProEntitled()` reflects what Apple is actually
// still charging for.
function LegacySubscriptionRow() {
  const [stillSubscribed, setStillSubscribed] = useState(false);

  const load = useCallback(async () => {
    setStillSubscribed(await isProEntitled());
  }, []);

  useEffect(() => {
    load();
    // Cancelling happens in the App Store app, not here, so nothing in this
    // screen's lifecycle tells us it happened. Re-reading whenever the app comes
    // back to the foreground is what makes the row disappear on its own.
    const s = AppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    return () => s.remove();
  }, [load]);

  if (!stillSubscribed) return null;

  return (
    <>
      <View style={[proStyles.wrap, proStyles.wrapAttached]}>
        <View style={proStyles.badge}>
          <Ionicons name="information-circle-outline" size={22} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={proStyles.title}>You're still subscribed</Text>
          <Text style={proStyles.sub}>
            EyeScout is free for everyone now. Cancel through Apple so you aren't charged again — you keep full access either way.
          </Text>
        </View>
      </View>

      <Pressable
        style={proStyles.manageRow}
        onPress={openManageSubscription}
        accessibilityRole="button"
        accessibilityLabel="Cancel subscription"
        accessibilityHint="Opens your App Store subscription settings"
      >
        <Text style={proStyles.manageText}>Cancel Subscription</Text>
        <Ionicons name="open-outline" size={15} color={colors.muted} />
      </Pressable>
    </>
  );
}

const proStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, marginBottom: 16, borderRadius: 16,
    backgroundColor: 'rgba(30,144,255,0.06)', borderWidth: 1, borderColor: 'rgba(30,144,255,0.25)',
  },
  // Square off the bottom so the cancel row reads as part of the same card.
  wrapAttached: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  manageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, marginBottom: 16,
    borderRadius: 16, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderWidth: 1, borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,144,255,0.25)', borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(30,144,255,0.03)',
  },
  manageText: { color: colors.muted, fontSize: 13.5, fontWeight: '700', letterSpacing: 0.2 },
  badge: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(30,144,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  sub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
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
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  accountText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
