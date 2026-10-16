import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoginFlow } from '../tg/auth';
import { loadStoredCredentials } from '../tg/client';
import { theme } from '../ui/theme';

type Step = 'creds' | 'phone' | 'code' | 'password';

export default function Login() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('creds');
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flow = useRef<LoginFlow | null>(null);

  // Prefill saved api credentials.
  useState(() => {
    loadStoredCredentials().then((c) => {
      if (c) {
        setApiId(String(c.apiId));
        setApiHash(c.apiHash);
      }
    });
  });

  function fail(e: any) {
    setError(humanError(e));
    setBusy(false);
  }

  async function startPhone() {
    setError(null);
    const id = parseInt(apiId, 10);
    if (!id || !apiHash.trim()) {
      setError('Вкажіть api_id та api_hash з my.telegram.org');
      return;
    }
    setStep('phone');
  }

  async function submitPhone() {
    if (!phone.trim()) {
      setError('Введіть номер телефону');
      return;
    }
    setError(null);
    setBusy(true);
    const f = new LoginFlow(
      { apiId: parseInt(apiId, 10), apiHash: apiHash.trim() },
      phone.trim(),
    );
    flow.current = f;
    f.needsPassword.promise.then(() => {
      setBusy(false);
      setStep('password');
    });
    f.done
      .then(() => router.replace('/chats'))
      .catch((e) => {
        if (e?.message !== 'AUTH_USER_CANCEL') fail(e);
      });
    // Give GramJS a tick to send the code, then move to the code step.
    setTimeout(() => {
      setBusy(false);
      setStep((s) => (s === 'phone' ? 'code' : s));
    }, 1500);
  }

  function submitCode() {
    if (!code.trim()) return;
    setError(null);
    setBusy(true);
    flow.current?.submitCode(code.trim());
  }

  function submitPassword() {
    if (!password) return;
    setError(null);
    setBusy(true);
    flow.current?.submitPassword(password);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>AyuGram</Text>
        <Text style={styles.subtitle}>Невидимий клієнт Telegram</Text>

        {step === 'creds' && (
          <View style={styles.form}>
            <Text style={styles.hint}>
              Створіть застосунок на my.telegram.org → API development tools і вставте значення сюди.
            </Text>
            <Field label="api_id" value={apiId} onChangeText={setApiId} keyboardType="number-pad" />
            <Field label="api_hash" value={apiHash} onChangeText={setApiHash} autoCapitalize="none" />
            <Pressable onPress={() => Linking.openURL('https://my.telegram.org/apps')}>
              <Text style={styles.link}>Відкрити my.telegram.org</Text>
            </Pressable>
            <Primary label="Далі" onPress={startPhone} />
          </View>
        )}

        {step === 'phone' && (
          <View style={styles.form}>
            <Field
              label="Номер телефону"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+380…"
              autoFocus
            />
            <Primary label="Отримати код" onPress={submitPhone} busy={busy} />
          </View>
        )}

        {step === 'code' && (
          <View style={styles.form}>
            <Text style={styles.hint}>Код надіслано в Telegram на інші пристрої.</Text>
            <Field
              label="Код підтвердження"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
            />
            <Primary label="Увійти" onPress={submitCode} busy={busy} />
          </View>
        )}

        {step === 'password' && (
          <View style={styles.form}>
            <Text style={styles.hint}>На акаунті ввімкнено двоетапну перевірку.</Text>
            <Field
              label="Пароль (2FA)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
            />
            <Primary label="Підтвердити" onPress={submitPassword} busy={busy} />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={theme.textFaint}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

function Primary({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable style={styles.button} onPress={busy ? undefined : onPress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

function humanError(e: any): string {
  const m = String(e?.message ?? e);
  if (m.includes('PHONE_NUMBER_INVALID')) return 'Невірний номер телефону';
  if (m.includes('PHONE_CODE_INVALID')) return 'Невірний код';
  if (m.includes('PHONE_CODE_EXPIRED')) return 'Код прострочено, спробуйте ще раз';
  if (m.includes('PASSWORD_HASH_INVALID')) return 'Невірний пароль';
  if (m.includes('API_ID_INVALID')) return 'Невірні api_id / api_hash';
  if (m.includes('FLOOD_WAIT')) return 'Забагато спроб. Зачекайте і спробуйте пізніше.';
  return m;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { paddingHorizontal: 28, paddingBottom: 60, alignItems: 'center' },
  logo: { color: theme.accent, fontSize: 36, fontWeight: '800' },
  subtitle: { color: theme.textDim, marginTop: 6, marginBottom: 32 },
  form: { width: '100%', gap: 16 },
  hint: { color: theme.textDim, fontSize: 13, lineHeight: 19 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: theme.textDim, fontSize: 12, marginLeft: 2 },
  input: {
    backgroundColor: theme.bgInput,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  link: { color: theme.accent, fontSize: 14, marginTop: -4 },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: theme.danger, marginTop: 24, textAlign: 'center' },
});
