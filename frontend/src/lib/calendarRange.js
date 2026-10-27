const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const inputDate = (value = Date.now()) => calendar.format(new Date(value));

// Resolve Israel's midnight independently of the browser's timezone, including DST days.
function midnight(day) {
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== day) return NaN;
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(clock.formatToParts(instant).map(({ type, value }) => [type, value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    instant += target - local;
  }
  return instant;
}

export function calendarRange(from, to, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: 'יש לבחור תאריך התחלה ותאריך סיום' };
  const start = midnight(from), lastDay = midnight(to);
  if (!Number.isFinite(start) || !Number.isFinite(lastDay)) return { error: 'יש לבחור תאריכים תקינים' };
  if (from > to) return { error: 'תאריך הסיום צריך להיות אחרי תאריך ההתחלה' };
  if (to > inputDate(now)) return { error: 'אפשר לבחור תאריכים עד היום' };
  const nextDay = new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const end = midnight(nextDay) - 1;
  if (end - start > 90 * 86400000) return { error: 'אפשר להציג עד 90 יום בכל פעם' };
  return { range: { from: new Date(start).toISOString(), to: new Date(end).toISOString() } };
}
