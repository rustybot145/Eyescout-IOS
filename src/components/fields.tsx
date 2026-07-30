import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function ErrorMsg({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <Text style={styles.err}>{children}</Text>;
}

export function TextField(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.field, focused && styles.fieldFocused, props.style]}
    />
  );
}

export function PasswordField(props: TextInputProps) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.pwWrap}>
      <TextInput
        placeholderTextColor={colors.muted}
        secureTextEntry={hidden}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.field, styles.pwField, focused && styles.fieldFocused, props.style]}
      />
      <Pressable style={styles.toggle} onPress={() => setHidden((h) => !h)} hitSlop={8}>
        <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={hidden ? colors.muted : colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.7,
    color: colors.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  required: { color: colors.blueSoft },
  sectionLabel: {
    fontFamily: fonts.condBold,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  err: { color: colors.err, fontSize: 12, marginTop: 6 },
  field: {
    width: '100%',
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: colors.white,
    fontSize: 14,
  },
  fieldFocused: { borderColor: colors.fieldFocusBorder },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwField: { paddingRight: 44 },
  toggle: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
});
