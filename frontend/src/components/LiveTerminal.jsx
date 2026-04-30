import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

// Dummy Logs for UI demonstration
const DUMMY_LOGS = [
  { type: 'info', text: '192.168.1.1 - GET /api/users/ping HTTP/1.1 200' },
  { type: 'info', text: '192.168.1.5 - GET /socket.io/?EIO=4 HTTP/1.1 200' },
  { type: 'error', text: '45.205.1.8 - PROPFIND / HTTP/1.1 502 (BLOCKED)' },
  { type: 'warning', text: 'Node.js PM2 process [vee-app] CPU spiked to 85%' },
  { type: 'info', text: '192.168.1.10 - POST /api/auth/login HTTP/1.1 200' },
  { type: 'success', text: 'System backup completed successfully in 4.2s' },
];

const LiveTerminal = () => {
  const [logs, setLogs] = useState(DUMMY_LOGS);
  const terminalEndRef = useRef(null);

  // Simulate incoming logs
  useEffect(() => {
    const interval = setInterval(() => {
      const newLog = DUMMY_LOGS[Math.floor(Math.random() * DUMMY_LOGS.length)];
      setLogs(prev => [...prev.slice(-15), { ...newLog, id: Date.now() }]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="terminal-window">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <TerminalIcon size={16} color="#60a5fa" />
        <span style={{ color: '#fff', fontWeight: '600', letterSpacing: '1px' }}>LIVE TAIL /var/log/nginx/access.log</span>
        <div style={{ marginRight: 'auto', display: 'flex', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></span>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {logs.map((log, i) => (
          <div key={i} style={{ display: 'flex', gap: '15px' }}>
            <span style={{ color: '#475569', minWidth: '70px' }}>
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className={`term-${log.type}`}>
              {log.text}
            </span>
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};

export default LiveTerminal;
