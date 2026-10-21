import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import OperationalStatus from "../components/OperationalStatus";
import OpsTabs from "../components/OpsTabs";
import {
  DataState,
  Empty,
  Panel,
  PageHead,
  Stat,
  StatRow,
  Tabs,
} from "../components/AnalyticsParts";
import { formatDateTime, formatNumber, formatTime } from "../lib/format";

const RESOURCE_TABS = [
  { id: "applications", label: "זיכרון", icon: MemoryStick },
  { id: "storage", label: "אחסון", icon: HardDrive },
  { id: "processes", label: "תהליכים", icon: Cpu },
];

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
};

const toneFor = (percentage) => {
  if (percentage >= 90) return "vermilion";
  if (percentage >= 75) return "ochre";
  return "forest";
};

const ResourceRows = ({ items, kind }) => {
  if (!items.length) return <Empty text="הפירוט זמין בשרת Linux" />;
  const peak = Math.max(
    ...items.map(
      (item) =>
        Number(
          kind === "storage"
            ? item.bytes
            : item.footprint_bytes || item.rss_bytes,
        ) || 0,
    ),
    1,
  );

  return (
    <ol className="resource-list">
      {items.map((item, index) => {
        const bytes =
          Number(
            kind === "storage"
              ? item.bytes
              : item.footprint_bytes || item.rss_bytes,
          ) || 0;
        const isProcess = kind === "processes";
        const subtitle =
          kind === "applications" ? (
            <>
              {Number(item.process_count) === 1
                ? "תהליך אחד"
                : `${formatNumber(item.process_count)} תהליכים`}
              {Number(item.child_memory_bytes) > 0 && (
                <>
                  {" · "}
                  <bdi dir="ltr">{formatBytes(item.child_memory_bytes)}</bdi>{" "}
                  בתהליכי־משנה
                </>
              )}
            </>
          ) : kind === "storage" ? (
            <>
              <bdi dir="ltr">{formatBytes(item.dependency_bytes)}</bdi> תלויות ·{" "}
              <bdi dir="ltr">
                {Number(item.dependency_percent || 0).toFixed(0)}%
              </bdi>{" "}
              מהפרויקט
            </>
          ) : (
            <>
              <bdi>{item.owner || "ללא שיוך"}</bdi> ·{" "}
              <bdi dir="ltr">PID {item.pid}</bdi> ·{" "}
              <bdi dir="ltr">CPU {Number(item.cpu || 0).toFixed(1)}%</bdi>
            </>
          );
        const label = isProcess ? item.command : item.name;

        return (
          <li
            key={`${item.id || item.pid || label}-${index}`}
            style={{ "--resource-bar": `${(bytes / peak) * 100}%` }}
          >
            <span className="resource-list__identity">
              <b dir={isProcess ? "ltr" : undefined} title={label}>
                {label}
              </b>
              <small>{subtitle}</small>
            </span>
            <span className="resource-list__value">
              <strong>
                <bdi dir="ltr">{formatBytes(bytes)}</bdi>
              </strong>
              {kind === "applications" && (
                <small>
                  <bdi dir="ltr">RAM {formatBytes(item.memory_bytes)}</bdi> ·{" "}
                  <bdi dir="ltr">Swap {formatBytes(item.swap_bytes)}</bdi>
                </small>
              )}
              {kind === "storage" && (
                <small>
                  {Number(item.disk_percent || 0).toFixed(1)}% מהדיסק
                </small>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const Infrastructure = () => {
  const [stats, setStats] = useState(null);
  const [operations, setOperations] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [resourceView, setResourceView] = useState("applications");

  const fetchData = useCallback(async () => {
    try {
      const [serverStats, appData, health] = await Promise.all([
        apiFetch("/apps/server-stats"),
        apiFetch("/apps"),
        apiFetch("/apps/operational-health").catch((error) => ({
          status: "unknown",
          issues: [
            {
              id: "load-failure",
              title: "מצב בדיקות השרת לא נטען",
              detail: error.message,
              severity: "unknown",
            },
          ],
          checks: {},
        })),
      ]);
      setOperations(health);
      setStats(serverStats);
      setApps(appData);
      setUpdatedAt(new Date().toISOString());
      setError("");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(fetchData, 0);
    // Hidden tabs stop polling so an idle dashboard adds no load to the server.
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") fetchData();
    }, 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchData]);

  const uptimeSeconds = Number(stats?.uptime) || 0;
  const uptimeDays = Math.floor(uptimeSeconds / 86400);
  const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
  const ram = Number(stats?.ram?.percentage) || 0;
  const swapTotal = Number(stats?.ram?.swap?.total) || 0;
  const swapUsed = Number(stats?.ram?.swap?.used) || 0;
  const swap = swapTotal ? (swapUsed / swapTotal) * 100 : 0;
  const disk = Number(stats?.disk?.percentage) || 0;
  const cores = Number(stats?.cpu?.cores) || 0;
  const load = Number(stats?.cpu?.load) || 0;
  const loadPercent = cores ? Math.min((load / cores) * 100, 100) : 0;
  const offline = apps.filter((app) => app.status !== "online");
  const resources = stats?.resources;
  const applications = resources?.applications || [];
  const [showAllResources, setShowAllResources] = useState(false);
  const storage = resources?.storage;
  const topProcesses = resources?.top_memory_processes || [];
  const storageItems = useMemo(
    () =>
      [...(storage?.projects || []), ...(storage?.other || [])].sort(
        (a, b) => Number(b.bytes) - Number(a.bytes),
      ),
    [storage],
  );
  const largestApp = applications[0];

  const selectedItems =
    resourceView === "applications"
      ? applications
      : resourceView === "storage"
        ? storageItems
        : topProcesses;

  return (
    <div className="page page--infrastructure">
      <PageHead
        title="תפעול"
        meta={<span>עודכן {formatTime(updatedAt)}</span>}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={fetchData}
          aria-label="רענון"
          title="רענון"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </PageHead>
      <OpsTabs />

      <DataState loading={loading && !stats} error={error} onRetry={fetchData}>
        <StatRow label="משאבי שרת">
          <Stat
            icon={MemoryStick}
            label="זיכרון זמין"
            value={formatBytes(stats?.ram?.available)}
            tone={toneFor(ram)}
            foot={`${ram.toFixed(0)}% בשימוש`}
          />
          <Stat
            icon={Cpu}
            label="מעבד"
            value={`${Math.round(loadPercent)}%`}
            tone={toneFor(loadPercent)}
            foot={`עומס ממוצע ${load.toFixed(2)} · ${formatNumber(cores)} ליבות`}
          />
          <Stat
            icon={HardDrive}
            label="דיסק פנוי"
            value={stats?.disk ? formatBytes(stats.disk.available) : "—"}
            tone={toneFor(disk)}
            foot={`${disk.toFixed(0)}% בשימוש`}
          />
          <Stat
            icon={TriangleAlert}
            label="לבדיקה"
            value={operations ? operations.issues.length : offline.length}
            tone={
              operations?.issues.length || offline.length
                ? "vermilion"
                : "forest"
            }
          />
        </StatRow>

        <OperationalStatus data={operations} />
        <details className="measurement-details">
          <summary>Swap וזמן פעילות</summary>
          <StatRow>
            <Stat
              label="Swap"
              value={`${swap.toFixed(0)}%`}
              tone={swap >= 75 ? "ochre" : "forest"}
              hint="Swap יכול להכיל דפים ישנים גם כשהשרת אינו תחת עומס פעיל"
              foot={
                <bdi dir="ltr">
                  {formatBytes(swapUsed)} / {formatBytes(swapTotal)}
                </bdi>
              }
            />
            <Stat
              label="זמן פעילות"
              value={`${uptimeDays}י ${uptimeHours}ש`}
              foot="מאז האתחול"
            />
          </StatRow>
        </details>
        <Panel
          title="צריכת משאבים"
          hint="RAM ו-Swap נספרים לכל עץ התהליכים, כולל תהליכי־משנה של השירות. האחסון נסרק בעדיפות נמוכה ונשמר במטמון לחצי שעה."
          action={
            <Tabs
              tabs={RESOURCE_TABS}
              value={resourceView}
              onChange={setResourceView}
              label="סוג פירוט משאבים"
            />
          }
          bleed
        >
          <div className="resource-summary" aria-label="עיקרי צריכת המשאבים">
            <span>
              <small>מוביל בזיכרון</small>
              <strong>{largestApp?.name || "לא זמין"}</strong>
              <b>
                <bdi dir="ltr">
                  RAM {formatBytes(largestApp?.memory_bytes)} + Swap{" "}
                  {formatBytes(largestApp?.swap_bytes)}
                </bdi>
              </b>
            </span>
            <span>
              <small>תלויות</small>
              <strong>
                <bdi dir="ltr">
                  {storage?.totals ? formatBytes(storage.totals.dependency_bytes) : "—"}
                </bdi>
              </strong>
              <b>{storage?.projects ? `${storage.projects.length} פרויקטים` : "האחסון נסרק"}</b>
            </span>
            <span>
              <small>גיבויים ו-Rollback</small>
              <strong>
                <bdi dir="ltr">
                  {storage?.totals
                    ? formatBytes(
                        (Number(storage.totals.backup_bytes) || 0) +
                          (Number(storage.totals.rollback_bytes) || 0),
                      )
                    : "—"}
                </bdi>
              </strong>
            </span>
          </div>
          <ResourceRows items={showAllResources ? selectedItems : selectedItems.slice(0, 8)} kind={resourceView} />
          {selectedItems.length > 8 && (
            <button type="button" className="idle-toggle" aria-expanded={showAllResources} onClick={() => setShowAllResources((value) => !value)}>
              {showAllResources ? "הצגת 8 המובילים" : `עוד ${formatNumber(selectedItems.length - 8)}`}
            </button>
          )}
        </Panel>

        <Panel
          title="שירותים לא זמינים"
          action={<Link className="crumb" to="/services">כל השירותים <ChevronLeft aria-hidden="true" /></Link>}
          bleed
        >
          {apps.some((app) => app.status !== "online") ? (
            <ul className="service-status-list">
              {apps
                .filter((app) => app.status !== "online")
                .map((app) => (
                  <li key={app.id}>
                    <Link to={`/services/${app.id}`}>
                      <i
                        className={
                          app.status === "online" ? "is-online" : "is-offline"
                        }
                        aria-hidden="true"
                      />
                      <span className="service-status-list__name">
                        <b>{app.name}</b>
                        <small>
                          <bdi dir="ltr">{app.pm2_name || app.systemd_unit || app.url}</bdi>
                          {app.status_changed_at ? ` · מאז ${formatDateTime(app.status_changed_at)}` : ""}
                        </small>
                      </span>
                      <span
                        className={`chip ${app.status === "online" ? "is-online" : "is-offline"}`}
                      >
                        {app.status === "unknown" ? "לא נבדק" : "לא זמין"}
                      </span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty text={apps.length ? `כל ${formatNumber(apps.length)} השירותים זמינים` : "אין שירותים מוגדרים"} />
          )}
        </Panel>
      </DataState>
    </div>
  );
};

export default Infrastructure;
