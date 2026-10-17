import * as SQLite from 'expo-sqlite';
import { Api } from 'telegram';

// Online-status tracking for contacts. Telegram broadcasts UpdateUserStatus for
// users whose privacy settings allow it; we keep the latest state plus a log of
// online/offline transitions so you can see when someone was last active.
// This only ever shows that a person is online — never who they talk to.

export type OnlineState = 'online' | 'recently' | 'within_week' | 'within_month' | 'long_ago' | 'offline' | 'hidden';

export type StatusInfo = {
  state: OnlineState;
  /** Unix seconds of the relevant moment (expires if online, wasOnline if offline). */
  at: number | null;
};

const db = SQLite.openDatabaseSync('ayu-status.db');
db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS status (
    user_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS status_log (
    user_id TEXT NOT NULL,
    state TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS status_log_user ON status_log (user_id, at DESC);
`);

export function parseStatus(status?: Api.TypeUserStatus): StatusInfo {
  if (!status || status instanceof Api.UserStatusEmpty) return { state: 'hidden', at: null };
  if (status instanceof Api.UserStatusOnline) return { state: 'online', at: status.expires };
  if (status instanceof Api.UserStatusOffline) return { state: 'offline', at: status.wasOnline };
  if (status instanceof Api.UserStatusRecently) return { state: 'recently', at: null };
  if (status instanceof Api.UserStatusLastWeek) return { state: 'within_week', at: null };
  if (status instanceof Api.UserStatusLastMonth) return { state: 'within_month', at: null };
  return { state: 'long_ago', at: null };
}

const listeners = new Set<(userId: string, info: StatusInfo) => void>();

export function onStatusEvent(l: (userId: string, info: StatusInfo) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Records a status update. Logs a transition only when the coarse state changes. */
export function recordStatus(userId: string, info: StatusInfo) {
  const now = Math.floor(Date.now() / 1000);
  const prev = db.getFirstSync<{ state: string }>('SELECT state FROM status WHERE user_id = ?', userId);
  db.runSync(
    `INSERT INTO status (user_id, state, at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET state = excluded.state, at = excluded.at, updated_at = excluded.updated_at`,
    userId,
    info.state,
    info.at,
    now,
  );
  if (!prev || prev.state !== info.state) {
    db.runSync('INSERT INTO status_log (user_id, state, at) VALUES (?, ?, ?)', userId, info.state, now);
  }
  listeners.forEach((fn) => fn(userId, info));
}

export function getStatus(userId: string): StatusInfo | null {
  const row = db.getFirstSync<{ state: OnlineState; at: number | null }>(
    'SELECT state, at FROM status WHERE user_id = ?',
    userId,
  );
  return row ? { state: row.state, at: row.at } : null;
}

export type StatusLogEntry = { state: OnlineState; at: number };

export function getStatusLog(userId: string, limit = 50) {
  return db.getAllSync<StatusLogEntry>(
    'SELECT state, at FROM status_log WHERE user_id = ? ORDER BY at DESC LIMIT ?',
    userId,
    limit,
  );
}

export function clearStatusHistory() {
  db.execSync('DELETE FROM status; DELETE FROM status_log;');
}

export function describeStatus(info: StatusInfo | null): { label: string; online: boolean } {
  if (!info) return { label: 'немає даних', online: false };
  switch (info.state) {
    case 'online':
      return { label: 'онлайн', online: true };
    case 'recently':
      return { label: 'був(ла) нещодавно', online: false };
    case 'within_week':
      return { label: 'був(ла) цього тижня', online: false };
    case 'within_month':
      return { label: 'був(ла) цього місяця', online: false };
    case 'long_ago':
      return { label: 'був(ла) давно', online: false };
    case 'hidden':
      return { label: 'статус прихований', online: false };
    case 'offline':
      if (info.at) {
        const d = new Date(info.at * 1000);
        const now = Date.now();
        const diff = now - d.getTime();
        if (diff < 60_000) return { label: 'був(ла) щойно', online: false };
        if (diff < 3_600_000) return { label: `був(ла) ${Math.floor(diff / 60_000)} хв тому`, online: false };
        const today = new Date().toDateString() === d.toDateString();
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (today) return { label: `був(ла) о ${time}`, online: false };
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
        return { label: `був(ла) ${date} о ${time}`, online: false };
      }
      return { label: 'офлайн', online: false };
    default:
      return { label: 'офлайн', online: false };
  }
}
