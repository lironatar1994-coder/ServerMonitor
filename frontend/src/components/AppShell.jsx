import { Activity, Globe2, LogOut, PanelRightClose, PanelRightOpen, ServerCog, Settings, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const navigation = [
  { to: '/visitors', label: 'מבקרים', icon: Globe2 },
  { to: '/infrastructure', label: 'שרת', icon: ServerCog },
  { to: '/services', label: 'שירותים', icon: Wrench },
  { to: '/settings', label: 'הגדרות', icon: Settings }
];

const RAIL_KEY = 'vee-monitor.rail-collapsed';

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const infrastructureMode = location.pathname.startsWith('/infrastructure');
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(RAIL_KEY) === '1');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const toggleRail = () => setCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem(RAIL_KEY, next ? '1' : '0');
    return next;
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-change'));
    navigate('/login', { replace: true });
  };

  const current = navigation.find(({ to }) => location.pathname.startsWith(to));

  return (
    <div className={`shell ${infrastructureMode ? 'shell--infrastructure' : ''} ${collapsed ? 'shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">דלג לתוכן</a>

      <aside className="side-rail" aria-label="ניווט ראשי">
        <div className="rail-top">
          <span className="brand-stamp" aria-hidden="true"><Activity /></span>
          <span className="brand-name"><b>Vee</b><small>Monitor</small></span>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            aria-label={collapsed ? 'הרחבת תפריט' : 'צמצום תפריט'}
            title={collapsed ? 'הרחבת תפריט' : 'צמצום תפריט'}
          >
            {collapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}
          </button>
        </div>

        <nav className="rail-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label} className={({ isActive }) => `rail-link ${isActive ? 'is-active' : ''}`}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <span className="live-signal" title="הנתונים מתעדכנים אוטומטית"><i aria-hidden="true" /><span>מחובר</span></span>
          <button type="button" className="rail-link rail-logout" onClick={handleLogout} title="התנתקות">
            <LogOut aria-hidden="true" /><span>התנתקות</span>
          </button>
        </div>
      </aside>

      <header className="mobile-header">
        <span className="brand-stamp" aria-hidden="true"><Activity /></span>
        <b>{current?.label || 'Vee Monitor'}</b>
        <button type="button" className="mobile-logout" onClick={handleLogout} aria-label="התנתקות">
          <LogOut aria-hidden="true" />
        </button>
      </header>

      <main id="main-content" className="workspace" tabIndex="-1">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="ניווט נייד">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default AppShell;
