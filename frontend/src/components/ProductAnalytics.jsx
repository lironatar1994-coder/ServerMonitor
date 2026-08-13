import { useMemo, useState } from 'react';
import { Empty, Panel, Stat, StatRow, Tabs } from './AnalyticsParts';
import { formatNumber } from '../lib/format';

const TOOL_LABELS = {
  editor: 'עורך PDF',
  'text-to-pdf': 'טקסט ל-PDF',
  ocr: 'זיהוי טקסט (OCR)',
  'fill-form': 'מילוי טפסים',
  merge: 'מיזוג קבצים',
  split: 'פיצול עמודים',
  compress: 'דחיסת PDF',
  'images-to-pdf': 'תמונות ל-PDF',
  'pdf-to-images': 'PDF לתמונות',
  'extract-text': 'חילוץ טקסט',
  watermark: 'סימן מים',
  numbers: 'מספור עמודים',
  crop: 'חיתוך עמודים',
  'pdf-to-word': 'PDF ל-Word',
  protect: 'הגנת סיסמה',
  unlock: 'הסרת סיסמה',
  rotate: 'סיבוב עמודים',
  meta: 'מאפייני מסמך',
  'editor-select': 'עורך · בחירה',
  'editor-edit': 'עורך · עריכת טקסט',
  'editor-replace': 'עורך · תיבת החלפה',
  'editor-signature': 'עורך · חתימה',
  'editor-text': 'עורך · טקסט',
  'editor-ink': 'עורך · ציור חופשי',
  'editor-highlight': 'עורך · הדגשה',
  'editor-rect': 'עורך · מלבן',
  'editor-ellipse': 'עורך · אליפסה',
  'editor-line': 'עורך · קו',
  'editor-arrow': 'עורך · חץ',
  'editor-image': 'עורך · תמונה',
  'editor-redact': 'עורך · צנזור'
};

const ZONE_LABELS = {
  header: 'כותרת וניווט עליון',
  'bottom-nav': 'ניווט תחתון',
  'home-hero': 'פתיחת קובץ בדף הבית',
  'home-tools': 'רשימת הכלים בדף הבית',
  'tools-navigation': 'ניווט בין כלים',
  'editor-toolbar': 'סרגל העורך',
  'editor-mobile-toolbar': 'סרגל העורך בנייד',
  'editor-tool-picker': 'בחירת כלי בנייד',
  'editor-save': 'שמירת PDF',
  'editor-pages': 'רשימת עמודים',
  'editor-canvas': 'משטח העריכה',
  'editor-properties': 'מאפייני העריכה',
  'text-toolbar': 'סרגל טקסט ל-PDF',
  'text-settings': 'הגדרות המסמך',
  'text-editor': 'עורך הטקסט',
  'text-preview': 'תצוגה מקדימה',
  'site-header': 'כותרת וניווט עליון',
  hero: 'פתיחת האתר',
  'hero-whatsapp': 'וואטסאפ מהפתיחה',
  gallery: 'גלריית עבודות',
  'gallery-instagram': 'אינסטגרם מהגלריה',
  'before-after': 'לפני ואחרי',
  'mid-cta': 'הנעה לפעולה אחרי הגלריה',
  'mid-whatsapp': 'וואטסאפ אחרי הגלריה',
  services: 'שירותים',
  about: 'אודות מרים',
  faq: 'שאלות נפוצות',
  contact: 'יצירת קשר',
  'contact-whatsapp': 'וואטסאפ מיצירת קשר',
  footer: 'תחתית האתר'
};

const VIEWPORT_LABELS = { mobile: 'נייד', tablet: 'טאבלט', desktop: 'מחשב' };
const ZONE_TABS = [{ id: 'clicks', label: 'לחיצות' }, { id: 'views', label: 'חשיפה' }];

function labelTool(label) {
  return TOOL_LABELS[label] || label;
}

function labelZone(zone) {
  if (ZONE_LABELS[zone]) return ZONE_LABELS[zone];
  const tool = zone.match(/^(?:tool|home-tool|tools-nav):(.+)$/)?.[1];
  if (tool) return labelTool(tool);
  const editorTool = zone.match(/^editor-tool:(.+)$/)?.[1];
  if (editorTool) return labelTool(`editor-${editorTool}`);
  const navigation = zone.match(/^nav:(.+)$/)?.[1];
  if (navigation) return `ניווט · ${labelTool(navigation)}`;
  return zone;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function HeatMap({ heatmaps }) {
  const [selected, setSelected] = useState('');
  const options = useMemo(() => heatmaps.map((heatmap) => ({
    key: `${heatmap.path}|${heatmap.viewport_class}`,
    label: `${heatmap.path} · ${VIEWPORT_LABELS[heatmap.viewport_class] || heatmap.viewport_class}`,
    heatmap
  })), [heatmaps]);

  const selectedKey = options.some((option) => option.key === selected) ? selected : (options[0]?.key || '');
  const active = options.find((option) => option.key === selectedKey)?.heatmap;
  const values = new Map((active?.cells || []).map((cell) => [`${cell.x}:${cell.y}`, Number(cell.taps) || 0]));
  const peak = Math.max(...values.values(), 1);

  if (!active) return <Empty text="האיסוף התחיל עכשיו. מפת החום תופיע אחרי הלחיצות הראשונות." />;

  return (
    <div className="heatmap-layout">
      <label className="heatmap-picker">
        <span>מסך</span>
        <select dir="ltr" value={selectedKey} onChange={(event) => setSelected(event.target.value)}>
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
      <div className="heatmap-frame" dir="ltr" aria-label={`מפת לחיצות עבור ${active.path}`}>
        {Array.from({ length: 144 }, (_, index) => {
          const x = index % 12;
          const y = Math.floor(index / 12);
          const taps = values.get(`${x}:${y}`) || 0;
          return (
            <span
              key={`${x}:${y}`}
              className={taps ? 'is-hot' : ''}
              style={{ '--heat': taps / peak }}
              title={taps ? `${formatNumber(taps)} לחיצות` : undefined}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div className="heatmap-caption">
        <span>{formatNumber(active.taps)} לחיצות</span>
        <span>{formatNumber(active.samples)} מדידות</span>
        <span className="heatmap-legend"><i /> חם יותר</span>
      </div>
    </div>
  );
}

function ZoneRanking({ zones, mode }) {
  const rows = mode === 'clicks'
    ? zones.map((row) => ({ label: labelZone(row.zone), value: row.taps, meta: `${formatNumber(row.sessions)} מדידות` }))
    : zones.map((row) => ({ label: labelZone(row.zone), value: row.samples, meta: `${formatNumber(row.average_dwell_seconds)} שנ׳ בממוצע` }));
  const peak = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  if (!rows.length) return <Empty text={mode === 'clicks' ? 'עוד אין לחיצות באזורים מסומנים' : 'עוד אין מדידות חשיפה'} />;
  return (
    <ol className="zone-ranking">
      {rows.slice(0, 10).map((row) => (
        <li key={row.label}>
          <div><b>{row.label}</b><small>{row.meta}</small></div>
          <strong>{formatNumber(row.value)}</strong>
          <i style={{ inlineSize: `${Math.max(3, (Number(row.value) / peak) * 100)}%` }} />
        </li>
      ))}
    </ol>
  );
}

function ToolTable({ tools }) {
  if (!tools.length) return <Empty text="שימוש בכלים יופיע כאן אחרי הפעולות הראשונות." />;
  return (
    <div className="product-table-wrap">
      <table className="product-table">
        <thead><tr><th>כלי</th><th>נפתח</th><th>הושלם</th><th>הורדות</th><th>שגיאות</th></tr></thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.label}>
              <th>{labelTool(tool.label)}<small>{formatNumber(tool.sessions)} סשנים</small></th>
              <td data-label="נפתח">{formatNumber(tool.opens)}</td>
              <td data-label="הושלם">{formatNumber(tool.completions)}</td>
              <td data-label="הורדות">{formatNumber(tool.downloads)}</td>
              <td data-label="שגיאות">{formatNumber(tool.failures)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScrollReach({ engagement }) {
  const reach = engagement.scroll_reach || {};
  const rows = [
    ['25%', reach.reached_25],
    ['50%', reach.reached_50],
    ['75%', reach.reached_75],
    ['סוף', reach.reached_end]
  ];
  if (!engagement.engagement_samples) return <Empty text="עומק צפייה וזמן מסך יופיעו אחרי המדידות הראשונות." />;
  return (
    <div className="reach-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span><i><b style={{ inlineSize: `${Number(value) || 0}%` }} /></i><strong dir="ltr">{formatNumber(value)}%</strong>
        </div>
      ))}
      <dl className="reach-summary">
        <div><dt>עומק ממוצע</dt><dd dir="ltr">{formatNumber(engagement.average_scroll_depth)}%</dd></div>
        <div><dt>זמן ממוצע</dt><dd>{formatNumber(engagement.average_dwell_seconds)} שנ׳</dd></div>
      </dl>
    </div>
  );
}

export default function ProductAnalytics({ engagement, mode = 'product' }) {
  const [zoneMode, setZoneMode] = useState('clicks');
  const summary = engagement?.product?.summary || {};
  const filtered = (Number(summary.automated_events) || 0) + (Number(engagement?.automated_engagement_samples) || 0);
  const hint = 'אירועי שימוש אנונימיים בלבד. אין שמות קבצים או תוכן מסמכים. אותות אוטומציה ובוטים מוכרים מסוננים מהמדדים.';
  const isSite = mode === 'site';
  const siteHint = 'אותות אנונימיים מהדפדפן, לא ספירת אנשים. אוטומציה ובוטים מוכרים מסוננים מהמדדים.';

  return (
    <section className="product-analytics" aria-label={isSite ? 'מפת מעורבות באתר' : 'שימוש ב-PDF Studio'}>
      {isSite && (
        <StatRow label="מעורבות באתר">
          <Stat label="סשנים עם מעורבות" value={engagement?.engagement_sessions} tone="forest" hint={siteHint} />
          <Stat label="מדידות מסך" value={engagement?.engagement_samples} hint={siteHint} />
          <Stat label="עומק ממוצע" value={`${formatNumber(engagement?.average_scroll_depth)}%`} />
          <Stat label="זמן ממוצע" value={formatNumber(engagement?.average_dwell_seconds)} foot="שניות" />
          <Stat label="אוטומציה שסוננה" value={filtered} tone="ochre" hint={siteHint} />
        </StatRow>
      )}
      {!isSite && (
        <StatRow label="מדדי שימוש ב-PDF Studio">
          <Stat label="כלים שנפתחו" value={summary.tool_opens} tone="forest" hint={hint} />
          <Stat label="קבצים שנפתחו" value={summary.files_opened} />
          <Stat label="פעולות שהושלמו" value={summary.tool_completions} tone="forest" />
          <Stat label="הורדות" value={summary.downloads} foot={formatBytes(summary.downloaded_bytes)} />
          <Stat label="שמירות בעורך" value={summary.saves} />
          <Stat label="שגיאות" value={summary.failures} tone="vermilion" foot={`${formatNumber(filtered)} אירועי אוטומציה סוננו`} />
        </StatRow>
      )}

      <div className="grid grid--1-1">
        <Panel title="מפת לחיצות" hint={isSite ? 'מיקום יחסי וגס בתוך המסך. אין צילום מסך, הקלטה או תוכן אישי.' : 'מיקום יחסי בתוך המסך, ללא צילום וללא תוכן מסמך.'}>
          <HeatMap heatmaps={engagement?.heatmaps || []} />
        </Panel>
        <Panel title="אזורי עניין" action={<Tabs tabs={ZONE_TABS} value={zoneMode} onChange={setZoneMode} label="סוג מדידה" />}>
          <ZoneRanking zones={zoneMode === 'clicks' ? (engagement?.zones || []) : (engagement?.viewed_zones || [])} mode={zoneMode} />
        </Panel>
      </div>

      <div className={`grid ${isSite ? '' : 'grid--2-1'}`}>
        {!isSite && (
          <Panel title="שימוש לפי כלי" hint="פתיחה היא בחירת כלי; השלמה נספרת כשהופק קובץ להורדה." bleed>
            <ToolTable tools={engagement?.product?.tools || []} />
          </Panel>
        )}
        <Panel title="עומק צפייה" hint="אחוז ממדידות המסך שהגיעו לכל עומק.">
          <ScrollReach engagement={engagement || {}} />
        </Panel>
      </div>
    </section>
  );
}
