import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { ViewerVideo } from './video';

export type ViewerMedia = { uri: string; kind: 'photo' | 'video' };

// Fullscreen media viewer. Tapping a profile grid tile opens it: photos expand
// to fit the screen, videos play with native controls. The account owner gets a
// three-dots menu in the corner to delete the item (the red action doubles as the
// confirmation, iOS action-sheet style).
export function MediaViewer({
  item,
  canDelete,
  onClose,
  onDelete,
}: {
  item: ViewerMedia | null;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);

  if (!item) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {item.kind === 'photo' ? (
          <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <ViewerVideo uri={item.uri} />
        )}

        {/* Top bar: close + three-dots */}
        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          {canDelete ? (
            <Pressable onPress={() => setMenu(true)} hitSlop={10} style={styles.iconBtn}>
              <Text style={styles.dots}>···</Text>
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {/* Three-dots menu (bottom sheet) */}
        {menu ? (
          <Pressable style={styles.menuOverlay} onPress={() => setMenu(false)}>
            <Pressable style={[styles.menu, { paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.grabber} />
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                <Ionicons name="trash-outline" size={19} color="#ff4d6d" />
                <Text style={[styles.menuText, { color: '#ff4d6d', fontWeight: '700' }]}>
                  Delete {item.kind === 'video' ? 'video' : 'photo'}
                </Text>
              </Pressable>
              <Pressable style={[styles.menuRow, styles.menuRowTop]} onPress={() => setMenu(false)}>
                <Ionicons name="close-circle-outline" size={19} color={colors.muted} />
                <Text style={styles.menuText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dots: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -8, letterSpacing: 1 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menu: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingTop: 8, paddingHorizontal: 6,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  menuRowTop: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  menuText: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
});
