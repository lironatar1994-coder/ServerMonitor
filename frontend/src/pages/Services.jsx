import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ExternalLink, Plus, RefreshCw, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AddAppModal from "../components/AddAppModal";
import SiteLink from "../components/SiteLink";
import OpsTabs from "../components/OpsTabs";
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
import { useVisiblePolling } from "../lib/useVisiblePolling";

const FILTERS = [
  { id: "all", label: "הכול" },
  { id: "online", label: "זמינים" },
  { id: "issues", label: "לבדיקה" },
];

// Sites first, then systems people log into, background processes and server infrastructure.
const SERVICE_GROUPS = [
  ["issues", "דורש בדיקה"],
  ["sites", "אתרים"],
  ["systems", "מערכות"],
  ["background", "תהליכי רקע"],
  ["infrastructure", "תשתית"],
];
const serviceGroup = (app) =>
  app.analytics_enabled
    ? "sites"
    : app.url
      ? "systems"
      : (app.pm2_name || app.systemd_unit) && !/^postgresql/.test(app.systemd_unit || "")
        ? "background"
        : "infrastructure";

const Services = () => {
  const [params] = useSearchParams();
  const [apps, setApps] = useState([]);
  const [operations, setOperations] = useState(null);
  const [operationsError, setOperationsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState(
    ["all", "online", "issues"].includes(params.get("filter"))
      ? params.get("filter")
      : "all",
  );
  const [search, setSearch] = useState(params.get("search") || "");

  const fetchApps = useCallback(async () => {
    setRefreshing(true);
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
      setRefreshing(false);
    }
  }, []);

  useVisiblePolling(fetchApps);

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
    <div className="page page--services page--infrastructure">
      <PageHead
        title="תפעול"
        meta={
          <span className="muted">
            {online} מתוך {apps.length} זמינים
          </span>
        }
      >
        <button type="button" className="icon-btn" onClick={fetchApps} disabled={refreshing} aria-label="רענון שירותים" title="רענון שירותים">
          <RefreshCw className={refreshing ? "is-spinning" : ""} aria-hidden="true" />
        </button>
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
      <OpsTabs />

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
            <div className="service-groups">
              {SERVICE_GROUPS.map(([group, groupLabel]) => {
                // Anything that needs a check is pinned above its usual group.
                const items = visible.filter((app) => {
                  const needsCheck = serviceState(app, operations, operationsError).needsCheck;
                  return group === "issues" ? needsCheck : !needsCheck && serviceGroup(app) === group;
                });
                if (!items.length) return null;
                return (
            <section key={group} aria-label={groupLabel}>
            <h3 className="service-group">{groupLabel}<small>{items.length}</small></h3>
            <ul className="service-list">
              {items.map((app) => {
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
                            ? "שירות"
                            : app.url
                              ? "אתר"
                              : "בדיקה"}
                        </b>
                        <small>
                          {app.status !== "online" && app.status_changed_at ? (
                            `${state.label} מאז ${formatDateTime(app.status_changed_at)}`
                          ) : state.issue && state.needsCheck ? (
                            state.issue.title
                          ) : app.pm2_name || app.systemd_unit ? (
                            <bdi dir="ltr">{`${(app.cpu || 0).toFixed(1)}% CPU · ${((app.memory || 0) / 1024 / 1024).toFixed(0)} MB`}</bdi>
                          ) : (
                            `נבדק ${formatDateTime(app.last_checked)}`
                          )}
                        </small>
                      </span>
                      <span
                        className={`chip ${!state.needsCheck ? "is-online" : "is-offline"}`}
                      >
                        {state.label}
                      </span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                    {app.url ? (
                      <SiteLink
                        className="icon-btn"
                        href={app.url}
                        aria-label={`פתיחת ${app.name}`}
                      >
                        <ExternalLink aria-hidden="true" />
                      </SiteLink>
                    ) : (
                      <span className="icon-btn icon-btn--placeholder" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ul>
            </section>
                );
              })}
            </div>
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
