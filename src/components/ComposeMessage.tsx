import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { GradientButton } from './GradientButton';

// The coach's "send a message to this player" sheet. Lives here because both the
// Scout grid and the player profile a coach opens need it — same sheet, same
// copy, one implementation.
export function ComposeMessage({
  visible,
  toName,
  onClose,
  onSend,
}: {
  visible: boolean;
  toName: string;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  // Reset between recipients so yesterday's half-typed note never leaks into a
  // different player's thread.
  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Send Message</Text>
          <Text style={styles.sub}>To: {toName}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Introduce yourself and let them know why you're interested…"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={1000}
            autoFocus
          />
          <GradientButton label="Send" onPress={() => text.trim() && onSend(text.trim())} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#161616', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 8, paddingHorizontal: 18,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 14 },
  title: { color: colors.white, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  input: {
    backgroundColor: colors.field, borderWidth: 1, borderColor: colors.fieldBorder, borderRadius: 12,
    padding: 14, color: colors.white, fontSize: 14.5, minHeight: 120, textAlignVertical: 'top', marginBottom: 16,
  },
});
