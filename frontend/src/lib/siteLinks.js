// ?monitor_internal=1 marks this browser internal on a monitored site (never measured there).
export const safeSiteUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

export const internalSiteUrl = (value) => {
  const safe = safeSiteUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.searchParams.set('monitor_internal', '1');
  return url.href;
};

