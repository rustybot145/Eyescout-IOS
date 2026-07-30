import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient, colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

type Props = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
};

// Web's .g-btn: full-width gradient button, uppercase condensed bold text.
export function GradientButton({ label, onPress, loading, disabled }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ translateY: pressed ? 0 : 0 }] }]}
    >
      <LinearGradient
        colors={gradient.colors}
        locations={gradient.locations}
        start={gradient.start}
        end={gradient.end}
        style={[styles.btn, isDisabled && { opacity: 0.7 }]}
      >
        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.white} size="small" />
          </View>
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    paddingVertical: 16, // py-4
    borderRadius: 8, // rounded-lg
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: {
    color: colors.white,
    fontFamily: fonts.condBold,
    fontSize: 16,
    letterSpacing: 2.4, // ~0.15em @16px
    textTransform: 'uppercase',
  },
});
