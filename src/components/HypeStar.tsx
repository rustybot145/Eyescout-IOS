import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleProp, ImageStyle } from 'react-native';

// The brand "hype" icon — the exact shooting-star asset the web portal uses
// (star.png), recolored with tintColor the same way the web masks it with
// currentColor. Muted white when not hyped, purple (#a855f7) when hyped.
const STAR = require('../../assets/hype-star.png');

export function HypeStar({
  size = 22,
  color,
  style,
}: {
  size?: number;
  color: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={STAR}
      resizeMode="contain"
      style={[{ width: size, height: size, tintColor: color }, style]}
    />
  );
}

// The web's `hype-pop` keyframes, frame for frame (feed.html):
//
//   0%   scale 1.00  rotate   0deg
//   35%  scale 1.60  rotate -18deg
//   55%  scale 0.85  rotate  10deg
//   78%  scale 1.12  rotate  -4deg
//   100% scale 1.00  rotate   0deg      // 0.45s, cubic-bezier(0.34,1.56,0.64,1)
//
// Driven by one 0..1 Animated.Value that both scale and rotation interpolate
// off, so the two stay locked to the same timeline the CSS keyframes describe.
const POP_MS = 450;
const FRAMES = [0, 0.35, 0.55, 0.78, 1];
const SCALES = [1, 1.6, 0.85, 1.12, 1];
const ANGLES = ['0deg', '-18deg', '10deg', '-4deg', '0deg'];

/**
 * A HypeStar that plays the web's pop animation whenever `popKey` changes to a
 * truthy-changed value. Pass the hyped state — it pops on the transition into
 * hyped, and stays still when un-hyping (matching the web, where the pop is a
 * reward for hyping, not a reaction to every tap).
 */
export function PoppingHypeStar({
  size = 22,
  color,
  popKey,
  style,
}: {
  size?: number;
  color: string;
  popKey: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    // Don't fire on first render — otherwise every already-hyped post in the
    // feed pops as it scrolls into view.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!popKey) return; // un-hyping is silent, same as the web

    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: POP_MS,
      // cubic-bezier(0.34, 1.56, 0.64, 1) — the CSS overshoot curve.
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
  }, [popKey, t]);

  return (
    <Animated.View
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: FRAMES, outputRange: SCALES }) },
          { rotate: t.interpolate({ inputRange: FRAMES, outputRange: ANGLES }) },
        ],
      }}
    >
      <HypeStar size={size} color={color} style={style} />
    </Animated.View>
  );
}

/**
 * The Most Hyped story ring's star. Plays the same pop on mount and then on a
 * slow loop, so the ring that leads the story row reads as the live, "hot"
 * thing rather than just another circle.
 */
export function PulsingHypeStar({ size = 26, color }: { size?: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // One pop, a long pause, repeat. The pause is what keeps this from being
    // the distracting kind of animation — it catches the eye on arrival, then
    // stays out of the way.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: POP_MS,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
        Animated.delay(2600),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  return (
    <Animated.View
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: FRAMES, outputRange: SCALES }) },
          { rotate: t.interpolate({ inputRange: FRAMES, outputRange: ANGLES }) },
        ],
      }}
    >
      <HypeStar size={size} color={color} />
    </Animated.View>
  );
}
