import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDeletedLog, type StoredMessage } from '../tg/archive';
import { mediaLabel } from '../tg/convert';
import { Avatar } from '../ui/Avatar';
import { formatDay } from '../ui/format';
import { theme } from '../ui/theme';

export default function Deleted() {
  const [rows, setRows] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDeletedLog().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  if (loading) return <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />;

  if (!rows.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🗑</Text>
        <Text style={styles.emptyText}>Поки що немає збережених видалених повідомлень.</Text>
        <Text style={styles.emptyHint}>
          Повідомлення зберігаються, поки застосунок відкритий або встигає отримати оновлення.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={rows}
      keyExtractor={(m) => `${m.peer}:${m.id}`}
      renderItem={({ item }) => {
        const who = item.sender_name || item.chat_title || item.peer;
        const media = item.media && !item.media.startsWith('service') ? mediaLabel(item.media) : '';
        return (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: '/chat/[peer]',
                params: { peer: item.peer, title: item.chat_title ?? who },
              })
            }
          >
            <Avatar name={who} seed={item.sender_id ?? item.peer} size={42} />
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.who} numberOfLines={1}>
                  {who}
                </Text>
                <Text style={styles.date}>{item.deleted_at ? formatDay(item.deleted_at) : ''}</Text>
              </View>
              {item.chat_title && item.chat_title !== who && (
                <Text style={styles.chat} numberOfLines={1}>
                  у «{item.chat_title}»
                </Text>
              )}
              <Text style={styles.text} numberOfLines={3}>
                {media ? `${media} ` : ''}
                {item.text}
              </Text>
            </View>
          </Pressable>
        );
      }}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  body: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  who: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  date: { color: theme.textFaint, fontSize: 12 },
  chat: { color: theme.textDim, fontSize: 12, marginTop: 1 },
  text: { color: theme.text, fontSize: 14, marginTop: 3, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: theme.bg },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: theme.text, fontSize: 16, textAlign: 'center' },
  emptyHint: { color: theme.textDim, fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 19 },
});
