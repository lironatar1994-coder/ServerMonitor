import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const final = process.argv.includes('--final-synthetic');
const prompt = JSON.parse(fs.readFileSync(path.join(dir, 'vault-desktop.json'), 'utf8')).prompt;
const sourcePng = path.join(dir, 'vault-desktop.png');
const embeddedPng = path.join(dir, 'vault-desktop.prompted.png');
const promptFile = path.join(dir, 'vault-desktop.prompt.txt');
fs.writeFileSync(promptFile, prompt);
if (!fs.existsSync(embeddedPng)) fs.copyFileSync(sourcePng, embeddedPng);
const embedTool = path.join(process.env.USERPROFILE, '.agents/skills/impeccable/scripts/embed-prompt.mjs');
execFileSync(process.execPath, [embedTool, embeddedPng, '--prompt-file', promptFile], { stdio: 'pipe' });
const roundtrip = execFileSync(process.execPath, [embedTool, embeddedPng, '--read'], { encoding: 'utf8' }).trimEnd();
if (roundtrip !== prompt) throw new Error('Embedded prompt does not match the exact source prompt');
const imageParts = b => {
  const parts = [];
  for (let offset = 8; offset < b.length;) {
    const length = b.readUInt32BE(offset);
    const type = b.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' || type === 'IHDR') parts.push(b.subarray(offset, offset + length + 12));
    offset += length + 12;
  }
  return Buffer.concat(parts);
};
if (!imageParts(fs.readFileSync(sourcePng)).equals(imageParts(fs.readFileSync(embeddedPng)))) throw new Error('Reference image pixel data changed');

fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
for (const file of ['heebo-400.ttf', 'heebo-600.ttf', 'Heebo-OFL.txt']) fs.copyFileSync(path.join(root, 'frontend/public/fonts', file), path.join(dir, 'fonts', file));
const specs = [
  ['vault-detail-1440.png', 'כספת — רשימה ופרטים', 'vault', 'desktop'],
  ['vault-detail-1536.png', 'כספת — פרטים במסך רחב', 'vault', 'desktop'],
  ['vault-list-390.png', 'כספת — רשימה בנייד', 'vault', 'mobile'],
  ['vault-detail-390.png', 'כספת — פרטים בנייד', 'vault', 'mobile'],
  ['vault-edit-1440.png', 'כספת — עריכת פריט', 'vault', 'desktop'],
  ['vault-edit-390.png', 'כספת — עריכת פריט בנייד', 'vault', 'mobile'],
  ['vault-team-1440.png', 'כספת — צוות והרשאות', 'vault', 'desktop'],
  ['vault-locked-1440.png', 'כספת — מצב נעול', 'vault', 'desktop'],
  ['password-upgrade-1440.png', 'כניסה — עדכון סיסמה', 'vault', 'desktop'],
  ['login-1440.png', 'כניסה למערכת', 'vault', 'desktop'],
  ['password-upgrade-320.png', 'כניסה — עדכון סיסמה בנייד', 'vault', 'mobile'],
  ['mfa-1440.png', 'כניסה — אימות נוסף', 'vault', 'desktop'],
  ['vault-recovery-1440.png', 'כספת — שחזור גישה', 'vault', 'desktop'],
  ['vault-edit-footer-390.png', 'כספת — פעולות עריכה בנייד', 'vault', 'mobile'],
  ['visitors-1440.png', 'אתרים', 'workspace', 'desktop'],
  ['clients-1440.png', 'לקוחות', 'workspace', 'desktop'],
  ['infrastructure-1440.png', 'שרת ומשאבים', 'workspace', 'desktop'],
  ['services-1440.png', 'שירותים', 'workspace', 'desktop'],
  ['settings-1440.png', 'הגדרות', 'workspace', 'desktop'],
  ['visitors-390.png', 'אתרים בנייד', 'workspace', 'mobile'],
  ['clients-390.png', 'לקוחות בנייד', 'workspace', 'mobile'],
  ['infrastructure-390.png', 'שרת ומשאבים בנייד', 'workspace', 'mobile'],
  ['services-390.png', 'שירותים בנייד', 'workspace', 'mobile'],
  ['settings-390.png', 'הגדרות בנייד', 'workspace', 'mobile'],
  ['vault-list-768.png', 'כספת — רשימה בטאבלט', 'vault', 'tablet'],
  ['vault-detail-768.png', 'כספת — פרטים בטאבלט', 'vault', 'tablet'],
  ['vault-list-320.png', 'כספת — רשימה במסך צר', 'vault', 'mobile'],
  ['vault-detail-320.png', 'כספת — פרטים במסך צר', 'vault', 'mobile'],
  ['visitors-320.png', 'אתרים במסך צר', 'workspace', 'mobile'],
  ['clients-320.png', 'לקוחות במסך צר', 'workspace', 'mobile'],
  ['infrastructure-320.png', 'שרת ומשאבים במסך צר', 'workspace', 'mobile'],
  ['services-320.png', 'שירותים במסך צר', 'workspace', 'mobile'],
  ['settings-320.png', 'הגדרות במסך צר', 'workspace', 'mobile'],
];
function metadata(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Expected PNG: ${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
if (final) fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
const screens = specs.map(([file, title, category, viewport]) => {
  const destination = path.join(dir, 'screenshots', file);
  if (final) {
    const source = path.join(root, '.impeccable/review/vault', file);
    if (!fs.existsSync(source)) throw new Error(`Missing final synthetic screenshot: ${file}`);
    fs.copyFileSync(source, destination);
  }
  const available = fs.existsSync(destination);
  const note = category === 'workspace' ? 'סביבת בדיקה סינתטית. ערכים חסרים ומצבים ריקים נשמרו כפי שהם בממשק.' : file.includes('recovery') ? 'סביבת בדיקה סינתטית. ערכי השחזור מוסתרים.' : undefined;
  return { file, title, category, viewport, path: `screenshots/${file}`, alt: `${title} — הממשק שיושם עם נתוני הדגמה סינתטיים`, ...(note ? { note } : {}), available, ...(available ? metadata(destination) : {}) };
});
screens.unshift({ file: 'vault-desktop.prompted.png', title: 'הקונספט הראשוני שאושר', category: 'reference', viewport: 'desktop', path: 'vault-desktop.prompted.png', alt: 'קונספט ראשוני שאושר: כספת בעברית עם רשימת פריטים ופאנל פרטים לצד ניווט כהה', note: 'מבנה הרשימה והפרטים שאושר בתחילת העבודה. צילומי המימוש מציגים את הפלטה המעודכנת; הקונספט המקורי נשמר ללא שינוי ואינו עדות לפעולה או לאבטחה.', available: true, ...metadata(embeddedPng) });
const data = { schema: 1, final: screens.filter(s => s.category !== 'reference').every(s => s.available), synthetic: true, prompt, screens };
fs.writeFileSync(path.join(dir, 'gallery-data.js'), `window.MOCK_GALLERY = ${JSON.stringify(data, null, 2)};\n`);
fs.writeFileSync(path.join(dir, 'gallery-manifest.json'), JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ final: data.final, screenshots: screens.filter(s => s.category !== 'reference' && s.available).length, promptVerified: true, imageDataPreserved: true, gallery: path.join(dir, 'index.html') }));
