import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from './AnalyticsParts';

// One operations workspace: resources, services, availability, backups and certificates.
const OPS_TABS = [
  { id: '/infrastructure', label: 'משאבים' },
  { id: '/services', label: 'שירותים' },
  { id: '/operations/availability', label: 'זמינות ומהירות' },
  { id: '/operations/backups', label: 'גיבויים ותעודות' }
];

export default function OpsTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = OPS_TABS.find((tab) => pathname === tab.id || pathname.startsWith(`${tab.id}/`))?.id;
  return <div className="ops-tabs"><Tabs tabs={OPS_TABS} value={current} onChange={(to) => navigate(to)} label="תפעול" /></div>;
}
