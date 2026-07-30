import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient, colors } from '../theme/colors';

// Web's .g-border: a 1px gradient border around a solid card. Achieved with a
// gradient background and a 1px inset solid layer.
export function GradientBorderCard({
  children,
  style,
  radius = 12,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  return (
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      start={gradient.start}
      end={gradient.end}
      style={[{ borderRadius: radius, padding: 1 }, style]}
    >
      <View style={[styles.inner, { borderRadius: radius - 1, backgroundColor: colors.card }]}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  inner: {
    padding: 32, // p-8
  },
});
