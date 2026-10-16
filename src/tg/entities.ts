// Users, chats and channels we've seen, keyed by marked peer id. GramJS keeps its
// own input-entity cache; this one is for names and titles.
export const entities = new Map<string, any>();

export function rememberEntities(list: Iterable<any> | undefined) {
  if (!list) return;
  // Imported lazily to avoid a cycle with convert.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utils } = require('telegram') as typeof import('telegram');
  for (const e of list) {
    if (!e || e.className === 'UserEmpty' || e.className === 'ChatEmpty') continue;
    try {
      entities.set(utils.getPeerId(e), e);
    } catch {
      // Not a peer-like entity.
    }
  }
}
