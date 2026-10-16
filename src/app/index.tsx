import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { resume } from '../tg/client';
import { loadSettings } from '../tg/settings';
import { theme } from '../ui/theme';

export default function Index() {
  const [status, setStatus] = useState('Підключення…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSettings();
      try {
        const ok = await resume();
        if (cancelled) return;
        router.replace(ok ? '/chats' : '/login');
      } catch {
        if (cancelled) return;
        setStatus('Не вдалось підключитися. Відкриваю вхід…');
        setTimeout(() => router.replace('/login'), 1200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>AyuGram</Text>
      <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  logo: { color: theme.accent, fontSize: 34, fontWeight: '800', letterSpacing: 0.5 },
  status: { color: theme.textDim, fontSize: 14 },
});
