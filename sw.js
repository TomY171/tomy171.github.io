/* Service Worker — הקוד שמאפשר להתקין את האפליקציה על מסך הבית.

   מה הוא עושה: יושב בין האפליקציה לרשת, ושומר עותק של קבצי
   האפליקציה (HTML, JS, CSS) אצלך במכשיר. התוצאה היא פתיחה מיידית,
   בלי להמתין להורדה בכל פעם.

   ארבע החלטות שכדאי להבין:

   1. "רשת קודם, מטמון כגיבוי". תמיד מנסים להביא את הגרסה העדכנית,
      ורק אם אין אינטרנט משתמשים בעותק השמור. ההפך — מטמון קודם —
      מהיר יותר, אבל אז אתה מעלה תיקון ולא רואה אותו. מבלבל מאוד.

   2. אבל לא מחכים לרשת בלי סוף. "אין אינטרנט" ו"אינטרנט גרוע"
      הם לא אותו דבר, ובטלפון השני נפוץ הרבה יותר: החיבור לא
      נכשל, הוא פשוט נתקע. בלי הגבלת זמן, אפליקציה עם עותק שמור
      מושלם במכשיר הייתה מציגה מסך ריק שלושים שניות. לכן אחרי
      שלוש שניות מגישים את העותק השמור — והרשת ממשיכה ברקע
      ומעדכנת את המטמון לפעם הבאה.

      כשאין עותק שמור אין מה למהר אליו, ואז מחכים לרשת עד הסוף.

   3. בקשות ל-Supabase לא נכנסות למטמון בכלל. הכרטיסיות שלך חייבות
      להיות עדכניות; כרטיסייה שנשמרה במטמון היא כרטיסייה שגויה.

   4. אין כאן תמיכה אמיתית בלימוד ללא אינטרנט. האפליקציה תיפתח,
      אבל הנתונים עדיין מגיעים מהשרת. זה פיצ'ר נפרד לעתיד.
*/

const CACHE = 'kt-shell-v1'

/** כמה לחכות לרשת כשיש עותק שמור להגיש במקומה. */
const NETWORK_TIMEOUT_MS = 3000

self.addEventListener('install', () => {
  // אל תחכה שהגרסה הישנה תיסגר — קח פיקוד מיד.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request

  if (request.method !== 'GET') return

  // רק קבצים של האפליקציה עצמה. Supabase, גופנים ותמונות חיצוניות
  // עוברים ישירות לרשת בלי שניגע בהם.
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(respond(request))
})

/** דף הבסיס, לניווט בלי רשת. הבקשה היא ל-"/" ולכן זה המפתח. */
async function appShell() {
  return (await caches.match('/')) ?? (await caches.match('/index.html'))
}

const offline = () =>
  new Response('אין חיבור לרשת', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })

async function respond(request) {
  const fromNetwork = fetch(request).then(response => {
    // רק תשובות תקינות נכנסות למטמון. בלי הבדיקה הזאת, שגיאת 500
    // רגעית מהשרת נשמרת — ומוגשת לך שוב כשאין רשת, כאילו זה הדף.
    if (response.ok) {
      const copy = response.clone()
      caches
        .open(CACHE)
        .then(cache => cache.put(request, copy))
        .catch(() => {})
    }
    return response
  })

  // גם אם נוותר עליה בהמשך, היא ממשיכה ברקע ומעדכנת את המטמון.
  // בלי הבליעה הזאת, כישלון מאוחר היה נספר כשגיאה שלא טופלה.
  fromNetwork.catch(() => {})

  const cached = await caches.match(request)

  if (!cached) {
    // אין למה לחזור — מחכים לרשת כמה שצריך.
    try {
      return await fromNetwork
    } catch {
      if (request.mode === 'navigate') {
        const shell = await appShell()
        if (shell) return shell
      }
      return offline()
    }
  }

  // יש עותק שמור: נותנים לרשת שלוש שניות, ואז מגישים אותו.
  try {
    return await Promise.race([
      fromNetwork,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS),
      ),
    ])
  } catch {
    return cached
  }
}
