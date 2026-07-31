import React, { useEffect, useRef, useState } from 'react';
import {
  View, Animated, Easing, StyleSheet, AccessibilityInfo, ViewStyle, DimensionValue,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

// Loading skeletons, ported from the web portal's `.skel` (share.html):
//
//   background: linear-gradient(100deg, #141416 30%, #1c1c1f 50%, #141416 70%)
//   background-size: 220% 100%
//   animation: sweep 1.3s linear infinite   →  background-position: -220% 0
//   @media (prefers-reduced-motion: reduce) { animation: none }
//
// CSS animates a background-position; React Native can't, so the same effect is
// produced by sliding a gradient overlay across a static base at the same
// 1.3s linear cadence. Same colours, same timing, same reduced-motion opt-out.

const BASE = '#141416';
const HIGHLIGHT = '#1c1c1f';
const SWEEP_MS = 1300;

export function SkeletonBlock({
  width,
  height,
  radius = 6,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useRef(new Animated.Value(0)).current;
  // Percentage widths ('90%') can't drive a translation, so the real pixel
  // width is measured on layout and the sweep starts once it's known.
  const [w, setW] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!w || reduceMotion) return;
    t.setValue(0);
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [w, reduceMotion, t]);

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: BASE, overflow: 'hidden' }, style]}
    >
      {w > 0 && !reduceMotion ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-w, w] }) }] },
          ]}
        >
          <LinearGradient
            colors={[BASE, HIGHLIGHT, BASE]}
            locations={[0.3, 0.5, 0.7]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const Circle = ({ size }: { size: number }) => (
  <SkeletonBlock width={size} height={size} radius={size / 2} />
);

// Four placeholder rings + labels, matching the web's #stories-skel block
// (70px circles with a 44x9 label bar beneath).
export function StoriesSkeleton() {
  return (
    <View style={styles.rail}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.storyItem}>
          <Circle size={70} />
          <SkeletonBlock width={44} height={9} radius={4} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

// One placeholder post card: 40px avatar, two header lines, the media block,
// and two caption lines — the same shape as the web's .skel-card.
function PostSkeleton({ last }: { last?: boolean }) {
  return (
    <View style={[styles.card, last && { marginBottom: 0 }]}>
      <View style={styles.cardHeader}>
        <Circle size={40} />
        <View style={{ flex: 1 }}>
          <SkeletonBlock width={120} height={11} style={{ marginBottom: 6 }} />
          <SkeletonBlock width={80} height={9} />
        </View>
      </View>
      <SkeletonBlock width="100%" height={260} radius={0} />
      <View style={styles.cardCaption}>
        <SkeletonBlock width="90%" height={10} style={{ marginBottom: 6 }} />
        <SkeletonBlock width="60%" height={10} />
      </View>
    </View>
  );
}

// The full loading state for the feed / news screens: the story rail plus two
// post cards, so the layout that's about to appear is already blocked out
// rather than a spinner in the middle of an empty screen.
export function FeedSkeleton({ showStories = true }: { showStories?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      {showStories ? <StoriesSkeleton /> : null}
      <View style={{ padding: 16 }}>
        <PostSkeleton />
        <PostSkeleton last />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  storyItem: { alignItems: 'center', width: 74 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardCaption: { padding: 14 },
});
