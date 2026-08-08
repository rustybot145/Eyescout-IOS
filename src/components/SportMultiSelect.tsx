import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { GradientButton } from './GradientButton';
import { toast } from './Overlays';

// The web's #sport-panel checkbox picker (login.html) — check up to `max`
// sports. Unlike Select, tapping an option does NOT close the sheet, since the
// whole point is picking more than one; a Done button closes it instead.
export function SportMultiSelect({
  values,
  placeholder,
  options,
  max = 2,
  onChange,
}: {
  values: string[];
  placeholder: string;
  options: { label: string; value: string }[];
  max?: number;
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(v: string) {
    if (values.includes(v)) {
      onChange(values.filter((x) => x !== v));
      return;
    }
    if (values.length >= max) {
      toast(`You can select up to ${max} sports`, 'err');
      return;
    }
    onChange([...values, v]);
  }

  const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !labels.length && styles.placeholder]} numberOfLines={1}>
          {labels.length ? labels.join(', ') : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.faint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{placeholder} — check up to {max}</Text>
            <ScrollView bounces={false} style={{ maxHeight: 360 }}>
              {options.map((o) => {
                const active = values.includes(o.value);
                return (
                  <Pressable
                    key={o.value}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => toggle(o.value)}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{o.label}</Text>
                    <View style={[styles.box, active && styles.boxActive]}>
                      {active ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ paddingHorizontal: 8, paddingTop: 10 }}>
              <GradientButton label="Done" onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { color: colors.white, fontSize: 14, flex: 1, marginRight: 8 },
  placeholder: { color: colors.muted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 18,
    paddingBottom: 34,
    paddingHorizontal: 8,
  },
  sheetTitle: {
    fontFamily: fonts.condBold,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionActive: { backgroundColor: 'rgba(30,144,255,0.12)' },
  optionText: { color: colors.white, fontSize: 15 },
  optionTextActive: { color: colors.white, fontWeight: '700' },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.fieldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { backgroundColor: colors.blue, borderColor: colors.blue },
});
