import { Activity, Bell, Globe2, LogOut, ServerCog, Settings, Wrench } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const navigation = [
  { to: '/visitors', label: 'מבקרים', short: 'מבקרים', icon: Globe2 },
  { to: '/infrastructure', label: 'שרת ומשאבים', short: 'שרת', icon: ServerCog },
  { to: '/services', label: 'שירותים', short: 'שירותים', icon: Wrench },
  { to: '/settings', label: 'הגדרות', short: 'הגדרות', icon: Settings }
];

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const infrastructureMode = location.pathname.startsWith('/infrastructure');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-change'));
    navigate('/login', { replace: true });
  };

  return (
    <div className={`shell ${infrastructureMode ? 'shell--infrastructure' : ''}`}>
      <a className="skip-link" href="#main-content">דלג לתוכן</a>
      <aside className="side-rail" aria-label="ניווט ראשי">
        <div className="brand-lockup" aria-label="Vee Monitor">
          <span className="brand-stamp"><Activity /></span>
          <span><b>Vee</b><small>Monitor / מבט חי</small></span>
        </div>
        <nav className="rail-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `rail-link ${isActive ? 'is-active' : ''}`}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="live-signal"><i /> מערכת פעילה</span>
          <button type="button" className="rail-link rail-logout" onClick={handleLogout}>
            <LogOut aria-hidden="true" /><span>התנתקות</span>
          </button>
        </div>
      </aside>

      <header className="mobile-header">
        <div className="brand-lockup"><span className="brand-stamp"><Activity /></span><b>Vee Monitor</b></div>
        <span className="mobile-live"><i /> חי</span>
      </header>

      <main id="main-content" className="workspace" tabIndex="-1">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="ניווט נייד">
        {navigation.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon aria-hidden="true" /><span>{short}</span>
          </NavLink>
        ))}
      </nav>

      <button type="button" className="alert-fab" aria-label="הצג התראות" title="אין התראות חדשות">
        <Bell aria-hidden="true" />
      </button>
    </div>
  );
};

export default AppShell;
