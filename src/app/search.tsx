import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  searchMessages,
  searchPeople,
  type GlobalMessageHit,
  type SearchHit,
} from '../tg/people';
import { Avatar } from '../ui/Avatar';
import { formatDay } from '../ui/format';
import { theme } from '../ui/theme';

type Item =
  | { kind: 'header'; title: string }
  | { kind: 'person'; hit: SearchHit }
  | { kind: 'message'; hit: GlobalMessageHit };

export default function Search() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    // Debounce so we don't hit the API on every keystroke.
    timer.current = setTimeout(async () => {
      try {
        const [people, messages] = await Promise.all([
          searchPeople(query).catch(() => []),
          searchMessages(query).catch(() => []),
        ]);
        const next: Item[] = [];
        if (people.length) {
          next.push({ kind: 'header', title: 'Чати та люди' });
          people.forEach((hit) => next.push({ kind: 'person', hit }));
        }
        if (messages.length) {
          next.push({ kind: 'header', title: 'Повідомлення' });
          messages.forEach((hit) => next.push({ kind: 'message', hit }));
        }
        setItems(next);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.searchBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук людей і повідомлень…"
          placeholderTextColor={theme.textFaint}
          autoFocus
          autoCorrect={false}
        />
        {busy && <ActivityIndicator color={theme.accent} />}
      </View>

      <FlatList
        data={items}
        keyExtractor={(it, i) =>
          it.kind === 'header'
            ? `h${i}`
            : it.kind === 'person'
              ? `p${it.hit.peer}`
              : `m${it.hit.peer}:${it.hit.id}`
        }
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === 'header') return <Text style={styles.sectionHeader}>{item.title}</Text>;
          if (item.kind === 'person') {
            const icon =
              item.hit.kind === 'channel' ? '📢 ' : item.hit.kind === 'bot' ? '🤖 ' : '';
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  item.hit.kind === 'user' || item.hit.kind === 'bot'
                    ? router.push({ pathname: '/profile/[peer]', params: { peer: item.hit.peer, title: item.hit.title } })
                    : router.push({ pathname: '/chat/[peer]', params: { peer: item.hit.peer, title: item.hit.title } })
                }
              >
                <Avatar name={item.hit.title} seed={item.hit.peer} size={44} />
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={1}>
                    {icon}
                    {item.hit.title}
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {item.hit.subtitle}
                  </Text>
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/chat/[peer]',
                  params: { peer: item.hit.peer, title: item.hit.chatTitle },
                })
              }
            >
              <Avatar name={item.hit.chatTitle} seed={item.hit.peer} size={44} />
              <View style={styles.body}>
                <View style={styles.msgTop}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.hit.chatTitle}
                  </Text>
                  <Text style={styles.date}>{formatDay(item.hit.date)}</Text>
                </View>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {item.hit.text}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          query.trim() && !busy ? <Text style={styles.empty}>Нічого не знайдено</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  back: { color: theme.accent, fontSize: 32, lineHeight: 32, marginTop: -3 },
  input: {
    flex: 1,
    backgroundColor: theme.bgInput,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sectionHeader: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  body: { flex: 1 },
  msgTop: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  subtitle: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  date: { color: theme.textFaint, fontSize: 12 },
  empty: { color: theme.textDim, textAlign: 'center', marginTop: 40 },
});
