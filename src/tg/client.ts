import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { Api, TelegramClient } from 'telegram';
import { NewMessage, type NewMessageEvent } from 'telegram/events';
import { Raw } from 'telegram/events/Raw';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

import { markDeleted, saveMessages, type StoredMessage, type NewStoredMessage } from './archive';
import { peerKey, toStored } from './convert';
import { entities, rememberEntities } from './entities';
import { getSettings } from './settings';
import { RNWebSocket } from './socket';
import { parseStatus, recordStatus } from './status';

export type Credentials = { apiId: number; apiHash: string };

export type ChatEvent =
  | { type: 'new'; message: NewStoredMessage }
  | { type: 'edited'; message: NewStoredMessage }
  | { type: 'deleted'; messages: StoredMessage[] };

const SESSION_KEY = 'tg-session';
const CREDS_KEY = 'tg-creds';
const STATE_KEY = 'tg-updates-state';

let client: TelegramClient | null = null;
let creds: Credentials | null = null;
const listeners = new Set<(e: ChatEvent) => void>();

export function onChatEvent(listener: (e: ChatEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(e: ChatEvent) {
  listeners.forEach((l) => {
    try {
      l(e);
    } catch (err) {
      console.warn(err);
    }
  });
}

export function getClient(): TelegramClient {
  if (!client) throw new Error('Telegram client is not initialised');
  return client;
}

export function getCredentials() {
  return creds;
}

export async function loadStoredCredentials(): Promise<Credentials | null> {
  const raw = await SecureStore.getItemAsync(CREDS_KEY);
  return raw ? (JSON.parse(raw) as Credentials) : null;
}

export async function hasSession() {
  return !!(await SecureStore.getItemAsync(SESSION_KEY));
}

function createClient(c: Credentials, session: string) {
  const tg = new TelegramClient(new StringSession(session), c.apiId, c.apiHash, {
    connectionRetries: Number.MAX_SAFE_INTEGER,
    useWSS: true,
    networkSocket: RNWebSocket as any,
    deviceModel: 'iPhone',
    systemVersion: 'iOS',
    appVersion: 'AyuGram iOS 1.0',
    langCode: 'uk',
    systemLangCode: 'uk',
  });
  tg.setLogLevel(LogLevel.ERROR);
  return tg;
}

/** Creates a client for logging in. The session is saved once login succeeds. */
export async function prepareLogin(c: Credentials) {
  await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify(c));
  creds = c;
  if (client) await client.disconnect().catch(() => {});
  client = createClient(c, '');
  await client.connect();
  return client;
}

export async function persistSession() {
  const session = (getClient().session as StringSession).save();
  await SecureStore.setItemAsync(SESSION_KEY, session);
}

/** Restores the saved session. Returns false when the user has to log in again. */
export async function resume(): Promise<boolean> {
  const [c, session] = await Promise.all([
    loadStoredCredentials(),
    SecureStore.getItemAsync(SESSION_KEY),
  ]);
  if (!c || !session) return false;
  creds = c;
  client = createClient(c, session);
  await client.connect();
  if (!(await client.checkAuthorization())) return false;
  await startServices();
  return true;
}

export async function logout() {
  try {
    await client?.invoke(new Api.auth.LogOut());
  } catch {
    // Session may already be dead; wipe it locally anyway.
  }
  await client?.disconnect().catch(() => {});
  client = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await AsyncStorage.removeItem(STATE_KEY);
}

// ---------------------------------------------------------------------------
// Ghost mode

/** Tells Telegram we're offline. Called after anything that might flip us online. */
export async function goOffline() {
  if (!client || !getSettings().noOnline) return;
  try {
    await client.invoke(new Api.account.UpdateStatus({ offline: true }));
  } catch {
    // Not critical.
  }
}

export async function goOnline() {
  if (!client || getSettings().noOnline) return;
  try {
    await client.invoke(new Api.account.UpdateStatus({ offline: false }));
  } catch {
    // Not critical.
  }
}

/** Sends the read receipt for a chat. Ghost mode only skips the automatic one. */
export async function markRead(entity: any) {
  await getClient().markAsRead(entity);
  await goOffline();
}

let lastTyping = 0;
export async function sendTyping(entity: any) {
  if (getSettings().noTyping) return;
  const now = Date.now();
  if (now - lastTyping < 5000) return;
  lastTyping = now;
  try {
    await getClient().invoke(
      new Api.messages.SetTyping({ peer: entity, action: new Api.SendMessageTypingAction() }),
    );
  } catch {
    // Not critical.
  }
}

export async function sendText(entity: any, text: string, replyTo?: number) {
  const s = getSettings();
  const tg = getClient();
  const msg = await tg.sendMessage(entity, {
    message: text,
    replyTo,
    // A scheduled message is delivered by the server, so we never appear online.
    schedule: s.sendScheduled ? Math.floor(Date.now() / 1000) + 12 : undefined,
  });
  if (s.readOnSend) await tg.markAsRead(entity).catch(() => {});
  await goOffline();
  return msg;
}

// ---------------------------------------------------------------------------
// Update handling: archive everything we see, catch deletions and edits.

async function storeAndEmit(msgs: (Api.Message | Api.MessageService)[], kind: 'new' | 'edited') {
  const rows = msgs.map(toStored).filter((r): r is NewStoredMessage => !!r);
  if (!rows.length) return;
  const changed = await saveMessages(rows);
  if (kind === 'new') {
    rows.forEach((message) => emit({ type: 'new', message }));
  } else {
    // Edits that only touch reactions/views keep the same text; skip those.
    changed.forEach((message) => emit({ type: 'edited', message }));
  }
}

async function handleDeleted(ids: number[], peer: string | null) {
  const rows = await markDeleted(ids, peer);
  if (rows.length) emit({ type: 'deleted', messages: rows });
}

async function handleUpdate(update: Api.TypeUpdate) {
  if (update instanceof Api.UpdateUserStatus) {
    recordStatus(update.userId.toString(), parseStatus(update.status));
    return;
  }
  if (update instanceof Api.UpdateDeleteMessages) {
    await handleDeleted(update.messages, null);
  } else if (update instanceof Api.UpdateDeleteChannelMessages) {
    await handleDeleted(update.messages, peerKey(new Api.PeerChannel({ channelId: update.channelId })));
  } else if (update instanceof Api.UpdateEditMessage || update instanceof Api.UpdateEditChannelMessage) {
    await storeAndEmit([update.message as Api.Message], 'edited');
  }
}

async function onNewMessage(event: NewMessageEvent) {
  const msg = event.message;
  if ((msg as any)._sender) rememberEntities([(msg as any)._sender]);
  await storeAndEmit([msg], 'new');
}

async function onRaw(update: Api.TypeUpdate) {
  try {
    await handleUpdate(update);
  } catch (err) {
    console.warn('update failed', err);
  }
}

type SavedState = { pts: number; qts: number; date: number };

async function saveState(state?: SavedState) {
  try {
    const s = state ?? (await getClient().invoke(new Api.updates.GetState()));
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ pts: s.pts, qts: s.qts, date: s.date }));
  } catch {
    // Try again next time.
  }
}

/**
 * GramJS doesn't recover updates missed while the app was closed. Ask the server
 * for the difference since last time so deletions and edits that happened while
 * we were away still land in the archive (private chats and basic groups).
 */
async function catchUp() {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (!raw) return;
  let state = JSON.parse(raw) as SavedState;
  const tg = getClient();
  for (let i = 0; i < 20; i++) {
    const diff = await tg.invoke(new Api.updates.GetDifference(state));
    if (diff instanceof Api.updates.DifferenceEmpty) return;
    if (diff instanceof Api.updates.DifferenceTooLong) {
      state = { ...state, pts: diff.pts };
      continue;
    }
    rememberEntities([...diff.users, ...diff.chats]);
    await storeAndEmit(diff.newMessages as Api.Message[], 'new');
    for (const u of diff.otherUpdates) await onRaw(u);
    const next = diff instanceof Api.updates.DifferenceSlice ? diff.intermediateState : diff.state;
    state = { pts: next.pts, qts: next.qts, date: next.date };
    await saveState(state);
    if (diff instanceof Api.updates.Difference) return;
  }
}

let servicesStarted = false;
let stateTimer: ReturnType<typeof setInterval> | undefined;

export async function startServices() {
  const tg = getClient();
  if (!servicesStarted) {
    servicesStarted = true;
    AppState.addEventListener('change', (s) => {
      if (s === 'active') goOffline();
      else saveState();
    });
  }
  tg.addEventHandler(onNewMessage, new NewMessage({}));
  tg.addEventHandler(onRaw, new Raw({}));
  await goOffline();
  try {
    await catchUp();
  } catch (err) {
    console.warn('catch-up failed', err);
  }
  await saveState();
  clearInterval(stateTimer);
  stateTimer = setInterval(() => saveState(), 60_000);
}

export { entities };
