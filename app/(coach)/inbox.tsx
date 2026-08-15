import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, TextInput, RefreshControl,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/fonts';
import { Avatar } from '../../src/components/Avatar';
import { confirm, openReport } from '../../src/components/Overlays';
import { CoachThread, ChatMsg, fetchCoachThreads, saveThread, deleteThread } from '../../src/data/messages';
import { getCurrentCoach } from '../../src/data/coach';
import { notifyNewMessage } from '../../src/data/notify';
import { timeAgo, formatTime, formatDate } from '../../src/lib/format';

export default function CoachInboxScreen() {
  const insets = useSafeAreaInsets();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    let id = coachId;
    if (!id) {
      const c = await getCurrentCoach();
      id = c?.id || null;
      setCoachId(id);
    }
    if (!id) return;
    setThreads(await fetchCoachThreads(id));
  }, [coachId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!activeId) load();
    }, [load, activeId])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const active = threads.find((t) => t.id === activeId) || null;

  const openThread = useCallback((t: CoachThread) => {
    let changed = false;
    const msgs = t.messages.map((m) => {
      if (m.from === 'player' && !m.read) {
        changed = true;
        return { ...m, read: true };
      }
      return m;
    });
    const updated = { ...t, messages: msgs };
    setThreads((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    setActiveId(t.id);
    if (changed) saveThread(updated);
  }, []);

  const onSend = useCallback(
    async (text: string) => {
      if (!active) return;
      const msg: ChatMsg = { from: 'coach', text, timestamp: new Date().toISOString(), read: true };
      const updated = { ...active, messages: [...active.messages, msg] };
      setThreads((prev) => prev.map((x) => (x.id === active.id ? updated : x)));
      await saveThread(updated);
      // See the matching note in the player inbox.
      notifyNewMessage(updated.id, updated.playerId, coachId);
    },
    [active, coachId]
  );

  const onDelete = useCallback(async (t: CoachThread) => {
    const ok = await confirm({
      title: 'Delete conversation?',
      message: 'This removes all messages in it and cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setThreads((prev) => prev.filter((x) => x.id !== t.id));
    setActiveId(null);
    deleteThread(t.id);
  }, []);

  // Report/Block reachable from inside a conversation, not just from posts.
  const onReport = useCallback((t: CoachThread) => {
    openReport(
      {
        postId: `thread:${t.id}`,
        authorId: t.playerId || '',
        authorName: t.playerName || 'this player',
        caption: 'Reported from a direct message conversation.',
        mediaData: '',
        type: 'photo',
      },
      () => {
        setThreads((prev) => prev.filter((x) => x.id !== t.id));
        setActiveId(null);
      }
    );
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (active) {
    return (
      <ChatView
        thread={active}
        onBack={() => {
          setActiveId(null);
          load();
        }}
        onSend={onSend}
        onDelete={() => onDelete(active)}
        onReport={() => onReport(active)}
        insets={insets}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>MESSAGES</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <ConvoRow t={item} onPress={() => openThread(item)} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-outline" size={24} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyTitle}>No Conversations</Text>
            <Text style={styles.emptyBody}>Message a player from the Scout tab and your conversations will appear here.</Text>
          </View>
        }
      />
    </View>
  );
}

function ConvoRow({ t, onPress }: { t: CoachThread; onPress: () => void }) {
  const last = t.messages[t.messages.length - 1];
  const preview = last ? last.text : 'No messages yet';
  const unread = t.messages.some((m) => m.from === 'player' && !m.read);
  return (
    <Pressable style={styles.convo} onPress={onPress}>
      <Avatar uri={t.playerPhoto} name={t.playerName} size={48} />
      <View style={styles.convoInfo}>
        <Text style={styles.convoName} numberOfLines={1}>
          {t.playerName}
        </Text>
        <Text style={[styles.convoPreview, unread && styles.convoPreviewUnread]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.convoRight}>
        <Text style={styles.convoTime}>{last ? timeAgo(last.timestamp) : ''}</Text>
        {unread ? <View style={styles.unreadDot} /> : null}
      </View>
    </Pressable>
  );
}

function ChatView({
  thread,
  onBack,
  onSend,
  onDelete,
  onReport,
  insets,
}: {
  thread: CoachThread;
  onBack: () => void;
  onSend: (text: string) => void;
  onDelete: () => void;
  onReport: () => void;
  insets: { top: number; bottom: number };
}) {
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  };

  const rows = thread.messages.map((m, i) => {
    const prev = thread.messages[i - 1];
    const showDate = i === 0 || new Date(m.timestamp).toDateString() !== new Date(prev.timestamp).toDateString();
    return { m, showDate, key: String(i) };
  });

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <Avatar uri={thread.playerPhoto} name={thread.playerName} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.chatName} numberOfLines={1}>
            {thread.playerName}
          </Text>
          {thread.playerSport ? <Text style={styles.chatRole}>{thread.playerSport}</Text> : null}
        </View>
        <Pressable onPress={onReport} hitSlop={8} style={styles.trashBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => {
          const isMine = item.m.from === 'coach';
          return (
            <View>
              {item.showDate ? <Text style={styles.dateDivider}>{formatDate(item.m.timestamp)}</Text> : null}
              <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.m.text}</Text>
                </View>
              </View>
              <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
                {formatTime(item.m.timestamp)}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.chatEmpty}>Start of your conversation with {thread.playerName}.</Text>}
      />

      <View style={[styles.inputWrap, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={`Message ${thread.playerName}…`}
          placeholderTextColor={colors.faint}
          onSubmitEditing={send}
          returnKeyType="send"
          multiline
        />
        <Pressable onPress={send} style={styles.sendBtn} hitSlop={6}>
          <Ionicons name="send" size={17} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1.5, color: colors.white },
  convo: {
    flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  convoInfo: { flex: 1, minWidth: 0 },
  convoName: { color: colors.white, fontSize: 15, fontWeight: '700' },
  convoPreview: { color: colors.muted, fontSize: 13, marginTop: 3 },
  convoPreviewUnread: { color: colors.white, fontWeight: '600' },
  convoRight: { alignItems: 'flex-end', gap: 6 },
  convoTime: { color: colors.faint, fontSize: 11 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.blue },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: colors.hairline, backgroundColor: colors.card,
  },
  backBtn: { padding: 2 },
  chatName: { color: colors.white, fontSize: 15, fontWeight: '700' },
  chatRole: { color: colors.muted, fontSize: 12, marginTop: 1 },
  trashBtn: {
    width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  dateDivider: { color: colors.faint, fontSize: 11, textAlign: 'center', marginVertical: 12, letterSpacing: 0.5 },
  msgRow: { flexDirection: 'row', marginTop: 2 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: colors.blue, borderBottomRightRadius: 5 },
  bubbleTheirs: { backgroundColor: '#1e1e1e', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  bubbleText: { color: 'rgba(255,255,255,0.92)', fontSize: 14.5, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  msgTime: { color: colors.faint, fontSize: 10.5, marginTop: 3, marginBottom: 6 },
  msgTimeMine: { textAlign: 'right' },
  msgTimeTheirs: { textAlign: 'left' },
  chatEmpty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 40 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.card,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 42, backgroundColor: colors.field, borderRadius: 21,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, color: colors.white, fontSize: 14.5,
    borderWidth: 1, borderColor: colors.fieldBorder,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 36 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.white, marginBottom: 10 },
  emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
