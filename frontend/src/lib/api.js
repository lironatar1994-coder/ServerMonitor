export async function apiFetch(path, options = {}) {
  const { timeoutMs = 20000, ...requestOptions } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
  const token = localStorage.getItem('token');
  const response = await fetch(`/serve-monitor/api${path}`, {
    ...requestOptions,
    signal: controller.signal,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-change'));
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new Error('ההתחברות פגה. יש להתחבר מחדש.');
  }

  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`השרת לא החזיר נתונים (${response.status}). נסו לרענן שוב.`);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `הבקשה נכשלה (${response.status})`);
  return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('השרת לא השיב בזמן. נסו שוב.', { cause: error });
    if (error instanceof TypeError) throw new Error('לא ניתן להתחבר לשרת. בדקו את החיבור ונסו שוב.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function getRangePreset(days = 1) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function rangeQuery(range) {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}
