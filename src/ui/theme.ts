// AyuGram-flavoured palette. Dark by default, since that's the common look.
export const theme = {
  bg: '#0E1621',
  bgElevated: '#17212B',
  bgInput: '#242F3D',
  card: '#17212B',
  separator: '#101921',
  accent: '#5CA7E4',
  accentGhost: '#8E7CFF',
  text: '#FFFFFF',
  textDim: '#7D8E9B',
  textFaint: '#55646F',
  bubbleIn: '#182533',
  bubbleOut: '#2B5278',
  deleted: '#3A1D22',
  deletedBorder: '#E05A6B',
  edited: '#24313D',
  danger: '#E05A6B',
  ok: '#4FB06D',
  badge: '#5CA7E4',
};

export const avatarColors = [
  '#E17076',
  '#7BC862',
  '#E5CA77',
  '#6EC9CB',
  '#65AADD',
  '#A695E7',
  '#EE7AAE',
];

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
