import { Api } from 'telegram';

import { getClient } from './client';
import { displayName } from './convert';
import { entities, rememberEntities } from './entities';
import { parseStatus, recordStatus, type StatusInfo } from './status';

export type Contact = {
  id: string;
  name: string;
  username: string | null;
  status: StatusInfo;
};

/** Loads your contacts and seeds the status store from their current state. */
export async function loadContacts(): Promise<Contact[]> {
  const res = await getClient().invoke(new Api.contacts.GetContacts({ hash: BigInt(0) as any }));
  if (res instanceof Api.contacts.ContactsNotModified) return [];
  rememberEntities(res.users);
  const contacts: Contact[] = [];
  for (const u of res.users) {
    if (!(u instanceof Api.User) || u.self) continue;
    const status = parseStatus(u.status);
    recordStatus(u.id.toString(), status);
    contacts.push({
      id: u.id.toString(),
      name: displayName(u) || u.username || u.id.toString(),
      username: u.username ?? null,
      status,
    });
  }
  // Online first, then by name.
  const rank = (s: StatusInfo) => (s.state === 'online' ? 0 : s.state === 'recently' ? 1 : 2);
  contacts.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
  return contacts;
}

export type Profile = {
  id: string;
  name: string;
  username: string | null;
  phone: string | null;
  bio: string | null;
  status: StatusInfo;
  isBot: boolean;
  isContact: boolean;
  commonChatsCount: number;
};

export async function loadProfile(peer: string): Promise<Profile> {
  const tg = getClient();
  const entity = entities.get(peer) ?? (await tg.getEntity(peer));
  const full = await tg.invoke(new Api.users.GetFullUser({ id: entity }));
  rememberEntities(full.users);
  const user = full.users.find((u) => u instanceof Api.User) as Api.User | undefined;
  const info = full.fullUser;
  const status = user ? parseStatus(user.status) : { state: 'hidden' as const, at: null };
  if (user) recordStatus(user.id.toString(), status);
  return {
    id: (user?.id ?? info.id).toString(),
    name: user ? displayName(user) : peer,
    username: user?.username ?? null,
    phone: user?.phone ?? null,
    bio: info.about ?? null,
    status,
    isBot: !!user?.bot,
    isContact: !!user?.contact,
    commonChatsCount: info.commonChatsCount ?? 0,
  };
}

export type CommonChat = { id: string; title: string; isChannel: boolean };

export async function loadCommonChats(peer: string): Promise<CommonChat[]> {
  const tg = getClient();
  const entity = entities.get(peer) ?? (await tg.getEntity(peer));
  const res = await tg.invoke(
    new Api.messages.GetCommonChats({ userId: entity, maxId: BigInt(0) as any, limit: 100 }),
  );
  rememberEntities(res.chats);
  return res.chats
    .filter((c) => c instanceof Api.Chat || c instanceof Api.Channel)
    .map((c: any) => ({
      id: c.id.toString(),
      title: c.title ?? '',
      isChannel: !!(c instanceof Api.Channel && c.broadcast),
    }));
}

export type SearchHit = {
  peer: string;
  title: string;
  subtitle: string;
  kind: 'user' | 'group' | 'channel' | 'bot';
};

/** Searches your contacts and global public chats by name/username. */
export async function searchPeople(query: string): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const res = await getClient().invoke(new Api.contacts.Search({ q: query.trim(), limit: 30 }));
  rememberEntities([...res.users, ...res.chats]);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const pushUser = (u: Api.User) => {
    const id = u.id.toString();
    if (seen.has(id) || u.self) return;
    seen.add(id);
    hits.push({
      peer: id,
      title: displayName(u) || u.username || id,
      subtitle: u.username ? `@${u.username}` : u.bot ? 'бот' : 'користувач',
      kind: u.bot ? 'bot' : 'user',
    });
  };
  const pushChat = (c: any) => {
    const marked = c instanceof Api.Channel ? `-100${c.id}` : `-${c.id}`;
    if (seen.has(marked)) return;
    seen.add(marked);
    hits.push({
      peer: marked,
      title: c.title ?? '',
      subtitle: c.username ? `@${c.username}` : c instanceof Api.Channel && c.broadcast ? 'канал' : 'група',
      kind: c instanceof Api.Channel && c.broadcast ? 'channel' : 'group',
    });
  };
  // `myResults`/`results` are peer references; the full objects live in users/chats.
  for (const u of res.users) if (u instanceof Api.User) pushUser(u);
  for (const c of res.chats) pushChat(c);
  return hits;
}

export type GlobalMessageHit = {
  peer: string;
  id: number;
  chatTitle: string;
  text: string;
  date: number;
};

/** Full-text search across all your chats' message history. */
export async function searchMessages(query: string): Promise<GlobalMessageHit[]> {
  if (!query.trim()) return [];
  const tg = getClient();
  const res: any = await tg.invoke(
    new Api.messages.SearchGlobal({
      q: query.trim(),
      filter: new Api.InputMessagesFilterEmpty(),
      minDate: 0,
      maxDate: 0,
      offsetRate: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      offsetId: 0,
      limit: 40,
    }),
  );
  rememberEntities([...(res.users ?? []), ...(res.chats ?? [])]);
  const { utils } = require('telegram') as typeof import('telegram'); // eslint-disable-line @typescript-eslint/no-require-imports
  const hits: GlobalMessageHit[] = [];
  for (const m of res.messages ?? []) {
    if (!(m instanceof Api.Message) || !m.peerId) continue;
    const peer = utils.getPeerId(m.peerId);
    const chat = entities.get(peer);
    hits.push({
      peer,
      id: m.id,
      chatTitle: chat ? displayName(chat) : peer,
      text: m.message ?? '',
      date: m.date,
    });
  }
  return hits;
}
