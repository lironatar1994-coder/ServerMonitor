import { useCallback, useMemo, useState, useEffect } from 'react';
import { Globe, Activity, ShieldAlert, Search, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown, Users, Clock, MousePointerClick, RefreshCw } from 'lucide-react';
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

const accessLogMonthMap = {
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

const parseAccessTimestamp = (timestamp) => {
  if (!timestamp) return null;
  const timestampValue = timestamp.toString();
  const accessLogMatch = timestampValue.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?/);
  if (accessLogMatch) {
    const [, day, month, year, hour, minute, second, offsetSign, offsetHour, offsetMinute] = accessLogMatch;
    let utcValue = Date.UTC(Number(year), accessLogMonthMap[month] ?? 0, Number(day), Number(hour), Number(minute), Number(second));
    if (offsetSign && offsetHour && offsetMinute) {
      const offsetMs = ((Number(offsetHour) * 60) + Number(offsetMinute)) * 60 * 1000;
      utcValue += offsetSign === '+' ? -offsetMs : offsetMs;
    }
    return new Date(utcValue);
  }

  const parsed = new Date(timestampValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatAccessDateTimeParts = (timestamp) => {
  const date = parseAccessTimestamp(timestamp);
  if (!date) return null;

  return {
    date: date.toLocaleDateString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }),
    time: date.toLocaleTimeString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  };
};

const formatTrafficDateLabel = (dateKey, full = false) => {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;

  if (!full) return `${day}.${month}`;

  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const knownHttpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const normalizeMethod = (method) => {
  const value = (method || '').toString().trim().toUpperCase();
  return knownHttpMethods.includes(value) ? value : 'OTHER';
};

const getMethodLabel = (method) => {
  const value = normalizeMethod(method);
  return value === 'OTHER' ? 'אחר' : value;
};

const getAccessTimestampValue = (timestamp) => {
  const date = parseAccessTimestamp(timestamp);
  return date ? date.getTime() : 0;
};

const getClassificationStyle = (classification) => {
  if (classification === 'Bot') return { background: '#fee2e2', color: '#991b1b' };
  if (classification === 'Mixed') return { background: '#fef3c7', color: '#92400e' };
  return { background: '#d1fae5', color: '#065f46' };
};

const getClassificationLabel = (classification) => {
  if (classification === 'Bot') return 'בוט';
  if (classification === 'Mixed') return 'מעורב';
  return 'אנושי';
};

const getBotReasonLabel = (reason) => {
  if (reason === 'missing user agent') return 'חסר User-Agent';
  if (reason === 'bot user agent') return 'User-Agent של בוט';
  if (reason === 'scanner path') return 'נתיב סריקה חשוד';
  return reason;
};

const renderAccessDateTime = (timestamp) => {
  const parts = formatAccessDateTimeParts(timestamp);
  if (!parts) return '-';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', lineHeight: 1.25 }}>
      <span style={{ fontWeight: '800', color: 'var(--text-primary)' }}>{parts.date}</span>
      <span style={{ fontFamily: 'monospace', direction: 'ltr', unicodeBidi: 'plaintext' }}>{parts.time}</span>
    </div>
  );
};

const DefaultWebTemplate = ({ app }) => {
  const [visitors, setVisitors] = useState([]);
  const [uniqueVisitors, setUniqueVisitors] = useState([]);
  const [uniqueSummary, setUniqueSummary] = useState(emptyUniqueSummary);
  const [uniqueOpen, setUniqueOpen] = useState(false);
  const [uniqueLoading, setUniqueLoading] = useState(false);
  const [uniqueError, setUniqueError] = useState('');
  const [uniqueFilter, setUniqueFilter] = useState('all');
  const [uniqueSort, setUniqueSort] = useState({ key: 'last_seen', direction: 'desc' });
  const [trafficRange, setTrafficRange] = useState(7);
  const [trafficHistory, setTrafficHistory] = useState([]);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState('');
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

  const fetchTrafficHistory = useCallback(async () => {
    setTrafficLoading(true);
    setTrafficError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/traffic-history?days=${trafficRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`Failed to load traffic history (${res.status})`);
      }
      const data = await res.json();
      setTrafficHistory(data.buckets || []);
    } catch (e) {
      console.error(e);
      setTrafficError(e.message || 'Failed to load traffic history');
    } finally {
      setTrafficLoading(false);
    }
  }, [app.id, trafficRange]);

  useEffect(() => {
    const initialLoad = setTimeout(fetchVisitors, 0);
    const interval = setInterval(fetchVisitors, 5000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [fetchVisitors]);

  useEffect(() => {
    const initialLoad = setTimeout(fetchTrafficHistory, 0);
    return () => clearTimeout(initialLoad);
  }, [fetchTrafficHistory]);

  const chartData = app.history && app.history.length > 0 ? app.history : [{visitors:0, requests:0, attacks:0}];
  const currentMetrics = chartData[chartData.length - 1] || { visitors: 0, requests: 0, attacks: 0 };
  const trafficChartData = trafficHistory.length > 0
    ? trafficHistory
    : Array.from({ length: trafficRange }, (_, index) => ({ date: `${index + 1}`, visitors: 0, requests: 0, attacks: 0 }));
  const activeTrafficDays = trafficHistory.filter((bucket) => Number(bucket.requests) > 0 || Number(bucket.visitors) > 0).length;
  const peakTrafficDay = trafficHistory.reduce((peak, bucket) => {
    if (!peak) return bucket;
    return (Number(bucket.visitors) || 0) > (Number(peak.visitors) || 0) ? bucket : peak;
  }, null);
  const trafficTotals = trafficHistory.reduce((totals, bucket) => ({
    visitors: totals.visitors + (Number(bucket.visitors) || 0),
    requests: totals.requests + (Number(bucket.requests) || 0)
  }), { visitors: 0, requests: 0 });
  const availableMethods = useMemo(() => {
    return Array.from(new Set(visitors.map((visitor) => normalizeMethod(visitor.method)).filter(Boolean))).sort((left, right) => {
      if (left === 'OTHER') return 1;
      if (right === 'OTHER') return -1;
      return knownHttpMethods.indexOf(left) - knownHttpMethods.indexOf(right);
    });
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
      const matchesMethod = visitorFilters.method === 'all' || normalizeMethod(visitor.method) === visitorFilters.method;
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
  const filteredUniqueVisitors = useMemo(() => {
    return uniqueVisitors.filter((visitor) => {
      if (uniqueFilter === 'human') return visitor.human_requests > 0;
      if (uniqueFilter === 'bot') return visitor.bot_requests > 0;
      if (uniqueFilter === 'mixed') return visitor.classification === 'Mixed';
      if (uniqueFilter === 'human_requests') return visitor.human_requests > 0;
      if (uniqueFilter === 'bot_requests') return visitor.bot_requests > 0;
      return true;
    });
  }, [uniqueFilter, uniqueVisitors]);
  const sortedUniqueVisitors = useMemo(() => {
    const getPrimaryPath = (visitor) => visitor.paths?.[0]?.value || '';
    const getPrimaryStatus = (visitor) => visitor.statuses?.[0]?.value || '';
    const getSortValue = (visitor) => {
      if (uniqueSort.key === 'requests') return Number(visitor.requests) || 0;
      if (uniqueSort.key === 'human_requests') return Number(visitor.human_requests) || 0;
      if (uniqueSort.key === 'bot_requests') return Number(visitor.bot_requests) || 0;
      if (uniqueSort.key === 'first_seen') return getAccessTimestampValue(visitor.first_seen);
      if (uniqueSort.key === 'last_seen') return getAccessTimestampValue(visitor.last_seen);
      if (uniqueSort.key === 'path') return getPrimaryPath(visitor).toLowerCase();
      if (uniqueSort.key === 'status') return getPrimaryStatus(visitor).toLowerCase();
      return (visitor[uniqueSort.key] || '').toString().toLowerCase();
    };

    return [...filteredUniqueVisitors].sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : leftValue.localeCompare(rightValue, 'en', { numeric: true, sensitivity: 'base' });

      return uniqueSort.direction === 'asc' ? result : -result;
    });
  }, [filteredUniqueVisitors, uniqueSort]);
  const uniqueFilterLabel = {
    all: 'כל המבקרים הייחודיים',
    human: 'מבקרים אנושיים',
    bot: 'בוטים',
    mixed: 'מעורבים',
    total_requests: 'כל הבקשות',
    human_requests: 'בקשות אנושיות',
    bot_requests: 'בקשות בוטים'
  }[uniqueFilter] || 'כל המבקרים הייחודיים';

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

  const updateUniqueSort = (key) => {
    setUniqueSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderUniqueSortHeader = (key, label) => {
    const isActive = uniqueSort.key === key;
    const Icon = isActive ? (uniqueSort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

    return (
      <button
        type="button"
        onClick={() => updateUniqueSort(key)}
        style={{
          background: 'transparent',
          border: 'none',
          color: isActive ? 'var(--accent-primary)' : 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: '900',
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
      <div className="web-overview-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="glass-card traffic-history-card" style={{ padding: '2rem' }}>
          <div className="traffic-history-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ marginBottom: '0.35rem', fontSize: '1.3rem', fontWeight: 'bold' }}>תנועת מבקרים</h2>
              <p className="desktop-helper-text" style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: '700' }}>
                היסטוריה לפי דגימות המוניטור. לא ספירה יומית ייחודית מדויקת.
              </p>
            </div>
            <div className="segmented-control" style={{ display: 'inline-flex', padding: '4px', borderRadius: '10px', background: '#f1f5f9', gap: '4px' }}>
              {[7, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTrafficRange(days)}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontWeight: '900',
                    color: trafficRange === days ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    background: trafficRange === days ? '#fff' : 'transparent',
                    boxShadow: trafficRange === days ? '0 2px 10px rgba(15, 23, 42, 0.08)' : 'none'
                  }}
                >
                  {days} ימים
                </button>
              ))}
            </div>
          </div>
          <div className="traffic-summary-strip" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontWeight: '800', fontSize: '0.9rem' }}>
            <span>מבקרים: <strong style={{ color: 'var(--text-primary)' }}>{trafficTotals.visitors}</strong></span>
            <span>בקשות: <strong style={{ color: 'var(--text-primary)' }}>{trafficTotals.requests}</strong></span>
            {trafficLoading && <span>מרענן...</span>}
          </div>
          {trafficError && (
            <div style={{ padding: '0.8rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontWeight: '800', marginBottom: '1rem' }}>
              {trafficError}
            </div>
          )}
          <div className="traffic-chart-wrap" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficChartData}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={(date) => formatTrafficDateLabel(date)} />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => formatTrafficDateLabel(date, true)}
                  formatter={(value, name) => [value, { visitors: 'מבקרים', requests: 'בקשות', attacks: 'התקפות' }[name] || name]}
                />
                <Area type="monotone" dataKey="requests" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorReq)" name="requests" />
                <Area type="monotone" dataKey="visitors" stroke="var(--success)" strokeWidth={3} fill="transparent" name="visitors" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card traffic-summary-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="var(--accent-primary)" />
            תקציר תקופה
          </h2>
          <div className="traffic-summary-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { label: 'ימים עם תנועה', value: `${activeTrafficDays}/${trafficRange}` },
              { label: 'שיא מבקרים ביום', value: peakTrafficDay ? `${peakTrafficDay.visitors} - ${formatTrafficDateLabel(peakTrafficDay.date)}` : '0' },
              { label: 'בקשות ממוצעות ליום', value: activeTrafficDays ? Math.round(trafficTotals.requests / activeTrafficDays) : 0 }
            ].map((item) => (
              <div key={item.label} style={{ paddingBottom: '0.9rem', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '800', marginBottom: '0.25rem' }}>{item.label}</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: '900' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Access Logs List */}
      <div className="glass-card visitor-panel" style={{ padding: '2rem', marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>
          {uniqueOpen ? 'מבקרים ייחודיים' : 'כניסות אחרונות'}
        </h2>
        <div className="visitor-panel-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <p className="desktop-helper-text" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700', display: uniqueOpen ? 'none' : 'block' }}>
            מציג {filteredVisitors.length} מתוך {visitors.length} כניסות שנמצאו
          </p>
          {uniqueOpen && (
            <p className="desktop-helper-text" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>
              מציג {sortedUniqueVisitors.length} מתוך {uniqueVisitors.length} מבקרים ייחודיים - {uniqueFilterLabel}
            </p>
          )}
          <button
            type="button"
            onClick={uniqueOpen ? () => setUniqueOpen(false) : openUniqueVisitors}
            className={uniqueOpen ? 'btn-icon' : 'btn-primary'}
            style={{ padding: '9px 14px', gap: '8px', fontWeight: '800' }}
            title={uniqueOpen ? 'הצג כניסות אחרונות' : 'הצג מדדי מבקרים ייחודיים'}
          >
            {uniqueOpen ? <Activity size={16} /> : <Users size={16} />}
            {uniqueOpen ? 'כניסות אחרונות' : 'מבקרים ייחודיים'}
          </button>
          {!uniqueOpen && hasActiveVisitorFilters && (
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
        {!uniqueOpen && (
          <>
        <div className="visitor-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1rem', alignItems: 'end' }}>
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
                <option key={method} value={method}>{getMethodLabel(method)}</option>
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
        <div className="desktop-visitors-table" style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
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
                      <td style={{ padding: '10px 8px' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 'bold' }}>{getMethodLabel(v.method)}</span></td>
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
        <div className="mobile-visitors-list">
          {loading && visitors.length === 0 ? (
            <div className="mobile-empty-state">טוען נתונים...</div>
          ) : visitors.length === 0 ? (
            <div className="mobile-empty-state">אין כניסות זמינות להצגה כעת</div>
          ) : sortedVisitors.length === 0 ? (
            <div className="mobile-empty-state">אין תוצאות שמתאימות לסינון הנוכחי</div>
          ) : (
            sortedVisitors.slice(0, 10).map((visitor, index) => (
              <div key={`${visitor.ip}-${visitor.timestamp}-${index}`} className="visitor-mobile-card">
                <div className="visitor-mobile-card-top">
                  <span className="visitor-mobile-ip">{visitor.ip}</span>
                  <span className="visitor-mobile-status">{visitor.status}</span>
                </div>
                <div className="visitor-mobile-meta">
                  <span>{getMethodLabel(visitor.method)}</span>
                  <span>{visitor.agent}</span>
                  <span>{formatAccessDateTimeParts(visitor.timestamp)?.time || visitor.timestamp}</span>
                </div>
                <div className="visitor-mobile-path">{visitor.path}</div>
              </div>
            ))
          )}
          {sortedVisitors.length > 10 && (
            <div className="mobile-empty-state">מוצגות 10 הכניסות הראשונות מתוך {sortedVisitors.length}</div>
          )}
        </div>
          </>
        )}
        {uniqueOpen && (
          <div>
            <div className="unique-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', direction: 'rtl', textAlign: 'right' }}>
              <p className="desktop-helper-text" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '700' }}>
                מקובץ לפי כתובת IP מתוך חלון לוג הכניסות של האפליקציה. תעבורה אנושית ובוטים מסווגים באותה שיטה של מדדי הדשבורד.
              </p>
              <button
                type="button"
                onClick={fetchUniqueVisitors}
                className="btn-icon"
                style={{ gap: '8px', fontWeight: '800' }}
                title="רענון מבקרים ייחודיים"
              >
                <RefreshCw size={16} />
                רענון
              </button>
            </div>

            <div className="unique-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.8rem', marginBottom: '1rem', direction: 'rtl' }}>
              {[
                { key: 'all', label: 'סה״כ ייחודיים', value: uniqueSummary.total_unique, Icon: Users, color: 'var(--accent-primary)', sortKey: 'last_seen' },
                { key: 'human', label: 'אנושיים', value: uniqueSummary.human_unique, Icon: Globe, color: 'var(--success)', sortKey: 'last_seen' },
                { key: 'bot', label: 'בוטים', value: uniqueSummary.bot_unique, Icon: ShieldAlert, color: 'var(--danger)', sortKey: 'last_seen' },
                { key: 'mixed', label: 'מעורבים', value: uniqueSummary.mixed_unique, Icon: Activity, color: 'var(--warning)', sortKey: 'last_seen' },
                { key: 'total_requests', label: 'כל הבקשות', value: uniqueSummary.total_requests, Icon: MousePointerClick, color: 'var(--accent-secondary)', sortKey: 'requests' },
                { key: 'human_requests', label: 'בקשות אנושיות', value: uniqueSummary.human_requests, Icon: Activity, color: 'var(--success)', sortKey: 'human_requests' },
                { key: 'bot_requests', label: 'בקשות בוטים', value: uniqueSummary.bot_requests, Icon: ShieldAlert, color: 'var(--danger)', sortKey: 'bot_requests' }
              ].map(({ key, label, value, Icon, color, sortKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setUniqueFilter(key);
                    setUniqueSort({ key: sortKey, direction: 'desc' });
                  }}
                  style={{
                    border: uniqueFilter === key ? '2px solid var(--accent-primary)' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: uniqueFilter === key ? '0.84rem 0.94rem' : '0.9rem 1rem',
                    background: uniqueFilter === key ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'right',
                    boxShadow: uniqueFilter === key ? '0 8px 18px rgba(59, 130, 246, 0.12)' : 'none'
                  }}
                  title={`הצג ${label}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color, fontWeight: '800', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                    <Icon size={15} />
                    {label}
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: '900', color: 'var(--text-primary)' }}>{value || 0}</div>
                </button>
              ))}
            </div>

            {uniqueError && (
              <div style={{ padding: '0.9rem 1rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontWeight: '800', marginBottom: '1rem' }}>
                {uniqueError}
              </div>
            )}

            <div className="desktop-visitors-table" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', direction: 'rtl' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', minWidth: '920px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-secondary)', background: '#f8fafc' }}>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('ip', 'כתובת IP')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('classification', 'סוג')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('requests', 'בקשות')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('first_seen', 'נראה לראשונה')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('last_seen', 'נראה לאחרונה')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('agent', 'מכשיר')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('path', 'נתיבים מובילים')}</th>
                    <th style={{ padding: '12px 10px' }}>{renderUniqueSortHeader('status', 'סטטוס')}</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueLoading && uniqueVisitors.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700' }}>טוען מבקרים ייחודיים...</td>
                    </tr>
                  ) : uniqueVisitors.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700' }}>לא נמצאו מבקרים ייחודיים בחלון הלוג הנוכחי.</td>
                    </tr>
                  ) : sortedUniqueVisitors.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '700' }}>אין מבקרים ייחודיים שמתאימים לסינון הנבחר.</td>
                    </tr>
                  ) : (
                    sortedUniqueVisitors.map((visitor) => {
                      const classificationStyle = getClassificationStyle(visitor.classification);
                      return (
                        <tr key={visitor.ip} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '11px 10px', fontFamily: 'monospace', fontWeight: '800' }}>{visitor.ip}</td>
                          <td style={{ padding: '11px 10px' }}>
                            <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '900', ...classificationStyle }}>
                              {getClassificationLabel(visitor.classification)}
                            </span>
                            {visitor.bot_reason && (
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '4px' }}>{getBotReasonLabel(visitor.bot_reason)}</div>
                            )}
                          </td>
                          <td style={{ padding: '11px 10px' }}>
                            <div style={{ fontWeight: '900' }}>{visitor.requests}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                              אנושי {visitor.human_requests} / בוט {visitor.bot_requests}
                            </div>
                          </td>
                          <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            <Clock size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                            {renderAccessDateTime(visitor.first_seen)}
                          </td>
                          <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            <Clock size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                            {renderAccessDateTime(visitor.last_seen)}
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
            <div className="mobile-visitors-list">
              {uniqueLoading && uniqueVisitors.length === 0 ? (
                <div className="mobile-empty-state">טוען מבקרים ייחודיים...</div>
              ) : uniqueVisitors.length === 0 ? (
                <div className="mobile-empty-state">לא נמצאו מבקרים ייחודיים בחלון הלוג הנוכחי.</div>
              ) : sortedUniqueVisitors.length === 0 ? (
                <div className="mobile-empty-state">אין מבקרים ייחודיים שמתאימים לסינון הנבחר.</div>
              ) : (
                sortedUniqueVisitors.slice(0, 10).map((visitor) => {
                  const classificationStyle = getClassificationStyle(visitor.classification);
                  return (
                    <div key={visitor.ip} className="visitor-mobile-card">
                      <div className="visitor-mobile-card-top">
                        <span className="visitor-mobile-ip">{visitor.ip}</span>
                        <span className="visitor-mobile-badge" style={classificationStyle}>
                          {getClassificationLabel(visitor.classification)}
                        </span>
                      </div>
                      <div className="visitor-mobile-meta">
                        <span>{visitor.requests} בקשות</span>
                        <span>אנושי {visitor.human_requests}</span>
                        <span>בוט {visitor.bot_requests}</span>
                      </div>
                      <div className="visitor-mobile-time">
                        <Clock size={13} />
                        {renderAccessDateTime(visitor.last_seen)}
                      </div>
                      <div className="visitor-mobile-path">
                        {(visitor.paths || []).map((path) => `${path.value} (${path.count})`).join(', ') || '-'}
                      </div>
                    </div>
                  );
                })
              )}
              {sortedUniqueVisitors.length > 10 && (
                <div className="mobile-empty-state">מוצגים 10 המבקרים הראשונים מתוך {sortedUniqueVisitors.length}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Terminal logs */}
      <div className="terminal-section" style={{ marginTop: '2rem', height: '400px' }}>
        <LiveTerminal appId={app.id} />
      </div>
    </div>
  );
};

export default DefaultWebTemplate;
