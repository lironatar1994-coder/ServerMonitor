import { useState } from 'react';
import { ExternalLink, Gem } from 'lucide-react';
import { Empty, Panel, Tabs } from './AnalyticsParts';
import { formatNumber } from '../lib/format';

const INTEREST_HINT = 'צפיות מוצלחות בעמודי קטלוג ומוצר מכתובות שלא זוהו כבוט. כל מועמד נספר פעם אחת לכל מוצר.';

const TABS = [
  { id: 'products', label: 'מוצרים' },
  { id: 'collections', label: 'קטגוריות' }
];

const trendLabel = (value) => {
  if (value === null || value === undefined) return 'חדש';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.5) return '—';
  return `${numeric > 0 ? '↑' : '↓'} ${Math.round(Math.abs(numeric))}%`;
};

const JewelryInterest = ({ interest, siteUrl }) => {
  const [tab, setTab] = useState('products');
  if (!interest) return null;

  const products = (interest.products || []).slice(0, 12);
  const collections = interest.collections || [];
  const summary = interest.summary || {};
  const baseUrl = (siteUrl || 'https://www.libidiamonds.co.il/').replace(/\/$/, '');
  const rows = tab === 'products' ? products : collections;
  const peak = Math.max(...rows.map((item) => Number(item.page_views) || 0), 1);

  return (
    <Panel
      className="panel--accent"
      title="מה נבחן בחנות"
      hint={INTEREST_HINT}
      action={<Tabs tabs={TABS} value={tab} onChange={setTab} label="פילוח חנות" />}
      bleed
    >
      <div className="shop-summary">
        <div><span>צפיות במוצרים</span><strong>{formatNumber(summary.product_page_views)}</strong></div>
        <div><span>מועמדים</span><strong>{formatNumber(summary.unique_product_candidates)}</strong></div>
        <div><span>מוצרים שנבחנו</span><strong>{formatNumber(summary.products_viewed)}</strong></div>
      </div>

      {rows.length ? (
        <ol className="shop-list">
          {rows.map((item, index) => {
            const isProduct = tab === 'products';
            return (
              <li key={isProduct ? item.slug : item.category} style={{ '--bar': `${(Number(item.page_views) / peak) * 100}%` }}>
                <a href={`${baseUrl}${item.path}`} target="_blank" rel="noreferrer">
                  <span className="shop-list__rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="shop-list__name">
                    <b>{isProduct ? item.name : item.label}</b>
                    <small dir={isProduct ? 'ltr' : 'rtl'}>{isProduct ? item.category_label : `${formatNumber(item.unique_candidates)} מועמדים`}</small>
                  </span>
                  <span className="shop-list__figures">
                    <strong>{formatNumber(item.page_views)}</strong>
                    <small>{isProduct ? `${formatNumber(item.unique_candidates)} מועמדים` : trendLabel(item.change_percent)}</small>
                  </span>
                  <ExternalLink aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ol>
      ) : <Empty icon={Gem} text={tab === 'products' ? 'אין צפיות בעמוד מוצר בטווח' : 'אין צפיות בקטגוריה בטווח'} />}
    </Panel>
  );
};

export default JewelryInterest;
