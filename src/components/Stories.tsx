import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, StyleSheet, Modal, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GradientText } from './GradientText';
import { HypeStar, PulsingHypeStar } from './HypeStar';
import { hapticSelect, hapticTap } from '../lib/haptics';
import { StoryVideo } from './video';
import { FeedPost } from '../data/feed';
import {
  fetchWeeklyHypeWinners, currentWeekStart, STORY_WINDOW_MS, WeeklyWinner,
} from '../data/stories';
import { timeAgo } from '../lib/format';

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 4000; // ms per photo (matches the web)

type StoryPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorJersey: string;
  authorPhoto: string | null;
  type: 'photo' | 'video';
  mediaData: string;
  caption: string;
  createdAt: string;
};

type StoryGroup = {
  key: string;
  kind: 'player' | 'mostHyped';
  label: string;
  avatarPhoto: string | null;
  avatarName: string;
  avatarJersey: string;
  posts: StoryPost[];
};

const toStory = (p: FeedPost): StoryPost => ({
  id: p.id,
  authorId: p.authorId,
  authorName: p.authorName,
  authorJersey: p.authorJersey,
  authorPhoto: p.authorPhoto,
  type: p.type,
  mediaData: p.mediaData,
  caption: p.caption,
  createdAt: p.createdAt,
});

// Which post leads the row as "Most Hyped".
//
// The winner is FROZEN FOR THE WEEK, not recomputed on every render — that was
// the old behaviour here, and it meant the ring could change several times a
// day as hype trickled in. get_weekly_hype_winners() locks one post in every
// Monday 12:00 AM Phoenix and holds it until the next Monday.
//
// If that RPC isn't deployed, we fall back to the best-hyped post created since
// this week's Monday. That's an approximation of the frozen winner (it can still
// move mid-week, and it can't see hype earned this week by an older post), but
// it keeps the ring on the right weekly cycle instead of an all-time one.
function pickMostHyped(media: FeedPost[], winners: WeeklyWinner[] | null): FeedPost | null {
  const globalWinnerId = winners?.find((w) => w.category === 'global')?.postId;
  if (globalWinnerId) {
    const won = media.find((p) => p.id === globalWinnerId);
    if (won) return won;
    // Winner exists but isn't in this feed page (other sport, or scrolled past
    // the fetch limit) — fall through rather than showing an empty ring.
  }

  const weekStart = currentWeekStart().getTime();
  let top: FeedPost | null = null;
  for (const p of media) {
    if (p.hypeCount <= 0) continue;
    if (new Date(p.createdAt).getTime() < weekStart) continue;
    if (!top || p.hypeCount > top.hypeCount) top = p;
  }
  return top;
}

// Build the story row: a leading "Most Hyped" ring, then one ring per athlete
// who posted media IN THE LAST 24 HOURS, most recent first — the same two
// clocks the web portal runs on (see src/data/stories.ts).
function buildStoryGroups(
  posts: FeedPost[],
  winners: WeeklyWinner[] | null,
  retired: Set<string>
): StoryGroup[] {
  const withMedia = posts.filter((p) => p.mediaData);
  if (!withMedia.length) return [];

  // Most Hyped is picked BEFORE every filter below — not the 24h cut, and not
  // the retired-on-refresh cut. It is the one ring that must never leave the
  // row: this week's winner is usually older than a day, and watching it
  // shouldn't make it vanish. It only ever greys out.
  const top = pickMostHyped(withMedia, winners);

  // Player rings expire after 24 hours, like every other story product...
  const cutoff = Date.now() - STORY_WINDOW_MS;
  const fresh = withMedia.filter(
    (p) =>
      new Date(p.createdAt).getTime() >= cutoff &&
      // ...and additionally drop the ones already watched BEFORE this refresh.
      // Watching greys a ring immediately but leaves it in place (so the row
      // doesn't rearrange under your thumb mid-scroll); the next refresh is
      // what actually clears it.
      !retired.has(p.id)
  );

  // Group by author, each group's posts oldest→newest for viewing order.
  const map = new Map<string, StoryGroup>();
  fresh.forEach((p) => {
    let g = map.get(p.authorId);
    if (!g) {
      g = {
        key: 'p_' + p.authorId,
        kind: 'player',
        label: p.authorName,
        avatarPhoto: p.authorPhoto,
        avatarName: p.authorName,
        avatarJersey: p.authorJersey,
        posts: [],
      };
      map.set(p.authorId, g);
    }
    g.posts.push(toStory(p));
  });
  const groups = [...map.values()];
  groups.forEach((g) => g.posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  // most-recent poster first
  groups.sort((a, b) => {
    const la = a.posts[a.posts.length - 1].createdAt;
    const lb = b.posts[b.posts.length - 1].createdAt;
    return lb.localeCompare(la);
  });

  const out: StoryGroup[] = [];
  if (top) {
    const t: FeedPost = top;
    out.push({
      key: 'mostHyped',
      kind: 'mostHyped',
      label: 'Most Hyped',
      avatarPhoto: t.authorPhoto,
      avatarName: t.authorName,
      avatarJersey: t.authorJersey,
      posts: [toStory(t)],
    });
  }
  return [...out, ...groups.slice(0, 15)];
}

export function Stories({ posts }: { posts: FeedPost[] }) {
  const [winners, setWinners] = useState<WeeklyWinner[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  // Watched stories from BEFORE the most recent refresh. Kept separate from
  // `seen` so watching greys a ring now and removes it later, rather than
  // yanking it out from under the user the instant the viewer closes.
  const [retired, setRetired] = useState<Set<string>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const groups = useMemo(
    () => buildStoryGroups(posts, winners, retired),
    [posts, winners, retired]
  );

  // Fetched once per mount. The answer only changes on Mondays, so there is
  // nothing to gain from re-checking it as the feed refreshes.
  useEffect(() => {
    let alive = true;
    fetchWeeklyHypeWinners().then((w) => {
      if (alive) setWinners(w);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A new `posts` array means the feed refetched — that's the moment everything
  // watched so far graduates from "greyed out" to "gone". Reading `seen` from a
  // ref keeps this effect keyed on posts alone, so marking something seen can't
  // retire it early.
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const firstPosts = useRef(true);
  useEffect(() => {
    if (firstPosts.current) {
      firstPosts.current = false; // initial load isn't a refresh
      return;
    }
    if (seenRef.current.size) setRetired(new Set(seenRef.current));
  }, [posts]);

  if (!groups.length) return null;

  const markSeen = (ids: string[]) =>
    setSeen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

  return (
    <View style={styles.rail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railInner}>
        {groups.map((g, i) => {
          const allSeen = g.posts.every((p) => seen.has(p.id));
          return (
            <Pressable
              key={g.key}
              style={styles.item}
              onPress={() => {
                hapticTap();
                setOpenIdx(i);
              }}
            >
              <StoryRing group={g} seen={allSeen} />
              <Text style={styles.label} numberOfLines={1}>
                {g.kind === 'mostHyped' ? 'Most Hyped' : g.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {openIdx !== null ? (
        <StoryViewer
          groups={groups}
          startIndex={openIdx}
          onClose={() => setOpenIdx(null)}
          onSeen={markSeen}
        />
      ) : null}
    </View>
  );
}

function StoryRing({ group, seen }: { group: StoryGroup; seen: boolean }) {
  const inner = (
    <View style={styles.ringInner}>
      {group.kind === 'mostHyped' ? (
        // Once watched it stops pulsing and goes grey — the ring stays in the
        // row regardless, it just stops advertising itself.
        seen ? (
          <HypeStar size={26} color="rgba(255,255,255,0.35)" />
        ) : (
          <PulsingHypeStar size={26} color="#c084fc" />
        )
      ) : group.avatarPhoto ? (
        <Image source={{ uri: group.avatarPhoto }} style={styles.avatarImg} />
      ) : group.avatarJersey ? (
        <GradientText style={styles.ringJersey}>{`#${group.avatarJersey}`}</GradientText>
      ) : (
        <Ionicons name="person" size={24} color="rgba(255,255,255,0.6)" />
      )}
    </View>
  );

  if (group.kind === 'mostHyped') {
    if (seen) return <View style={[styles.ring, styles.ringSeen]}>{inner}</View>;
    return (
      <LinearGradient colors={['#4c0080', '#7B2FBE', '#a855f7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
        {inner}
      </LinearGradient>
    );
  }
  if (seen) {
    return <View style={[styles.ring, styles.ringSeen]}>{inner}</View>;
  }
  return (
    <LinearGradient colors={gradient.colors} locations={gradient.locations} start={gradient.start} end={gradient.end} style={styles.ring}>
      {inner}
    </LinearGradient>
  );
}

function StoryViewer({
  groups,
  startIndex,
  onClose,
  onSeen,
}: {
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  onSeen: (ids: string[]) => void;
}) {
  const [gi, setGi] = useState(startIndex);
  const [ii, setIi] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const group = groups[gi];
  const post = group?.posts[ii];

  // Advance helpers
  // A soft tick on each advance — this is a rapid, repeated action, so it uses
  // the lightest feedback available rather than the hype buzz.
  const goNext = () => {
    if (!group) return onClose();
    hapticSelect();
    if (ii < group.posts.length - 1) setIi(ii + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setIi(0);
    } else onClose();
  };
  const goPrev = () => {
    hapticSelect();
    if (ii > 0) setIi(ii - 1);
    else if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setIi(Math.max(0, prev.posts.length - 1));
    }
  };

  // Photos auto-advance on a fixed timer; videos advance when the clip ends and
  // animate their bar over the clip's real duration (started by StoryVideo).
  useEffect(() => {
    if (!post) return;
    onSeen([post.id]);
    progress.setValue(0);
    anim.current?.stop();
    if (post.type === 'photo') {
      anim.current = Animated.timing(progress, { toValue: 1, duration: STORY_DURATION, useNativeDriver: false });
      anim.current.start(({ finished }) => {
        if (finished) goNext();
      });
    }
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, ii]);

  const startVideoBar = (ms: number) => {
    progress.setValue(0);
    anim.current?.stop();
    anim.current = Animated.timing(progress, { toValue: 1, duration: Math.max(ms, 800), useNativeDriver: false });
    anim.current.start();
  };

  if (!group || !post) return null;

  const authorLine = `${post.authorName}${post.authorJersey ? '  #' + post.authorJersey : ''}`;
  const avatarPhoto = post.authorPhoto || group.avatarPhoto;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {/* Media */}
        {post.type === 'photo' ? (
          <Image source={{ uri: post.mediaData }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={styles.media}>
            <StoryVideo key={post.id} uri={post.mediaData} onEnd={goNext} onDuration={startVideoBar} />
          </View>
        )}

        {/* Tap zones: left 35% prev, right 65% next */}
        <Pressable style={styles.tapPrev} onPress={goPrev} />
        <Pressable style={styles.tapNext} onPress={goNext} />

        {/* Progress bars */}
        <View style={styles.bars} pointerEvents="none">
          {group.posts.map((_, i) => (
            <View key={i} style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width:
                      i < ii
                        ? '100%'
                        : i === ii
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header */}
        <View style={styles.vHeader} pointerEvents="box-none">
          <View style={styles.vUser}>
            <LinearGradient colors={gradient.colors} locations={gradient.locations} start={gradient.start} end={gradient.end} style={styles.vRing}>
              <View style={styles.vAvatar}>
                {avatarPhoto ? (
                  <Image source={{ uri: avatarPhoto }} style={styles.vAvatarImg} />
                ) : (
                  <GradientText style={styles.vAvatarInitial}>{(post.authorName || '?').charAt(0).toUpperCase()}</GradientText>
                )}
              </View>
            </LinearGradient>
            <View>
              <Text style={styles.vName}>{authorLine}</Text>
              <Text style={styles.vTime}>{timeAgo(post.createdAt)}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.vClose}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

        {/* Caption */}
        {post.caption ? (
          <View style={styles.vCaption} pointerEvents="none">
            <Text style={styles.vCaptionText}>{post.caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const RING = 70;
const styles = StyleSheet.create({
  rail: { borderBottomWidth: 1, borderBottomColor: colors.hairline, paddingVertical: 14, backgroundColor: colors.bg },
  railInner: { paddingHorizontal: 16, gap: 18 },
  item: { alignItems: 'center', width: 74, gap: 7 },
  ring: { width: RING, height: RING, borderRadius: RING / 2, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  ringSeen: { backgroundColor: 'rgba(255,255,255,0.12)' },
  ringInner: {
    flex: 1, width: '100%', borderRadius: RING / 2, backgroundColor: '#1e1e1e',
    borderWidth: 2.5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: RING / 2 },
  ringJersey: { fontFamily: fonts.display, fontSize: 17, color: colors.white, lineHeight: 22 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', maxWidth: 72 },

  // viewer
  viewer: { flex: 1, backgroundColor: '#000' },
  media: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width, height },
  videoMedia: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  playCircle: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  tapPrev: { position: 'absolute', top: 0, left: 0, width: '35%', height: '100%' },
  tapNext: { position: 'absolute', top: 0, right: 0, width: '65%', height: '100%' },
  bars: { position: 'absolute', top: 52, left: 14, right: 14, flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  vHeader: {
    position: 'absolute', top: 66, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  vUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vRing: { width: 40, height: 40, borderRadius: 20, padding: 2 },
  vAvatar: {
    flex: 1, borderRadius: 20, backgroundColor: '#1e1e1e', borderWidth: 2, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  vAvatarImg: { width: '100%', height: '100%', borderRadius: 20 },
  vAvatarInitial: { fontFamily: fonts.display, fontSize: 16, color: colors.white, lineHeight: 20 },
  vName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  vTime: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  vClose: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  vCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 48 },
  vCaptionText: { color: '#fff', fontSize: 15, fontWeight: '500', lineHeight: 22, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
