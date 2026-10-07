import {
  Globe2,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  ServerCog,
  Settings,
  Wrench,
  BriefcaseBusiness,
  KeyRound,
  MoreHorizontal,
  X,
  Search,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Modal from "./Modal";
import QuickSwitch from "./QuickSwitch";
import { apiFetch } from "../lib/api";
import {
  getSessionSnapshot,
  subscribeSession,
  setSession,
} from "../lib/session";
const main = [
  { to: "/visitors", label: "אתרים", icon: Globe2 },
  { to: "/clients", label: "לקוחות", icon: BriefcaseBusiness },
  { to: "/vault", label: "כספת", icon: KeyRound },
];
const operations = [
  { to: "/infrastructure", label: "שרת ומשאבים", icon: ServerCog },
  { to: "/services", label: "שירותים", icon: Wrench },
];
const settings = { to: "/settings", label: "הגדרות", icon: Settings };
const NavItem = ({ item, onClick }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) => `rail-link ${isActive ? "is-active" : ""}`}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
};
export default function AppShell() {
  const [collapsed, setCollapsed] = useState(
      () => localStorage.getItem("vee-monitor.rail-collapsed") === "1",
    ),
    [more, setMore] = useState(false),
    [switching, setSwitching] = useState(false);
  const user = useSyncExternalStore(subscribeSession, getSessionSnapshot),
    navigate = useNavigate(),
    location = useLocation(),
    infrastructure = location.pathname.startsWith("/infrastructure");
  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", body: "{}" });
    } finally {
      setSession(null);
      const channel = new BroadcastChannel("monitor-session");
      channel.postMessage("logout");
      channel.close();
      navigate("/login", { replace: true });
    }
  };
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);
  useEffect(() => {
    const channel = new BroadcastChannel("monitor-session");
    channel.onmessage = (event) => {
      if (event.data === "logout") setSession(null);
      else if (event.data?.active) last = Math.max(last, event.data.active);
    };
    let last = Date.now();
    const active = () => {
      if (Date.now() - last >= 30 * 60000) {
        apiFetch("/auth/logout", { method: "POST", body: "{}" }).catch(
          () => {},
        );
        channel.postMessage("logout");
        setSession(null);
        return;
      }
      last = Date.now();
      channel.postMessage({ active: last });
    };
    const timer = setInterval(() => {
      if (Date.now() - last >= 30 * 60000) {
        apiFetch("/auth/logout", { method: "POST", body: "{}" }).catch(
          () => {},
        );
        channel.postMessage("logout");
        setSession(null);
      }
    }, 15000);
    window.addEventListener("pointerdown", active);
    window.addEventListener("keydown", active);
    return () => {
      channel.close();
      clearInterval(timer);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
    };
  }, []);
  useEffect(() => {
    if (!more) return;
    const close = (e) => {
      if (e.key === "Escape") setMore(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [more]);
  useEffect(() => {
    const shortcut = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        setSwitching(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const toggle = () =>
    setCollapsed((value) => {
      localStorage.setItem("vee-monitor.rail-collapsed", value ? "0" : "1");
      return !value;
    });
  return (
    <div
      className={`shell ${infrastructure ? "shell--infrastructure" : ""} ${collapsed ? "shell--collapsed" : ""}`}
      data-role={user?.role}
    >
      <a className="skip-link" href="#main-content">
        דלג לתוכן
      </a>
      <aside className="side-rail" aria-label="ניווט ראשי">
        <div className="rail-top">
          <span className="brand-name">
            <b>Server Monitor</b>
          </span>
          <button
            className="rail-toggle"
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "הרחבת תפריט" : "צמצום תפריט"}
          >
            {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </button>
        </div>
        <button
          className="rail-search"
          onClick={() => setSwitching(true)}
          aria-label="חיפוש וניווט"
          title="חיפוש וניווט (Ctrl+K)"
        >
          <Search aria-hidden="true" />
          <span>חיפוש מהיר</span>
          <kbd dir="ltr">Ctrl K</kbd>
        </button>
        <nav className="rail-nav">
          <span className="rail-section">סביבת עבודה</span>
          {main.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
          <span className="rail-section rail-section--operations">תפעול</span>
          {operations.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </nav>
        <div className="rail-foot">
          <NavItem item={settings} />
          <div className="rail-user">
            <span className="rail-avatar">{user?.username?.slice(0, 1)}</span>
            <span>
              <b>{user?.username}</b>
              <small>
                {user?.role === "owner"
                  ? "בעלים"
                  : user?.role === "editor"
                    ? "עורך"
                    : "קורא"}
              </small>
            </span>
          </div>
          <button
            className="rail-link rail-logout"
            type="button"
            onClick={logout}
            aria-label="התנתקות"
          >
            <LogOut />
            <span>התנתקות</span>
          </button>
        </div>
      </aside>
      <header className="mobile-header">
        <b>Server Monitor</b>
        <button
          className="mobile-search"
          onClick={() => setSwitching(true)}
          aria-label="חיפוש וניווט"
        >
          <Search />
        </button>
        <button className="mobile-logout" onClick={logout} aria-label="התנתקות">
          <LogOut />
        </button>
      </header>
      <main id="main-content" className="workspace" tabIndex="-1">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="ניווט נייד">
        {[...main, { ...operations[0], label: "שרת" }].map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
        <button
          className={
            more ||
            ["/settings", "/services"].some((p) =>
              location.pathname.startsWith(p),
            )
              ? "is-active"
              : ""
          }
          onClick={() => setMore(!more)}
          aria-expanded={more}
          aria-controls="mobile-more"
        >
          <MoreHorizontal />
          <span>עוד</span>
        </button>
      </nav>
      {switching && <QuickSwitch onClose={() => setSwitching(false)} />}
      {more && (
        <Modal
          className="mobile-more"
          label="עוד"
          onClose={() => setMore(false)}
        >
          <div>
            <h2>עוד</h2>
            <button
              className="icon-btn"
              aria-label="סגירת תפריט"
              onClick={() => setMore(false)}
            >
              <X />
            </button>
          </div>
          <NavItem item={operations[1]} onClick={() => setMore(false)} />
          <NavItem item={settings} onClick={() => setMore(false)} />
        </Modal>
      )}
    </div>
  );
}
