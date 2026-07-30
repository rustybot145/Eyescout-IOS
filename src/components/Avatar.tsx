import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { GradientText } from './GradientText';
import { fonts } from '../theme/fonts';

// Circular avatar: profile photo when present, else the person's initial in
// brand-gradient text on a dark disc (matches the web post-avatar fallback).
export function Avatar({
  uri,
  name,
  size = 42,
  style,
}: {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: ViewStyle;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
      ) : (
        <GradientText style={{ fontFamily: fonts.display, fontSize: size * 0.42, lineHeight: size * 0.52 }}>
          {initial}
        </GradientText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#15111d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
