import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GridVideo } from './video';

const { width } = Dimensions.get('window');

// ── Cover ── dark diagonal gradient with a 4px brand bar on top (web .cover)
export function Cover() {
  return (
    <View style={styles.cover}>
      <LinearGradient colors={['#0d0b14', '#0e1520', '#0a0d10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={gradient.colors}
        locations={gradient.locations}
        start={gradient.start}
        end={gradient.end}
        style={styles.coverBar}
      />
    </View>
  );
}

// ── Stat cell ──
export function Stat({ num, label, onPress }: { num: string | number; label: string; onPress?: () => void }) {
  const inner = (
    <View style={styles.stat}>
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

// ── Empty state block ──
export function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.25)" />
      </View>
      <Text style={styles.emptyLabel}>{label}</Text>
    </View>
  );
}

// ── Photo/Video grid (2-col square tiles, web mobile layout) ──
export type Tile = { uri: string; kind: 'photo' | 'video' };

export function MediaGrid({
  tiles,
  onPressItem,
  autoplayVideos,
  videosActive = true,
}: {
  tiles: Tile[];
  onPressItem?: (index: number) => void;
  autoplayVideos?: boolean; // silent-autoplay video tiles inline (e.g. Highlights)
  videosActive?: boolean; // pause the inline videos when the screen isn't focused
}) {
  const gap = 8;
  const size = (width - 32 - gap) / 2; // screen padding 16 each side
  return (
    <View style={styles.grid}>
      {tiles.map((t, i) => (
        <Pressable
          key={i}
          onPress={onPressItem ? () => onPressItem(i) : undefined}
          style={({ pressed }) => [
            { width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: '#111', opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {t.kind === 'photo' ? (
            <Image source={{ uri: t.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : autoplayVideos ? (
            <>
              <GridVideo uri={t.uri} active={videosActive} />
              <View style={styles.gridMuteBadge} pointerEvents="none">
                <Ionicons name="volume-mute" size={13} color="#fff" />
              </View>
            </>
          ) : (
            <View style={styles.videoTile}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={22} color="#fff" />
              </View>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 140, position: 'relative', overflow: 'hidden' },
  coverBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  stat: { alignItems: 'center', minWidth: 54 },
  statNum: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, color: colors.white, marginBottom: 3 },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyLabel: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridMuteBadge: {
    position: 'absolute', right: 7, bottom: 7, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  videoTile: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
});
