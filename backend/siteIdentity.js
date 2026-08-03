function normalizeWebsiteIdentity(value) {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Website URL must use HTTP or HTTPS');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    const host = parsed.port ? `${hostname}:${parsed.port}` : hostname;
    let pathname = parsed.pathname.replace(/\/{2,}/g, '/') || '/';
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
    return `${host}${pathname.toLowerCase()}`;
}

function findAppForSiteUrl(apps, siteUrl) {
    let target;
    try {
        target = normalizeWebsiteIdentity(siteUrl);
    } catch {
        return null;
    }

    const matches = (apps || []).filter((app) => {
        try {
            return normalizeWebsiteIdentity(app.url) === target;
        } catch {
            return false;
        }
    });

    return matches.length === 1 ? matches[0] : null;
}

module.exports = { normalizeWebsiteIdentity, findAppForSiteUrl };
