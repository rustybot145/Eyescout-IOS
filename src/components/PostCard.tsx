import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Avatar } from './Avatar';
import { PoppingHypeStar } from './HypeStar';
import { hapticHype, hapticTap } from '../lib/haptics';
import { FeedVideo } from './video';
import { FeedPost } from '../data/feed';
import { timeAgo, formatCount } from '../lib/format';

const { width } = Dimensions.get('window');
const MEDIA_W = Math.min(width, 560); // card caps at phone width

// A single feed post — mirrors feed.html's <article class="post">:
// header (avatar · name · follow · meta · ⋯), media, hype action, caption, time.
export const PostCard = React.memo(function PostCard({
  post,
  active = false,
  onHype,
  onFollow,
  onReport,
  onShare,
  onOpenAuthor,
}: {
  post: FeedPost;
  active?: boolean;
  onHype: (p: FeedPost) => void;
  onFollow: (p: FeedPost) => void;
  onReport: (p: FeedPost) => void;
  onShare?: (p: FeedPost) => void;
  // Opens the author's full profile. Optional so a caller with nowhere to
  // navigate (or a post with no author id) just renders a non-tappable header.
  onOpenAuthor?: (p: FeedPost) => void;
}) {
  const meta = [post.sport, post.sport && post.authorGradYear ? 'Class of ' + post.authorGradYear : '']
    .filter(Boolean)
    .join(' · ');

  // Only the avatar and the name open the profile — deliberately NOT the whole
  // header, which would swallow taps meant for the Follow button next to it.
  const openAuthor = onOpenAuthor && post.authorId ? () => onOpenAuthor(post) : undefined;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={openAuthor} disabled={!openAuthor} hitSlop={4}>
          <Avatar uri={post.authorPhoto} name={post.authorName} size={42} />
        </Pressable>
        <View style={styles.headText}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1} onPress={openAuthor}>
              {post.authorName}
              {post.authorJersey ? ` · #${post.authorJersey}` : ''}
            </Text>
            {!post.isMine ? (
              <Pressable
                onPress={() => onFollow(post)}
                style={[styles.followBtn, post.following && styles.followingBtn]}
                hitSlop={6}
              >
                <Text style={[styles.followText, post.following && styles.followingText]}>
                  {post.following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        <Pressable onPress={() => onReport(post)} hitSlop={8} style={styles.more}>
          <Text style={styles.moreDots}>···</Text>
        </Pressable>
      </View>

      {/* Media */}
      {post.mediaData && post.type === 'photo' ? (
        <Image source={{ uri: post.mediaData }} style={styles.media} resizeMode="cover" />
      ) : post.mediaData && post.type === 'video' ? (
        <FeedVideo uri={post.mediaData} active={active} height={MEDIA_W * 0.82} />
      ) : (
        <View style={[styles.media, styles.videoTile]}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={26} color="#fff" />
          </View>
        </View>
      )}

      {/* Actions — hype on the left, share pushed to the right edge */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            // Buzz on the way IN only. Un-hyping is a correction, not an
            // achievement, and buzzing both ways makes a mis-tap feel doubly loud.
            if (!post.hyped) hapticHype();
            onHype(post);
          }}
          style={styles.hypeBtn}
          hitSlop={6}
        >
          <PoppingHypeStar size={22} color={post.hyped ? '#a855f7' : colors.muted} popKey={post.hyped} />
          <Text style={[styles.hypeCount, post.hyped && styles.hypeCountOn]}>
            {formatCount(post.hypeCount)}
          </Text>
        </Pressable>
        {onShare ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onShare(post);
            }}
            style={styles.shareBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Share this post"
          >
            <Ionicons name="paper-plane-outline" size={20} color={colors.muted} />
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        ) : null}
      </View>

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 11 },
  headText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: colors.white, fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(30,144,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(30,144,255,0.35)',
  },
  followingBtn: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.14)' },
  followText: { color: colors.blue, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  followingText: { color: colors.muted },
  meta: { color: colors.muted, fontSize: 12.5, marginTop: 3 },
  more: { paddingHorizontal: 4, alignSelf: 'flex-start' },
  moreDots: { color: colors.muted, fontSize: 18, fontWeight: '700', letterSpacing: 1, marginTop: -6 },
  media: { width: '100%', height: MEDIA_W * 0.82, backgroundColor: '#0d0d0d' },
  videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  hypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // marginLeft:auto pins share to the right edge of the row, opposite hype.
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 'auto' },
  shareText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  hypeCount: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  hypeCountOn: { color: '#a855f7' },
  caption: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20, paddingHorizontal: 14, paddingTop: 6 },
  time: { color: colors.faint, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, letterSpacing: 0.3 },
});
