import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

// Feed video — Instagram-style: muted autoplay + loop, tap to toggle sound.
// Only plays when `active` (the post is the one currently on screen), mirroring
// the web feed's IntersectionObserver autoplay.
export function FeedVideo({ uri, active, height }: { uri: string; active: boolean; height: number }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <Pressable onPress={() => setMuted((m) => !m)} style={[styles.feedWrap, { height }]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={styles.muteBtn}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

// Story video — plays the full reel with sound, then advances. Reports its
// duration so the story progress bar can animate to match.
export function StoryVideo({
  uri,
  onEnd,
  onDuration,
}: {
  uri: string;
  onEnd: () => void;
  onDuration: (ms: number) => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    const endSub = player.addListener('playToEnd', () => onEnd());
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && player.duration > 0) onDuration(player.duration * 1000);
    });
    return () => {
      endSub.remove();
      statusSub.remove();
    };
  }, [player, onEnd, onDuration]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

// Grid preview video — silent autoplay + loop, filling a profile grid tile.
// Wrapped in a pointerEvents="none" view so taps fall through to the tile's
// Pressable (which opens the fullscreen viewer with sound). `active` pauses it
// when the profile isn't focused so nothing plays in the background.
export function GridVideo({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  );
}

// Fullscreen viewer video — autoplay, loops, with native transport controls
// (play/pause/scrubber) so an opened clip is fully playable.
export function ViewerVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  feedWrap: { width: '100%', backgroundColor: '#000' },
  muteBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
