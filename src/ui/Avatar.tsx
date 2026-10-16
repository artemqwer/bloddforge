import { StyleSheet, Text, View } from 'react-native';

import { avatarColor, initials } from './theme';

export function Avatar({ name, seed, size = 52 }: { name: string; seed: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(seed) },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '600' },
});
