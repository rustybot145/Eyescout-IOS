import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';

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
