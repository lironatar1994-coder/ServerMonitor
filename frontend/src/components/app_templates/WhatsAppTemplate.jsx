import React, { useState, useEffect } from 'react';
import { Send, AlertTriangle, Clock, Power, RefreshCw, Smartphone, CheckCircle, XCircle } from 'lucide-react';
import LiveTerminal from '../LiveTerminal';

const WhatsAppTemplate = ({ app }) => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('0508611888');
  const [testMessage, setTestMessage] = useState('🔔 *בדיקת מערכת התראות מנטור Vee* - הודעת הבדיקה נשלחה בהצלחה!');
  const [sendingTest, setSendingTest] = useState(false);

  // WhatsApp worker states
  const [waStatus, setWaStatus] = useState(() => app.whatsapp_status ? {
    ...app.whatsapp_status,
    isOnline: app.whatsapp_status.isOnline ?? (app.whatsapp_status.status !== 'UNKNOWN')
  } : { status: 'UNKNOWN', qr: null, isOnline: false });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [togglingPower, setTogglingPower] = useState(false);

  const refreshWhatsAppData = async () => {
    await Promise.all([fetchVisitors(), fetchWhatsAppStatus()]);
  };

  const fetchVisitors = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/visitors?t=${Date.now()}`, {
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

  const fetchWhatsAppStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/whatsapp-status?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch (e) {
      console.error('Failed to load whatsapp status:', e);
    }
    setLoadingStatus(false);
  };

  const handlePowerAction = async (action) => {
    if (!window.confirm(`האם אתה בטוח שברצונך לבצע ${action === 'start' ? 'הפעלה' : action === 'stop' ? 'כיבוי' : 'אתחול'} לשירות ה-WhatsApp?`)) {
      return;
    }
    setTogglingPower(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/serve-monitor/api/apps/${app.id}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'הפעולה בוצעה בהצלחה');
        fetchWhatsAppStatus();
        if (action === 'start') {
          setTimeout(fetchWhatsAppStatus, 2000);
          setTimeout(fetchWhatsAppStatus, 5000);
        }
      } else {
        alert(data.error || 'שגיאה בביצוע הפעולה');
      }
    } catch (e) {
      console.error(e);
      alert('שגיאת תקשורת');
    }
    setTogglingPower(false);
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
        setTimeout(refreshWhatsAppData, 1500);
        setTimeout(refreshWhatsAppData, 4000);
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
    refreshWhatsAppData();

    const interval = setInterval(refreshWhatsAppData, 2000);
    const handleFocus = () => refreshWhatsAppData();
    const handleVisibility = () => {
      if (!document.hidden) {
        refreshWhatsAppData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [app.id]);

  const sentCount = visitors.filter(v => v.status === 'sent').length;
  const failedCount = visitors.filter(v => v.status === 'failed').length;
  const pendingCount = visitors.filter(v => v.status === 'pending' || v.status === 'pending').length;
  const qrImage = waStatus.qr || waStatus.qrCode || waStatus.qr_code;
  const hasActiveWhatsappState = waStatus.status === 'READY' || waStatus.status === 'NEEDS_SCAN' || waStatus.status === 'INITIALIZING';
  const shouldShowQr = qrImage && waStatus.status !== 'READY';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* WhatsApp Status and Controls Panel */}
      <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', direction: 'rtl' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone size={24} color="var(--accent-primary)" />
              סטטוס חיבור WhatsApp
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              ניהול וחיבור שירות ה-WhatsApp של Vee
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '30px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: (waStatus.isOnline || hasActiveWhatsappState)
                  ? (waStatus.status === 'READY' ? '#10b981' : waStatus.status === 'NEEDS_SCAN' ? '#f59e0b' : '#3b82f6')
                  : '#ef4444',
                boxShadow: (waStatus.isOnline || hasActiveWhatsappState) && waStatus.status === 'READY' 
                  ? '0 0 10px #10b981' 
                  : (waStatus.isOnline || hasActiveWhatsappState) && waStatus.status === 'NEEDS_SCAN'
                  ? '0 0 10px #f59e0b'
                  : '0 0 10px #ef4444',
                display: 'inline-block'
              }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>
                {!(waStatus.isOnline || hasActiveWhatsappState) 
                  ? 'השירות כבוי' 
                  : (waStatus.status === 'READY' ? 'מחובר ומאומת' 
                     : waStatus.status === 'NEEDS_SCAN' ? 'ממתין לסריקה' 
                     : waStatus.status === 'INITIALIZING' ? 'באתחול...' 
                     : 'שגיאה')}
              </span>
            </div>

            {/* PM2 Controls */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {waStatus.isOnline ? (
                <>
                  <button 
                    onClick={() => handlePowerAction('stop')}
                    disabled={togglingPower}
                    className="btn-danger"
                    style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', cursor: 'pointer' }}
                    title="כיבוי שירות"
                  >
                    <Power size={16} />
                    כבה
                  </button>
                  <button 
                    onClick={() => handlePowerAction('restart')}
                    disabled={togglingPower}
                    style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}
                    title="אתחול שירות"
                  >
                    <RefreshCw size={16} className={togglingPower ? 'animate-spin' : ''} />
                    אתחל
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handlePowerAction('start')}
                  disabled={togglingPower}
                  style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', cursor: 'pointer' }}
                  title="הפעל שירות"
                >
                  <Power size={16} />
                  הפעל שירות
                </button>
              )}
            </div>
          </div>
        </div>

        {/* QR Code section inside the panel if Needs Scan */}
        {shouldShowQr && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2rem',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '1.5rem',
            flexWrap: 'wrap',
            marginTop: '0.5rem',
            direction: 'rtl'
          }}>
            <div style={{ maxWidth: '300px', textAlign: 'right' }}>
              <h4 style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>סריקת קוד QR לחיבור</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                פתחו את אפליקציית WhatsApp בטלפון שלכם, היכנסו ל-<strong>מכשירים מקושרים</strong> וסרקו את הקוד המופיע משמאל. הנתונים יתעדכנו אוטומטית לאחר החיבור.
              </p>
            </div>
            <div style={{
              background: '#fff',
              padding: '10px',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img src={qrImage} alt="WhatsApp QR" style={{ width: '180px', height: '180px' }} />
            </div>
          </div>
        )}
      </div>

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
