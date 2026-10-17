import { Api, utils } from 'telegram';

import type { NewStoredMessage } from './archive';
import { entities } from './entities';

export function peerKey(peer: Api.TypePeer | Api.TypeInputPeer | any): string {
  return utils.getPeerId(peer);
}

export function displayName(entity: any): string {
  if (!entity) return '';
  try {
    return utils.getDisplayName(entity) || '';
  } catch {
    return '';
  }
}

/** Compact media descriptor stored in the archive, e.g. `photo`, `voice`, `file:report.pdf`. */
export function mediaKind(msg: Api.Message): string | null {
  if (!msg.media || msg.media instanceof Api.MessageMediaEmpty) return null;
  if (msg.media instanceof Api.MessageMediaWebPage) return null;
  if (msg.photo) return 'photo';
  if (msg.sticker) return `sticker:${msg.file?.emoji ?? ''}`;
  if (msg.videoNote) return 'round';
  if (msg.gif) return 'gif';
  if (msg.video) return 'video';
  if (msg.voice) return 'voice';
  if (msg.audio) return `audio:${msg.file?.title ?? msg.file?.name ?? ''}`;
  if (msg.document) return `file:${msg.file?.name ?? ''}`;
  if (msg.poll) return `poll:${msg.poll.poll.question?.text ?? ''}`;
  if (msg.geo || msg.venue) return 'geo';
  if (msg.contact) return `contact:${msg.contact.firstName ?? ''} ${msg.contact.phoneNumber ?? ''}`;
  if (msg.dice) return `dice:${msg.dice.emoticon}`;
  return 'other';
}

/** Compact reaction summary, e.g. "👍3 ❤️1". A "*" prefix marks reactions you chose. */
export function reactionSummaryFromObj(r?: Api.TypeMessageReactions): string | null {
  if (!r || !(r instanceof Api.MessageReactions) || !r.results?.length) return null;
  const parts: string[] = [];
  for (const rc of r.results) {
    const emo = rc.reaction instanceof Api.ReactionEmoji ? rc.reaction.emoticon : '⭐';
    const mine = rc.chosenOrder !== undefined && rc.chosenOrder !== null ? '*' : '';
    parts.push(`${mine}${emo}${rc.count}`);
  }
  return parts.join(' ');
}

export function reactionSummary(msg: Api.Message): string | null {
  return reactionSummaryFromObj(msg.reactions);
}

export function mediaLabel(media: string | null): string {
  if (!media) return '';
  const [kind, ...rest] = media.split(':');
  const extra = rest.join(':').trim();
  switch (kind) {
    case 'photo':
      return '🖼 Фото';
    case 'sticker':
      return `${extra || '🙂'} Стікер`;
    case 'round':
      return '⏺ Відеоповідомлення';
    case 'gif':
      return '🎞 GIF';
    case 'video':
      return '🎬 Відео';
    case 'voice':
      return '🎤 Голосове';
    case 'audio':
      return `🎵 ${extra || 'Аудіо'}`;
    case 'file':
      return `📎 ${extra || 'Файл'}`;
    case 'poll':
      return `📊 ${extra || 'Опитування'}`;
    case 'geo':
      return '📍 Геопозиція';
    case 'contact':
      return `👤 ${extra || 'Контакт'}`;
    case 'dice':
      return extra || '🎲';
    case 'service':
      return extra;
    default:
      return '📦 Вкладення';
  }
}

function serviceText(msg: Api.MessageService): string {
  const name = msg.action.className.replace(/^MessageAction/, '');
  const map: Record<string, string> = {
    ChatAddUser: 'додав(ла) учасника',
    ChatDeleteUser: 'вийшов(ла) з групи',
    ChatJoinedByLink: 'приєднався(лась) за посиланням',
    ChatEditTitle: 'змінив(ла) назву',
    ChatEditPhoto: 'змінив(ла) фото',
    PinMessage: 'закріпив(ла) повідомлення',
    PhoneCall: 'дзвінок',
    ChatCreate: 'створив(ла) групу',
    ChannelCreate: 'канал створено',
    ScreenshotTaken: 'зробив(ла) скриншот',
  };
  return map[name] ?? name;
}

export function toStored(msg: Api.Message | Api.MessageService): NewStoredMessage | null {
  if (!(msg instanceof Api.Message) && !(msg instanceof Api.MessageService)) return null;
  if (!msg.peerId) return null;
  const peer = peerKey(msg.peerId);
  const chat = entities.get(peer);
  const fromId = msg.fromId ? peerKey(msg.fromId) : msg.out ? null : peer;
  const sender = (msg as any)._sender ?? (fromId ? entities.get(fromId) : undefined);
  const isService = msg instanceof Api.MessageService;
  return {
    peer,
    id: msg.id,
    is_channel: msg.peerId instanceof Api.PeerChannel ? 1 : 0,
    chat_title: chat ? displayName(chat) : null,
    sender_id: fromId,
    sender_name: sender ? displayName(sender) : null,
    out: msg.out ? 1 : 0,
    text: isService ? '' : msg.message ?? '',
    media: isService ? `service:${serviceText(msg)}` : mediaKind(msg),
    date: msg.date ?? 0,
    edit_date: isService ? null : msg.editDate ?? null,
    reply_to: msg.replyTo instanceof Api.MessageReplyHeader ? msg.replyTo.replyToMsgId ?? null : null,
    reactions: isService ? null : reactionSummary(msg),
  };
}
