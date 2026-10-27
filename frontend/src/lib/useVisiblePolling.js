import { useEffect } from 'react';

// Refresh on return to the tab and on a quiet interval; hidden tabs do no work.
export function useVisiblePolling(load, intervalMs = 60000) {
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async (quiet = false) => {
      if (!active || pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { await load(quiet); } finally { pending = false; }
    };
    const resume = () => refresh(true);
    const initial = window.setTimeout(() => refresh(), 0);
    const interval = window.setInterval(resume, intervalMs);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [load, intervalMs]);
}
