import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getEdits } from '../../tg/archive';
import {
  deleteOwnMessages,
  editOwnMessage,
  markRead,
  onChatEvent,
  reactTo,
  sendPhoto,
  sendText,
  sendTyping,
} from '../../tg/client';
import { mediaLabel } from '../../tg/convert';
import { entityFor } from '../../tg/dialogs';
import { fromNewExport as fromNew, loadHistory, loadPhoto, type ChatMessage } from '../../tg/history';
import { pickPhoto } from '../../tg/media';
import { useSettings } from '../../tg/settings';
import { dateSeparator, formatTime, sameDay } from '../../ui/format';
import { Glass } from '../../ui/Glass';
import { theme } from '../../ui/theme';

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😁', '😢', '🙏'];

type Row =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'day'; date: number; key: string };

type Compose = { mode: 'reply'; id: number; preview: string } | { mode: 'edit'; id: number; preview: string } | null;

export default function Chat() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ peer: string; title?: string }>();
  const peer = params.peer!;
  const title = params.title ?? 'Чат';
  const settings = useSettings();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [compose, setCompose] = useState<Compose>(null);
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const loadingMore = useRef(false);

  const upsert = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, { ...map.get(m.id), ...m });
      return [...map.values()].sort((a, b) => b.id - a.id);
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || done) return;
    loadingMore.current = true;
    const offset = messages.length ? Math.min(...messages.map((m) => m.id)) : 0;
    try {
      const page = await loadHistory(peer, offset);
      upsert(page.messages);
      if (page.done) setDone(true);
    } catch (err) {
      console.warn(err);
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, [peer, messages, done, upsert]);

  useEffect(() => {
    (async () => {
      try {
        const page = await loadHistory(peer, 0);
        upsert(page.messages);
        if (page.done) setDone(true);
      } finally {
        setLoading(false);
      }
    })();
    return onChatEvent((e) => {
      if (e.type === 'new' && e.message.peer === peer) upsert([fromNew(e.message)]);
      else if (e.type === 'edited' && e.message.peer === peer) upsert([{ ...fromNew(e.message), has_edits: true }]);
      else if (e.type === 'deleted') {
        const mine = e.messages.filter((m) => m.peer === peer);
        if (mine.length) upsert(mine.map((m) => ({ ...m, has_edits: false })));
      } else if (e.type === 'reactions' && e.peer === peer) {
        setMessages((prev) => prev.map((m) => (m.id === e.id ? { ...m, reactions: e.reactions } : m)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  // Lookup of loaded message text, for rendering reply snippets without extra fetches.
  const textById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of messages) map.set(m.id, m.text || mediaLabel(m.media));
    return map;
  }, [messages]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      out.push({ kind: 'msg', msg: m });
      const next = messages[i + 1];
      if (!next || !sameDay(m.date, next.date)) out.push({ kind: 'day', date: m.date, key: `day-${m.id}` });
    }
    return out;
  }, [messages]);

  async function doSend() {
    const body = text.trim();
    if (!body || sending) return;
    const entity = entityFor(peer);
    setSending(true);
    const current = compose;
    setText('');
    setCompose(null);
    try {
      if (current?.mode === 'edit') {
        await editOwnMessage(entity, current.id, body);
      } else {
        await sendText(entity, body, current?.mode === 'reply' ? current.id : undefined);
      }
    } catch (err: any) {
      Alert.alert('Не вдалося', String(err?.message ?? err));
      setText(body);
      setCompose(current);
    } finally {
      setSending(false);
    }
  }

  async function attachPhoto() {
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      setSending(true);
      await sendPhoto(entityFor(peer), uri, text.trim(), compose?.mode === 'reply' ? compose.id : undefined);
      setText('');
      setCompose(null);
    } catch (err: any) {
      Alert.alert('Фото не надіслано', String(err?.message ?? err));
    } finally {
      setSending(false);
    }
  }

  function onChangeText(v: string) {
    setText(v);
    if (v.length) sendTyping(entityFor(peer)).catch(() => {});
  }

  async function onEyePress() {
    try {
      await markRead(entityFor(peer));
      Alert.alert('Прочитано', 'Чат позначено прочитаним.');
    } catch (err: any) {
      Alert.alert('Помилка', String(err?.message ?? err));
    }
  }

  async function react(msg: ChatMessage, emoji: string) {
    setActionMsg(null);
    // If you already chose this one, tapping again clears it.
    const already = msg.reactions?.includes(`*${emoji}`);
    try {
      await reactTo(entityFor(peer), msg.id, already ? null : emoji);
    } catch (err: any) {
      Alert.alert('Реакція не надіслана', String(err?.message ?? err));
    }
  }

  async function removeMessage(msg: ChatMessage) {
    setActionMsg(null);
    Alert.alert('Видалити повідомлення?', 'Його буде видалено для всіх.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOwnMessages(entityFor(peer), [msg.id], true);
          } catch (err: any) {
            Alert.alert('Не вдалося видалити', String(err?.message ?? err));
          }
        },
      },
    ]);
  }

  function startReply(msg: ChatMessage) {
    setActionMsg(null);
    setCompose({ mode: 'reply', id: msg.id, preview: msg.text || mediaLabel(msg.media) || 'повідомлення' });
  }

  function startEdit(msg: ChatMessage) {
    setActionMsg(null);
    setText(msg.text);
    setCompose({ mode: 'edit', id: msg.id, preview: msg.text || 'повідомлення' });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <Glass style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pressable
          style={{ flex: 1 }}
          disabled={peer.startsWith('-')}
          onPress={() => router.push({ pathname: '/profile/[peer]', params: { peer, title } })}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </Pressable>
        <Pressable onPress={onEyePress} hitSlop={10}>
          <Text style={styles.eye}>👁</Text>
        </Pressable>
      </Glass>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows}
          inverted
          keyExtractor={(r) => (r.kind === 'msg' ? `m${r.msg.id}` : r.key)}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <View style={styles.dayWrap}>
                <Text style={styles.dayText}>{dateSeparator(item.date)}</Text>
              </View>
            ) : (
              <Bubble
                peer={peer}
                msg={item.msg}
                showDeleted={settings.showDeletedInChat}
                manualPhoto={settings.manualPhotoLoad}
                replyText={item.msg.reply_to ? textById.get(item.msg.reply_to) : undefined}
                onLongPress={setActionMsg}
                onReact={react}
              />
            )
          }
          ListFooterComponent={
            !done ? <ActivityIndicator color={theme.textFaint} style={{ marginVertical: 16 }} /> : undefined
          }
          contentContainerStyle={{ paddingVertical: 10 }}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          updateCellsBatchingPeriod={40}
        />
      )}

      {compose && (
        <View style={styles.composeBar}>
          <View style={styles.composeAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.composeMode}>{compose.mode === 'edit' ? 'Редагування' : 'Відповідь'}</Text>
            <Text style={styles.composePreview} numberOfLines={1}>
              {compose.preview}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (compose.mode === 'edit') setText('');
              setCompose(null);
            }}
            hitSlop={10}
          >
            <Text style={styles.composeClose}>✕</Text>
          </Pressable>
        </View>
      )}

      <Glass style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={styles.attach} onPress={attachPhoto} disabled={sending} hitSlop={8}>
          <Text style={styles.attachIcon}>📎</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder="Повідомлення…"
          placeholderTextColor={theme.textFaint}
          multiline
        />
        <Pressable style={styles.send} onPress={doSend} disabled={sending}>
          <Text style={styles.sendIcon}>{sending ? '…' : compose?.mode === 'edit' ? '✓' : '➤'}</Text>
        </Pressable>
      </Glass>

      <ActionSheet
        msg={actionMsg}
        onClose={() => setActionMsg(null)}
        onReact={react}
        onReply={startReply}
        onEdit={startEdit}
        onDelete={removeMessage}
        onCopy={(m) => {
          Clipboard.setStringAsync(m.text);
          setActionMsg(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function ActionSheet({
  msg,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onCopy,
}: {
  msg: ChatMessage | null;
  onClose: () => void;
  onReact: (m: ChatMessage, e: string) => void;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onCopy: (m: ChatMessage) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!msg) return null;
  const own = msg.out === 1;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.reactRow}>
            {QUICK_REACTIONS.map((e) => (
              <Pressable key={e} onPress={() => onReact(msg, e)} style={styles.reactBtn}>
                <Text style={styles.reactEmoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
          {msg.text ? <SheetAction label="Копіювати текст" icon="📋" onPress={() => onCopy(msg)} /> : null}
          <SheetAction label="Відповісти" icon="↩️" onPress={() => onReply(msg)} />
          {own && !msg.media && <SheetAction label="Редагувати" icon="✏️" onPress={() => onEdit(msg)} />}
          {own && <SheetAction label="Видалити" icon="🗑" danger onPress={() => onDelete(msg)} />}
        </View>
      </Pressable>
    </Modal>
  );
}

function SheetAction({
  label,
  icon,
  danger,
  onPress,
}: {
  label: string;
  icon: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.sheetAction} onPress={onPress}>
      <Text style={styles.sheetIcon}>{icon}</Text>
      <Text style={[styles.sheetLabel, danger && { color: theme.danger }]}>{label}</Text>
    </Pressable>
  );
}

type BubbleProps = {
  peer: string;
  msg: ChatMessage;
  showDeleted: boolean;
  manualPhoto: boolean;
  replyText?: string;
  onLongPress: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, e: string) => void;
};

const Bubble = memo(function Bubble({
  peer,
  msg,
  showDeleted,
  manualPhoto,
  replyText,
  onLongPress,
  onReact,
}: BubbleProps) {
  const out = msg.out === 1;
  const isDeleted = msg.deleted === 1;
  const isService = msg.media?.startsWith('service:');
  const [photo, setPhoto] = useState<string | null>(msg.photo);
  const [photoAsked, setPhotoAsked] = useState(false);

  useEffect(() => {
    if (msg.media === 'photo' && !photo && !manualPhoto) {
      loadPhoto(peer, msg.id).then((uri) => uri && setPhoto(uri));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.id]);

  if (isDeleted && !showDeleted) return null;

  if (isService) {
    return (
      <View style={styles.serviceWrap}>
        <Text style={styles.serviceText}>
          {msg.sender_name ? `${msg.sender_name} ` : ''}
          {mediaLabel(msg.media)}
        </Text>
      </View>
    );
  }

  const media = msg.media ? mediaLabel(msg.media) : '';
  const reactions = parseReactions(msg.reactions);

  async function showHistory() {
    const edits = await getEdits(peer, msg.id);
    const body = [
      ...edits.map((e, i) => `${i + 1}. [${formatTime(e.date)}] ${e.text || '(без тексту)'}`),
      `${edits.length + 1}. [${formatTime(msg.edit_date ?? msg.date)}] ${msg.text || '(без тексту)'} ← поточна`,
    ].join('\n\n');
    Alert.alert('Історія редагувань', body || 'Немає збережених версій.');
  }

  function loadPhotoNow() {
    setPhotoAsked(true);
    loadPhoto(peer, msg.id).then((uri) => uri && setPhoto(uri));
  }

  return (
    <Pressable
      onLongPress={() => !isDeleted && onLongPress(msg)}
      delayLongPress={250}
      style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn, isDeleted && styles.bubbleDeleted]}
    >
      {!out && msg.sender_name && msg.is_channel === 0 && (
        <Text style={styles.sender}>{msg.sender_name}</Text>
      )}
      {isDeleted && <Text style={styles.deletedTag}>🗑 Видалено</Text>}
      {replyText != null && (
        <View style={styles.reply}>
          <Text style={styles.replyText} numberOfLines={1}>
            {replyText}
          </Text>
        </View>
      )}
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : msg.media === 'photo' && manualPhoto && !photoAsked ? (
        <Pressable style={styles.photoStub} onPress={loadPhotoNow}>
          <Text style={styles.photoStubText}>🖼 Завантажити фото</Text>
        </Pressable>
      ) : media && msg.media !== 'photo' ? (
        <Text style={styles.media}>{media}</Text>
      ) : null}
      {msg.text ? <Text style={styles.text}>{msg.text}</Text> : null}
      {reactions.length > 0 && (
        <View style={styles.reactionRow}>
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onReact(msg, r.emoji)}
              style={[styles.reactionChip, r.mine && styles.reactionChipMine]}
            >
              <Text style={styles.reactionText}>
                {r.emoji} {r.count}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.meta}>
        {msg.has_edits && (
          <Text style={styles.editedTag} onPress={showHistory}>
            ред.
          </Text>
        )}
        <Text style={styles.time}>{formatTime(msg.date)}</Text>
      </View>
    </Pressable>
  );
});

function parseReactions(s: string | null): { emoji: string; count: number; mine: boolean }[] {
  if (!s) return [];
  return s.split(' ').map((part) => {
    const mine = part.startsWith('*');
    const body = mine ? part.slice(1) : part;
    const m = body.match(/^(.+?)(\d+)$/);
    return m ? { emoji: m[1], count: parseInt(m[2], 10), mine } : { emoji: body, count: 0, mine };
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.glassBorder,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  back: { color: theme.accent, fontSize: 34, lineHeight: 34, marginTop: -4 },
  headerTitle: { color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 },
  eye: { fontSize: 20 },
  dayWrap: { alignItems: 'center', marginVertical: 8 },
  dayText: {
    color: theme.textDim,
    fontSize: 12,
    backgroundColor: theme.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bubble: {
    maxWidth: '82%',
    marginVertical: 2,
    marginHorizontal: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
  },
  bubbleIn: { backgroundColor: theme.bubbleIn, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleOut: { backgroundColor: theme.bubbleOut, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleDeleted: { backgroundColor: theme.deleted, borderWidth: 1, borderColor: theme.deletedBorder },
  sender: { color: theme.accent, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  deletedTag: { color: theme.deletedBorder, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  reply: {
    borderLeftWidth: 2,
    borderLeftColor: theme.accent,
    paddingLeft: 6,
    marginBottom: 4,
    opacity: 0.85,
  },
  replyText: { color: theme.textDim, fontSize: 13 },
  text: { color: theme.text, fontSize: 15, lineHeight: 20 },
  media: { color: theme.text, fontSize: 15, fontStyle: 'italic', marginBottom: 2 },
  photo: { width: 220, height: 220, borderRadius: 10, marginBottom: 4, backgroundColor: theme.bgInput },
  photoStub: {
    width: 220,
    height: 120,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: theme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStubText: { color: theme.accent, fontSize: 14 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reactionChipMine: { backgroundColor: theme.accent },
  reactionText: { color: theme.text, fontSize: 12 },
  meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 6, marginTop: 2 },
  editedTag: { color: theme.accentGhost, fontSize: 11, fontWeight: '600' },
  time: { color: theme.textFaint, fontSize: 11 },
  serviceWrap: { alignItems: 'center', marginVertical: 6 },
  serviceText: {
    color: theme.textDim,
    fontSize: 12,
    backgroundColor: theme.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.glassBorder,
  },
  composeAccent: { width: 3, height: 32, borderRadius: 2, backgroundColor: theme.accent },
  composeMode: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  composePreview: { color: theme.textDim, fontSize: 13 },
  composeClose: { color: theme.textDim, fontSize: 18, paddingHorizontal: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.glassBorder,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
  attach: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  attachIcon: { fontSize: 20 },
  input: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.text,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    maxHeight: 120,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
  },
  reactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  reactBtn: { padding: 6 },
  reactEmoji: { fontSize: 28 },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  sheetLabel: { color: theme.text, fontSize: 16 },
});
