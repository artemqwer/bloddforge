import { Buffer } from 'buffer';
import { Api } from 'telegram';

import { getClient } from './client';

// Recent stickers and saved GIFs. We render each item's small JPEG thumbnail
// (animated .tgs stickers can't be shown natively here, but their preview can).

export type MediaDoc = Api.Document;

export async function loadRecentStickers(): Promise<MediaDoc[]> {
  try {
    const res = await getClient().invoke(new Api.messages.GetRecentStickers({ hash: BigInt(0) as any }));
    if (res instanceof Api.messages.RecentStickers) {
      return res.stickers.filter((d): d is Api.Document => d instanceof Api.Document);
    }
  } catch {
    // Signed out or no stickers.
  }
  return [];
}

export async function loadSavedGifs(): Promise<MediaDoc[]> {
  try {
    const res = await getClient().invoke(new Api.messages.GetSavedGifs({ hash: BigInt(0) as any }));
    if (res instanceof Api.messages.SavedGifs) {
      return res.gifs.filter((d): d is Api.Document => d instanceof Api.Document);
    }
  } catch {
    // None saved.
  }
  return [];
}

const thumbCache = new Map<string, string>();

/** Downloads a document's smallest thumbnail as a data URI, cached by id. */
export async function thumbUri(doc: MediaDoc): Promise<string | null> {
  const key = doc.id.toString();
  const cached = thumbCache.get(key);
  if (cached) return cached;
  try {
    const buf = await getClient().downloadMedia(new Api.MessageMediaDocument({ document: doc }), { thumb: 0 });
    if (!buf || typeof buf === 'string') return null;
    const uri = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
    thumbCache.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}
