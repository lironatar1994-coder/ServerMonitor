import {
  ChevronLeft,
  CircleCheck,
  CircleHelp,
  Clock3,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "./AnalyticsParts";
import { formatDateTime } from "../lib/format";

const Issue = ({ item }) => (
  <li className={`operation-issue operation-issue--${item.severity}`}>
    <TriangleAlert aria-hidden="true" />
    <div>
      <b>{item.title}</b>
      <small dir="auto">{item.detail}</small>
      {item.diagnostics?.length > 0 && (
        <details>
          <summary>פרטי הבדיקה</summary>
          {item.diagnostics.map((text, index) => (
            <p dir="ltr" key={index}>
              {text}
            </p>
          ))}
        </details>
      )}
    </div>
    {item.appId && (
      <Link
        className="icon-btn"
        to={`/services/${item.appId}`}
        aria-label={`פתיחת שירות: ${item.title}`}
      >
        <ChevronLeft />
      </Link>
    )}
  </li>
);
export default function OperationalStatus({ data }) {
  if (!data) return null;
  const issues = data.issues || [];
  const checks = [
    ["health", "בדיקת שרת"],
    ["browser", "אתרים ומדידה"],
    ["backup", "גיבוי מתועד"],
  ];
  return (
    <>
      {issues.length > 0 && (
        <Panel
          title="מה דורש טיפול"
          className="operational-panel"
          action={
            <span
              className="issue-count"
              aria-label={`${issues.length} נושאים לטיפול`}
            >
              {issues.length}
            </span>
          }
          bleed
        >
          <ul className="operation-issues">
            {issues.slice(0, 3).map((item) => (
              <Issue item={item} key={item.id} />
            ))}
          </ul>
          {issues.length > 3 && (
            <details className="operation-more">
              <summary>עוד {issues.length - 3} נושאים</summary>
              <ul className="operation-issues">
                {issues.slice(3).map((item) => (
                  <Issue item={item} key={item.id} />
                ))}
              </ul>
            </details>
          )}
        </Panel>
      )}
      <section className="operation-checks" aria-label="בדיקות אחרונות">
        {checks.map(([key, label]) => {
          const check = data.checks?.[key];
          const Icon =
            check?.status === "ok"
              ? CircleCheck
              : check?.status === "unknown" || !check
                ? CircleHelp
                : TriangleAlert;
          return (
            <div key={key}>
              <Icon aria-hidden="true" />
              <span>
                <b>{label}</b>
                <small>
                  {check?.status === "ok"
                    ? key === "backup"
                      ? "גיבוי מוצלח"
                      : "הבדיקה עברה"
                    : check?.status === "failed"
                      ? "דורש טיפול"
                      : "לא אומת"}
                </small>
              </span>
              <time dateTime={check?.checkedAt || undefined}>
                {check?.checkedAt ? (
                  formatDateTime(check.checkedAt)
                ) : (
                  <Clock3 aria-label="אין זמן בדיקה" />
                )}
              </time>
            </div>
          );
        })}
      </section>
    </>
  );
}
