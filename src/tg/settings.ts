import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type GhostSettings = {
  /** Never send read receipts; chats are marked read only by the eye button. */
  noReadReceipts: boolean;
  /** Never report "online"; push an offline status after every action. */
  noOnline: boolean;
  /** Never send "typing…". */
  noTyping: boolean;
  /** Send messages as scheduled +12s so the server doesn't flip us online. */
  sendScheduled: boolean;
  /** Mark the chat read after you send a message into it. */
  readOnSend: boolean;
  /** Keep messages other people delete. */
  saveDeleted: boolean;
  /** Keep every previous version of edited messages. */
  saveEdits: boolean;
  /** Show kept deleted messages inside chats (otherwise only in the log). */
  showDeletedInChat: boolean;
};

const KEY = 'ghost-settings';

const defaults: GhostSettings = {
  noReadReceipts: true,
  noOnline: true,
  noTyping: true,
  sendScheduled: false,
  readOnSend: false,
  saveDeleted: true,
  saveEdits: true,
  showDeletedInChat: true,
};

let current: GhostSettings = defaults;
const listeners = new Set<() => void>();

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...defaults, ...JSON.parse(raw) };
  } catch {
    current = defaults;
  }
  listeners.forEach((l) => l());
}

export function getSettings() {
  return current;
}

export function setSetting<K extends keyof GhostSettings>(key: K, value: GhostSettings[K]) {
  current = { ...current, [key]: value };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

export function isFullGhost(s: GhostSettings) {
  return s.noReadReceipts && s.noOnline && s.noTyping;
}

export function setFullGhost(on: boolean) {
  current = { ...current, noReadReceipts: on, noOnline: on, noTyping: on };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
