import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

// Full-screen brand intro that plays whenever the app opens un-authenticated,
// then hands off to the signup quiz. Defensive: advances on end, on load error,
// and on a hard timeout so a bad asset can never strand the user on black.
//
// Resolve the bundled clip to a plain URI via RN's asset registry (NOT
// expo-asset's native module, which isn't present in this Expo Go runtime) —
// expo-video plays URI strings fine, same as the feed videos.
const INTRO = Image.resolveAssetSource(require('../../assets/intro.mp4')).uri;
// intro.mp4 is pre-trimmed to end at its black point (~2.9s) so playToEnd hands
// off to the quiz right when it goes black — no dead black tail. See intro-original.mp4.
const MAX_MS = 7000; // hard ceiling so we never hang

export function IntroVideo({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const player = useVideoPlayer(INTRO, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    const endSub = player.addListener('playToEnd', finish);
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') finish();
    });
    const timer = setTimeout(finish, MAX_MS);
    return () => {
      endSub.remove();
      statusSub.remove();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(350)} style={styles.root}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Pressable
        onPress={finish}
        hitSlop={12}
        style={[styles.skip, { top: insets.top + 12 }]}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  skip: {
    position: 'absolute',
    right: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  skipText: {
    color: colors.white,
    fontFamily: fonts.cond,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
