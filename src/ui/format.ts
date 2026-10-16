export function formatTime(unix: number) {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDay(unix: number) {
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return formatTime(unix);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'вчора';
  const days = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  if (now.getTime() - d.getTime() < 7 * 86400_000) return days[d.getDay()];
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dateSeparator(unix: number) {
  const d = new Date(unix * 1000);
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
  ];
  const now = new Date();
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${months[d.getMonth()]}${year}`;
}

export function sameDay(a: number, b: number) {
  return new Date(a * 1000).toDateString() === new Date(b * 1000).toDateString();
}
