import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { loadCommonChats, loadProfile, type CommonChat, type Profile } from '../../tg/people';
import { describeStatus, getStatusLog, onStatusEvent, type StatusInfo } from '../../tg/status';
import { Avatar } from '../../ui/Avatar';
import { formatDay } from '../../ui/format';
import { theme } from '../../ui/theme';

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ peer: string; title?: string }>();
  const peer = params.peer!;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [common, setCommon] = useState<CommonChat[]>([]);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile(peer)
      .then((p) => {
        setProfile(p);
        setStatus(p.status);
        if (p.commonChatsCount > 0) loadCommonChats(peer).then(setCommon).catch(() => {});
      })
      .catch((e) => setError(String(e?.message ?? e)));
    return onStatusEvent((userId, info) => {
      if (userId === peer) setStatus(info);
    });
  }, [peer]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!profile) return <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />;

  const d = describeStatus(status);
  const log = getStatusLog(peer, 20);

  function copy(label: string, value: string) {
    Clipboard.setStringAsync(value);
    Alert.alert('Скопійовано', label);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.head}>
        <View>
          <Avatar name={profile.name} seed={profile.id} size={96} />
          {d.online && <View style={styles.dot} />}
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={[styles.status, d.online && { color: theme.ok }]}>{d.label}</Text>
      </View>

      <View style={styles.card}>
        {profile.username && (
          <Field
            label="Ім'я користувача"
            value={`@${profile.username}`}
            onPress={() => copy('@' + profile.username, '@' + profile.username)}
          />
        )}
        {profile.phone && (
          <Field label="Телефон" value={`+${profile.phone}`} onPress={() => copy('Телефон', '+' + profile.phone)} />
        )}
        {profile.bio && <Field label="Про себе" value={profile.bio} />}
        <Field label="Тип" value={profile.isBot ? 'Бот' : profile.isContact ? 'Контакт' : 'Користувач'} />
      </View>

      <Pressable
        style={styles.openChat}
        onPress={() => router.push({ pathname: '/chat/[peer]', params: { peer, title: profile.name } })}
      >
        <Text style={styles.openChatText}>💬 Відкрити чат</Text>
      </Pressable>

      {common.length > 0 && (
        <Section title={`СПІЛЬНІ ГРУПИ (${profile.commonChatsCount})`}>
          {common.map((c) => (
            <Pressable
              key={c.id}
              style={styles.commonRow}
              onPress={() =>
                router.push({
                  pathname: '/chat/[peer]',
                  params: { peer: c.isChannel ? `-100${c.id}` : `-${c.id}`, title: c.title },
                })
              }
            >
              <Avatar name={c.title} seed={c.id} size={38} />
              <Text style={styles.commonTitle} numberOfLines={1}>
                {c.isChannel ? '📢 ' : ''}
                {c.title}
              </Text>
            </Pressable>
          ))}
        </Section>
      )}

      {log.length > 0 && (
        <Section title="ІСТОРІЯ АКТИВНОСТІ">
          {log.map((e, i) => (
            <View key={i} style={styles.logRow}>
              <Text style={[styles.logState, e.state === 'online' && { color: theme.ok }]}>
                {describeStatus({ state: e.state, at: null }).label}
              </Text>
              <Text style={styles.logTime}>{formatDay(e.at)}</Text>
            </View>
          ))}
          <Text style={styles.logHint}>
            Записується, поки застосунок відкритий і Telegram показує статус цієї людини.
          </Text>
        </Section>
      )}
    </ScrollView>
  );
}

function Field({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.field} onPress={onPress} disabled={!onPress}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  head: { alignItems: 'center', paddingVertical: 24 },
  name: { color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 14 },
  status: { color: theme.textDim, fontSize: 14, marginTop: 4 },
  dot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.ok,
    borderWidth: 3,
    borderColor: theme.bg,
  },
  card: { backgroundColor: theme.card, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  field: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  fieldLabel: { color: theme.accent, fontSize: 12 },
  fieldValue: { color: theme.text, fontSize: 15, marginTop: 3 },
  openChat: {
    backgroundColor: theme.card,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openChatText: { color: theme.accent, fontSize: 15, fontWeight: '600' },
  section: { marginTop: 22 },
  sectionTitle: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginLeft: 20, marginBottom: 8 },
  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  commonTitle: { color: theme.text, fontSize: 15, flex: 1 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  logState: { color: theme.textDim, fontSize: 14 },
  logTime: { color: theme.textFaint, fontSize: 13 },
  logHint: { color: theme.textFaint, fontSize: 12, padding: 14, lineHeight: 17 },
  error: { color: theme.danger, textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
});
