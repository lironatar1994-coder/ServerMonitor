import { Ban, ShieldCheck, ShieldEllipsis } from 'lucide-react';
import LiveTerminal from '../LiveTerminal';

const SshSecurityTemplate = ({ app }) => {
  const current = app.history?.at(-1) || { attacks: 0 };
  return (
    <div className="ssh-workspace">
      <section className="ssh-metrics"><article><ShieldCheck /><strong>פעיל</strong><span>Fail2ban</span></article><article><Ban /><strong>{current.attacks || 0}</strong><span>כתובות חסומות</span></article><article><ShieldEllipsis /><strong>{app.status === 'online' ? 'תקין' : 'בדיקה'}</strong><span>מצב SSH</span></article></section>
      <section className="ssh-terminal"><span className="eyebrow">Security events</span><h2>אירועי אבטחה אחרונים</h2><LiveTerminal appId={app.id} /></section>
    </div>
  );
};

export default SshSecurityTemplate;
