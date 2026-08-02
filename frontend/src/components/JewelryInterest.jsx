import { ExternalLink, Eye, Gem, Users } from 'lucide-react';
import { formatNumber } from '../lib/format';

const trendLabel = (value) => {
  if (value === null) return 'חדש בטווח';
  if (!Number.isFinite(Number(value)) || Math.abs(Number(value)) < 0.5) return 'ללא שינוי';
  const rounded = Math.round(Math.abs(Number(value)));
  return Number(value) > 0 ? `↑ ${rounded}%` : `↓ ${rounded}%`;
};

const JewelryInterest = ({ interest, siteUrl }) => {
  if (!interest) return null;
  const products = (interest.products || []).slice(0, 12);
  const collections = interest.collections || [];
  const summary = interest.summary || {};
  const collectionPeak = Math.max(...collections.map((item) => Number(item.page_views) || 0), 1);
  const productPeak = Math.max(...products.map((item) => Number(item.page_views) || 0), 1);
  const baseUrl = (siteUrl || 'https://www.libidiamonds.co.il/').replace(/\/$/, '');

  return (
    <section className="jewelry-interest" aria-labelledby="jewelry-interest-title">
      <header className="jewelry-interest__masthead">
        <div>
          <span className="edition-label">LIBI / חלון הראווה</span>
          <h2 id="jewelry-interest-title">מה הלקוחות בוחנים לפני שהם פונים</h2>
          <p>רק צפיות מוצלחות בעמודי קטלוג ומוצר, מכתובות שלא זוהו כבוטים. טעינת תמונות וקוד אינה נספרת.</p>
        </div>
        <div className="jewelry-interest__summary" aria-label="סיכום עניין במוצרים">
          <div><span>צפיות במוצרים</span><strong>{formatNumber(summary.product_page_views)}</strong></div>
          <div><span>מועמדים שהתעניינו</span><strong>{formatNumber(summary.unique_product_candidates)}</strong></div>
          <div><span>מוצרים שנבחנו</span><strong>{formatNumber(summary.products_viewed)}</strong></div>
        </div>
      </header>

      <div className="jewelry-interest__layout">
        <article className="collection-pulse">
          <div className="jewelry-subhead"><span>קטגוריות</span><h3>לאיזה מדף הם ניגשו</h3></div>
          <div className="collection-pulse__list">
            {collections.map((item) => (
              <a href={`${baseUrl}${item.path}`} target="_blank" rel="noreferrer" key={item.category}>
                <span className="collection-pulse__name"><b>{item.label}</b><small>{formatNumber(item.unique_candidates)} מועמדים</small></span>
                <span className="collection-pulse__track" aria-hidden="true"><i style={{ '--interest': `${(Number(item.page_views) / collectionPeak) * 100}%` }} /></span>
                <strong>{formatNumber(item.page_views)}</strong>
                <em className={Number(item.change_percent) < 0 ? 'is-down' : 'is-up'}>{trendLabel(item.change_percent)}</em>
              </a>
            ))}
          </div>
        </article>

        <article className="product-ledger">
          <div className="jewelry-subhead"><span>מוצרים</span><h3>התכשיטים הנצפים ביותר</h3></div>
          {products.length ? <div className="product-ledger__list">
            {products.map((product, index) => (
              <a href={`${baseUrl}${product.path}`} target="_blank" rel="noreferrer" key={product.slug}>
                <span className="product-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="product-name">
                  <b>{product.name}</b>
                  <small>{product.category_label} · <span dir="ltr">{product.slug}</span></small>
                </span>
                <span className="product-gauge" aria-hidden="true"><i style={{ '--interest': `${(Number(product.page_views) / productPeak) * 100}%` }} /></span>
                <span className="product-stat"><Eye /><b>{formatNumber(product.page_views)}</b><small>צפיות</small></span>
                <span className="product-stat"><Users /><b>{formatNumber(product.unique_candidates)}</b><small>מועמדים</small></span>
                <ExternalLink className="product-open" />
              </a>
            ))}
          </div> : <div className="jewelry-empty"><Gem /><span>עדיין אין צפיות בעמוד מוצר בטווח שנבחר.</span></div>}
        </article>
      </div>

      <footer className="jewelry-interest__note">
        <Gem /> מועמד הוא כתובת IP שלא זוהתה כבוט, לא אדם מאומת. אותו מועמד נספר פעם אחת לכל מוצר גם אם פתח אותו כמה פעמים.
      </footer>
    </section>
  );
};

export default JewelryInterest;
