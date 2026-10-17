import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getEdits } from '../../tg/archive';
import { markRead, onChatEvent, sendText, sendTyping } from '../../tg/client';
import { mediaLabel } from '../../tg/convert';
import { entityFor } from '../../tg/dialogs';
import { fromNewExport as fromNew, loadHistory, loadPhoto, type ChatMessage } from '../../tg/history';
import { useSettings } from '../../tg/settings';
import { dateSeparator, formatTime, sameDay } from '../../ui/format';
import { Glass } from '../../ui/Glass';
import { theme } from '../../ui/theme';

type Row =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'day'; date: number; key: string };

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
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      out.push({ kind: 'msg', msg: m });
      const next = messages[i + 1];
      // Messages are newest-first; a day label goes after the last msg of a day.
      if (!next || !sameDay(m.date, next.date)) {
        out.push({ kind: 'day', date: m.date, key: `day-${m.id}` });
      }
    }
    return out;
  }, [messages]);

  async function doSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const entity = entityFor(peer);
      await sendText(entity, body);
    } catch (err: any) {
      Alert.alert('Не вдалося надіслати', String(err?.message ?? err));
      setText(body);
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
              <Bubble peer={peer} msg={item.msg} showDeleted={settings.showDeletedInChat} />
            )
          }
          ListFooterComponent={
            !done ? <ActivityIndicator color={theme.textFaint} style={{ marginVertical: 16 }} /> : undefined
          }
          contentContainerStyle={{ paddingVertical: 10 }}
        />
      )}

      <Glass style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder="Повідомлення…"
          placeholderTextColor={theme.textFaint}
          multiline
        />
        <Pressable style={styles.send} onPress={doSend} disabled={sending}>
          <Text style={styles.sendIcon}>{sending ? '…' : '➤'}</Text>
        </Pressable>
      </Glass>
    </KeyboardAvoidingView>
  );
}

function Bubble({ peer, msg, showDeleted }: { peer: string; msg: ChatMessage; showDeleted: boolean }) {
  const out = msg.out === 1;
  const isDeleted = msg.deleted === 1;
  const isService = msg.media?.startsWith('service:');
  const [photo, setPhoto] = useState<string | null>(msg.photo);

  useEffect(() => {
    if (msg.media === 'photo' && !photo) {
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

  async function showHistory() {
    const edits = await getEdits(peer, msg.id);
    const body = [
      ...edits.map((e, i) => `${i + 1}. [${formatTime(e.date)}] ${e.text || '(без тексту)'}`),
      `${edits.length + 1}. [${formatTime(msg.edit_date ?? msg.date)}] ${msg.text || '(без тексту)'} ← поточна`,
    ].join('\n\n');
    Alert.alert('Історія редагувань', body || 'Немає збережених версій.');
  }

  return (
    <Pressable
      onLongPress={msg.has_edits ? showHistory : undefined}
      style={[
        styles.bubble,
        out ? styles.bubbleOut : styles.bubbleIn,
        isDeleted && styles.bubbleDeleted,
      ]}
    >
      {!out && msg.sender_name && msg.is_channel === 0 && (
        <Text style={styles.sender}>{msg.sender_name}</Text>
      )}
      {isDeleted && <Text style={styles.deletedTag}>🗑 Видалено</Text>}
      {photo && <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />}
      {media && !photo ? <Text style={styles.media}>{media}</Text> : null}
      {msg.text ? <Text style={styles.text}>{msg.text}</Text> : null}
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
  bubbleDeleted: {
    backgroundColor: theme.deleted,
    borderWidth: 1,
    borderColor: theme.deletedBorder,
  },
  sender: { color: theme.accent, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  deletedTag: { color: theme.deletedBorder, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  text: { color: theme.text, fontSize: 15, lineHeight: 20 },
  media: { color: theme.text, fontSize: 15, fontStyle: 'italic', marginBottom: 2 },
  photo: { width: 220, height: 220, borderRadius: 10, marginBottom: 4, backgroundColor: theme.bgInput },
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.glassBorder,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
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
});
