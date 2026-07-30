import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { GradientText } from '../../src/components/GradientText';
import { PostCard } from '../../src/components/PostCard';
import { Stories } from '../../src/components/Stories';
import { PaywallCard } from '../../src/components/Paywall';
import { openReport } from '../../src/components/Overlays';
import { sharePost } from '../../src/lib/sharePost';
import { FeedPost, fetchFeed, toggleHype, toggleFollow } from '../../src/data/feed';
import { fetchHasPro, fetchFeedPreview } from '../../src/data/subscription';
import { getCurrentCoach, Coach } from '../../src/data/coach';

const PAGE = 5;

// Coach News feed — the latest athlete posts in the coach's sport (all sports if
// the coach covers multiple). Reuses the player feed data + PostCard; coaches can
// hype and follow players from here.
export default function CoachNewsScreen() {
  const insets = useSafeAreaInsets();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  const viewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVideo = viewableItems.find((v) => (v.item as FeedPost)?.type === 'video');
    const pick = firstVideo || viewableItems[0];
    if (pick) setActiveId((pick.item as FeedPost).id);
  }).current;

  const load = useCallback(async () => {
    const c = coach || (await getCurrentCoach());
    if (c && !coach) setCoach(c);
    if (!c) return;
    const pro = await fetchHasPro();
    setHasPro(pro);
    const data = pro
      ? await fetchFeed(c.id, c.sport === 'Multiple Sports' ? '' : c.sport)
      : await fetchFeedPreview(c.id);
    setPosts(data);
    setVisible(PAGE);
  }, [coach]);

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

  const onHype = useCallback(
    (p: FeedPost) => {
      if (!coach) return;
      const nowHyped = !p.hyped;
      setPosts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, hyped: nowHyped, hypeCount: x.hypeCount + (nowHyped ? 1 : -1) } : x))
      );
      toggleHype(p.id, coach.id, nowHyped);
    },
    [coach]
  );

  const onFollow = useCallback(
    (p: FeedPost) => {
      if (!coach) return;
      const nowFollowing = !p.following;
      setPosts((prev) => prev.map((x) => (x.authorId === p.authorId ? { ...x, following: nowFollowing } : x)));
      toggleFollow(coach.id, p.authorId, nowFollowing);
    },
    [coach]
  );

  // Mints a share token, then hands off to the OS share sheet.
  const onShare = useCallback((p: FeedPost) => {
    sharePost(p.id);
  }, []);

  const onReport = useCallback((p: FeedPost) => {
    openReport({ postId: p.id, authorId: p.authorId, authorName: p.authorName, caption: p.caption, mediaData: p.mediaData, type: p.type });
  }, []);

  const shown = posts.slice(0, visible);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <GradientText style={styles.brand}>NEWS FEED</GradientText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard post={item} active={item.id === activeId} onHype={onHype} onFollow={onFollow} onReport={onReport} onShare={onShare} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          onEndReachedThreshold={0.5}
          onEndReached={() => setVisible((v) => Math.min(v + PAGE, posts.length))}
          ListHeaderComponent={
            hasPro && posts.length ? (
              <View style={{ marginHorizontal: -16, marginTop: -16, marginBottom: 8 }}>
                <Stories posts={posts} />
              </View>
            ) : null
          }
          ListFooterComponent={hasPro === false ? <PaywallCard role="coach" uid={coach?.id} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="newspaper-outline" size={26} color="rgba(255,255,255,0.2)" />
              </View>
              <Text style={styles.emptyTitle}>No Posts Yet</Text>
              <Text style={styles.emptyBody}>New posts from athletes in your sport will show up here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  brand: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.5 },
  empty: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 36 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.white, marginBottom: 10 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
