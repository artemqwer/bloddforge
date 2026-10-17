import { Api, utils } from 'telegram';

import { getClient } from './client';
import type { DialogItem } from './dialogs';

// Telegram "chat folders" (dialog filters). We load their definitions and apply
// them to the already-fetched dialog list client-side, the same way the official
// apps do. Folder membership is approximated from include/exclude peers plus the
// type flags (contacts / groups / channels / bots).
export type Folder = {
  id: number;
  title: string;
  include: Set<string>;
  pinned: Set<string>;
  exclude: Set<string>;
  flags: {
    contacts: boolean;
    nonContacts: boolean;
    groups: boolean;
    broadcasts: boolean;
    bots: boolean;
  };
};

function peerId(p: Api.TypeInputPeer): string | null {
  try {
    return utils.getPeerId(p);
  } catch {
    return null;
  }
}

function idSet(peers: Api.TypeInputPeer[]): Set<string> {
  const s = new Set<string>();
  for (const p of peers) {
    const id = peerId(p);
    if (id) s.add(id);
  }
  return s;
}

export async function loadFolders(): Promise<Folder[]> {
  try {
    const res = await getClient().invoke(new Api.messages.GetDialogFilters());
    const filters = res instanceof Api.messages.DialogFilters ? res.filters : [];
    const folders: Folder[] = [];
    for (const f of filters) {
      if (!(f instanceof Api.DialogFilter)) continue; // Skip the default "All chats".
      folders.push({
        id: f.id,
        title: typeof f.title === 'string' ? f.title : f.title?.text ?? 'Папка',
        include: idSet(f.includePeers),
        pinned: idSet(f.pinnedPeers),
        exclude: idSet(f.excludePeers),
        flags: {
          contacts: !!f.contacts,
          nonContacts: !!f.nonContacts,
          groups: !!f.groups,
          broadcasts: !!f.broadcasts,
          bots: !!f.bots,
        },
      });
    }
    return folders;
  } catch {
    return [];
  }
}

export function inFolder(folder: Folder, d: DialogItem): boolean {
  if (folder.exclude.has(d.peer)) return false;
  if (folder.include.has(d.peer) || folder.pinned.has(d.peer)) return true;
  const { flags } = folder;
  switch (d.kind) {
    case 'user':
    case 'self':
      return flags.contacts || flags.nonContacts;
    case 'bot':
      return flags.bots;
    case 'group':
      return flags.groups;
    case 'channel':
      return flags.broadcasts;
    default:
      return false;
  }
}
