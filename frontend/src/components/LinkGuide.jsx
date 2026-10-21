import { useEffect, useReducer, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Link2, Lock, Pause, Play, Plus, QrCode, RotateCcw, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import { Tabs } from './AnalyticsParts';

/*
 * Animated walkthrough of creating a tracked link, drawn with HTML on a fixed
 * 640×360 canvas that scales to its frame. Each channel tab replays the same
 * flow and ends where that channel's link is posted. Reduced motion steps manually.
 */
const W = 640;
const CHANNEL_OPTIONS = ['וואטסאפ', 'פייסבוק', 'אינסטגרם', 'טיקטוק', 'קוד QR'];
const SCENES = [
  { id: 'whatsapp', label: 'וואטסאפ', option: 0, code: 'wa', campaign: 'מבצע חגים', place: 'whatsapp', where: 'מדביקים בהודעה, בקבוצה או בסטטוס' },
  { id: 'facebook', label: 'פייסבוק', option: 1, code: 'fb', campaign: 'פוסט השקה', place: 'facebook', where: 'מדביקים בפוסט, בתגובה או בעמוד העסק' },
  { id: 'story', label: 'סטורי', option: 2, code: 'ig', campaign: 'סטורי', place: 'story', where: 'בסטורי מוסיפים מדבקת קישור ומדביקים' },
  { id: 'tiktok', label: 'טיקטוק', option: 3, code: 'tt', campaign: 'קישור בביו', place: 'bio', where: 'מדביקים בביו של הפרופיל' },
  { id: 'qr', label: 'QR', option: 4, code: 'qr', campaign: 'פלייר', place: 'qr', where: 'מדפיסים את הקוד על פלייר, כרטיס או שלט' },
];
const STEPS = [
  { ms: 2600, text: () => 'בלשונית מקורות לוחצים על "קישור חדש"' },
  { ms: 2800, text: (s) => `בוחרים ערוץ: ${CHANNEL_OPTIONS[s.option]}` },
  { ms: 2400, text: (s) => `הקוד מוצע לבד (${s.code}), ואפשר לשנות אותו` },
  { ms: 2800, text: (s) => `קמפיין אינו חובה, למשל "${s.campaign}"` },
  { ms: 2200, text: () => 'לוחצים "יצירה"' },
  { ms: 2400, text: (s) => (s.place === 'qr' ? 'פותחים את קוד ה-QR ומורידים אותו' : 'מעתיקים את הקישור') },
  { ms: 3200, text: (s) => s.where },
  { ms: 2800, text: (s) => `מי שלוחץ מגיע לאתר, והביקור משויך ל${CHANNEL_OPTIONS[s.option]}` },
  { ms: 3600, text: () => 'הלחיצות והביקורים נספרים כאן ובחלק "איך הגיעו"' },
];
const TICK = 80;
const REST = { x: 560, y: 300 };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function clock(state, action) {
  switch (action.type) {
    case 'tick': {
      if (!state.playing) return state;
      const elapsed = state.elapsed + TICK;
      if (elapsed < STEPS[state.step].ms) return { ...state, elapsed };
      if (state.step === STEPS.length - 1) return { ...state, elapsed: STEPS[state.step].ms, playing: false };
      return { ...state, step: state.step + 1, elapsed: 0 };
    }
    case 'go': return { step: action.step, elapsed: action.still ? STEPS[action.step].ms : 0, playing: !action.still };
    case 'toggle':
      if (!state.playing && state.step === STEPS.length - 1 && state.elapsed >= STEPS.at(-1).ms) return { step: 0, elapsed: 0, playing: true };
      return { ...state, playing: !state.playing };
    default: return state;
  }
}

/** Where the pointer is and whether it is pressing, for one moment of one step. */
function pointer(scene, step, t) {
  const press = (at) => t >= at && t < at + 450;
  switch (step) {
    case 0: return { x: 90, y: 46, press: press(950) };
    case 1: return t < 800 ? { x: 513, y: 115, press: press(500) } : { x: 513, y: 144 + 24 * scene.option, press: press(1550) };
    case 2: return { x: 330, y: 118, press: false };
    case 3: return { x: 129, y: 115, press: press(700) };
    case 4: return { x: 377, y: 171, press: press(950) };
    case 5: return { x: scene.place === 'qr' ? 90 : 60, y: 96, press: press(950) };
    case 6: return { x: 330, y: 214, press: press(1100) };
    case 7: return { x: 320, y: 214, press: press(900) };
    case 8: return { x: 300, y: 104, press: false };
    default: return { ...REST, press: false };
  }
}

function Device({ scene, host, step, t, qr }) {
  const short = `${host}/l/${scene.code}`;
  const pasted = step > 6 || t >= 1300;
  const site = step === 7 && t >= 1150;
  const link = <span className={`guide-device__link ${pasted ? 'is-in' : ''}`} dir="ltr">{scene.place === 'story' ? <><Link2 aria-hidden="true" />{host.replace(/^www\./, '').toUpperCase()}</> : short}</span>;
  if (site) {
    return (
      <div className="guide-device">
        <div className="guide-site">
          <div className="guide-site__bar" dir="ltr"><Lock aria-hidden="true" />{host}</div>
          <div className="guide-site__hero" /><i /><i /><i className="is-short" />
          <div className="guide-site__block" /><div className="guide-site__block" />
        </div>
      </div>
    );
  }
  if (scene.place === 'qr') {
    return (
      <div className="guide-device is-paper">
        <div className="guide-flyer">
          <b>{scene.campaign}</b><small>סורקים ומגיעים לאתר</small>
          {qr ? <img src={qr} alt="" /> : <span className="guide-flyer__qr" />}
          <small dir="ltr">{host}</small>
        </div>
      </div>
    );
  }
  return (
    <div className={`guide-device is-${scene.place}`}>
      {scene.place === 'whatsapp' && (
        <div className="guide-app"><div className="guide-app__head">קבוצת לקוחות</div>
          <div className="guide-chat"><span className="guide-chat__in">שלום לכולם</span>
            <span className="guide-chat__out">{scene.campaign} לכל הלקוחות{link}</span></div></div>
      )}
      {scene.place === 'facebook' && (
        <div className="guide-app"><div className="guide-app__head">פייסבוק</div>
          <div className="guide-post"><span className="guide-post__who"><i />{host.replace(/^www\./, '')}</span>
            <p>{scene.campaign}! פרטים באתר</p>{link}<div className="guide-post__preview" /></div></div>
      )}
      {scene.place === 'story' && (
        <div className="guide-story"><span className="guide-story__bars"><i /><i /></span><b>{scene.campaign}</b>{link}</div>
      )}
      {scene.place === 'bio' && (
        <div className="guide-app guide-bio"><i className="guide-bio__avatar" /><b>{host.replace(/^www\./, '')}</b>
          <span className="guide-bio__stats"><span><b>1,204</b> עוקבים</span><span><b>86</b> סרטונים</span></span>
          <p>עיצוב ודפוס לעסקים</p>{link}</div>
      )}
      {step === 6 && t >= 1100 && t < 1900 && <span className="guide-paste">הדבקה</span>}
    </div>
  );
}

/** One frame of the walkthrough; `still` renders the poster without a pointer. */
function Stage({ scene, host, step, t, qr, still = false }) {
  const frame = useRef(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = frame.current;
    const fit = () => setScale(element.clientWidth / W);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const at = (s, from = 0) => step > s || (step === s && t >= from);
  const formOpen = at(1) && !at(4, 1000);
  const dropdown = step === 1 && t >= 600 && t < 1650;
  const chosen = at(1, 1600);
  const typed = step === 3 ? scene.campaign.slice(0, Math.max(0, Math.floor((t - 900) / 90))) : at(3) ? scene.campaign : '';
  const created = at(4, 1000);
  const copied = scene.place !== 'qr' && step === 5 && t >= 1000;
  const qrOpen = scene.place === 'qr' && at(5, 1000) && step < 8;
  const counting = step === 8 ? Math.min(1, t / 1600) : 0;
  const clicks = Math.round(12 * counting);
  const visits = Math.round(9 * counting);
  const device = step === 6 || step === 7;
  const cursor = still ? { ...REST, press: false } : pointer(scene, step, t);
  return (
    <div className="guide-stage" ref={frame} aria-hidden="true">
      <div className="guide-canvas" style={{ transform: `scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}>
        <div className="guide-panel">
          <div className="guide-panel__head">
            <b>קישורים למעקב</b>
            {!formOpen && <span className="guide-btn is-primary guide-new"><Plus />קישור חדש</span>}
          </div>
          {!formOpen && !created && <span className="guide-empty">עדיין אין קישורים למעקב</span>}
          {formOpen && (
            <div className="guide-form">
              <label className="guide-field" style={{ left: 398 }}>ערוץ<span className={`guide-input ${step === 1 ? 'is-focus' : ''}`}>{chosen ? CHANNEL_OPTIONS[scene.option] : 'וואטסאפ'}</span></label>
              <label className="guide-field" style={{ left: 206 }}>הקישור<span className={`guide-input is-code ${step === 2 ? 'is-ring' : ''}`} dir="ltr"><small>{host}/l/</small>{chosen ? scene.code : ''}</span></label>
              <label className="guide-field" style={{ left: 14 }}>קמפיין (לא חובה)<span className={`guide-input ${step === 3 ? 'is-focus' : ''}`}>{typed}{step === 3 && t >= 700 && <i className="guide-caret" />}</span></label>
              <label className="guide-field is-row2" style={{ left: 398 }}>עמוד יעד<span className="guide-input" dir="ltr">/</span></label>
              <span className="guide-btn is-primary guide-create">יצירה</span>
              <span className="guide-btn guide-cancel">ביטול</span>
              {dropdown && (
                <span className="guide-menu">
                  {CHANNEL_OPTIONS.map((name, index) => <span key={name} className={index === scene.option && t >= 1000 ? 'is-hover' : ''}>{name}</span>)}
                </span>
              )}
            </div>
          )}
          {created && (
            <div className="guide-row">
              <span className="guide-row__main"><b dir="ltr">{host}/l/{scene.code}</b><small>{CHANNEL_OPTIONS[scene.option]} · {scene.campaign}</small></span>
              <span className="guide-row__num" style={{ left: 268 }}><b>{clicks}</b><small>לחיצות, 30 יום</small></span>
              <span className="guide-row__num" style={{ left: 178 }}><b>{visits}</b><small>ביקורים</small></span>
              <span className="guide-icon" style={{ left: 24 }}>{copied ? <Check /> : <Copy />}</span>
              <span className="guide-icon" style={{ left: 54 }}><QrCode /></span>
              <span className="guide-icon" style={{ left: 84 }}><Trash2 /></span>
              {copied && <span className="guide-tip">הועתק</span>}
            </div>
          )}
          {qrOpen && (
            <div className="guide-qr">{qr ? <img src={qr} alt="" /> : <span className="guide-flyer__qr" />}<span className="guide-btn">הורדה</span></div>
          )}
          {step === 8 && (
            <div className="guide-sources">
              <b>איך הגיעו</b>
              {[[CHANNEL_OPTIONS[scene.option], 9], ['ישיר', 4], ['גוגל', 2]].map(([name, value]) => (
                <span key={name} className="guide-sources__row"><span>{name}</span><i style={{ width: `${(value / 9) * 150 * counting}px` }} /><b>{Math.round(value * counting)}</b></span>
              ))}
            </div>
          )}
        </div>
        {device && <span className="guide-scrim" />}
        {device && <Device scene={scene} host={host} step={step} t={t} qr={qr} />}
        {!still && (
          <span className="guide-cursor" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
            {cursor.press && <span className="guide-press" />}
            <svg viewBox="0 0 14 20" width="14" height="20"><path d="M1 1v15l4-3.6 2.6 6 2.6-1.1-2.6-5.9H13z" fill="#18283A" stroke="#FFFFFF" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          </span>
        )}
      </div>
    </div>
  );
}

function Player({ host, initial, onClose }) {
  const reduced = reducedMotion();
  const [sceneId, setSceneId] = useState(initial);
  const [state, dispatch] = useReducer(clock, { step: 0, elapsed: reduced ? STEPS[0].ms : 0, playing: !reduced });
  const [qr, setQr] = useState('');
  const scene = SCENES.find((item) => item.id === sceneId);
  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = setInterval(() => dispatch({ type: 'tick' }), TICK);
    return () => clearInterval(timer);
  }, [state.playing]);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`https://${host}/l/qr`, { errorCorrectionLevel: 'M', margin: 1, width: 180 }).then((url) => alive && setQr(url)).catch(() => {});
    return () => { alive = false; };
  }, [host]);
  const choose = (id) => { setSceneId(id); dispatch({ type: 'go', step: 0, still: reduced }); };
  const finished = !state.playing && state.step === STEPS.length - 1 && state.elapsed >= STEPS.at(-1).ms;
  return (
    <Modal label="מדריך: קישור למעקב" onClose={onClose} className="guide-modal">
      <div className="guide-modal__head">
        <h2>איך יוצרים קישור למעקב</h2>
        <button type="button" className="icon-btn" aria-label="סגירה" title="סגירה" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <div className="guide-tabs"><Tabs tabs={SCENES} value={sceneId} onChange={choose} label="ערוץ במדריך" /></div>
      <Stage scene={scene} host={host} step={state.step} t={state.elapsed} qr={qr} />
      <div className="guide-controls">
        <button type="button" className="icon-btn" onClick={() => (reduced && !state.playing ? dispatch({ type: 'go', step: Math.min(state.step + 1, STEPS.length - 1), still: true }) : dispatch({ type: 'toggle' }))}
          aria-label={finished ? 'הפעלה מחדש' : state.playing ? 'השהיה' : reduced ? 'לשלב הבא' : 'הפעלה'} title={finished ? 'הפעלה מחדש' : state.playing ? 'השהיה' : 'הפעלה'}>
          {finished ? <RotateCcw aria-hidden="true" /> : state.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <ol className="guide-steps">
          {STEPS.map((step, index) => (
            <li key={index}>
              <button type="button" aria-label={`שלב ${index + 1}: ${step.text(scene)}`} aria-current={index === state.step ? 'step' : undefined}
                onClick={() => dispatch({ type: 'go', step: index, still: reduced || !state.playing })}>
                <i style={{ width: index < state.step ? '100%' : index === state.step ? `${(state.elapsed / step.ms) * 100}%` : 0 }} />
              </button>
            </li>
          ))}
        </ol>
        <span className="guide-count">{state.step + 1}/{STEPS.length}</span>
      </div>
      <p className="guide-caption" aria-live="polite">{STEPS[state.step].text(scene)}</p>
    </Modal>
  );
}

/** Poster: the opening frame with the guide title on top; opens the player. */
export default function LinkGuide({ siteUrl }) {
  const [open, setOpen] = useState(false);
  const host = (() => { try { return new URL(siteUrl).host; } catch { return 'example.co.il'; } })();
  const scene = SCENES[0];
  return (
    <>
      <button type="button" className="guide-poster" onClick={() => setOpen(true)} aria-label="צפייה במדריך: איך יוצרים קישור למעקב לוואטסאפ ולערוצים אחרים">
        <Stage scene={scene} host={host} step={0} t={0} still />
        <span className="guide-poster__over">
          <span className="guide-poster__play"><Play aria-hidden="true" /></span>
          <b>איך יוצרים קישור לוואטסאפ</b>
          <small>מדריך קצר · גם פייסבוק, סטורי ו-QR</small>
        </span>
      </button>
      {open && <Player host={host} initial="whatsapp" onClose={() => setOpen(false)} />}
    </>
  );
}
