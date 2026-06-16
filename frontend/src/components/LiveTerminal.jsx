import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

const LiveTerminal = ({ appId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialScrolled, setInitialScrolled] = useState(false);
  const containerRef = useRef(null);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${appId}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Map string logs to objects { type, text }
        const formattedLogs = (data.logs || []).map((log, index) => {
          let type = 'info';
          const lowerLog = log.toLowerCase();
          if (
            lowerLog.includes('error') || 
            lowerLog.includes('fail') || 
            lowerLog.includes('exception') ||
            log.includes(' 500 ') || 
            log.includes(' 502 ') || 
            log.includes(' 503 ') || 
            log.includes(' 404 ')
          ) {
             type = 'error';
          } else if (
            lowerLog.includes('warn') || 
            log.includes(' 400 ') || 
            log.includes(' 401 ') || 
            log.includes(' 403 ')
          ) {
             type = 'warning';
          } else if (
            log.includes(' 200 ') || 
            log.includes(' 304 ') || 
            lowerLog.includes('success') ||
            lowerLog.includes('online')
          ) {
             type = 'success';
          }
          return { type, text: log, id: `${index}-${Date.now()}` };
        });
        setLogs(formattedLogs);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    setInitialScrolled(false);
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [appId]);

  useEffect(() => {
    if (logs.length > 0 && !initialScrolled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setInitialScrolled(true);
    }
  }, [logs, initialScrolled]);

  return (
    <div ref={containerRef} className="terminal-window" style={{ overflowY: 'auto', maxHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <TerminalIcon size={16} color="#60a5fa" />
        <span style={{ color: '#fff', fontWeight: '600', letterSpacing: '1px' }}>LIVE TAIL ACCESS / APP LOGS</span>
        <div style={{ marginRight: 'auto', display: 'flex', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading && logs.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>טוען לוגים...</div>
        ) : logs.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>אין לוגים זמינים להצגה כעת</div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id || i} style={{ display: 'flex', gap: '15px' }}>
              <span className={`term-${log.type}`} style={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {log.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LiveTerminal;
