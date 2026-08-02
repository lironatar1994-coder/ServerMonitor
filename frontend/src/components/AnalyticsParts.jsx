import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Info, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { formatNumber } from '../lib/format';

const RANGE_OPTIONS = [
  { days: 1, label: '24 שעות' },
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 יום' },
  { days: 90, label: '90 יום' }
];

const toInputDate = (date) => date.toISOString().slice(0, 10);
const today = toInputDate(new Date());
const weekAgo = toInputDate(new Date(Date.now() - 7 * 86400000));

/** Small “why” affordance so caveats live in one icon instead of a paragraph per metric. */
export const Hint = ({ text }) => (
  <span className="hint">
    <button type="button" className="hint__trigger" aria-label={text}><Info aria-hidden="true" /></button>
    <span className="hint__bubble" aria-hidden="true">{text}</span>
  </span>
);

export const PageHead = ({ title, meta, children }) => (
  <header className="page-head">
    <div className="page-head__id">
      <h1>{title}</h1>
      {meta ? <div className="page-head__meta">{meta}</div> : null}
    </div>
    {children ? <div className="page-head__tools">{children}</div> : null}
  </header>
);

export const StatRow = ({ children, label = 'מדדים מרכזיים' }) => (
  <section className="stat-row" aria-label={label}>{children}</section>
);

export const Stat = ({ label, value, delta, tone = 'ink', hint, foot }) => {
  const numericDelta = Number(delta);
  const showDelta = delta !== undefined && delta !== null && Number.isFinite(numericDelta);
  const display = typeof value === 'string' ? value : formatNumber(value);
  return (
    <article className={`stat stat--${tone}`}>
      <span className="stat__label">{label}{hint && <Hint text={hint} />}</span>
      <strong className="stat__value">{display}</strong>
      <span className="stat__foot">
        {showDelta && (
          <span className={`stat__delta ${numericDelta >= 0 ? 'is-up' : 'is-down'}`}>
            {numericDelta >= 0 ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
            {Math.abs(numericDelta).toFixed(0)}%
          </span>
        )}
        {foot && <small>{foot}</small>}
      </span>
    </article>
  );
};

/* Toggle group rather than ARIA tabs: the buttons swap the data in place and
   there is no separate tabpanel to own focus. */
export const Tabs = ({ tabs, value, onChange, label = 'בחירת תצוגה' }) => (
  <div className="tabs" role="group" aria-label={label}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        aria-pressed={value === tab.id}
        className={value === tab.id ? 'is-active' : ''}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const Panel = ({ title, hint, action, children, className = '', bleed = false }) => (
  <section className={`panel ${className}`}>
    {(title || action) && (
      <div className="panel__head">
        {title && <h2>{title}{hint && <Hint text={hint} />}</h2>}
        {action ? <div className="panel__action">{action}</div> : null}
      </div>
    )}
    <div className={`panel__body ${bleed ? 'is-bleed' : ''}`}>{children}</div>
  </section>
);

const CustomRange = ({ onApply, active, onClear }) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleApply = () => {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);
    if (fromDate >= toDate) return;
    onApply({ from: fromDate.toISOString(), to: toDate.toISOString() });
    setOpen(false);
  };

  return (
    <div className="custom-range" ref={containerRef}>
      <button
        type="button"
        className={`custom-range__trigger ${active ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-label="טווח מותאם"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-range__panel">
          <label>מתאריך<input type="date" max={today} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>עד תאריך<input type="date" max={today} value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <div className="custom-range__actions">
            {active && <button type="button" className="is-ghost" onClick={() => { onClear(); setOpen(false); }}>איפוס</button>}
            <button type="button" onClick={handleApply}><Check aria-hidden="true" /> הצגה</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const RangePicker = ({ days, onChange, loading, onRefresh, onCustom, customActive = false }) => (
  <div className="range-picker">
    <div className="range-picker__segments" role="group" aria-label="טווח זמן">
      {RANGE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.days}
          aria-pressed={!customActive && days === option.days}
          className={!customActive && days === option.days ? 'is-active' : ''}
          onClick={() => onChange(option.days)}
        >
          {option.label}
        </button>
      ))}
    </div>
    {onCustom && <CustomRange onApply={onCustom} active={customActive} onClear={() => onChange(days || 7)} />}
    {onRefresh && (
      <button type="button" className="range-picker__refresh" onClick={onRefresh} aria-label="רענון נתונים">
        <RefreshCw className={loading ? 'is-spinning' : ''} aria-hidden="true" />
      </button>
    )}
  </div>
);

export const RankedList = ({ items = [], empty = 'אין נתונים בטווח הזה', color = 'forest', max = 8 }) => {
  const rows = items.slice(0, max);
  const peak = Math.max(...rows.map((item) => Number(item.requests) || 0), 1);
  if (!rows.length) return <Empty text={empty} />;
  return (
    <ol className="ranked-list">
      {rows.map((item, index) => (
        <li className="ranked-row" key={`${item.label}-${index}`} style={{ '--bar': `${(Number(item.requests) / peak) * 100}%`, '--bar-color': `var(--${color})` }}>
          <b title={item.label}>{item.label || 'לא ידוע'}</b>
          <strong>{formatNumber(item.requests)}</strong>
        </li>
      ))}
    </ol>
  );
};

export const Empty = ({ icon: Icon, text }) => (
  <p className="empty">{Icon && <Icon aria-hidden="true" />}{text}</p>
);

export const DataState = ({ loading, error, onRetry, children }) => {
  if (loading) {
    return (
      <div className="skeleton-stack" role="status">
        <span /><span /><span />
        <em>טוען…</em>
      </div>
    );
  }
  if (error) {
    return (
      <div className="error-state" role="alert">
        <b>הנתונים לא נטענו</b>
        <span>{error}</span>
        {onRetry && <button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" /> נסה שוב</button>}
      </div>
    );
  }
  return children;
};

/** Kept for screens that still render a lettered section title outside a Panel. */
export const SectionHeader = ({ title, note, action }) => (
  <div className="panel__head">
    <h2>{title}{note && <Hint text={note} />}</h2>
    {action ? <div className="panel__action">{action}</div> : null}
  </div>
);
