import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { Notif, fetchNotifications, isFollowingActor, markAllRead } from '../../src/data/activity';
import { toggleFollow } from '../../src/data/feed';
import { getCurrentUserId } from '../../src/data/user';
import { useProAccess } from '../../src/lib/useProAccess';
import { PaywallScreen } from '../../src/components/Paywall';
import { timeAgo } from '../../src/lib/format';

type TabKey = 'all' | 'follows' | 'messages';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'follows', label: 'Follows' },
  { key: 'messages', label: 'Messages' },
];

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasPro } = useProAccess();
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [tab, setTab] = useState<TabKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const id = uid || (await getCurrentUserId());
    if (id && !uid) setUid(id);
    if (!id) return;
    const data = await fetchNotifications(id);
    setItems(data);
    markAllRead(id); // opening Activity clears the unread state, like the web
  }, [uid]);

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

  const onFollowBack = useCallback(
    (actorId: string) => {
      if (!uid) return;
      const nowFollowing = !isFollowingActor(items, actorId);
      const set: Set<string> = (items as any)._following || new Set();
      if (nowFollowing) set.add(actorId);
      else set.delete(actorId);
      setItems((prev) => {
        (prev as any)._following = set;
        return [...prev];
      });
      toggleFollow(uid, actorId, nowFollowing);
    },
    [items, uid]
  );

  const filtered = items.filter((n) => {
    if (tab === 'follows') return n.type === 'follow';
    if (tab === 'messages') return n.type === 'message';
    return true;
  });

  // Activity is a Pro feature.
  if (hasPro === false) {
    return <PaywallScreen role="player" uid={uid} title="See who's following you and who viewed your profile with Pro." />;
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>ACTIVITY</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotifRow
              n={item}
              following={item.actorId ? isFollowingActor(items, item.actorId) : false}
              onFollowBack={onFollowBack}
              onOpenMessages={() => router.push('/messages')}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
          ListEmptyComponent={<EmptyActivity />}
        />
      )}
    </View>
  );
}

function NotifRow({
  n,
  following,
  onFollowBack,
  onOpenMessages,
}: {
  n: Notif;
  following: boolean;
  onFollowBack: (id: string) => void;
  onOpenMessages: () => void;
}) {
  const icon = iconFor(n.type);
  const body = bodyFor(n);
  const Wrap: any = n.type === 'message' ? Pressable : View;
  return (
    <Wrap style={styles.row} onPress={n.type === 'message' ? onOpenMessages : undefined}>
      <View style={[styles.avatar, { backgroundColor: icon.bg, borderColor: icon.border }]}>
        <Ionicons name={icon.name as any} size={20} color={icon.color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowText}>
          <Text style={styles.rowStrong}>{body.strong}</Text>
          {body.rest}
        </Text>
        {body.preview ? (
          <Text style={styles.rowPreview} numberOfLines={1}>
            "{body.preview}"
          </Text>
        ) : null}
        <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
      </View>
      {n.type === 'follow' && n.actorId ? (
        <Pressable
          onPress={() => onFollowBack(n.actorId!)}
          style={[styles.followBack, following && styles.followingBack]}
          hitSlop={6}
        >
          <Text style={[styles.followBackText, following && styles.followingBackText]}>
            {following ? 'Following' : 'Follow Back'}
          </Text>
        </Pressable>
      ) : null}
      {!n.read ? <View style={styles.unreadDot} /> : null}
    </Wrap>
  );
}

function iconFor(type: Notif['type']) {
  switch (type) {
    case 'follow':
      return { name: 'person', bg: 'rgba(123,47,190,0.16)', border: 'rgba(123,47,190,0.3)', color: '#c084fc' };
    case 'message':
      return { name: 'chatbubble', bg: 'rgba(30,144,255,0.12)', border: 'rgba(30,144,255,0.3)', color: colors.blue };
    case 'hype_milestone':
      return { name: 'star', bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.3)', color: '#a855f7' };
    case 'post_removed':
      return { name: 'warning', bg: 'rgba(255,77,109,0.1)', border: 'rgba(255,77,109,0.28)', color: '#ff4d6d' };
  }
}

function bodyFor(n: Notif): { strong: string; rest: string; preview?: string } {
  switch (n.type) {
    case 'follow':
      return { strong: n.actorName || 'Someone', rest: ' started following you' };
    case 'message':
      return { strong: n.actorName || 'A coach', rest: ' sent you a message', preview: n.text };
    case 'hype_milestone':
      return { strong: `🔥 ${n.actorName} hype!`, rest: ` Your post just reached ${n.actorName} hype — keep it going.` };
    case 'post_removed':
      return { strong: 'A post was removed', rest: ' for violating our community guidelines' };
  }
}

function EmptyActivity() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="notifications-outline" size={26} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.emptyTitle}>No Activity Yet</Text>
      <Text style={styles.emptyBody}>When players follow you or coaches send you a message, it'll show up here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.5, color: colors.white },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: 12, gap: 6,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.blue },
  tabText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: colors.muted },
  tabTextActive: { color: colors.white },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  rowStrong: { color: colors.white, fontWeight: '700' },
  rowPreview: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  rowTime: { color: colors.faint, fontSize: 11.5, marginTop: 4 },
  followBack: {
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(30,144,255,0.14)', borderWidth: 1, borderColor: 'rgba(30,144,255,0.35)',
  },
  followingBack: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.14)' },
  followBackText: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  followingBackText: { color: colors.muted },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue },
  empty: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 36 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.6, textTransform: 'uppercase',
    color: colors.white, marginBottom: 10,
  },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
