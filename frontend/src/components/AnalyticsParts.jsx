import { ArrowDownLeft, ArrowUpLeft, CalendarDays, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { formatNumber } from '../lib/format';

const defaultRangeEnd = new Date();
const defaultRangeStart = new Date(defaultRangeEnd);
defaultRangeStart.setDate(defaultRangeStart.getDate() - 7);
const defaultTo = defaultRangeEnd.toISOString().slice(0, 10);
const defaultFrom = defaultRangeStart.toISOString().slice(0, 10);

export const SectionHeader = ({ eyebrow, title, note, action }) => (
  <div className="section-heading">
    <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{note && <p>{note}</p>}</div>
    {action}
  </div>
);

export const MetricBlock = ({ label, value, delta, tone = 'ink', note }) => {
  const numericDelta = Number(delta) || 0;
  const displayValue = typeof value === 'string' && /[^0-9.,-]/.test(value) ? value : formatNumber(value);
  return (
    <article className={`metric-block metric-block--${tone}`}>
      <span className="metric-label">{label}</span>
      <strong>{displayValue}</strong>
      <div className="metric-foot">
        {delta !== undefined && (
          <span className={numericDelta >= 0 ? 'delta-up' : 'delta-down'}>
            {numericDelta >= 0 ? <ArrowUpLeft /> : <ArrowDownLeft />}{Math.abs(numericDelta).toFixed(0)}%
          </span>
        )}
        <small>{note}</small>
      </div>
    </article>
  );
};

const CustomRange = ({ onApply }) => {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const handleApply = () => {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);
    if (fromDate < toDate) onApply({ from: fromDate.toISOString(), to: toDate.toISOString() });
  };
  return <details className="custom-range"><summary>מותאם</summary><div><label>מתאריך<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>עד תאריך<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" onClick={handleApply}>הצגה</button></div></details>;
};

export const RangePicker = ({ days, onChange, loading, onRefresh, onCustom, customActive = false }) => (
  <div className="range-picker" aria-label="בחירת טווח זמן">
    <CalendarDays aria-hidden="true" />
    {[1, 7, 30, 90].map((option) => (
      <button type="button" key={option} className={!customActive && days === option ? 'is-active' : ''} onClick={() => onChange(option)}>
        {option === 1 ? '24 שעות' : `${option} ימים`}
      </button>
    ))}
    {onCustom && <CustomRange onApply={onCustom} />}
    <button type="button" className="range-refresh" onClick={onRefresh} aria-label="רענון נתונים">
      <RefreshCw className={loading ? 'is-spinning' : ''} />
    </button>
  </div>
);

export const RankedList = ({ items = [], empty = 'אין עדיין נתונים', color = 'forest' }) => {
  const maximum = Math.max(...items.map((item) => Number(item.requests) || 0), 1);
  return (
    <div className="ranked-list">
      {items.length === 0 ? <div className="quiet-empty">{empty}</div> : items.map((item, index) => (
        <div className="ranked-row" key={`${item.label}-${index}`}>
          <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
          <div><b title={item.label}>{item.label || 'לא ידוע'}</b><i style={{ '--bar': `${(Number(item.requests) / maximum) * 100}%`, '--bar-color': `var(--${color})` }} /></div>
          <strong>{formatNumber(item.requests)}</strong>
        </div>
      ))}
    </div>
  );
};

export const DataState = ({ loading, error, children }) => {
  if (loading) return <div className="skeleton-stack" role="status"><span /><span /><span /><em>טוען נתוני מבקרים…</em></div>;
  if (error) return <div className="error-state" role="alert"><b>לא הצלחנו לטעון את הנתונים</b><span>{error}</span></div>;
  return children;
};
