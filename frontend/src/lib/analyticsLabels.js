export const VISITOR_HINT = 'הערכה לפי דפדפנים שבהם העמוד נטען והמדידה פעלה. אותו אדם עשוי להיספר יותר מפעם אחת, ואוטומציה שלא זוהתה עשויה להיכלל. אין כאן זיהוי של אנשים.';
export const CONNECTION_HINT = 'כתובות רשת שונות שביקשו עמוד בהצלחה ולא זוהו כאוטומציה. כמה אנשים יכולים לחלוק כתובת אחת. זהו נתון עזר מהשרת, לא ספירת אנשים.';
export const PAGE_HINT = 'עמודים שהשרת החזיר בהצלחה, לאחר סינון אוטומציה מוכרת. תמונות, קוד ובקשות שנכשלו אינם נכללים.';
export const PROJECT_NAMES = { koral: 'קורל אירועים', miryam: 'מרים זליג', pinhas: 'פנחס רצון', libi: 'ליבי יהלומים', reuven: 'דפוס ראובן', sos: 'בדרך אליך', seder: 'סדר', pdf: 'PDF Studio', pizza: 'פיצת התנור' };
// Alenu and its reserve-duty pages (clean URLs and their .html twins).
const ALENU_PAGES = {
  '/index': 'עמוד הבית', '/start': 'טופס התחלה', '/privacy': 'פרטיות', '/accessibility': 'נגישות',
  '/miluim': 'מילואים · עמוד ראשי', '/miluim-guide': 'מילואים · מדריך הנחת ארנונה', '/miluim-cities': 'מילואים · לפי עיר',
  '/miluim-commanders': 'מילואים · למפקדים', '/miluim-certificate': 'מילואים · אישור שירות', '/miluim-missing': 'מילואים · הנחה שחסרה',
  '/miluim-retro': 'מילואים · החזר רטרואקטיבי'
};

export const ALENU_JOURNEY_ACTIONS = {
  'landing-open': 'עמוד הבית נפתח', 'page-scroll': 'החלה גלילה',
  'section-hero': 'נצפה האזור הראשי', 'section-ours': 'נצפה החלק על הבירוקרטיה',
  'section-form': 'נצפה החלק על מילוי הטופס', 'section-accounts': 'נצפה החלק על העברת החשבונות',
  'section-updates': 'נצפה החלק על עדכונים', 'section-price': 'נצפתה עלות השירות', 'section-faq': 'נצפו השאלות הנפוצות',
  'section-about': 'נצפה החלק ״מי אנחנו״', 'section-closing': 'נצפה אזור ההתחלה בתחתית',
  'start-header': 'לחיצה להתחלה מהתפריט', 'start-hero': 'לחיצה להתחלה מהאזור הראשי',
  'start-price': 'לחיצה להתחלה מהמחיר', 'start-closing': 'לחיצה להתחלה מתחתית העמוד',
  'start-sticky': 'לחיצה על כפתור ההתחלה הצף', 'nav-how': 'לחיצה על ״איך זה עובד״', 'nav-price': 'לחיצה על ״עלות השירות״',
  'nav-miluim': 'לחיצה לעמוד מילואים', 'faq-toggle': 'לחיצה על שאלה נפוצה', 'video-toggle': 'לחיצה על נגן ההדגמה',
  'selection-open': 'בחירת חשבונות', 'details-open': 'פרטי קשר', 'next-details': 'לחיצה על ״להמשיך״',
  'back-selection': 'לחיצה על ״שינוי הבחירה״', 'back-details': 'לחיצה על ״עריכת הפרטים״',
  'account-elec': 'שינוי בחירת חשמל', 'account-water': 'שינוי בחירת מים', 'account-arnona': 'שינוי בחירת ארנונה',
  'account-gas': 'שינוי בחירת גז', 'address-toggle': 'לחיצה על אזור שינוי הכתובת', 'change-address': 'שינוי בחירת עדכון כתובת',
  'edit-name': 'החל מילוי שם', 'edit-phone': 'החל מילוי נייד', 'edit-city': 'החל מילוי עיר',
  'change-role': 'שינוי סוג הפונה', 'change-direction': 'שינוי סוג המעבר',
  'invalid-name': 'שגיאת אימות בשם', 'invalid-phone': 'שגיאת אימות בנייד', 'invalid-city': 'שגיאת אימות בעיר',
  'crm-sending': 'שליחה ל־CRM', 'crm-received': 'ה־CRM אישר קליטה',
  'crm-unconfirmed': 'טרם התקבל אישור מה־CRM', 'copy-message': 'לחיצה להעתקת הודעת וואטסאפ',
};

export function pageName(path, appName) {
  if (path === '/') return 'עמוד הבית';
  if (appName === 'Alenu' || appName === 'Alenu Miluim') {
    const name = ALENU_PAGES[String(path || '').replace(/\.html$/, '').replace(/\/$/, '')];
    if (name) return name;
  }
  const project = appName === 'LA webs' && path?.match(/^\/work\/([^/]+)\/?$/)?.[1];
  return project && PROJECT_NAMES[project] ? `פרויקט ${PROJECT_NAMES[project]}` : path;
}
