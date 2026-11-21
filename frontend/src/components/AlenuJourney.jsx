import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, rangeQuery } from '../lib/api';
import { formatNumber } from '../lib/format';
import { DataState, Empty, Panel } from './AnalyticsParts';

const stages = ['עמוד הבית', 'בחירת חשבונות', 'פרטי קשר', 'ניסיון שליחה', 'אישור קליטה מה־CRM'];

export default function AlenuJourney({ appId, range }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const params = rangeQuery(range);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/visitor-analytics/apps/${appId}/alenu-journey?${params}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [appId, params, retry]);

  return <Panel title="מסלול פנייה" className="alenu-journey"
    hint="ביקורים אנונימיים שבהם נמדד כל שלב. אפשר להיכנס ישירות לטופס. השלב האחרון בטבלה הוא המתקדם ביותר שנמדד בטווח. אישור קליטה מופיע כשהדפדפן קיבל אישור מה־CRM."
    action={<Link className="btn" to={`?view=visitors&${params}`}>היסטוריית מבקרים</Link>}>
    <DataState loading={!result && !error} error={error} onRetry={() => { setError(''); setRetry(value => value + 1); }}>
      {result?.stages.some(stage => stage.reached) ? (
        <table className="alenu-journey__stages">
          <thead><tr><th scope="col">שלב</th><th scope="col">נמדדו בשלב</th><th scope="col">שלב מתקדם ביותר</th></tr></thead>
          <tbody>{result.stages.map(({ stage, reached, furthest }) => (
            <tr key={stage}><th scope="row">{stages[stage - 1]}</th><td><bdi>{formatNumber(reached)}</bdi></td><td><bdi>{formatNumber(furthest)}</bdi></td></tr>
          ))}</tbody>
        </table>
      ) : <Empty text="עדיין לא נמדדו שלבים בטווח הזה" />}
    </DataState>
  </Panel>;
}
