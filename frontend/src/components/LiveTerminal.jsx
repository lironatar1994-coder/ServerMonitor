import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { apiFetch } from '../lib/api';

const getLogType = (log) => {
  const value = log.toLowerCase();
  if (/error|fail|exception|\s50[023]\s|\s404\s/.test(value)) return 'error';
  if (/warn|\s40[013]\s/.test(value)) return 'warning';
  if (/\s20[0-9]\s|\s304\s|success|online/.test(value)) return 'success';
  return 'info';
};

const LiveTerminal = ({ appId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiFetch(`/apps/${appId}/logs`);
      setLogs((data.logs || []).map((log, index) => ({ type: getLogType(log), text: log, id: `${index}-${log}` })));
    } catch (error) {
      setLogs([{ type: 'error', text: error.message, id: 'fetch-error' }]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    const initial = window.setTimeout(fetchLogs, 0);
    const interval = window.setInterval(fetchLogs, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [fetchLogs]);

  const lastLogId = useMemo(() => logs.at(-1)?.id, [logs]);
  useEffect(() => {
    if (lastLogId && containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [lastLogId]);

  return (
    <div ref={containerRef} className="terminal-window">
      <div className="terminal-chrome"><TerminalIcon /><span>LIVE TAIL / APP LOGS</span><i /><i /><i /></div>
      {loading && !logs.length ? <div className="terminal-empty">טוען לוגים…</div> : !logs.length ? <div className="terminal-empty">אין לוגים זמינים כרגע</div> : logs.map((log) => <div key={log.id} className={`term-${log.type}`}>{log.text}</div>)}
    </div>
  );
};

export default LiveTerminal;
