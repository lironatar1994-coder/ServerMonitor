const TZ = 'Asia/Jerusalem';
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;

export const formatNumber = (value) => new Intl.NumberFormat('he-IL').format(Number(value) || 0);

export const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('he-IL', {
    timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp(value)))
  : '—';

export const formatTime = (value) => value
  ? new Intl.DateTimeFormat('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp(value)))
  : '—';

/** Short relative label for feed rows: “עכשיו”, “לפני 4 ד׳”, “לפני 3 ש׳”, then a date. */
export const formatAgo = (value) => {
  if (!value) return '—';
  const minutes = Math.round((Date.now() - new Date(timestamp(value)).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return `לפני ${minutes} ד׳`;
  if (minutes < 1440) return `לפני ${Math.round(minutes / 60)} ש׳`;
  return formatDateTime(value);
};
