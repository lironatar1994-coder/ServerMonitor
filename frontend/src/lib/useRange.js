import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRangePreset } from './api';
import { reportRange } from './reportNavigation';
const STORAGE_KEY = 'vee-monitor.range';
const readStored = fallback => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if ([1, 7, 30, 90].includes(stored?.days)) return { days: stored.days, custom: null };
    if (stored?.custom && reportRange(new URLSearchParams(stored.custom).toString())) return stored;
  } catch { /* optional storage */ }
  return fallback;
};
const persist = value => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* optional storage */ } return value; };
export function useRange(defaultDays = 1) {
  const location = useLocation(), navigate = useNavigate();
  const [stored, setStored] = useState(() => readStored({ days: defaultDays, custom: null }));
  const params = new URLSearchParams(location.search);
  const from = params.get('from'), to = params.get('to');
  const linked = useMemo(() => reportRange(new URLSearchParams({ from, to }).toString()), [from, to]);
  const state = useMemo(() => linked ? { days: null, custom: linked } : stored, [linked, stored]);
  const update = useCallback(value => {
    setStored(persist(value));
    const query = new URLSearchParams(location.search);
    query.delete('from'); query.delete('to');
    // A shared page drill-down must retain its exact period on another browser.
    if (query.has('page')) {
      const range = value.custom || getRangePreset(value.days);
      query.set('from', range.from); query.set('to', range.to);
    }
    navigate({ pathname: location.pathname, search: query.toString() }, { replace: true });
  }, [location.pathname, location.search, navigate]);
  const setDays = useCallback(days => update({ days, custom: null }), [update]);
  const setCustom = useCallback(custom => update({ days: null, custom }), [update]);
  const resolveRange = useCallback(() => state.custom || getRangePreset(state.days), [state]);
  return { ...state, setDays, setCustom, resolveRange };
}
