const CATEGORY_META = {
    rings: { label: 'טבעות', path: '/jewelry/rings' },
    earrings: { label: 'עגילים', path: '/jewelry/earrings' },
    necklaces: { label: 'שרשראות', path: '/jewelry/necklaces' },
    bracelets: { label: 'צמידים', path: '/jewelry/bracelets' }
};

const KNOWN_PRODUCTS = {
    'aura-solitaire-ring': 'טבעת סוליטר ״אורה״',
    'seren-pear-solitaire-ring': 'טבעת טיפה ״סרן״',
    'elara-oval-hidden-halo-ring': 'טבעת אובל ״אלרה״',
    'atelier-emerald-cathedral-ring': 'טבעת אמרלד ״אטלייה״',
    'verona-round-bezel-ring': 'טבעת בזל עגול ״ורונה״',
    'stella-diamond-studs': 'עגילים צמודים ״סטלה״',
    'solene-emerald-studs': 'עגילי אמרלד ״סולין״',
    'orbit-bezel-studs': 'עגילי בזל ״אורביט״',
    'luna-diamond-hoops': 'חישוקי יהלומים ״לונה״',
    'glow-halo-earrings': 'עגילי היילו ״גלואו״',
    'aria-oval-studs': 'עגילי אובל ״אריה״'
};

function inferCategory(slug) {
    if (/(ring|band)$/.test(slug)) return 'rings';
    if (/(earrings|studs|hoops|huggies)$/.test(slug)) return 'earrings';
    if (/(necklace|pendant)$/.test(slug)) return 'necklaces';
    if (/(bracelet|bangle)$/.test(slug)) return 'bracelets';
    return 'other';
}

function humanizeSlug(slug) {
    return slug
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function percentChange(current, previous) {
    if (previous > 0) return ((current - previous) / previous) * 100;
    return current > 0 ? null : 0;
}

function getPreviousRange(range) {
    const duration = new Date(range.to).getTime() - new Date(range.from).getTime();
    return {
        from: new Date(new Date(range.from).getTime() - duration).toISOString(),
        to: range.from
    };
}

function getContentRows(db, appId, range, prefix) {
    const previous = getPreviousRange(range);
    return db.prepare(`
        WITH canonical_events AS (
            SELECT ip, occurred_at,
                RTRIM(CASE
                    WHEN INSTR(path, '?') > 0 THEN SUBSTR(path, 1, INSTR(path, '?') - 1)
                    ELSE path
                END, '/') AS canonical_path
            FROM visitor_events
            WHERE app_id = @appId
              AND is_bot = 0 AND is_page_view = 1
              AND occurred_at >= @previousFrom AND occurred_at < @to
        )
        SELECT canonical_path AS path,
            SUM(CASE WHEN occurred_at >= @from THEN 1 ELSE 0 END) AS page_views,
            COUNT(DISTINCT CASE WHEN occurred_at >= @from THEN ip END) AS unique_candidates,
            SUM(CASE WHEN occurred_at < @from THEN 1 ELSE 0 END) AS previous_page_views
        FROM canonical_events
        WHERE canonical_path LIKE @prefix
        GROUP BY canonical_path
        HAVING page_views > 0
        ORDER BY page_views DESC, unique_candidates DESC, canonical_path ASC
    `).all({
        appId,
        from: range.from,
        to: range.to,
        previousFrom: previous.from,
        prefix: `${prefix}%`
    });
}

function getProductSummary(db, appId, range) {
    return db.prepare(`
        WITH canonical_events AS (
            SELECT ip,
                RTRIM(CASE
                    WHEN INSTR(path, '?') > 0 THEN SUBSTR(path, 1, INSTR(path, '?') - 1)
                    ELSE path
                END, '/') AS canonical_path
            FROM visitor_events
            WHERE app_id = ? AND is_bot = 0 AND is_page_view = 1
              AND occurred_at >= ? AND occurred_at < ?
        )
        SELECT COUNT(*) AS page_views,
            COUNT(DISTINCT ip) AS unique_candidates,
            COUNT(DISTINCT canonical_path) AS products_viewed
        FROM canonical_events
        WHERE canonical_path LIKE '/product/%'
    `).get(appId, range.from, range.to);
}

function getLibiJewelryInterest(db, appId, range) {
    const rawProducts = getContentRows(db, appId, range, '/product/');
    const rawCollections = getContentRows(db, appId, range, '/jewelry/');
    const summary = getProductSummary(db, appId, range);
    const productViews = rawProducts.reduce((total, row) => total + Number(row.page_views || 0), 0);

    const products = rawProducts.map((row) => {
        const slug = row.path.slice('/product/'.length);
        const category = inferCategory(slug);
        const pageViews = Number(row.page_views) || 0;
        const uniqueCandidates = Number(row.unique_candidates) || 0;
        const previousPageViews = Number(row.previous_page_views) || 0;
        return {
            slug,
            path: row.path,
            name: KNOWN_PRODUCTS[slug] || humanizeSlug(slug),
            category,
            category_label: CATEGORY_META[category]?.label || 'תכשיט אחר',
            page_views: pageViews,
            unique_candidates: uniqueCandidates,
            views_per_candidate: uniqueCandidates ? pageViews / uniqueCandidates : 0,
            share_percent: productViews ? (pageViews / productViews) * 100 : 0,
            previous_page_views: previousPageViews,
            change_percent: percentChange(pageViews, previousPageViews)
        };
    });

    const collectionByPath = new Map(rawCollections.map((row) => [row.path, row]));
    const collections = Object.entries(CATEGORY_META).map(([category, meta]) => {
        const row = collectionByPath.get(meta.path) || {};
        const pageViews = Number(row.page_views) || 0;
        const previousPageViews = Number(row.previous_page_views) || 0;
        return {
            category,
            label: meta.label,
            path: meta.path,
            page_views: pageViews,
            unique_candidates: Number(row.unique_candidates) || 0,
            previous_page_views: previousPageViews,
            change_percent: percentChange(pageViews, previousPageViews)
        };
    }).sort((a, b) => b.page_views - a.page_views);

    return {
        summary: {
            product_page_views: Number(summary.page_views) || 0,
            unique_product_candidates: Number(summary.unique_candidates) || 0,
            products_viewed: Number(summary.products_viewed) || 0,
            top_product: products[0] || null,
            top_collection: collections.find((item) => item.page_views > 0) || null
        },
        products,
        collections
    };
}

module.exports = { getLibiJewelryInterest, humanizeSlug, inferCategory };
