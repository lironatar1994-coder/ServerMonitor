import { useCallback, useMemo, useState, useEffect } from 'react';
import { Globe, Activity, ShieldAlert, Search, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown, Users, X, Clock, MousePointerClick, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import LiveTerminal from '../LiveTerminal';

const emptyUniqueSummary = {
  total_unique: 0,
  human_unique: 0,
  bot_unique: 0,
  mixed_unique: 0,
  total_requests: 0,
  human_requests: 0,
  bot_requests: 0
};

const formatAccessTime = (timestamp) => {
  if (!timestamp) return '-';
  const parts = timestamp.split(':');
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]}:${parts[2]}:${parts[3].split(' ')[0]}`;
  }
  return timestamp;
};

const getClassificationStyle = (classification) => {
  if (classification === 'Bot') return { background: '#fee2e2', color: '#991b1b' };
  if (classification === 'Mixed') return { background: '#fef3c7', color: '#92400e' };
  return { background: '#d1fae5', color: '#065f46' };
};

const DefaultWebTemplate = ({ app }) => {
  const [visitors, setVisitors] = useState([]);
  const [uniqueVisitors, setUniqueVisitors] = useState([]);
  const [uniqueSummary, setUniqueSummary] = useState(emptyUniqueSummary);
  const [uniqueOpen, setUniqueOpen] = useState(false);
  const [uniqueLoading, setUniqueLoading] = useState(false);
  const [uniqueError, setUniqueError] = useState('');
  const [loading, setLoading] = useState(true);
  const [visitorFilters, setVisitorFilters] = useState({
    search: '',
    agent: 'all',
    method: 'all',
    status: 'all'
  });
  const [visitorSort, setVisitorSort] = useState({ key: null, direction: 'desc' });

  const fetchVisitors = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/visitors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVisitors(data.visitors || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [app.id]);

  const fetchUniqueVisitors = useCallback(async () => {
    setUniqueLoading(true);
    setUniqueError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/unique-visitors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`Failed to load unique visitors (${res.status})`);
      }
      const data = await res.json();
      setUniqueVisitors(data.visitors || []);
      setUniqueSummary(data.summary || emptyUniqueSummary);
    } catch (e) {
      console.error(e);
      setUniqueError(e.message || 'Failed to load unique visitors');
    } finally {
      setUniqueLoading(false);
    }
  }, [app.id]);

  const openUniqueVisitors = () => {
    setUniqueOpen(true);
    fetchUniqueVisitors();
  };

  useEffect(() => {
    const initialLoad = setTimeout(fetchVisitors, 0);
    const interval = setInterval(fetchVisitors, 5000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [fetchVisitors]);

  const chartData = app.history && app.history.length > 0 ? app.history : [{visitors:0, requests:0, attacks:0}];
  const currentMetrics = chartData[chartData.length - 1] || { visitors: 0, requests: 0, attacks: 0 };
  const availableMethods = useMemo(() => {
    return Array.from(new Set(visitors.map((visitor) => visitor.method).filter(Boolean))).sort();
  }, [visitors]);
  const filteredVisitors = useMemo(() => {
    const searchTerm = visitorFilters.search.trim().toLowerCase();

    return visitors.filter((visitor) => {
      const status = Number(visitor.status);
      const matchesSearch = !searchTerm || [
        visitor.ip,
        visitor.path,
        visitor.method,
        visitor.agent,
        visitor.status?.toString()
      ].some((value) => (value || '').toString().toLowerCase().includes(searchTerm));

      const matchesAgent = visitorFilters.agent === 'all' || visitor.agent === visitorFilters.agent;
      const matchesMethod = visitorFilters.method === 'all' || visitor.method === visitorFilters.method;
      const matchesStatus = visitorFilters.status === 'all'
        || (visitorFilters.status === 'success' && status >= 200 && status < 300)
        || (visitorFilters.status === 'redirect' && status >= 300 && status < 400)
        || (visitorFilters.status === 'client-error' && status >= 400 && status < 500)
        || (visitorFilters.status === 'server-error' && status >= 500);

      return matchesSearch && matchesAgent && matchesMethod && matchesStatus;
    });
  }, [visitors, visitorFilters]);
  const sortedVisitors = useMemo(() => {
    if (!visitorSort.key) return filteredVisitors;

    const monthMap = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11
    };
    const getTimestampValue = (timestamp) => {
      if (!timestamp) return 0;
      const timestampValue = timestamp.toString();
      const accessLogMatch = timestampValue.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
      if (accessLogMatch) {
        const [, day, month, year, hour, minute, second] = accessLogMatch;
        return Date.UTC(Number(year), monthMap[month] ?? 0, Number(day), Number(hour), Number(minute), Number(second));
      }

      const parsed = Date.parse(timestampValue);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const getSortValue = (visitor) => {
      if (visitorSort.key === 'timestamp') return getTimestampValue(visitor.timestamp);
      if (visitorSort.key === 'status') return Number(visitor.status) || 0;
      return (visitor[visitorSort.key] || '').toString().toLowerCase();
    };

    return [...filteredVisitors].sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : leftValue.localeCompare(rightValue, 'he', { numeric: true, sensitivity: 'base' });

      return visitorSort.direction === 'asc' ? result : -result;
    });
  }, [filteredVisitors, visitorSort]);
  const hasActiveVisitorFilters = Object.values(visitorFilters).some((value) => value !== '' && value !== 'all');

  const updateVisitorFilter = (key, value) => {
    setVisitorFilters((current) => ({ ...current, [key]: value }));
  };

  const resetVisitorFilters = () => {
    setVisitorFilters({ search: '', agent: 'all', method: 'all', status: 'all' });
  };

  const updateVisitorSort = (key) => {
    setVisitorSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderSortHeader = (key, label) => {
    const isActive = visitorSort.key === key;
    const Icon = isActive ? (visitorSort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

    return (
      <button
        type="button"
        onClick={() => updateVisitorSort(key)}
        style={{
          background: 'transparent',
          border: 'none',
          color: isActive ? 'var(--accent-primary)' : 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: '800',
          padding: 0
        }}
        title={`מיון לפי ${label}`}
      >
        <span>{label}</span>
        <Icon size={14} strokeWidth={2.4} />
      </button>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Stats Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Globe size={30} color="var(--accent-secondary)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>מבקרים סה״כ</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{currentMetrics.visitors || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Activity size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>בקשות / תעבורה</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{currentMetrics.requests || 0}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <ShieldAlert size={30} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>התקפות נחסמו</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{currentMetrics.attacks || 0}</p>
        </div>
      </div>

      {/* Chart and traffic sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>היסטוריית תעבורה (24 דגימות אחרונות)</h2>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" tickFormatter={(t) => t ? new Date(t).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}) : ''} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" name="בקשות" />
                <Area type="monotone" dataKey="visitors" stroke="var(--success)" strokeWidth={2} fill="transparent" name="מבקרים" />
                <Area type="monotone" dataKey="attacks" stroke="var(--danger)" strokeWidth={2} fill="transparent" name="התקפות" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} color="var(--accent-primary)" />
            מקורות תנועה
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ישראל 🇮🇱</span>
                <span style={{ fontWeight: 'bold' }}>78%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '78%', height: '100%', background: 'var(--accent-gradient)' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>ארצות הברית 🇺🇸</span>
                <span style={{ fontWeight: 'bold' }}>12%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '12%', height: '100%', background: 'var(--success)' }}></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600' }}>אירופה 🇪🇺</span>
                <span style={{ fontWeight: 'bold' }}>8%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '8%', height: '100%', background: 'var(--warning)' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Access Logs List */}
      <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>כניסות אחרונות (עד 100 כניסות אחרונות בזמן אמת)</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>
            מציג {filteredVisitors.length} מתוך {visitors.length} כניסות שנמצאו
          </p>
          <button
            type="button"
            onClick={openUniqueVisitors}
            className="btn-primary"
            style={{ padding: '9px 14px', gap: '8px', fontWeight: '800' }}
            title="Grouped unique visitor metrics"
          >
            <Users size={16} />
            Unique visitors
          </button>
          {hasActiveVisitorFilters && (
            <button
              type="button"
              onClick={resetVisitorFilters}
              className="btn-icon"
              style={{ gap: '8px', fontWeight: '700' }}
              title="איפוס סינונים"
            >
              <RotateCcw size={16} />
              איפוס
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1rem', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.85rem' }}>
            חיפוש
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="input-field"
                value={visitorFilters.search}
                onChange={(event) => updateVisitorFilter('search', event.target.value)}
                placeholder="IP, נתיב, מתודה, סטטוס"
                style={{ paddingRight: '38px' }}
              />
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.85rem' }}>
            סוג מכשיר
            <select
              className="input-field"
              value={visitorFilters.agent}
              onChange={(event) => updateVisitorFilter('agent', event.target.value)}
            >
              <option value="all">הכל</option>
              <option value="Mobile">נייד</option>
              <option value="Desktop">מחשב</option>
              <option value="Bot">בוט</option>
              <option value="Unknown">לא ידוע</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.85rem' }}>
            מתודה
            <select
              className="input-field"
              value={visitorFilters.method}
              onChange={(event) => updateVisitorFilter('method', event.target.value)}
            >
              <option value="all">הכל</option>
              {availableMethods.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '0.85rem' }}>
            סטטוס
            <select
              className="input-field"
              value={visitorFilters.status}
              onChange={(event) => updateVisitorFilter('status', event.target.value)}
            >
              <option value="all">הכל</option>
              <option value="success">2xx תקין</option>
              <option value="redirect">3xx הפניה</option>
              <option value="client-error">4xx שגיאת לקוח</option>
              <option value="server-error">5xx שגיאת שרת</option>
            </select>
          </label>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', direction: 'rtl' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('timestamp', 'זמן')}</th>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('ip', 'כתובת IP')}</th>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('method', 'מתודה')}</th>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('path', 'נתיב')}</th>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('agent', 'סוג')}</th>
                <th style={{ padding: '12px 8px' }}>{renderSortHeader('status', 'סטטוס')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && visitors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>טוען נתונים...</td>
                </tr>
              ) : visitors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>אין כניסות זמינות להצגה כעת</td>
                </tr>
              ) : sortedVisitors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>אין תוצאות שמתאימות לסינון הנוכחי</td>
                </tr>
              ) : (
                sortedVisitors.map((v, i) => {
                  const formatTime = (ts) => {
                    if (!ts) return '';
                    const parts = ts.split(':');
                    if (parts.length >= 4) {
                      return parts[1] + ':' + parts[2] + ':' + parts[3].split(' ')[0];
                    }
                    return ts;
                  };
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{formatTime(v.timestamp)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: '600' }}>{v.ip}</td>
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 'bold' }}>{v.method}</span></td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{v.path}</td>
                      <td style={{ padding: '10px 8px' }}>{v.agent === 'Mobile' ? '📱 נייד' : v.agent === 'Desktop' ? '💻 מחשב' : v.agent === 'Bot' ? '🤖 בוט' : '❓ לא ידוע'}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '6px', 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold',
                          background: v.status >= 200 && v.status < 300 ? '#d1fae5' : v.status >= 300 && v.status < 400 ? '#eff6ff' : v.status >= 400 && v.status < 500 ? '#fef3c7' : '#fee2e2',
                          color: v.status >= 200 && v.status < 300 ? '#065f46' : v.status >= 300 && v.status < 400 ? '#1e40af' : v.status >= 400 && v.status < 500 ? '#92400e' : '#991b1b'
                        }}>
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {uniqueOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unique visitors"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={() => setUniqueOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              width: 'min(1120px, 100%)',
              maxHeight: '86vh',
              overflow: 'hidden',
              padding: 0,
              background: 'rgba(255,255,255,0.98)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: '900', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Unique visitors</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>
                  Grouped by IP from the app access-log window. Human and bot traffic use the same classifier as dashboard metrics.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={fetchUniqueVisitors}
                  className="btn-icon"
                  style={{ padding: '9px', borderRadius: '8px' }}
                  title="Refresh unique visitors"
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setUniqueOpen(false)}
                  className="btn-icon"
                  style={{ padding: '9px', borderRadius: '8px' }}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                {[
                  ['Total unique', uniqueSummary.total_unique, Users, 'var(--accent-primary)'],
                  ['Human IPs', uniqueSummary.human_unique, Globe, 'var(--success)'],
                  ['Bot IPs', uniqueSummary.bot_unique, ShieldAlert, 'var(--danger)'],
                  ['Total requests', uniqueSummary.total_requests, MousePointerClick, 'var(--accent-secondary)'],
                  ['Human requests', uniqueSummary.human_requests, Activity, 'var(--success)'],
                  ['Bot requests', uniqueSummary.bot_requests, ShieldAlert, 'var(--danger)']
                ].map(([label, value, Icon, color]) => (
                  <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem 1rem', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color, fontWeight: '800', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                      <Icon size={15} />
                      {label}
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: 'var(--text-primary)' }}>{value || 0}</div>
                  </div>
                ))}
              </div>

              {uniqueError && (
                <div style={{ padding: '0.9rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontWeight: '800', marginBottom: '1rem' }}>
                  {uniqueError}
                </div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '920px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-secondary)', background: '#f8fafc' }}>
                      <th style={{ padding: '12px 10px' }}>IP</th>
                      <th style={{ padding: '12px 10px' }}>Type</th>
                      <th style={{ padding: '12px 10px' }}>Requests</th>
                      <th style={{ padding: '12px 10px' }}>First seen</th>
                      <th style={{ padding: '12px 10px' }}>Last seen</th>
                      <th style={{ padding: '12px 10px' }}>Device</th>
                      <th style={{ padding: '12px 10px' }}>Top paths</th>
                      <th style={{ padding: '12px 10px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueLoading && uniqueVisitors.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700' }}>Loading unique visitors...</td>
                      </tr>
                    ) : uniqueVisitors.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700' }}>No unique visitors found in the current log window.</td>
                      </tr>
                    ) : (
                      uniqueVisitors.map((visitor) => {
                        const classificationStyle = getClassificationStyle(visitor.classification);
                        return (
                          <tr key={visitor.ip} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '11px 10px', fontFamily: 'monospace', fontWeight: '800' }}>{visitor.ip}</td>
                            <td style={{ padding: '11px 10px' }}>
                              <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', ...classificationStyle }}>
                                {visitor.classification}
                              </span>
                              {visitor.bot_reason && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '4px' }}>{visitor.bot_reason}</div>
                              )}
                            </td>
                            <td style={{ padding: '11px 10px' }}>
                              <div style={{ fontWeight: '900' }}>{visitor.requests}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                                H {visitor.human_requests} / B {visitor.bot_requests}
                              </div>
                            </td>
                            <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              <Clock size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                              {formatAccessTime(visitor.first_seen)}
                            </td>
                            <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              <Clock size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                              {formatAccessTime(visitor.last_seen)}
                            </td>
                            <td style={{ padding: '11px 10px', fontWeight: '800' }}>{visitor.agent}</td>
                            <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.78rem', maxWidth: '260px' }}>
                              {(visitor.paths || []).map((path) => `${path.value} (${path.count})`).join(', ') || '-'}
                            </td>
                            <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                              {(visitor.statuses || []).map((status) => `${status.value} (${status.count})`).join(', ') || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terminal logs */}
      <div style={{ marginTop: '2rem', height: '400px' }}>
        <LiveTerminal appId={app.id} />
      </div>
    </div>
  );
};

export default DefaultWebTemplate;
