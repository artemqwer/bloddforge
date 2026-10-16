import { Api } from 'telegram';

import { saveMessages, type NewStoredMessage } from './archive';
import { getClient } from './client';
import { displayName, mediaLabel, toStored } from './convert';
import { entities, rememberEntities } from './entities';

export type DialogItem = {
  peer: string;
  title: string;
  kind: 'user' | 'group' | 'channel' | 'bot' | 'self';
  unread: number;
  pinned: boolean;
  date: number;
  preview: string;
  previewOut: boolean;
};

export function previewOf(m: Pick<NewStoredMessage, 'text' | 'media'>) {
  const media = mediaLabel(m.media);
  if (m.text && media && !m.media?.startsWith('service')) return `${media}, ${m.text}`;
  return m.text || media;
}

function kindOf(entity: any): DialogItem['kind'] {
  if (entity instanceof Api.User) {
    if (entity.self) return 'self';
    return entity.bot ? 'bot' : 'user';
  }
  if (entity instanceof Api.Channel) return entity.broadcast ? 'channel' : 'group';
  return 'group';
}

export async function loadDialogs(archived = false): Promise<DialogItem[]> {
  const tg = getClient();
  const dialogs = await tg.getDialogs({ limit: 150, archived });
  rememberEntities(dialogs.map((d) => d.entity));

  const tops: NewStoredMessage[] = [];
  const items: DialogItem[] = [];
  for (const d of dialogs) {
    if (!d.entity || d.id === undefined) continue;
    const peer = d.id.toString();
    const top = d.message ? toStored(d.message) : null;
    if (top) tops.push(top);
    items.push({
      peer,
      title: kindOf(d.entity) === 'self' ? 'Збережене' : d.title || displayName(d.entity) || peer,
      kind: kindOf(d.entity),
      unread: d.unreadCount,
      pinned: d.pinned,
      date: d.date,
      preview: top ? previewOf(top) : '',
      previewOut: !!top?.out,
    });
  }
  // Archive the latest message of each chat so its deletion can be caught later.
  saveMessages(tops).catch(() => {});
  return items;
}

export function entityFor(peer: string) {
  return entities.get(peer);
}
