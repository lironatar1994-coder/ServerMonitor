import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Globe2,
  KeyRound,
  Search,
  ServerCog,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { reportRange } from "../lib/reportNavigation";
import { rangeSearch } from "../lib/dailyCheck";
import { useRange } from "../lib/useRange";

const destinations = [
  { id: "sites", title: "אתרים", to: "/visitors", icon: Globe2 },
  { id: "clients", title: "לקוחות", to: "/clients", icon: BriefcaseBusiness },
  { id: "vault", title: "כספת", to: "/vault", icon: KeyRound },
  {
    id: "server",
    title: "שרת ומשאבים",
    to: "/infrastructure",
    icon: ServerCog,
  },
  { id: "services", title: "שירותים", to: "/services", icon: Wrench },
  { id: "settings", title: "הגדרות", to: "/settings", icon: Settings },
];
const publicLocation = (value) => {
  try {
    const url = new URL(value);
    return url.hostname + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return "";
  }
};
export default function QuickSwitch({ onClose }) {
  const [apps, setApps] = useState([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const navigate = useNavigate(),
    location = useLocation(),
    input = useRef(null);
  const { resolveRange } = useRange(1);
  useEffect(() => {
    let alive = true;
    apiFetch("/apps")
      .then((value) => alive && setApps(value))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const nav = destinations.filter((item) =>
      item.title.toLocaleLowerCase().includes(term),
    );
    const list = apps
      .filter((app) =>
        `${app.name} ${publicLocation(app.url)}`
          .toLocaleLowerCase()
          .includes(term),
      )
      .map((app) => ({
        id: `app-${app.id}`,
        title: app.name,
        description:
          publicLocation(app.url) || app.pm2_name || app.systemd_unit,
        app,
        icon: app.analytics_enabled ? Globe2 : Wrench,
      }));
    return [...nav, ...list].slice(0, 40);
  }, [apps, query]);
  const choose = (item) => {
    if (!item) return;
    let to = item.to;
    if (item.app)
      to = item.app.analytics_enabled
        ? `/visitors/${item.app.id}${rangeSearch(reportRange(location.search) || resolveRange())}`
        : `/services/${item.app.id}`;
    onClose();
    navigate(to);
  };
  return (
    <Modal label="חיפוש וניווט" onClose={onClose} className="quick-switch">
      <div className="quick-switch__search">
        <Search aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-switch-results"
          aria-activedescendant={
            results[selected] ? `quick-${results[selected].id}` : undefined
          }
          aria-label="חיפוש מסך, אתר או שירות"
          placeholder="חיפוש מסך, אתר או שירות"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const index =
                (selected +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  results.length) %
                Math.max(1, results.length);
              setSelected(index);
              document
                .getElementById(`quick-${results[index]?.id}`)
                ?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(results[selected]);
            }
          }}
        />
        <button className="icon-btn" aria-label="סגירת חיפוש" onClick={onClose}>
          <X />
        </button>
      </div>
      <div
        className="quick-switch__results"
        id="quick-switch-results"
        role="listbox"
        aria-label="תוצאות חיפוש"
      >
        {results.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              id={`quick-${item.id}`}
              role="option"
              aria-selected={selected === index}
              tabIndex={-1}
              className={selected === index ? "is-selected" : ""}
              key={item.id}
              onMouseMove={() => setSelected(index)}
              onClick={() => choose(item)}
            >
              <Icon aria-hidden="true" />
              <span>
                <b dir="auto">{item.title}</b>
                {item.description && (
                  <small dir="ltr">{item.description}</small>
                )}
              </span>
              <ArrowLeft aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {!results.length && <p className="empty">אין תוצאות שתואמות לחיפוש</p>}
      {loading && (
        <p className="quick-switch__status" role="status">
          טוען את רשימת האתרים…
        </p>
      )}
      {error && (
        <p className="quick-switch__status" role="alert">
          {error} · אפשר עדיין לעבור בין המסכים.
        </p>
      )}
      <footer>
        <span>
          <kbd>Enter</kbd> לפתיחה
        </span>
        <span>
          <kbd>Esc</kbd> לסגירה
        </span>
      </footer>
    </Modal>
  );
}
