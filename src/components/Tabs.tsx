import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

// Web's .tab row — Create Account / Log In, active tab has a blue underline.
export function Tabs({ tab, onChange }: { tab: 'signup' | 'login'; onChange: (t: 'signup' | 'login') => void }) {
  return (
    <View style={styles.row}>
      {([
        ['signup', 'Create Account'],
        ['login', 'Log In'],
      ] as const).map(([key, label]) => {
        const active = tab === key;
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={[styles.tab, active && styles.tabActive]}>
            <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tab: {
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: { borderBottomColor: colors.blue },
  text: {
    fontFamily: fonts.condBold,
    fontSize: 13,
    letterSpacing: 1.95,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  textActive: { color: colors.white },
});
