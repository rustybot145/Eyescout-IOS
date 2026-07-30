import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

// Web's .role-switch — Player / Coach pill toggle, active pill is solid blue.
export function RoleSwitch({ role, onChange }: { role: 'player' | 'coach'; onChange: (r: 'player' | 'coach') => void }) {
  return (
    <View style={styles.wrap}>
      {(['player', 'coach'] as const).map((r) => {
        const active = role === r;
        return (
          <Pressable key={r} onPress={() => onChange(r)} style={[styles.opt, active && styles.optActive]}>
            <Text style={[styles.text, active && styles.textActive]}>{r === 'player' ? 'Player' : 'Coach'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 11,
    padding: 4,
    gap: 4,
    marginTop: 16,
  },
  opt: {
    paddingVertical: 9,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  optActive: { backgroundColor: colors.blue },
  text: {
    fontFamily: fonts.condBold,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  textActive: { color: colors.white },
});
