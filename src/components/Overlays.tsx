import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Animated, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { REPORT_REASONS, ReportTarget, submitReport } from '../data/reports';
import { blockUser } from '../data/blocks';
import { getCurrentUser } from '../data/user';

const { height } = Dimensions.get('window');

// ── Imperative API ──────────────────────────────────────────────────────────
// Any screen can call these without wiring props. A single <OverlayHost/> mounted
// in the root layout renders the actual UI. Replaces React Native's Alert.* with
// on-brand custom components.

type ConfirmOpts = { title: string; message?: string; confirmText?: string; cancelText?: string; destructive?: boolean };
type Action =
  | { kind: 'toast'; message: string; tone: 'ok' | 'err' }
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'report'; target: ReportTarget; onBlocked?: (authorId: string) => void };

let dispatch: ((a: Action) => void) | null = null;

export function toast(message: string, tone: 'ok' | 'err' = 'ok') {
  dispatch?.({ kind: 'toast', message, tone });
}
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => dispatch?.({ kind: 'confirm', opts, resolve }));
}
// `onBlocked` lets the calling screen drop that author's posts immediately
// instead of waiting for the next refresh.
export function openReport(target: ReportTarget, onBlocked?: (authorId: string) => void) {
  dispatch?.({ kind: 'report', target, onBlocked });
}

// ── Host ────────────────────────────────────────────────────────────────────
export function OverlayHost() {
  const [toastState, setToastState] = useState<{ message: string; tone: 'ok' | 'err' } | null>(null);
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const [reportState, setReportState] = useState<{
    target: ReportTarget;
    onBlocked?: (authorId: string) => void;
  } | null>(null);

  useEffect(() => {
    dispatch = (a) => {
      if (a.kind === 'toast') setToastState({ message: a.message, tone: a.tone });
      else if (a.kind === 'confirm') setConfirmState({ opts: a.opts, resolve: a.resolve });
      else if (a.kind === 'report') setReportState({ target: a.target, onBlocked: a.onBlocked });
    };
    return () => {
      dispatch = null;
    };
  }, []);

  return (
    <>
      {toastState ? <Toast {...toastState} onDone={() => setToastState(null)} /> : null}
      {confirmState ? (
        <ConfirmModal
          {...confirmState.opts}
          onResult={(v) => {
            confirmState.resolve(v);
            setConfirmState(null);
          }}
        />
      ) : null}
      {reportState ? (
        <ReportSheet
          target={reportState.target}
          onBlocked={reportState.onBlocked}
          onClose={() => setReportState(null)}
        />
      ) : null}
    </>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────────
function Toast({ message, tone, onDone }: { message: string; tone: 'ok' | 'err'; onDone: () => void }) {
  const y = useRef(new Animated.Value(-20)).current;
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(y, { toValue: -20, duration: 200, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(onDone);
    }, 2400);
    return () => clearTimeout(t);
  }, [y, op, onDone]);

  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <Animated.View style={[styles.toast, { opacity: op, transform: [{ translateY: y }] }]}>
        <Ionicons
          name={tone === 'ok' ? 'checkmark-circle' : 'alert-circle'}
          size={18}
          color={tone === 'ok' ? '#39D353' : '#ff5555'}
        />
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    </View>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────────────
function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive,
  onResult,
}: ConfirmOpts & { onResult: (v: boolean) => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onResult(false)} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={() => onResult(false)}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.dialogIcon, destructive && styles.dialogIconDanger]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={24}
              color={destructive ? '#ff6b6b' : colors.blue}
            />
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          {message ? <Text style={styles.dialogMsg}>{message}</Text> : null}
          <View style={styles.dialogBtns}>
            <Pressable style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => onResult(false)}>
              <Text style={styles.dialogCancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[styles.dialogBtn, destructive ? styles.dialogDanger : styles.dialogConfirm]}
              onPress={() => onResult(true)}
            >
              <Text style={styles.dialogConfirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Report sheet (Instagram-style, two-step) ────────────────────────────────
function ReportSheet({
  target,
  onClose,
  onBlocked,
}: {
  target: ReportTarget;
  onClose: () => void;
  onBlocked?: (authorId: string) => void;
}) {
  const [step, setStep] = useState<'options' | 'reasons' | 'done'>('options');
  const ty = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
  }, [ty]);

  const dismiss = () => {
    Animated.timing(ty, { toValue: height, duration: 200, useNativeDriver: true }).start(onClose);
  };

  // Play's UGC policy wants blocking to be reachable in the same place as
  // reporting. Confirm first — it hides content both ways and is easy to mis-tap.
  async function block() {
    const ok = await confirm({
      title: `Block ${target.authorName || 'this user'}?`,
      message: "You won't see their posts or messages, and they won't see yours.",
      confirmText: 'Block',
      destructive: true,
    });
    if (!ok) return;
    try {
      const me = await getCurrentUser();
      if (!me?.id) throw new Error('not signed in');
      await blockUser(me.id, target.authorId);
      onBlocked?.(target.authorId);
      toast(`Blocked ${target.authorName || 'user'}`);
    } catch {
      toast('Could not block right now', 'err');
    }
    dismiss();
  }

  async function pickReason(reason: string) {
    setStep('done');
    try {
      const me = await getCurrentUser();
      await submitReport(target, reason, {
        id: me?.id || '',
        name: me ? `${me.first} ${me.last}`.trim() || 'Player' : 'Player',
        role: me?.role || 'player',
      });
    } catch {
      /* report is best-effort; the thank-you still shows */
    }
    setTimeout(dismiss, 1500);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <Pressable style={styles.sheetOverlay} onPress={dismiss}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: ty }] }]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />

            {step === 'options' && (
              <View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Post options</Text>
                  <Pressable onPress={dismiss} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.faint} />
                  </Pressable>
                </View>
                <Pressable style={styles.sheetRow} onPress={() => setStep('reasons')}>
                  <Ionicons name="flag-outline" size={19} color="#ff4d6d" />
                  <Text style={[styles.sheetRowText, { color: '#ff4d6d', fontWeight: '700' }]}>Report post</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={block}>
                  <Ionicons name="ban-outline" size={19} color="#ff4d6d" />
                  <Text style={[styles.sheetRowText, { color: '#ff4d6d', fontWeight: '700' }]}>
                    Block {target.authorName || 'this user'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.sheetRow, styles.sheetRowTop]} onPress={dismiss}>
                  <Ionicons name="close-circle-outline" size={19} color={colors.muted} />
                  <Text style={styles.sheetRowText}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {step === 'reasons' && (
              <View>
                <View style={styles.sheetHeader}>
                  <Pressable onPress={() => setStep('options')} hitSlop={8}>
                    <Ionicons name="chevron-back" size={22} color={colors.muted} />
                  </Pressable>
                  <Text style={styles.sheetTitle}>Report</Text>
                  <Pressable onPress={dismiss} hitSlop={8}>
                    <Ionicons name="close" size={22} color={colors.faint} />
                  </Pressable>
                </View>
                <Text style={styles.sheetSub}>Why are you reporting this post?</Text>
                <ScrollView style={{ maxHeight: height * 0.44 }} bounces={false}>
                  {REPORT_REASONS.map((r) => (
                    <Pressable key={r} style={[styles.sheetRow, styles.sheetRowTop]} onPress={() => pickReason(r)}>
                      <Text style={styles.sheetRowText}>{r}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.faint} style={{ marginLeft: 'auto' }} />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {step === 'done' && (
              <View style={styles.done}>
                <View style={styles.doneIcon}>
                  <Ionicons name="checkmark" size={28} color="#39D353" />
                </View>
                <Text style={styles.doneTitle}>Thanks for letting us know</Text>
                <Text style={styles.doneBody}>
                  Our team will review this post. We use reports like yours to keep the community safe.
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // toast
  toastWrap: { position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 9, maxWidth: '90%',
    backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  toastText: { color: colors.white, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  // confirm
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  dialog: {
    width: '100%', maxWidth: 380, backgroundColor: '#181818', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 26, alignItems: 'center',
  },
  dialogIcon: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(30,144,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(30,144,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  dialogIconDanger: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.22)' },
  dialogTitle: {
    fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.4, textTransform: 'uppercase',
    color: colors.white, marginBottom: 8, textAlign: 'center',
  },
  dialogMsg: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginBottom: 22 },
  dialogBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  dialogBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  dialogCancel: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  dialogCancelText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  dialogConfirm: { backgroundColor: colors.blue },
  dialogDanger: { backgroundColor: '#e5484d' },
  dialogConfirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingBottom: 34, paddingTop: 8, paddingHorizontal: 6,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 6 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  sheetTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  sheetSub: { color: colors.faint, fontSize: 12.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  sheetRowTop: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  sheetRowText: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  done: { alignItems: 'center', paddingVertical: 34, paddingHorizontal: 26 },
  doneIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(57,211,83,0.12)',
    borderWidth: 1, borderColor: 'rgba(57,211,83,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  doneTitle: { color: colors.white, fontSize: 16, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  doneBody: { color: colors.faint, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
