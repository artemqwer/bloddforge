import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glass } from '../../ui/Glass';
import { theme } from '../../ui/theme';

const ICONS: Record<string, string> = {
  chats: '💬',
  contacts: '👥',
  settings: '⚙️',
};
const LABELS: Record<string, string> = {
  chats: 'Чати',
  contacts: 'Контакти',
  settings: 'Налаштування',
};

function GlassTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || 10 }]} pointerEvents="box-none">
      <Glass style={styles.bar} variant="regular">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              hitSlop={6}
            >
              <Text style={[styles.icon, focused && styles.iconActive]}>{ICONS[route.name] ?? '•'}</Text>
              <Text style={[styles.label, focused && styles.labelActive]}>{LABELS[route.name] ?? route.name}</Text>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}
    >
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="contacts" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 26,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 6,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.glassBorder,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
  icon: { fontSize: 22, opacity: 0.5 },
  iconActive: { opacity: 1 },
  label: { color: theme.textFaint, fontSize: 11 },
  labelActive: { color: theme.accent, fontWeight: '700' },
});
