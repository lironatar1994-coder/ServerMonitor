import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Plus, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AddAppModal from "../components/AddAppModal";
import {
  DataState,
  Empty,
  Panel,
  PageHead,
  Tabs,
} from "../components/AnalyticsParts";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { getSessionSnapshot } from "../lib/session";
import { serviceState } from "../lib/serviceState";

const FILTERS = [
  { id: "all", label: "הכול" },
  { id: "online", label: "זמינים" },
  { id: "issues", label: "לבדיקה" },
];

const Services = () => {
  const [params] = useSearchParams();
  const [apps, setApps] = useState([]);
  const [operations, setOperations] = useState(null);
  const [operationsError, setOperationsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState(
    ["all", "online", "issues"].includes(params.get("filter"))
      ? params.get("filter")
      : "all",
  );
  const [search, setSearch] = useState(params.get("search") || "");

  const fetchApps = useCallback(async () => {
    try {
      const [catalog, health] = await Promise.all([
        apiFetch("/apps"),
        apiFetch("/apps/operational-health").catch(() => ({ unavailable: true })),
      ]);
      setApps(catalog);
      setOperations(health);
      setOperationsError(Boolean(health.unavailable));
      setError("");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(fetchApps, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchApps]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return apps
      .filter((app) => {
        const state = serviceState(app, operations, operationsError);
        if (filter === "online" && state.needsCheck)
          return false;
        if (filter === "issues" && !state.needsCheck)
          return false;
        if (!term) return true;
        return [
          app.name,
          app.url,
          app.pm2_name,
          app.systemd_unit,
          app.log_path,
        ].some((field) => (field || "").toLowerCase().includes(term));
      })
      .sort(
        (a, b) =>
          Number(serviceState(b, operations, operationsError).needsCheck) -
            Number(serviceState(a, operations, operationsError).needsCheck) ||
          a.name.localeCompare(b.name, "he"),
      );
  }, [apps, filter, search, operations, operationsError]);

  const online = apps.filter((app) => !serviceState(app, operations, operationsError).needsCheck).length;

  return (
    <div className="page page--services">
      <PageHead
        title="שירותים"
        meta={
          <span className="muted">
            {online} מתוך {apps.length} זמינים
          </span>
        }
      >
        {getSessionSnapshot()?.role === "owner" && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden="true" /> הוספה
          </button>
        )}
      </PageHead>

      <DataState loading={loading} error={error} onRetry={fetchApps}>
        {operationsError && (
          <div className="banner banner--attention" role="status">
            <span>בדיקת החיבורים אינה זמינה</span>
            <button type="button" className="btn" onClick={fetchApps}>בדיקה חוזרת</button>
          </div>
        )}
        <Panel
          action={
            <>
              <Tabs
                tabs={FILTERS}
                value={filter}
                onChange={setFilter}
                label="סינון שירותים"
              />
              <div className="search">
                <Search aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש שירות"
                  aria-label="חיפוש שירות"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="ניקוי חיפוש"
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          }
          bleed
        >
          {visible.length ? (
            <ul className="service-list">
              {visible.map((app) => {
                const state = serviceState(app, operations, operationsError);
                return (
                  <li key={app.id}>
                    <Link
                      to={`/services/${app.id}`}
                      className="service-list__main"
                    >
                      <i
                        className={
                          !state.needsCheck
                            ? "is-online"
                            : "is-offline"
                        }
                        aria-hidden="true"
                      />
                      <span className="service-list__name">
                        <b>{app.name}</b>
                        <small dir="ltr">
                          {app.url ||
                            app.pm2_name ||
                            app.systemd_unit ||
                            app.log_path ||
                            "—"}
                        </small>
                      </span>
                      <span className="service-list__meta">
                        <b>
                          {app.pm2_name || app.systemd_unit
                            ? "מנוהל"
                            : app.log_path
                              ? "סטטי"
                              : "ניטור"}
                        </b>
                        <small>
                          {app.pm2_name
                            ? `${(app.cpu || 0).toFixed(1)}% CPU · ${((app.memory || 0) / 1024 / 1024).toFixed(0)} MB`
                            : `נבדק ${formatDateTime(app.last_checked)}`}
                        </small>
                      </span>
                      <span
                        className={`chip ${!state.needsCheck ? "is-online" : "is-offline"}`}
                      >
                        {state.label}
                      </span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                    {app.url && (
                      <a
                        className="icon-btn"
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`פתיחת ${app.name}`}
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              text={
                apps.length
                  ? "אין שירותים שתואמים לסינון"
                  : "אין שירותים מוגדרים עדיין"
              }
            />
          )}
        </Panel>
      </DataState>

      {adding && (
        <AddAppModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            fetchApps();
          }}
        />
      )}
    </div>
  );
};

export default Services;
