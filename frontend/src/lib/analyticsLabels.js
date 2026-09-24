export const VISITOR_HINT = 'הערכה לפי דפדפנים שבהם העמוד נטען והמדידה פעלה. אותו אדם עשוי להיספר יותר מפעם אחת, ואוטומציה שלא זוהתה עשויה להיכלל. אין כאן זיהוי של אנשים.';
export const CONNECTION_HINT = 'כתובות רשת שונות שביקשו עמוד בהצלחה ולא זוהו כאוטומציה. כמה אנשים יכולים לחלוק כתובת אחת. זהו נתון עזר מהשרת, לא ספירת אנשים.';
export const PAGE_HINT = 'עמודים שהשרת החזיר בהצלחה, לאחר סינון אוטומציה מוכרת. תמונות, קוד ובקשות שנכשלו אינם נכללים.';
export const PROJECT_NAMES = { koral: 'קורל אירועים', miryam: 'מרים זליג', pinhas: 'פנחס רצון', libi: 'ליבי יהלומים', reuven: 'דפוס ראובן', sos: 'בדרך אליך', seder: 'סדר', pdf: 'PDF Studio' };
export function pageName(path, appName) {
  if (path === '/') return 'עמוד הבית';
  const project = appName === 'LA webs' && path?.match(/^\/work\/([^/]+)\/?$/)?.[1];
  return project && PROJECT_NAMES[project] ? `פרויקט ${PROJECT_NAMES[project]}` : path;
}
