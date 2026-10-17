import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { archiveStats, clearArchive } from '../tg/archive';
import { logout } from '../tg/client';
import { clearStatusHistory } from '../tg/status';
import {
  setFullGhost,
  setSetting,
  useSettings,
  type GhostSettings,
} from '../tg/settings';
import { theme } from '../ui/theme';

export default function Settings() {
  const s = useSettings();
  const [stats, setStats] = useState({ total: 0, deleted: 0, edits: 0 });

  useEffect(() => {
    archiveStats().then(setStats);
  }, []);

  const fullGhost = s.noReadReceipts && s.noOnline && s.noTyping;

  async function doLogout() {
    Alert.alert('Вийти з акаунта?', 'Сесію буде видалено з цього пристрою.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Вийти',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  async function doClear() {
    Alert.alert('Очистити архів?', 'Видалені та відредаговані повідомлення буде стерто.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Очистити',
        style: 'destructive',
        onPress: async () => {
          await clearArchive();
          clearStatusHistory();
          setStats({ total: 0, deleted: 0, edits: 0 });
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Section title="НЕВИДИМІСТЬ">
        <Row
          label="Повний невидимий режим"
          hint="Вмикає всі три налаштування нижче одним перемикачем"
          value={fullGhost}
          onChange={setFullGhost}
          highlight
        />
        <Toggle k="noReadReceipts" label="Не надсилати «прочитано»" hint="Читайте, не позначаючи прочитаним. Кнопка 👁 у чаті позначає вручну." s={s} />
        <Toggle k="noOnline" label="Приховувати «онлайн»" hint="Завжди показувати офлайн" s={s} />
        <Toggle k="noTyping" label="Не показувати «друкує…»" s={s} />
      </Section>

      <Section title="ВІДПРАВЛЕННЯ">
        <Toggle
          k="sendScheduled"
          label="Надсилати відкладено"
          hint="Повідомлення йде через сервер із затримкою 12с, щоб не засвітити «онлайн»"
          s={s}
        />
        <Toggle k="readOnSend" label="Позначати прочитаним після відповіді" s={s} />
      </Section>

      <Section title="АРХІВ">
        <Toggle k="saveDeleted" label="Зберігати видалені повідомлення" s={s} />
        <Toggle k="saveEdits" label="Зберігати історію редагувань" s={s} />
        <Toggle
          k="showDeletedInChat"
          label="Показувати видалені в чаті"
          hint="Інакше вони доступні лише в журналі видалених"
          s={s}
        />
      </Section>

      <Section title="СТАТИСТИКА">
        <View style={styles.statsRow}>
          <Stat label="Повідомлень" value={stats.total} />
          <Stat label="Видалених" value={stats.deleted} />
          <Stat label="Редагувань" value={stats.edits} />
        </View>
      </Section>

      <Pressable style={styles.action} onPress={doClear}>
        <Text style={styles.actionText}>Очистити архів</Text>
      </Pressable>
      <Pressable style={[styles.action, styles.danger]} onPress={doLogout}>
        <Text style={[styles.actionText, { color: theme.danger }]}>Вийти з акаунта</Text>
      </Pressable>

      <Text style={styles.footer}>
        Неофіційний клієнт Telegram. Фічі невидимості порушують правила Telegram для сторонніх
        клієнтів — використовуйте на власний ризик.
      </Text>
    </ScrollView>
  );
}

function Toggle({
  k,
  label,
  hint,
  s,
}: {
  k: keyof GhostSettings;
  label: string;
  hint?: string;
  s: GhostSettings;
}) {
  return <Row label={label} hint={hint} value={s[k]} onChange={(v) => setSetting(k, v)} />;
}

function Row({
  label,
  hint,
  value,
  onChange,
  highlight,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.rowLabel, highlight && { color: theme.accentGhost, fontWeight: '700' }]}>
          {label}
        </Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: highlight ? theme.accentGhost : theme.accent, false: theme.textFaint }}
        thumbColor="#fff"
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  section: { marginTop: 22 },
  sectionTitle: { color: theme.textDim, fontSize: 12, fontWeight: '700', marginLeft: 20, marginBottom: 8 },
  sectionBody: { backgroundColor: theme.card, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.separator,
  },
  rowLabel: { color: theme.text, fontSize: 15 },
  rowHint: { color: theme.textDim, fontSize: 12, marginTop: 3, lineHeight: 17 },
  statsRow: { flexDirection: 'row', paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: theme.accent, fontSize: 24, fontWeight: '800' },
  statLabel: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  action: {
    backgroundColor: theme.card,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  danger: { marginTop: 8 },
  actionText: { color: theme.accent, fontSize: 15, fontWeight: '600' },
  footer: { color: theme.textFaint, fontSize: 12, lineHeight: 18, marginHorizontal: 20, marginTop: 24 },
});
