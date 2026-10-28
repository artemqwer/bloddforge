import { Buffer } from 'buffer';
import { Api } from 'telegram';

import {
  getDeletedInRange,
  getEditedIds,
  getPhoto,
  getStoredForPeer,
  saveMessages,
  setPhoto,
  type NewStoredMessage,
  type StoredMessage,
} from './archive';
import { getClient } from './client';
import { toStored } from './convert';
import { entityFor } from './dialogs';
import { rememberEntities } from './entities';

export type ChatMessage = StoredMessage & { has_edits: boolean };

export function fromNewExport(m: NewStoredMessage, hasEdits = false): ChatMessage {
  return { ...m, deleted: 0, deleted_at: null, photo: null, has_edits: hasEdits };
}
const fromNew = fromNewExport;

const PAGE = 40;

// Loaded raw messages, kept so we can download their media on demand.
const rawMessages = new Map<string, Api.Message>();
const rawKey = (peer: string, id: number) => `${peer}:${id}`;

export function rawMessage(peer: string, id: number) {
  return rawMessages.get(rawKey(peer, id));
}

/**
 * Loads one page of history (newest first, older than `offsetId`), archives it,
 * and splices back in any messages that were deleted but kept locally so they
 * stay visible in place.
 */
export async function loadHistory(
  peer: string,
  offsetId = 0,
): Promise<{ messages: ChatMessage[]; done: boolean }> {
  const entity = entityFor(peer);
  if (!entity) {
    // Chat not in the dialog list (e.g. opened from the deleted log): show the archive.
    const stored = await getStoredForPeer(peer);
    return { messages: stored.map((m) => fromNew(m, false)), done: true };
  }

  const live = await getClient().getMessages(entity, { limit: PAGE, offsetId: offsetId || undefined });
  rememberEntities(live.map((m) => (m as any)._sender).filter(Boolean));

  const rows: NewStoredMessage[] = [];
  const result: ChatMessage[] = [];
  for (const msg of live) {
    const stored = toStored(msg);
    if (!stored) continue;
    rows.push(stored);
    if (msg instanceof Api.Message) rawMessages.set(rawKey(peer, msg.id), msg);
    result.push(fromNew(stored, false));
  }
  await saveMessages(rows);

  // Mark which of these have an edit history, and pull in deleted messages
  // whose ids fall inside this page's range.
  const ids = result.map((m) => m.id);
  if (ids.length) {
    const minId = Math.min(...ids);
    const maxId = Math.max(...ids);
    const [edited, deleted] = await Promise.all([
      getEditedIds(peer, ids),
      getDeletedInRange(peer, minId, maxId),
    ]);
    for (const m of result) if (edited.has(m.id)) m.has_edits = true;
    for (const d of deleted) {
      result.push({ ...d, has_edits: false });
    }
    result.sort((a, b) => b.id - a.id);
  }

  return { messages: result, done: live.length < PAGE };
}

/** Returns the latest pinned message's text/label for a chat, or null. */
export async function loadPinned(peer: string): Promise<{ id: number; text: string } | null> {
  const entity = entityFor(peer);
  if (!entity) return null;
  try {
    const msgs = await getClient().getMessages(entity, { limit: 1, filter: new Api.InputMessagesFilterPinned() });
    const m = msgs[0];
    if (!m) return null;
    const stored = toStored(m);
    const text = stored ? stored.text || (stored.media ? stored.media.split(':')[0] : '') : '';
    return { id: m.id, text: text || 'повідомлення' };
  } catch {
    return null;
  }
}

/** Downloads a message's media to a cache file and opens the iOS share sheet. */
export async function downloadAndShare(peer: string, id: number, filename: string): Promise<void> {
  const raw = rawMessages.get(rawKey(peer, id));
  if (!raw || !raw.media) throw new Error('Медіа недоступне (відкрийте чат і прокрутіть до повідомлення)');
  const [{ File, Paths }, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);
  const buf = await getClient().downloadMedia(raw, {});
  if (!buf || typeof buf === 'string') throw new Error('Не вдалося завантажити');
  const safe = filename.replace(/[^\w.\-() ]+/g, '_') || `file_${id}`;
  const file = new File(Paths.cache, safe);
  try {
    file.delete();
  } catch {
    // Not there yet.
  }
  file.create();
  file.write(new Uint8Array(buf));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Шерінг недоступний на цьому пристрої');
  await Sharing.shareAsync(file.uri);
}

/** Downloads a photo to a data URI, caching it in the archive. */
export async function loadPhoto(peer: string, id: number): Promise<string | null> {
  const cached = await getPhoto(peer, id);
  if (cached) return cached;
  const raw = rawMessages.get(rawKey(peer, id));
  if (!raw || !raw.photo) return null;
  try {
    const buf = await getClient().downloadMedia(raw, {});
    if (!buf || typeof buf === 'string') return null;
    const base64 = Buffer.from(buf).toString('base64');
    const uri = `data:image/jpeg;base64,${base64}`;
    await setPhoto(peer, id, uri);
    return uri;
  } catch {
    return null;
  }
}
