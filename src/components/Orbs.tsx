import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

// Web's .orb-1 / .orb-2 — soft radial glows in the background corners.
function Orb({
  size,
  color,
  opacity,
  style,
}: {
  size: number;
  color: string;
  opacity: number;
  style: object;
}) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="g" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="70%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill="url(#g)" />
      </Svg>
    </View>
  );
}

export function Orbs() {
  return (
    <>
      {/* orb-1: purple, top-right */}
      <Orb size={500} color="#7B2FBE" opacity={0.15} style={{ top: -100, right: -100 }} />
      {/* orb-2: blue, bottom-left */}
      <Orb size={400} color="#1E90FF" opacity={0.12} style={{ bottom: -50, left: -80 }} />
    </>
  );
}

export const orbStyles = StyleSheet.create({});
