export function serviceState(app, operations, unavailable = false) {
  const issue = operations?.issues?.find((item) => item.appId === app.id);
  if (app.status !== "online")
    return { needsCheck: true, label: app.status === "unknown" ? "לא נבדק" : "לא זמין", issue };
  if (app.pm2_name === "seder-whatsapp" && unavailable)
    return { needsCheck: true, label: "חיבור לא אומת", issue: null };
  if (issue)
    return {
      needsCheck: true,
      label: issue.id === "seder-whatsapp"
        ? issue.severity === "unknown" ? "חיבור לא אומת" : "לא מחובר"
        : "לא זמין",
      issue,
    };
  return { needsCheck: false, label: "זמין", issue: null };
}
