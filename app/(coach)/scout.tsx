import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, StyleSheet, Pressable, TextInput, Modal, ScrollView,
  RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { Avatar } from '../../src/components/Avatar';
import { Select } from '../../src/components/Select';
import { GradientButton } from '../../src/components/GradientButton';
import { TextField } from '../../src/components/fields';
import { toast } from '../../src/components/Overlays';
import { PaywallScreen } from '../../src/components/Paywall';
import { useProAccess } from '../../src/lib/useProAccess';
import { GRAD_YEARS } from '../../src/theme/options';
import {
  Coach, PlayerCard, getCurrentCoach, fetchPlayers, fetchSavedPlayerIds, toggleSavePlayer,
} from '../../src/data/coach';
import { sendCoachMessage } from '../../src/data/messages';

const { width } = Dimensions.get('window');
const COL_W = (width - 16 * 2 - 12) / 2;

// Height ranges — same buckets as the web coach-feed.
const HEIGHT_OPTIONS = [
  { label: 'All Heights', value: '' },
  { label: `Under 6'0"`, value: 'under6' },
  { label: `6'0" – 6'3"`, value: '6to6-3' },
  { label: `6'4" – 6'7"`, value: '6-4to6-7' },
  { label: `6'8"+`, value: '6-8plus' },
];

// "6'5" / 6-5 / 6ft5 → total inches (ported from the web).
function parseHeightIn(h: string): number | null {
  if (!h) return null;
  const m = h.match(/(\d+)'[\s"]*(\d*)/);
  return m ? parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) || 0) : null;
}
function heightQueryInches(q: string): number | null {
  const m = q.match(/^(\d)\s*(?:'|ft|feet|-|\s)\s*(\d{1,2})?\s*(?:"|in|inches)?$/i);
  if (!m) return null;
  const inch = m[2] ? parseInt(m[2], 10) : 0;
  if (inch > 11) return null;
  return parseInt(m[1], 10) * 12 + inch;
}
function statValue(p: PlayerCard, label: string): number | null {
  const s = (p.stats || []).find((x) => (x.label || '').toLowerCase() === label.toLowerCase());
  if (!s) return null;
  const num = parseFloat(String(s.value).replace(/[^0-9.\-]/g, ''));
  return isNaN(num) ? null : num;
}
function matchesSearch(p: PlayerCard, raw: string): boolean {
  const q = (raw || '').trim().toLowerCase();
  if (!q) return true;
  const qh = heightQueryInches(q); // a height query matches that tall OR taller
  if (qh !== null) {
    const ph = parseHeightIn(p.height);
    return ph !== null && ph >= qh;
  }
  const hay = [
    `${p.first} ${p.last}`, p.school, p.gradYear, p.position, p.sport, p.height,
    p.weight ? `${p.weight} lbs` : '', ...(p.stats || []).flatMap((s) => [s.label, s.value]),
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return hay.some((x) => x.includes(q));
}

export default function ScoutScreen() {
  const insets = useSafeAreaInsets();
  const { hasPro } = useProAccess();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [position, setPosition] = useState('');
  const [height, setHeight] = useState('');
  const [stat, setStat] = useState('');
  const [statMin, setStatMin] = useState('');

  const [detail, setDetail] = useState<PlayerCard | null>(null);
  const [composeFor, setComposeFor] = useState<PlayerCard | null>(null);

  const load = useCallback(async () => {
    const c = coach || (await getCurrentCoach());
    if (c && !coach) setCoach(c);
    if (!c) return;
    const [list, savedIds] = await Promise.all([fetchPlayers(), fetchSavedPlayerIds(c.id)]);
    setPlayers(list);
    setSaved(savedIds);
  }, [coach]);

  // Lock to the coach's own sport (case-insensitive). "Multiple Sports"/blank sees all.
  const sportPlayers = useMemo(() => {
    const s = (coach?.sport || '').toLowerCase();
    if (!s || s === 'multiple sports') return players;
    return players.filter((p) => (p.sport || '').toLowerCase() === s);
  }, [players, coach]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Position + stat dropdowns are populated from the players in this sport.
  const positionOptions = useMemo(() => {
    const set = new Set<string>();
    sportPlayers.forEach((p) => p.position && set.add(p.position));
    return [{ label: 'All Positions', value: '' }, ...[...set].sort().map((v) => ({ label: v, value: v }))];
  }, [sportPlayers]);
  const statOptions = useMemo(() => {
    const set = new Set<string>();
    sportPlayers.forEach((p) => (p.stats || []).forEach((s) => s.label && set.add(s.label)));
    return [{ label: 'All Stats', value: '' }, ...[...set].sort().map((v) => ({ label: v, value: v }))];
  }, [sportPlayers]);

  // Full filter chain — mirrors the web's applyFilters().
  const filtered = useMemo(() => {
    const min = parseFloat(statMin);
    return sportPlayers.filter((p) => {
      if (!matchesSearch(p, query)) return false;
      if (year && p.gradYear !== year) return false;
      if (position && (p.position || '').toUpperCase() !== position.toUpperCase()) return false;
      if (height) {
        const inches = parseHeightIn(p.height);
        if (inches === null) return false;
        if (height === 'under6' && inches >= 72) return false;
        if (height === '6to6-3' && (inches < 72 || inches > 75)) return false;
        if (height === '6-4to6-7' && (inches < 76 || inches > 79)) return false;
        if (height === '6-8plus' && inches < 80) return false;
      }
      if (stat) {
        const v = statValue(p, stat);
        if (v === null) return false;
        if (!isNaN(min) && v < min) return false;
      }
      return true;
    });
  }, [sportPlayers, query, year, position, height, stat, statMin]);

  const onToggleSave = useCallback(
    (p: PlayerCard) => {
      if (!coach) return;
      const nowSaved = !saved.has(p.id);
      setSaved((prev) => {
        const next = new Set(prev);
        if (nowSaved) next.add(p.id);
        else next.delete(p.id);
        return next;
      });
      toggleSavePlayer(coach.id, p.id, nowSaved);
    },
    [coach, saved]
  );

  async function sendMessage(player: PlayerCard, text: string) {
    if (!coach) return;
    const { error } = await sendCoachMessage(coach, player.id, text);
    if (error) toast('Could not send', 'err');
    else toast(`Message sent to ${player.first}`);
    setComposeFor(null);
  }

  // Full-screen states — these cover the search + filters entirely.
  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }
  if (coach && !coach.verified) {
    return (
      <View style={[styles.root, styles.lock]}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={24} color={colors.blue} />
        </View>
        <Text style={styles.lockTitle}>Pending Verification</Text>
        <Text style={styles.lockBody}>
          We'll notify you when your account is verified and you're ready to scout players.
        </Text>
      </View>
    );
  }
  if (hasPro === false) {
    return <PaywallScreen role="coach" uid={coach?.id} title="Scout and search every athlete in your sport with Pro." />;
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SCOUT PLAYERS</Text>
          {coach?.sport && coach.sport !== 'Multiple Sports' ? (
            <Text style={styles.sportLabel}>{coach.sport}</Text>
          ) : null}
        </View>
        <Text style={styles.count}>
          {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Search + filters (coach is locked to their own sport) */}
      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.faint} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, class, school, stat, height…"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <Select value={year} placeholder="All Classes" options={[{ label: 'All Classes', value: '' }, ...GRAD_YEARS]} onChange={setYear} />
          </View>
          <View style={{ flex: 1 }}>
            <Select value={position} placeholder="All Positions" options={positionOptions} onChange={setPosition} />
          </View>
        </View>
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <Select value={height} placeholder="All Heights" options={HEIGHT_OPTIONS} onChange={setHeight} />
          </View>
          <View style={{ flex: 1 }}>
            <Select value={stat} placeholder="All Stats" options={statOptions} onChange={(v) => { setStat(v); if (!v) setStatMin(''); }} />
          </View>
        </View>
        {stat ? (
          <TextField
            value={statMin}
            onChangeText={setStatMin}
            placeholder={`Minimum ${stat}`}
            keyboardType="numeric"
          />
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
        renderItem={({ item }) => (
          <PlayerGridCard player={item} onPress={() => setDetail(item)} onMessage={() => setComposeFor(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No players match your filters.{'\n'}Try adjusting your search or filters.</Text>
          </View>
        }
      />

      {/* Player detail */}
      <PlayerDetail
        player={detail}
        saved={detail ? saved.has(detail.id) : false}
        onClose={() => setDetail(null)}
        onSave={() => detail && onToggleSave(detail)}
        onMessage={() => {
          const p = detail;
          setDetail(null);
          setComposeFor(p);
        }}
      />

      {/* Compose message */}
      <ComposeMessage player={composeFor} onClose={() => setComposeFor(null)} onSend={sendMessage} insets={insets} />
    </View>
  );
}

// Player card copied from the web coach-feed .player-card: dark banner with a
// blue top bar, a blue-ringed avatar overlapping the banner, centered name /
// school / height·weight, "Class of" + position tags, and a blue Message button.
function PlayerGridCard({
  player,
  onPress,
  onMessage,
}: {
  player: PlayerCard;
  onPress: () => void;
  onMessage: () => void;
}) {
  const name = `${player.first} ${player.last}`.trim();
  const initials = `${(player.first || '?')[0] || ''}${(player.last || '')[0] || ''}`.toUpperCase();
  const hw = [player.height, player.weight ? `${player.weight} lbs` : ''].filter(Boolean).join(' · ');

  return (
    <Pressable style={[styles.card, { width: COL_W }]} onPress={onPress}>
      {/* Banner + blue bar */}
      <View style={styles.cardBanner}>
        <View style={styles.cardBannerBar} />
      </View>

      {/* Avatar overlapping the banner */}
      <View style={styles.cardAvatarWrap}>
        <View style={styles.cardAvatarInner}>
          {player.profilePhoto ? (
            <Image source={{ uri: player.profilePhoto }} style={styles.cardAvatarImg} />
          ) : (
            <Text style={styles.cardInitials}>{initials || '?'}</Text>
          )}
        </View>
      </View>

      {/* Body */}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {name || 'Player'}
        </Text>
        {player.school ? (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {player.school}
          </Text>
        ) : null}
        {hw ? (
          <Text style={styles.cardHw} numberOfLines={1}>
            {hw}
          </Text>
        ) : null}
        <View style={styles.cardTags}>
          {player.gradYear ? <Tag text={`Class of ${player.gradYear}`} /> : null}
          {player.position ? <Tag text={player.position} /> : null}
        </View>
        <Pressable style={styles.scoutBtn} onPress={onMessage}>
          <Text style={styles.scoutBtnText}>Message →</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}

function PlayerDetail({
  player,
  saved,
  onClose,
  onSave,
  onMessage,
}: {
  player: PlayerCard | null;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onMessage: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!player) return null;
  const name = `${player.first} ${player.last}`.trim();
  const rows: [string, string][] = [
    ['Sport', player.sport],
    ['Position', player.position],
    ['Class Of', player.gradYear],
    ['School', player.school],
    ['Club Team', player.clubTeam],
    ['Height', player.height],
    ['Weight', player.weight ? `${player.weight}` : ''],
    ['Jersey', player.jersey ? `#${player.jersey}` : ''],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailTop}>
              <Avatar uri={player.profilePhoto} name={name} size={72} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.detailName}>{name || 'Player'}</Text>
                {player.school ? <Text style={styles.detailSchool}>{player.school}</Text> : null}
              </View>
              <Pressable onPress={onSave} hitSlop={8} style={styles.detailSave}>
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? colors.blue : colors.muted} />
              </Pressable>
            </View>

            {player.bio ? <Text style={styles.detailBio}>{player.bio}</Text> : null}

            <View style={styles.infoCard}>
              {rows.map(([k, v], i) => (
                <View key={k} style={[styles.infoRow, i < rows.length - 1 && styles.infoRowBorder]}>
                  <Text style={styles.infoKey}>{k}</Text>
                  <Text style={styles.infoVal}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={{ height: 18 }} />
            <GradientButton label="Send Message" onPress={onMessage} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ComposeMessage({
  player,
  onClose,
  onSend,
  insets,
}: {
  player: PlayerCard | null;
  onClose: () => void;
  onSend: (p: PlayerCard, text: string) => void;
  insets: { bottom: number };
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (player) setText('');
  }, [player]);
  if (!player) return null;
  const name = `${player.first} ${player.last}`.trim();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.compose, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.composeTitle}>Send Message</Text>
          <Text style={styles.composeSub}>To: {name}</Text>
          <TextInput
            style={styles.composeInput}
            value={text}
            onChangeText={setText}
            placeholder="Introduce yourself and let them know why you're interested…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={1000}
            autoFocus
          />
          <GradientButton label="Send" onPress={() => text.trim() && onSend(player, text.trim())} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.5, color: colors.white },
  sportLabel: { color: colors.blue, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, marginTop: 3 },
  count: { color: colors.muted, fontSize: 12.5, fontWeight: '600', marginBottom: 3 },
  controls: { paddingHorizontal: 16, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.field,
    borderWidth: 1, borderColor: colors.fieldBorder, borderRadius: 10, paddingHorizontal: 14, height: 44,
  },
  search: { flex: 1, color: colors.white, fontSize: 14.5 },
  filterRow: { flexDirection: 'row', gap: 10 },
  // web .player-card
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderRadius: 14, overflow: 'hidden',
  },
  cardBanner: { height: 72, backgroundColor: '#10141c' },
  cardBannerBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.blue },
  cardAvatarWrap: {
    position: 'absolute', top: 40, left: '50%', marginLeft: -32,
    width: 64, height: 64, borderRadius: 32, padding: 2, backgroundColor: colors.blue, zIndex: 2,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  cardAvatarInner: {
    flex: 1, borderRadius: 32, backgroundColor: '#1a1a1a', borderWidth: 2.5, borderColor: colors.card,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cardAvatarImg: { width: '100%', height: '100%', borderRadius: 32 },
  cardInitials: { color: 'rgba(255,255,255,0.7)', fontSize: 17, fontWeight: '700' },
  cardBody: { paddingTop: 40, paddingHorizontal: 12, paddingBottom: 14, alignItems: 'center' },
  cardName: { color: colors.white, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  cardMeta: { color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'center' },
  cardHw: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: 'center', letterSpacing: 0.2 },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10, marginBottom: 14 },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3,
  },
  tagText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  scoutBtn: { width: '100%', backgroundColor: colors.blue, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  scoutBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 40 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  lockIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(30,144,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  lockTitle: { fontSize: 17, fontWeight: '800', color: colors.white, letterSpacing: 0.3, marginBottom: 8 },
  lockBody: { fontSize: 13.5, color: colors.muted, lineHeight: 21, textAlign: 'center', maxWidth: 280 },
  // detail sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#161616', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 8, paddingHorizontal: 18, maxHeight: '86%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 14 },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  detailName: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
  detailSchool: { color: colors.muted, fontSize: 13.5, marginTop: 3 },
  detailSave: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  detailBio: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  infoCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  infoKey: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  infoVal: { fontSize: 14, color: colors.white, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  // compose
  compose: {
    backgroundColor: '#161616', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 8, paddingHorizontal: 18,
  },
  composeTitle: { color: colors.white, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  composeSub: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  composeInput: {
    backgroundColor: colors.field, borderWidth: 1, borderColor: colors.fieldBorder, borderRadius: 12,
    padding: 14, color: colors.white, fontSize: 14.5, minHeight: 120, textAlignVertical: 'top', marginBottom: 16,
  },
});
