export function safeReturnPath(value) {
  if (typeof value !== "string") return "/visitors";
  const path = value.split("?")[0];
  return /^\/(?:visitors|services|clients|app)(?:\/\d+)?$/.test(path) ||
    /^\/(?:infrastructure|settings|dashboard|sites|server|system-stats)$/.test(
      path,
    ) ||
    /^\/vault(?:\/[a-f0-9-]{36})?$/.test(path)
    ? value
    : "/visitors";
}

export function reportRange(search) {
  const query = new URLSearchParams(search);
  const from = Date.parse(query.get("from")),
    to = Date.parse(query.get("to"));
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > 90 * 86400000
  )
    return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export function legacyAppDestination(app, search = "") {
  if (!Number.isSafeInteger(Number(app?.id)) || Number(app.id) < 1)
    return "/services";
  return `${app.analytics_enabled ? "/visitors" : "/services"}/${Number(app.id)}${search}`;
}
