export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/serve-monitor/api${path}`, {
    ...options,
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `הבקשה נכשלה (${response.status})`);
  return data;
}

export function getRangePreset(days = 1) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function rangeQuery(range) {
  return new URLSearchParams({ from: range.from, to: range.to }).toString();
}
