import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Trash2 } from "lucide-react";
import { IconAction } from "./AnalyticsParts";
import { apiFetch } from "../lib/api";

const date = (value) => new Date(value).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit" });

/** Browsers that sign in without password and code; each can be forgotten. */
export default function TrustedDevices({ disabled }) {
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setDevices((await apiFetch("/auth/devices")).devices); setError(""); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  const forget = async (device) => {
    if (!window.confirm(device.current ? "לשכוח את המכשיר הזה? בכניסה הבאה תתבקשו סיסמה וקוד." : `לשכוח את ${device.label}? הוא ינותק מיד.`)) return;
    try { await apiFetch(`/auth/devices/${device.id}`, { method: "DELETE" }); load(); }
    catch (e) { setError(e.message); }
  };
  return (
    <div className="trusted-devices">
      <h3>מכשירים שמורים</h3>
      {error && <p role="alert" className="status-line is-attention">{error}</p>}
      {devices && !devices.length && <p className="muted">אין מכשירים שמורים. אפשר לבחור "לזכור את המכשיר" בכניסה הבאה.</p>}
      {devices?.length > 0 && (
        <ul>
          {devices.map((device) => (
            <li key={device.id}>
              <MonitorSmartphone aria-hidden="true" />
              <span><b>{device.label}{device.current && <small> · המכשיר הזה</small>}</b>
                <small>שימוש אחרון {date(device.last_used)} · עד {date(device.expires_at)}</small></span>
              {!disabled && <IconAction icon={Trash2} label={`שכחת ${device.label}`} onClick={() => forget(device)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
