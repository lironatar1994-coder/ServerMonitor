import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
  RotateCcw,
} from "lucide-react";
import { PageHead, Empty } from "../components/AnalyticsParts";
import SecurityStep from "../components/SecurityStep";
import Modal from "../components/Modal";
import { apiFetch } from "../lib/api";
import { getSessionSnapshot, subscribeSession } from "../lib/session";
import { VaultCrypto } from "../vault/client";
import { safeLoginUrl } from "../vault/crypto";
import LockedVault from "../vault/LockedVault";
import EntryForm from "../vault/EntryForm";
import TeamPanel from "../vault/TeamPanel";
import "../vault/vault.css";

const environments = {
  production: "ייצור",
  staging: "בדיקות",
  local: "מקומית",
};
export default function Vault() {
  const user = useSyncExternalStore(subscribeSession, getSessionSnapshot),
    navigate = useNavigate(),
    selectedId = useParams()["*"];
  const [status, setStatus] = useState(null),
    [unlocked, setUnlocked] = useState(false),
    [entries, setEntries] = useState([]),
    [apps, setApps] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [setup, setSetup] = useState(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [appFilter, setAppFilter] = useState(""),
    [editing, setEditing] = useState(null),
    [revealed, setRevealed] = useState(""),
    [notes, setNotes] = useState(null),
    [team, setTeam] = useState(false),
    [mfa, setMfa] = useState(null);
  const worker = useRef(null),
    lastActivity = useRef(0),
    hiddenAt = useRef(null),
    listScroll = useRef(0),
    listEl = useRef(null),
    returnFocus = useRef(null),
    detailHeading = useRef(null),
    statusRef = useRef(null),
    activeEpoch = useRef(null);
  const owner = user?.role === "owner",
    canEdit = ["owner", "editor"].includes(user?.role);
  const refreshStatus = useCallback(async () => {
    const value = await apiFetch("/vault/status");
    statusRef.current = value;
    setStatus(value);
    return value;
  }, []);
  const lock = useCallback((message = "") => {
    worker.current?.lock();
    worker.current = null;
    activeEpoch.current = null;
    setUnlocked(false);
    setEntries([]);
    setEditing(null);
    setRevealed("");
    setNotes(null);
    setSetup(null);
    setSearch("");
    setTeam(false);
    setMfa(null);
    setNotice(message);
    setBusy(false);
  }, []);
  const ensureWorker = () => {
    if (!worker.current) worker.current = new VaultCrypto();
    return worker.current;
  };
  const action = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e.code === "MFA_REQUIRED") setMfa(() => fn);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadEntries = async (
    client = worker.current,
    trash = filter === "trash",
  ) => {
    let all = [],
      after = "";
    do {
      const result = await apiFetch(
        `/vault/entries?trash=${trash}${after ? "&after=" + encodeURIComponent(after) : ""}`,
      );
      if (result.state.epoch !== statusRef.current?.state?.epoch) {
        lock("מפתח הכספת השתנה. יש לפתוח אותה מחדש.");
        await refreshStatus();
        return;
      }
      all.push(...result.entries);
      after = result.next;
    } while (after);
    const decoded = await client.call("metadata", { entries: all });
    if (client === worker.current) setEntries(decoded);
  };
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(refreshStatus)
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    apiFetch("/apps")
      .then((value) => alive && setApps(value))
      .catch(() => {});
    return () => {
      alive = false;
      worker.current?.lock();
      worker.current = null;
    };
  }, [refreshStatus]);
  useEffect(() => {
    if (!unlocked && !setup) return;
    lastActivity.current = Date.now();
    const activity = () => {
      if (Date.now() - lastActivity.current >= 300000) {
        lock("הכספת ננעלה ללא פעילות.");
        return;
      }
      lastActivity.current = Date.now();
    };
    const visibility = () => {
      setRevealed("");
      if (document.hidden) hiddenAt.current = Date.now();
      else {
        if (hiddenAt.current && Date.now() - hiddenAt.current >= 60000)
          lock("הכספת ננעלה לאחר מעבר לרקע.");
        hiddenAt.current = null;
        if (Date.now() - lastActivity.current >= 300000)
          lock("הכספת ננעלה ללא פעילות.");
      }
    };
    const timer = setInterval(() => {
      if (
        Date.now() - lastActivity.current >= 300000 ||
        (hiddenAt.current && Date.now() - hiddenAt.current >= 60000)
      )
        lock("הכספת ננעלה אוטומטית.");
    }, 1000);
    document.addEventListener("pointerdown", activity);
    document.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [unlocked, setup, lock]);
  useEffect(() => {
    if (!unlocked) return;
    const timer = setInterval(() => {
      refreshStatus()
        .then((next) => {
          if (!next.membership || next.state.epoch !== activeEpoch.current)
            lock("הרשאות הכספת השתנו.");
        })
        .catch(() => lock("לא ניתן לאמת את הגישה. הכספת ננעלה."));
    }, 30000);
    return () => clearInterval(timer);
  }, [unlocked, refreshStatus, lock]);
  useEffect(() => {
    if (!revealed) return;
    const timeout = setTimeout(() => setRevealed(""), 15000);
    return () => clearTimeout(timeout);
  }, [revealed]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed("");
      setNotes(null);
      setEditing(null);
      if (!selectedId) {
        if (listEl.current) listEl.current.scrollTop = listScroll.current;
        returnFocus.current?.focus();
      } else detailHeading.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedId, unlocked]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const unlock = async (passphrase) => {
    const current = await refreshStatus(),
      client = ensureWorker();
    await client.call("unlock", {
      userId: user.id,
      passphrase,
      record: current.keys,
      wrappedKey: current.membership?.wrapped_key,
    });
    if (client !== worker.current) return;
    if (!current.state && owner) {
      const wrappedKey = await client.call("initialize", {
        publicKey: current.keys.publicKey,
      });
      await apiFetch("/vault/initialize", {
        method: "POST",
        body: JSON.stringify({ wrappedKey }),
      });
      await refreshStatus();
      current.state = statusRef.current.state;
      current.membership = statusRef.current.membership;
    }
    if (current.membership) {
      activeEpoch.current = current.state.epoch;
      await loadEntries(client);
      if (client === worker.current) {
        setUnlocked(true);
        setNotice("");
      }
    }
  };
  const create = async (passphrase) => {
    setBusy(true);
    try {
      const client = ensureWorker(),
        result = await client.call("setup", { userId: user.id, passphrase });
      await client.call("unlock", {
        userId: user.id,
        passphrase,
        record: result.record,
      });
      if (client === worker.current) setSetup(result);
    } finally {
      setBusy(false);
    }
  };
  const confirmSetup = () =>
    action(async () => {
      const client = worker.current,
        record = setup.record;
      const existing = await refreshStatus();
      if (!existing.keys)
        await apiFetch("/vault/keys", {
          method: "POST",
          body: JSON.stringify(record),
        });
      else if (existing.keys.publicKey !== record.publicKey)
        throw new Error("המפתח השתנה. יש לפתוח את הכספת מחדש.");
      if (!status.state && owner) {
        const wrappedKey = await client.call("initialize", {
          publicKey: record.publicKey,
        });
        await apiFetch("/vault/initialize", {
          method: "POST",
          body: JSON.stringify({ wrappedKey }),
        });
        await refreshStatus();
        if (client === worker.current) {
          setSetup(null);
          activeEpoch.current = statusRef.current.state.epoch;
          setUnlocked(true);
          await loadEntries(client);
        }
      } else {
        setSetup(null);
        await refreshStatus();
        lock("המפתח נוצר. בעלים יכולים כעת לאשר את הגישה.");
      }
    });
  const recover = async (recoveryCode, passphrase) => {
    const client = ensureWorker(),
      record = await client.call("recover", {
        userId: user.id,
        recoveryCode,
        passphrase,
        record: status.keys,
      });
    await action(async () => {
      await apiFetch("/vault/keys", {
        method: "PUT",
        body: JSON.stringify(record),
      });
      lock("הסיסמה עודכנה. אפשר לפתוח את הכספת.");
      await refreshStatus();
    });
  };
  const select = (entry, event) => {
    listScroll.current = listEl.current?.scrollTop || 0;
    returnFocus.current = event?.currentTarget;
    navigate(`/vault/${entry.id}`);
  };
  const selected = entries.find((e) => e.id === selectedId);
  const visible = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            (filter !== "favorites" || e.favorite) &&
            (!appFilter || String(e.fields.appId) === appFilter) &&
            [e.fields.title, e.fields.username, e.fields.url].some((value) =>
              (value || "")
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            ),
        )
        .sort(
          (a, b) =>
            Number(b.favorite) - Number(a.favorite) ||
            a.fields.title.localeCompare(b.fields.title, "he"),
        ),
    [entries, filter, search, appFilter],
  );
  const getSecret = async (entry) => {
    const client = worker.current;
    const payload = await apiFetch(`/vault/entries/${entry.id}/secret`);
    if (payload.version !== entry.version || payload.epoch !== entry.epoch)
      throw new Error("הפריט השתנה. רעננו את הרשימה לפני שימוש.");
    const secret = await client.call("secret", { entry: payload });
    if (
      client !== worker.current ||
      !window.location.pathname.endsWith(`/vault/${entry.id}`)
    )
      throw new Error("הבחירה השתנתה. נסו שוב בפריט הנוכחי.");
    return secret;
  };
  const copy = async (value) => {
    await navigator.clipboard.writeText(value);
    setNotice("הועתק");
  };
  const save = async (fields, secret) => {
    const client = worker.current,
      id = editing.entry?.id || crypto.randomUUID(),
      expectedVersion = editing.entry?.version || 0,
      epoch = status.state.epoch;
    setBusy(true);
    try {
      const encrypted = await client.call("save", {
        id,
        version: expectedVersion + 1,
        epoch,
        metadata: fields,
        secret,
      });
      await apiFetch(`/vault/entries/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...encrypted, expectedVersion, epoch }),
      });
      await loadEntries(client);
      setEditing(null);
      navigate(`/vault/${id}`);
      setNotice("הפריט נשמר");
    } finally {
      setBusy(false);
    }
  };
  const switchFilter = (value) =>
    action(async () => {
      setFilter(value);
      setEditing(null);
      navigate("/vault");
      if ((filter === "trash") !== (value === "trash"))
        await loadEntries(worker.current, value === "trash");
    });
  const rotate = () =>
    action(async () => {
      const snapshot = await apiFetch("/vault/rotation"),
        client = worker.current,
        data = await client.call("rotation", {
          ...snapshot,
          epoch: snapshot.state.epoch,
        });
      await apiFetch("/vault/rotate", {
        method: "POST",
        body: JSON.stringify({ ...data, revision: snapshot.state.revision }),
      });
      lock("המפתח הוחלף. פתחו שוב את הכספת.");
      await refreshStatus();
    });
  const entryUrl = selected && safeLoginUrl(selected.fields.url);
  const visiblePassword = revealed?.id === selectedId ? revealed.password : "";
  const visibleNotes = notes?.id === selectedId ? notes.text : null;
  return (
    <div
      className={`page page--vault ${selectedId || editing ? "vault-has-detail" : ""}`}
    >
      <PageHead
        title="כספת"
        meta={
          <span className="muted">
            {unlocked
              ? `${entries.length} פריטים · כספת צוות`
              : "פרטי הגישה של הצוות"}
          </span>
        }
      >
        {unlocked && (
          <>
            <button
              className="icon-btn"
              disabled={busy}
              aria-label="רענון רשימת פריטים"
              onClick={() => action(() => loadEntries())}
            >
              <RotateCcw />
            </button>
            <button className="btn" onClick={() => lock("הכספת ננעלה")}>
              <LockKeyhole /> נעילה
            </button>
            {owner && (
              <button
                className="icon-btn"
                onClick={() => setTeam(true)}
                aria-label="ניהול צוות"
              >
                <Users />
              </button>
            )}
            {canEdit && (
              <button
                className="btn btn--primary"
                onClick={() => {
                  setEditing({ entry: null, secret: null });
                  setRevealed("");
                }}
              >
                <Plus /> פרטי גישה חדשים
              </button>
            )}
          </>
        )}
      </PageHead>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
          <button
            className="icon-btn"
            aria-label="סגירת שגיאה"
            onClick={() => setError("")}
          >
            <X />
          </button>
        </div>
      )}
      {notice && (
        <div className="vault-toast" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <div role="status" className="vault-locked">
          טוען את הכספת…
        </div>
      ) : !status ? (
        <div className="vault-locked">
          <LockKeyhole />
          <h2>לא ניתן לטעון את הכספת</h2>
          <button className="btn" onClick={() => action(refreshStatus)}>
            ניסיון נוסף
          </button>
        </div>
      ) : !unlocked ? (
        status.keys &&
        (status.state || !owner) &&
        !status.membership &&
        !setup ? (
          <div className="vault-locked">
            <Users />
            <h2>ממתינים לאישור גישה</h2>
            <p>בעלים צריכים לאמת מולך את טביעת המפתח ולהעניק גישה לכספת.</p>
            <code className="setup-secret" dir="ltr">
              {status.keys.fingerprint.match(/.{1,8}/g).join(" ")}
            </code>
            <button className="btn" onClick={() => action(refreshStatus)}>
              בדיקת הרשאה
            </button>
          </div>
        ) : (
          <LockedVault
            status={status}
            user={user}
            busy={busy}
            setup={setup}
            onUnlock={(pass) => action(() => unlock(pass))}
            onSetup={create}
            onConfirmSetup={confirmSetup}
            onRecover={recover}
            onReset={() =>
              action(async () => {
                await apiFetch("/vault/keys/reset", {
                  method: "POST",
                  body: "{}",
                });
                lock();
                await refreshStatus();
              })
            }
          />
        )
      ) : (
        <>
          {status.state.rotation_required === 1 && (
            <div className="banner banner--attention">
              נדרשת החלפת מפתח לפני שמירת שינויים.{" "}
              {owner && (
                <button className="btn" disabled={busy} onClick={rotate}>
                  החלפת מפתח הכספת
                </button>
              )}
            </div>
          )}
          {team ? (
            <TeamPanel
              cryptoClient={{ call: (...args) => worker.current.call(...args) }}
              epoch={status.state.epoch}
              userId={user.id}
              onClose={() => setTeam(false)}
              action={action}
              onRotationRequired={refreshStatus}
            />
          ) : (
            <div className="vault-workspace">
              <section className="vault-list-pane" aria-label="רשימת פרטי גישה">
                <div className="vault-search">
                  <Search aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="חיפוש פרטי גישה"
                    placeholder="חיפוש אפליקציה, משתמש או כתובת"
                  />
                  {search && (
                    <button
                      className="icon-btn"
                      aria-label="ניקוי חיפוש"
                      onClick={() => setSearch("")}
                    >
                      <X />
                    </button>
                  )}
                </div>
                <div className="vault-list-tools">
                  <div className="tabs" role="group" aria-label="סינון פריטים">
                    {[
                      ["all", "הכול"],
                      ["favorites", "מועדפים"],
                      ["trash", "סל מחזור"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? "is-active" : ""}
                        onClick={() => switchFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor="vault-app-filter">
                    סינון לפי אפליקציה
                  </label>
                  <select
                    id="vault-app-filter"
                    value={appFilter}
                    onChange={(e) => setAppFilter(e.target.value)}
                  >
                    <option value="">כל האפליקציות</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <ul className="vault-list" ref={listEl}>
                  {visible.map((e) => (
                    <li key={e.id}>
                      <button
                        className={`vault-list-row ${selectedId === e.id ? "is-selected" : ""}`}
                        aria-current={selectedId === e.id ? "true" : undefined}
                        onClick={(event) => select(e, event)}
                      >
                        <span className="vault-initial" aria-hidden="true">
                          {e.fields.title.slice(0, 1)}
                        </span>
                        <span className="vault-row-copy">
                          <b dir="auto">{e.fields.title}</b>
                          <span dir="auto">{e.fields.username}</span>
                          <small dir="ltr">
                            {safeLoginUrl(e.fields.url)
                              ? new URL(e.fields.url).hostname
                              : "—"}
                          </small>
                        </span>
                        {e.favorite ? (
                          <Star className="vault-star" aria-label="מועדף" />
                        ) : (
                          <span className="vault-env">
                            {environments[e.fields.environment]}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {!visible.length && (
                  <Empty
                    text={
                      search
                        ? "אין פריטים שתואמים לחיפוש"
                        : filter === "trash"
                          ? "סל המחזור ריק"
                          : entries.length
                            ? "אין פריטים בסינון הזה"
                            : "עדיין אין פרטי גישה"
                    }
                  />
                )}
              </section>
              {editing ? (
                <EntryForm
                  key={editing.entry?.id || "new"}
                  entry={editing.entry}
                  secret={editing.secret}
                  apps={apps}
                  cryptoClient={{
                    call: (...args) => worker.current.call(...args),
                  }}
                  onSave={save}
                  onClose={() => {
                    if (
                      window.confirm(
                        "לסגור את העריכה? שינויים שלא נשמרו יימחקו.",
                      )
                    )
                      setEditing(null);
                  }}
                  busy={busy}
                />
              ) : selected ? (
                <section className="vault-detail">
                  <div className="vault-detail-head">
                    <button
                      className="icon-btn vault-mobile-back"
                      onClick={() => navigate("/vault")}
                      aria-label="חזרה לרשימה"
                    >
                      <ArrowRight />
                    </button>
                    <div>
                      <h2 dir="auto" ref={detailHeading} tabIndex={-1}>
                        {selected.fields.title}
                      </h2>
                      <small className="muted">
                        {environments[selected.fields.environment]} ·{" "}
                        {apps.find(
                          (a) => String(a.id) === String(selected.fields.appId),
                        )?.name || "שירות חיצוני"}
                      </small>
                    </div>
                    <div className="vault-detail-actions">
                      <button
                        className="icon-btn"
                        aria-label={
                          selected.favorite
                            ? "הסרה מהמועדפים"
                            : "הוספה למועדפים"
                        }
                        aria-pressed={!!selected.favorite}
                        onClick={() =>
                          action(async () => {
                            await apiFetch(
                              `/vault/entries/${selected.id}/favorite`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  favorite: !selected.favorite,
                                }),
                              },
                            );
                            await loadEntries();
                          })
                        }
                      >
                        <Star
                          className={selected.favorite ? "vault-star" : ""}
                        />
                      </button>
                      {canEdit && !selected.trashed_at && (
                        <button
                          className="btn"
                          onClick={() =>
                            action(async () => {
                              const secret = await getSecret(selected);
                              setEditing({ entry: selected, secret });
                              setRevealed("");
                            })
                          }
                        >
                          <Pencil /> עריכה
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="vault-fields">
                    <div className="vault-value">
                      <label>שם משתמש / אימייל</label>
                      <div>
                        <bdi dir="auto">{selected.fields.username}</bdi>
                        <button
                          className="icon-btn"
                          aria-label="העתקת שם משתמש"
                          onClick={() =>
                            action(() => copy(selected.fields.username))
                          }
                        >
                          <Copy />
                        </button>
                      </div>
                    </div>
                    <div className="vault-value">
                      <label>סיסמה</label>
                      <div>
                        <bdi dir="ltr" className="vault-password">
                          {visiblePassword || "••••••••••••"}
                        </bdi>
                        <button
                          className="icon-btn"
                          aria-label={
                            visiblePassword ? "הסתרת סיסמה" : "הצגת סיסמה"
                          }
                          onClick={() =>
                            visiblePassword
                              ? setRevealed("")
                              : action(async () =>
                                  setRevealed({
                                    id: selected.id,
                                    password: (await getSecret(selected))
                                      .password,
                                  }),
                                )
                          }
                        >
                          {visiblePassword ? <EyeOff /> : <Eye />}
                        </button>
                        <button
                          className="icon-btn"
                          aria-label="העתקת סיסמה"
                          onClick={() =>
                            action(async () =>
                              copy((await getSecret(selected)).password),
                            )
                          }
                        >
                          <Copy />
                        </button>
                      </div>
                    </div>
                    <div className="vault-value">
                      <label>כתובת כניסה</label>
                      <div>
                        <bdi dir="ltr">{selected.fields.url}</bdi>
                        <button
                          className="icon-btn"
                          aria-label="העתקת כתובת"
                          onClick={() =>
                            action(() => copy(selected.fields.url))
                          }
                        >
                          <Copy />
                        </button>
                      </div>
                    </div>
                    {entryUrl?.insecure && (
                      <p className="banner banner--attention">
                        הקישור משתמש ב־HTTP ואינו מוצפן.
                      </p>
                    )}
                    {entryUrl && (
                      <a
                        className="btn btn--primary vault-open"
                        href={entryUrl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setRevealed("")}
                      >
                        <ExternalLink /> פתיחת אתר
                      </a>
                    )}
                    <details
                      className="vault-notes"
                      onToggle={(e) => {
                        if (e.currentTarget.open && visibleNotes === null)
                          action(async () =>
                            setNotes({
                              id: selected.id,
                              text: (await getSecret(selected)).notes,
                            }),
                          );
                      }}
                    >
                      <summary>הערות</summary>
                      <p dir="auto">
                        {visibleNotes === null
                          ? "טוען…"
                          : visibleNotes || "אין הערות"}
                      </p>
                    </details>
                  </div>
                  <footer className="vault-entry-footer">
                    <small>
                      עודכן{" "}
                      {new Date(selected.updated_at).toLocaleString("he-IL")}
                    </small>
                    {canEdit && (
                      <div>
                        {selected.trashed_at ? (
                          <>
                            <button
                              className="btn"
                              onClick={() =>
                                action(async () => {
                                  await apiFetch(
                                    `/vault/entries/${selected.id}/trash`,
                                    {
                                      method: "POST",
                                      body: JSON.stringify({
                                        restore: true,
                                        expectedVersion: selected.version,
                                      }),
                                    },
                                  );
                                  await loadEntries();
                                  navigate("/vault");
                                })
                              }
                            >
                              <RotateCcw /> שחזור
                            </button>
                            {owner && (
                              <button
                                className="btn btn--danger"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "למחוק לצמיתות? לא ניתן לבטל פעולה זו.",
                                    )
                                  )
                                    action(async () => {
                                      await apiFetch(
                                        `/vault/entries/${selected.id}`,
                                        { method: "DELETE" },
                                      );
                                      await loadEntries();
                                      navigate("/vault");
                                    });
                                }}
                              >
                                מחיקה לצמיתות
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            className="btn"
                            onClick={() =>
                              action(async () => {
                                await apiFetch(
                                  `/vault/entries/${selected.id}/trash`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      expectedVersion: selected.version,
                                    }),
                                  },
                                );
                                await loadEntries();
                                navigate("/vault");
                                setNotice("הפריט הועבר לסל המחזור ל־30 יום");
                              })
                            }
                          >
                            <Trash2 /> לסל המחזור
                          </button>
                        )}
                      </div>
                    )}
                  </footer>
                </section>
              ) : (
                <div className="vault-detail vault-empty-selection">
                  <KeyRound aria-hidden="true" />
                  {selectedId && (
                    <button className="btn" onClick={() => navigate("/vault")}>
                      חזרה לרשימה
                    </button>
                  )}
                  <h2>
                    {selectedId
                      ? "הפריט אינו זמין ברשימה הזו"
                      : "פרטי הגישה, בהישג יד"}
                  </h2>
                  <p>בחרו פריט מהרשימה כדי להעתיק פרטים או לפתוח את האתר.</p>
                  {canEdit && !entries.length && (
                    <button
                      className="btn btn--primary"
                      onClick={() => setEditing({ entry: null, secret: null })}
                    >
                      <Plus /> הוספת פרטי גישה
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {mfa && (
        <Modal label="אימות פעולה" onClose={() => setMfa(null)}>
          <button
            className="icon-btn"
            aria-label="ביטול אימות"
            onClick={() => setMfa(null)}
          >
            <X />
          </button>
          <SecurityStep
            onComplete={() => {
              const retry = mfa;
              setMfa(null);
              action(retry);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
