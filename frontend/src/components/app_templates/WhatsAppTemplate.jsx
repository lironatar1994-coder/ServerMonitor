import React, { useState, useEffect } from 'react';
import { Send, AlertTriangle, Clock } from 'lucide-react';
import LiveTerminal from '../LiveTerminal';

const WhatsAppTemplate = ({ app }) => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('0508611888');
  const [testMessage, setTestMessage] = useState('🔔 *בדיקת מערכת התראות מנטור Vee* - הודעת הבדיקה נשלחה בהצלחה!');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchVisitors = async () => {
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
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    setSendingTest(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/serve-monitor/api/auth/test-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phone: testPhone, message: testMessage })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'הודעת בדיקה נשלחה בהצלחה');
        fetchVisitors();
      } else {
        alert(data.error || 'שגיאה בשליחת הודעת בדיקה');
      }
    } catch (err) {
      console.error(err);
      alert('שגיאת תקשורת עם השרת');
    }
    setSendingTest(false);
  };

  useEffect(() => {
    fetchVisitors();
    const interval = setInterval(fetchVisitors, 5000);
    return () => clearInterval(interval);
  }, [app.id]);

  const sentCount = visitors.filter(v => v.status === 'sent').length;
  const failedCount = visitors.filter(v => v.status === 'failed').length;
  const pendingCount = visitors.filter(v => v.status === 'pending' || v.status === 'pending').length;

  return (
    <div className="animate-fade-in">
      {/* Stats Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Send size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>הודעות שנשלחו (מתוך 100)</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{sentCount}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertTriangle size={30} color="var(--danger)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>הודעות שנכשלו (מתוך 100)</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>{failedCount}</p>
        </div>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Clock size={30} color="var(--warning)" style={{ margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>הודעות בממתין (מתוך 100)</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>{pendingCount}</p>
        </div>
      </div>

      {/* Grid container for Messages Table and Send Test WhatsApp */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
        {/* Messages Table */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>הודעות אחרונות (100 הודעות אחרונות בזמן אמת)</h2>
          <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', direction: 'rtl' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 8px' }}>תאריך וזמן שליחה</th>
                  <th style={{ padding: '12px 8px' }}>מספר יעד</th>
                  <th style={{ padding: '12px 8px' }}>סטטוס</th>
                  <th style={{ padding: '12px 8px' }}>תוכן ההודעה</th>
                  <th style={{ padding: '12px 8px' }}>שגיאה</th>
                </tr>
              </thead>
              <tbody>
                {loading && visitors.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>טוען נתונים...</td>
                  </tr>
                ) : visitors.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>אין הודעות זמינות להצגה כעת</td>
                  </tr>
                ) : (
                  visitors.map((v, i) => {
                    const formatTime = (ts) => {
                      if (!ts) return '';
                      try {
                        let dateStr = ts;
                        if (!ts.includes('T') && !ts.includes('Z') && !ts.includes('+')) {
                          // SQLite datetime values are stored in UTC like 'YYYY-MM-DD HH:MM:SS'.
                          // Replace the space with 'T' and add 'Z' to parse as proper UTC in JS.
                          dateStr = ts.trim().replace(' ', 'T') + 'Z';
                        }
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) return ts;
                        return date.toLocaleString('he-IL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        });
                      } catch(e) {
                        return ts;
                      }
                    };
                    let statusBg = '#fef3c7'; // pending
                    let statusText = '#92400e';
                    if (v.status === 'sent') {
                      statusBg = '#d1fae5';
                      statusText = '#065f46';
                    } else if (v.status === 'failed') {
                      statusBg = '#fee2e2';
                      statusText = '#991b1b';
                    }
                    return (
                      <tr key={v.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{formatTime(v.created_at)}</td>
                        <td style={{ padding: '10px 8px', fontWeight: '600' }}>{v.phone}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.8rem', 
                            fontWeight: 'bold',
                            background: statusBg,
                            color: statusText
                          }}>
                            {v.status === 'sent' ? 'נשלח' : v.status === 'failed' ? 'נכשל' : 'ממתין'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.message}>
                          {v.message}
                        </td>
                        <td style={{ padding: '10px 8px', color: 'var(--danger)', fontSize: '0.85rem' }}>{v.error || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Send Test WhatsApp */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 'bold' }}>בדיקת שליחת WhatsApp</h2>
          <form onSubmit={handleSendTest} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>מספר טלפון ליעד (עם קידומת מדינה) *</label>
              <input 
                type="text"
                required
                placeholder="למשל: 0508611888"
                className="input-field" 
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>תוכן ההודעה לבדיקה *</label>
              <textarea 
                required
                rows={3}
                className="input-field" 
                style={{ resize: 'vertical', minHeight: '80px' }}
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={sendingTest}>
              {sendingTest ? 'שולח...' : 'שלח הודעת בדיקה'}
            </button>
          </form>
        </div>
      </div>

      {/* Terminal Console */}
      <div style={{ marginTop: '2rem', height: '400px' }}>
        <LiveTerminal appId={app.id} />
      </div>
    </div>
  );
};

export default WhatsAppTemplate;
