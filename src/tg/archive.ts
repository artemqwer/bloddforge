import * as SQLite from 'expo-sqlite';

import { getSettings } from './settings';

/** A message as kept locally. `peer` is the marked peer id (user > 0, chat < 0, channel -100…). */
export type StoredMessage = {
  peer: string;
  id: number;
  is_channel: number;
  chat_title: string | null;
  sender_id: string | null;
  sender_name: string | null;
  out: number;
  text: string;
  media: string | null;
  date: number;
  edit_date: number | null;
  reply_to: number | null;
  deleted: number;
  deleted_at: number | null;
  photo: string | null;
};

export type EditRecord = { text: string; date: number };

const db = SQLite.openDatabaseSync('ayu-archive.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS messages (
    peer TEXT NOT NULL,
    id INTEGER NOT NULL,
    is_channel INTEGER NOT NULL DEFAULT 0,
    chat_title TEXT,
    sender_id TEXT,
    sender_name TEXT,
    out INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT '',
    media TEXT,
    date INTEGER NOT NULL,
    edit_date INTEGER,
    reply_to INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    photo TEXT,
    PRIMARY KEY (peer, id)
  );
  CREATE INDEX IF NOT EXISTS messages_deleted ON messages (deleted, deleted_at);
  CREATE INDEX IF NOT EXISTS messages_id ON messages (id);
  CREATE TABLE IF NOT EXISTS edits (
    peer TEXT NOT NULL,
    id INTEGER NOT NULL,
    text TEXT NOT NULL,
    date INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS edits_msg ON edits (peer, id);
`);

export type NewStoredMessage = Omit<StoredMessage, 'deleted' | 'deleted_at' | 'photo'>;

/**
 * Upserts messages. When the stored text differs from the incoming one, the old
 * text goes into the edit history. Returns the rows whose text changed.
 */
export async function saveMessages(rows: NewStoredMessage[]): Promise<NewStoredMessage[]> {
  const changed: NewStoredMessage[] = [];
  if (!rows.length) return changed;
  const { saveEdits } = getSettings();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const prev = await db.getFirstAsync<{ text: string; date: number; edit_date: number | null }>(
        'SELECT text, date, edit_date FROM messages WHERE peer = ? AND id = ?',
        row.peer,
        row.id,
      );
      if (prev && prev.text !== row.text) {
        changed.push(row);
        if (saveEdits) {
          await db.runAsync(
            'INSERT INTO edits (peer, id, text, date) VALUES (?, ?, ?, ?)',
            row.peer,
            row.id,
            prev.text,
            prev.edit_date ?? prev.date,
          );
        }
      }
      await db.runAsync(
        `INSERT INTO messages (peer, id, is_channel, chat_title, sender_id, sender_name, out, text, media, date, edit_date, reply_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (peer, id) DO UPDATE SET
           chat_title = COALESCE(excluded.chat_title, chat_title),
           sender_name = COALESCE(excluded.sender_name, sender_name),
           text = excluded.text,
           media = excluded.media,
           edit_date = excluded.edit_date`,
        row.peer,
        row.id,
        row.is_channel,
        row.chat_title,
        row.sender_id,
        row.sender_name,
        row.out,
        row.text,
        row.media,
        row.date,
        row.edit_date,
        row.reply_to,
      );
    }
  });
  return changed;
}

/**
 * Flags messages as deleted. For private chats and basic groups Telegram only
 * sends message ids (they're unique per account), so `peer` is null there.
 * Returns the affected messages.
 */
export async function markDeleted(ids: number[], peer: string | null): Promise<StoredMessage[]> {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const where = peer
    ? `peer = ? AND id IN (${marks})`
    : `is_channel = 0 AND id IN (${marks})`;
  const params = peer ? [peer, ...ids] : ids;
  const rows = await db.getAllAsync<StoredMessage>(
    `SELECT * FROM messages WHERE deleted = 0 AND ${where}`,
    ...params,
  );
  if (!rows.length) return rows;
  if (getSettings().saveDeleted) {
    const now = Math.floor(Date.now() / 1000);
    await db.runAsync(`UPDATE messages SET deleted = 1, deleted_at = ? WHERE ${where}`, now, ...params);
    return rows.map((r) => ({ ...r, deleted: 1, deleted_at: now }));
  }
  await db.runAsync(`DELETE FROM messages WHERE ${where}`, ...params);
  return rows;
}

/** Deleted messages of one chat with ids in [minId, maxId]. */
export function getDeletedInRange(peer: string, minId: number, maxId: number) {
  return db.getAllAsync<StoredMessage>(
    'SELECT * FROM messages WHERE peer = ? AND deleted = 1 AND id BETWEEN ? AND ? ORDER BY id DESC',
    peer,
    minId,
    maxId,
  );
}

export function getDeletedLog(limit = 300) {
  return db.getAllAsync<StoredMessage>(
    'SELECT * FROM messages WHERE deleted = 1 ORDER BY deleted_at DESC LIMIT ?',
    limit,
  );
}

/** Everything kept for a chat — used when the chat can't be loaded from the server. */
export function getStoredForPeer(peer: string, limit = 200) {
  return db.getAllAsync<StoredMessage>(
    'SELECT * FROM messages WHERE peer = ? ORDER BY id DESC LIMIT ?',
    peer,
    limit,
  );
}

export function getEdits(peer: string, id: number) {
  return db.getAllAsync<EditRecord>(
    'SELECT text, date FROM edits WHERE peer = ? AND id = ? ORDER BY date ASC',
    peer,
    id,
  );
}

export async function getEditedIds(peer: string, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db.getAllAsync<{ id: number }>(
    `SELECT DISTINCT id FROM edits WHERE peer = ? AND id IN (${ids.map(() => '?').join(',')})`,
    peer,
    ...ids,
  );
  return new Set(rows.map((r) => r.id));
}

export async function getPhoto(peer: string, id: number) {
  const row = await db.getFirstAsync<{ photo: string | null }>(
    'SELECT photo FROM messages WHERE peer = ? AND id = ?',
    peer,
    id,
  );
  return row?.photo ?? null;
}

export function setPhoto(peer: string, id: number, dataUri: string) {
  return db.runAsync('UPDATE messages SET photo = ? WHERE peer = ? AND id = ?', dataUri, peer, id);
}

export async function archiveStats() {
  const row = await db.getFirstAsync<{ total: number; deleted: number; edits: number }>(
    `SELECT
       (SELECT COUNT(*) FROM messages) AS total,
       (SELECT COUNT(*) FROM messages WHERE deleted = 1) AS deleted,
       (SELECT COUNT(*) FROM edits) AS edits`,
  );
  return row ?? { total: 0, deleted: 0, edits: 0 };
}

export async function clearArchive() {
  await db.execAsync('DELETE FROM messages; DELETE FROM edits;');
}

/** Removes messages you deleted yourself, so they don't show up as "deleted by someone". */
export async function forgetMessages(peer: string, ids: number[]) {
  if (!ids.length) return;
  await db.runAsync(
    `DELETE FROM messages WHERE peer = ? AND id IN (${ids.map(() => '?').join(',')})`,
    peer,
    ...ids,
  );
}
