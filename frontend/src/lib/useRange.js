import { useCallback, useState } from 'react';
import { getRangePreset } from './api';

const STORAGE_KEY = 'vee-monitor.range';

const readStored = (fallback) => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && (stored.days || stored.custom)) return stored;
  } catch { /* ignore unreadable storage */ }
  return fallback;
};

const persist = (value) => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  return value;
};

/**
 * Shared time range for every analytics screen. The selection follows the user
 * across pages, and `resolveRange` always recomputes "now" so live polling does
 * not freeze on the range captured at mount.
 */
export function useRange(defaultDays = 1) {
  const [state, setState] = useState(() => readStored({ days: defaultDays, custom: null }));

  const setDays = useCallback((days) => setState(persist({ days, custom: null })), []);
  const setCustom = useCallback((custom) => setState(persist({ days: null, custom })), []);
  const resolveRange = useCallback(() => state.custom || getRangePreset(state.days), [state]);

  return { days: state.days, custom: state.custom, setDays, setCustom, resolveRange };
}
