export const previousRange = ({ from, to }) => ({ from: new Date(2 * Date.parse(from) - Date.parse(to)).toISOString(), to: from });

export function changeLabel(current, previous) {
  if (current == null || previous == null) return 'השוואה לא זמינה';
  const a = Number(current), b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'השוואה לא זמינה';
  if (b === 0) return 'ללא פעילות קודמת';
  if (a === b) return 'ללא שינוי';
  const delta = Math.abs(a - b).toLocaleString('he-IL');
  return `${delta} ${a > b ? 'יותר' : 'פחות'}${b >= 30 ? ` (${Math.round(Math.abs(a - b) / b * 100)}%)` : ''}`;
}

export const rangeSearch = range => `?${new URLSearchParams({ from: range.from, to: range.to })}`;

// Align bucket offsets, never array indexes: sparse days must not slide together.
export function comparisonSeries(current, previous, range, metric) {
  if (!range) return [];
  const start = Date.parse(range.from), end = Date.parse(range.to);
  const step = end - start <= 48 * 3600000 ? 3600000 : 86400000;
  const anchor = Math.floor(start / step) * step;
  const beforeAnchor = Math.floor((2 * start - end) / step) * step;
  const now = new Map((current || []).map(row => [Date.parse(row.bucket), row[metric]]));
  const before = new Map((previous || []).map(row => [Date.parse(row.bucket), row[metric]]));
  return Array.from({ length: Math.ceil((end - anchor) / step) }, (_, i) => ({
    bucket: new Date(anchor + i * step).toISOString(),
    previousBucket: new Date(beforeAnchor + i * step).toISOString(),
    current: now.get(anchor + i * step) ?? 0,
    previous: previous ? before.get(beforeAnchor + i * step) ?? 0 : null
  }));
}
