import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onChatEvent } from '../../tg/client';
import { loadDialogs, previewOf, type DialogItem } from '../../tg/dialogs';
import { inFolder, loadFolders, type Folder } from '../../tg/folders';
import { isFullGhost, useSettings } from '../../tg/settings';
import { Avatar } from '../../ui/Avatar';
import { formatDay } from '../../ui/format';
import { theme } from '../../ui/theme';

export default function Chats() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [dialogs, setDialogs] = useState<DialogItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<number>(-1); // -1 = All chats
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [items, f] = await Promise.all([loadDialogs(), loadFolders()]);
      setDialogs(items);
      setFolders(f);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const visibleDialogs = useMemo(() => {
    if (activeFolder < 0) return dialogs;
    const folder = folders.find((f) => f.id === activeFolder);
    return folder ? dialogs.filter((d) => inFolder(folder, d)) : dialogs;
  }, [dialogs, folders, activeFolder]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Live updates: bump a chat's preview / unread when something happens.
    return onChatEvent((e) => {
      if (e.type === 'new') {
        setDialogs((prev) => {
          const peer = e.message.peer;
          const idx = prev.findIndex((d) => d.peer === peer);
          if (idx < 0) {
            refresh();
            return prev;
          }
          const d = { ...prev[idx] };
          d.preview = previewOf(e.message);
          d.previewOut = !!e.message.out;
          d.date = e.message.date;
          if (!e.message.out) d.unread += 1;
          const next = [d, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
          return next;
        });
      }
    });
  }, [refresh]);

  const ghost = isFullGhost(settings);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>AyuGram</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/search')} hitSlop={10}>
            <Text style={styles.headerIcon}>🔍</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/deleted')} hitSlop={10}>
            <Text style={styles.headerIcon}>🗑</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.ghostBar, { backgroundColor: ghost ? theme.accentGhost : theme.bgInput }]}>
        <Text style={styles.ghostText}>
          {ghost ? '👻 Невидимий режим увімкнено' : '⚠️ Невидимий режим частково вимкнено'}
        </Text>
      </View>

      {folders.length > 0 && (
        <View style={styles.folderStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
            <FolderTab label="Усі чати" active={activeFolder < 0} onPress={() => setActiveFolder(-1)} />
            {folders.map((f) => (
              <FolderTab
                key={f.id}
                label={f.title}
                active={activeFolder === f.id}
                onPress={() => setActiveFolder(f.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visibleDialogs}
          keyExtractor={(d) => d.peer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                refresh();
              }}
              tintColor={theme.accent}
            />
          }
          renderItem={({ item }) => <Row item={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={9}
        />
      )}
    </View>
  );
}

function FolderTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.folderTab}>
      <Text style={[styles.folderText, active && styles.folderTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {active && <View style={styles.folderUnderline} />}
    </Pressable>
  );
}

const Row = memo(function Row({ item }: { item: DialogItem }) {
  const icon =
    item.kind === 'channel' ? '📢 ' : item.kind === 'bot' ? '🤖 ' : item.kind === 'self' ? '📝 ' : '';
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/chat/[peer]', params: { peer: item.peer, title: item.title } })}
    >
      <Avatar name={item.title} seed={item.peer} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {icon}
            {item.title}
          </Text>
          <Text style={styles.rowDate}>{item.date ? formatDay(item.date) : ''}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {item.previewOut ? 'Ви: ' : ''}
            {item.preview}
          </Text>
          {item.unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread > 999 ? '999+' : item.unread}</Text>
            </View>
          )}
          {item.pinned && item.unread === 0 && <Text style={styles.pin}>📌</Text>}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 18 },
  headerIcon: { fontSize: 20 },
  ghostBar: { paddingVertical: 6, paddingHorizontal: 16 },
  ghostText: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  folderStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  folderRow: { paddingHorizontal: 8 },
  folderTab: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  folderText: { color: theme.textDim, fontSize: 14, fontWeight: '600' },
  folderTextActive: { color: theme.accent },
  folderUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    left: 12,
    right: 12,
    backgroundColor: theme.accent,
    borderRadius: 1,
  },
  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 9, gap: 12 },
  rowBody: { flex: 1, justifyContent: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  rowDate: { color: theme.textFaint, fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  rowPreview: { color: theme.textDim, fontSize: 14, flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: theme.badge,
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pin: { fontSize: 13 },
});
