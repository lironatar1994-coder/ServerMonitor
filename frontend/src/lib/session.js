let snapshot = null,
  csrf = "",
  initialized = false;
const listeners = new Set();
export const getSessionSnapshot = () => snapshot;
export const getCsrf = () => csrf;
export const subscribeSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function setSession(data) {
  csrf = data?.csrf || "";
  snapshot = data?.next === "ready" ? data.user : null;
  initialized = true;
  listeners.forEach((fn) => fn());
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("auth-change"));
}
export async function bootstrapSession() {
  // Remove tokens left by older releases without reading or reusing them.
  if (typeof localStorage !== "undefined") localStorage.removeItem("token");
  const res = await fetch("/serve-monitor/api/auth/session", {
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) {
    setSession(null);
    return null;
  }
  if (!res.ok) throw new Error("לא ניתן לבדוק את ההתחברות. נסו שוב.");
  const data = await res.json();
  setSession(data);
  return data;
}
export const sessionInitialized = () => initialized;
