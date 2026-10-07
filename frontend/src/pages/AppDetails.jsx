import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  Play,
  Power,
  RefreshCw,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import LiveTerminal from "../components/LiveTerminal";
import SshSecurityTemplate from "../components/app_templates/SshSecurityTemplate";
import WhatsAppTemplate from "../components/app_templates/WhatsAppTemplate";
import { DataState, Panel, PageHead } from "../components/AnalyticsParts";
import { formatDateTime } from "../lib/format";
import { apiFetch } from "../lib/api";
import { getSessionSnapshot } from "../lib/session";
import Modal from "../components/Modal";

const ACTION_LABEL = { start: "הפעלה", stop: "עצירה", restart: "הפעלה מחדש" };

const AppDetails = () => {
  const owner = getSessionSnapshot()?.role === "owner";
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [connection, setConnection] = useState(null);
  const [operationsError, setOperationsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [actionState, setActionState] = useState("");

  const fetchApp = useCallback(async () => {
    try {
      const [record, health] = await Promise.all([
        apiFetch(`/apps/${id}`),
        apiFetch("/apps/operational-health").catch(() => ({ unavailable: true })),
      ]);
      setApp(record);
      setOperationsError(Boolean(health.unavailable));
      setConnection(
        health?.issues?.find(
          (item) => item.appId === Number(id) && item.id === "seder-whatsapp",
        ) || null,
      );
      setError("");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(fetchApp, 0);
    const interval = window.setInterval(fetchApp, 10000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchApp]);

  const handleAction = async () => {
    const action = pendingAction;
    setPendingAction(null);
    setActionState(action);
    try {
      await apiFetch(`/apps/${id}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await fetchApp();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionState("");
    }
  };

  const healthTarget =
    app?.health_url ||
    (app?.health_port
      ? `127.0.0.1:${app.health_port}${app.health_path || "/"}`
      : "");

  return (
    <div className="page page--service-detail">
      <DataState loading={loading && !app} error={error} onRetry={fetchApp}>
        {app && (
          <>
            <PageHead
              title={app.name}
              meta={
                <>
                  <Link className="crumb" to="/services">
                    <ChevronRight aria-hidden="true" /> כל השירותים
                  </Link>
                  <span
                    className={`chip ${app.status === "online" ? "is-online" : "is-offline"}`}
                  >
                    {app.status === "online"
                      ? app.pm2_name || app.systemd_unit
                        ? "תהליך פעיל"
                        : "זמין בבדיקה"
                      : "לא פעיל"}
                  </span>
                  <span className="muted">
                    בדיקה: {formatDateTime(app.last_checked)}
                  </span>
                  {app.url && (
                    <a
                      className="crumb"
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      פתיחה <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </>
              }
            ></PageHead>

            {operationsError && (
              <div className="banner banner--attention" role="status">
                <span>{app.pm2_name === "seder-whatsapp" ? "חיבור WhatsApp לא אומת" : "בדיקת החיבורים אינה זמינה"}</span>
                <button type="button" className="btn" onClick={fetchApp}>בדיקה חוזרת</button>
              </div>
            )}
            {!operationsError && connection && (
              <div className="banner banner--attention" role="status">
                <b>{connection.title}</b>
                <span>{connection.detail}</span>
              </div>
            )}
            {owner && app.pm2_name === "vee-whatsapp-worker" ? (
              <WhatsAppTemplate app={app} />
            ) : owner && app.name === "SSH Security" ? (
              <SshSecurityTemplate app={app} />
            ) : (
              <div className="grid grid--1-2">
                <Panel title="מצב השירות">
                  <dl className="spec-list">
                    <div>
                      <dt>סוג</dt>
                      <dd>
                        {app.pm2_name || app.systemd_unit
                          ? "שירות מנוהל"
                          : "אתר סטטי"}
                      </dd>
                    </div>
                    <div>
                      <dt>CPU</dt>
                      <dd>
                        {app.cpu == null ? "—" : `${app.cpu.toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>זיכרון</dt>
                      <dd>{((app.memory || 0) / 1024 / 1024).toFixed(1)} MB</dd>
                    </div>
                    <div>
                      <dt>בדיקת תקינות</dt>
                      <dd dir={healthTarget ? "ltr" : "rtl"}>
                        {healthTarget || "ללא"}
                      </dd>
                    </div>
                    <div>
                      <dt>דומיין לוג</dt>
                      <dd dir="ltr">{app.log_host || "—"}</dd>
                    </div>
                    <div>
                      <dt>נתיבים לכלול</dt>
                      <dd dir="ltr">{app.log_filter || "הכול"}</dd>
                    </div>
                    <div>
                      <dt>נתיבים להוציא</dt>
                      <dd dir="ltr">{app.log_exclude || "—"}</dd>
                    </div>
                  </dl>
                  {Boolean(app.analytics_enabled && app.log_path) && (
                    <Link className="btn btn--wide" to={`/visitors/${app.id}`}>
                      תמונת המבקרים
                    </Link>
                  )}
                </Panel>

                {owner && (
                  <Panel title="לוג חי" className="panel--terminal" bleed>
                    <LiveTerminal appId={app.id} />
                  </Panel>
                )}
              </div>
            )}
            {owner && (
              <details className="measurement-details service-controls">
                <summary>פעולות ניהול השירות</summary>
                {(app.pm2_name || app.systemd_unit) && (
                  <div className="btn-group">
                    {app.status === "online" ? (
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => setPendingAction("stop")}
                      >
                        <Power aria-hidden="true" /> עצירה
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => setPendingAction("start")}
                      >
                        <Play aria-hidden="true" /> הפעלה
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setPendingAction("restart")}
                    >
                      <RefreshCw
                        className={actionState ? "is-spinning" : ""}
                        aria-hidden="true"
                      />{" "}
                      הפעלה מחדש
                    </button>
                  </div>
                )}
              </details>
            )}
          </>
        )}
      </DataState>

      {pendingAction && (
        <Modal label={`${ACTION_LABEL[pendingAction]} של ${app?.name}?`} onClose={() => setPendingAction(null)}>
            <h2 id="confirm-title">
              {ACTION_LABEL[pendingAction]} של {app?.name}?
            </h2>
            <p>הפעולה תשפיע מיד על השירות בשרת.</p>
            <div className="dialog__actions">
              <button
                type="button"
                className="btn"
                onClick={() => setPendingAction(null)}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleAction}
              >
                {ACTION_LABEL[pendingAction]}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default AppDetails;
