import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, Pressable, ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { GradientText } from '../../src/components/GradientText';
import { PostCard } from '../../src/components/PostCard';
import { FeedSkeleton } from '../../src/components/Skeleton';
import { Stories } from '../../src/components/Stories';
import { PaywallCard } from '../../src/components/Paywall';
import { openReport } from '../../src/components/Overlays';
import { sharePost } from '../../src/lib/sharePost';
import { hapticTap } from '../../src/lib/haptics';
import { FeedPost, fetchFeed, toggleHype, toggleFollow } from '../../src/data/feed';
import { fetchHasPro, fetchFeedPreview } from '../../src/data/subscription';
import { getCurrentUser, CurrentUser } from '../../src/data/user';
import { LinearGradient } from 'expo-linear-gradient';

const PAGE = 5; // render 5 at a time, like the web feed's batched rendering

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  // Which post is on screen → only that video plays (web's IntersectionObserver).
  const viewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVideo = viewableItems.find((v) => (v.item as FeedPost)?.type === 'video');
    const pick = firstVideo || viewableItems[0];
    if (pick) setActiveId((pick.item as FeedPost).id);
  }).current;

  const load = useCallback(async () => {
    const user = me || (await getCurrentUser());
    if (user && !me) setMe(user);
    if (!user) return;
    const pro = await fetchHasPro();
    setHasPro(pro);
    // Pro → the full feed; free → the DB-capped 2-post teaser.
    const data = pro ? await fetchFeed(user.id, user.sport) : await fetchFeedPreview(user.id);
    setPosts(data);
    setVisible(PAGE);
  }, [me]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when the tab regains focus (a new post / hype from elsewhere shows up)
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

  // Optimistic hype toggle — flip locally, then persist (same as web).
  const onHype = useCallback(
    (p: FeedPost) => {
      if (!me) return;
      const nowHyped = !p.hyped;
      setPosts((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, hyped: nowHyped, hypeCount: x.hypeCount + (nowHyped ? 1 : -1) } : x
        )
      );
      toggleHype(p.id, me.id, nowHyped);
    },
    [me]
  );

  const onFollow = useCallback(
    (p: FeedPost) => {
      if (!me) return;
      const nowFollowing = !p.following;
      hapticTap();
      setPosts((prev) => prev.map((x) => (x.authorId === p.authorId ? { ...x, following: nowFollowing } : x)));
      toggleFollow(me.id, p.authorId, nowFollowing);
    },
    [me]
  );

  // Mints a share token, then hands off to the OS share sheet.
  const onShare = useCallback((p: FeedPost) => {
    sharePost(p.id);
  }, []);

  // Custom in-app report/block sheet (not a native alert). Blocking drops that
  // author's posts from the list right away; fetchFeed filters them from then on.
  const onReport = useCallback((p: FeedPost) => {
    openReport(
      {
        postId: p.id,
        authorId: p.authorId,
        authorName: p.authorName,
        caption: p.caption,
        mediaData: p.mediaData,
        type: p.type,
      },
      (authorId) => setPosts((prev) => prev.filter((x) => x.authorId !== authorId))
    );
  }, []);

  const shown = posts.slice(0, visible);

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient
        colors={['#141018', '#111111']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <GradientText style={styles.brand}>EYESCOUT</GradientText>
        <View style={styles.headerBar} />
      </LinearGradient>

      {loading ? (
        <FeedSkeleton />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard post={item} active={item.id === activeId} onHype={onHype} onFollow={onFollow} onReport={onReport} onShare={onShare} onOpenAuthor={(p) => router.push(`/player/${p.authorId}`)} />
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
          ListFooterComponent={hasPro === false ? <PaywallCard role="player" uid={me?.id} /> : null}
          ListEmptyComponent={<EmptyFeed />}
          removeClippedSubviews
          initialNumToRender={PAGE}
          windowSize={7}
        />
      )}
    </View>
  );
}

function EmptyFeed() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.25)" />
      </View>
      <Text style={styles.emptyTitle}>Your Feed Is Quiet</Text>
      <Text style={styles.emptyBody}>
        Posts from athletes in your sport show up here. Follow players and share your own highlights to get
        started.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  brand: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.5 },
  headerBar: { height: 0 },
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
