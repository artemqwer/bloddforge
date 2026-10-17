import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadContacts, type Contact } from '../../tg/people';
import { describeStatus, onStatusEvent, type StatusInfo } from '../../tg/status';
import { Avatar } from '../../ui/Avatar';
import { theme } from '../../ui/theme';

export default function Contacts() {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts()
      .then((list) => {
        setContacts(list);
        setStatuses(Object.fromEntries(list.map((c) => [c.id, c.status])));
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
    // Live updates as status events arrive.
    return onStatusEvent((userId, info) => {
      setStatuses((prev) => ({ ...prev, [userId]: info }));
    });
  }, []);

  const online = contacts.filter((c) => statuses[c.id]?.state === 'online').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.screenTitle}>Контакти</Text>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            <Text style={styles.header}>
              {contacts.length} контактів{online ? ` · ${online} онлайн` : ''}
            </Text>
          }
      renderItem={({ item }) => {
        const info = statuses[item.id] ?? item.status;
        const d = describeStatus(info);
        return (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({ pathname: '/profile/[peer]', params: { peer: item.id, title: item.name } })
            }
          >
            <View>
              <Avatar name={item.name} seed={item.id} size={46} />
              {d.online && <View style={styles.dot} />}
            </View>
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.status, d.online && { color: theme.ok }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          </Pressable>
        );
      }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          removeClippedSubviews
          initialNumToRender={14}
          maxToRenderPerBatch={12}
          windowSize={9}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  screenTitle: { color: theme.text, fontSize: 24, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 10 },
  header: { color: theme.textDim, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 12 },
  body: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '600' },
  status: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.ok,
    borderWidth: 2,
    borderColor: theme.bg,
  },
  error: { color: theme.danger, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
});
