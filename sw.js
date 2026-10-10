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

// v2: גרסה חדשה של הקובץ מוחקת את המטמון הקודם, ואיתו קבצים ישנים
// שהצטברו מכל פריסה ופריסה.
const CACHE = 'kt-shell-v2'

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

  // השמירה במטמון נמשכת ברקע גם אחרי שהתשובה כבר הוגשה. waitUntil
  // חייב להיקרא כאן, בזמן האירוע — מאוחר יותר הדפדפן כבר לא מקבל
  // אותו — ולכן הוא מקבל הבטחה ש-respond משחרר כשהעבודה נגמרת.
  let release = () => {}
  event.waitUntil(new Promise(resolve => (release = resolve)))
  event.respondWith(respond(request, release))
})

/**
 * קבצי הבנייה שטקסט מזכיר: "/assets/index-AbC123.js" ב-index.html,
 * ו-"./TrackScreen-XyZ.js" או "assets/..." בתוך קובץ JS של הבנייה.
 */
function assetRefs(text) {
  const out = new Set()
  for (const m of text.matchAll(/(?:\/assets\/|["'`]assets\/|\.\/)([\w.-]+\.(?:js|css))/g)) {
    out.add('/assets/' + m[1])
  }
  return [...out]
}

/**
 * דף בסיס חדש נכנס למטמון רק יחד עם הקבצים שלו.
 *
 * קודם הוא נשמר לבד: index.html של גרסה חדשה הגיע ברקע ונכנס
 * למטמון, אבל ה-JS וה-CSS שלו לא. בפתיחה הבאה בלי רשת הוגש הדף
 * החדש, הקבצים שלו לא נמצאו — ומסך לבן.
 *
 * ומאחר שכאן ידוע מה הבנייה הנוכחית, כאן גם מנקים: קבצים של
 * בניות קודמות נמחקים. בלי זה כל פריסה השאירה במכשיר עוד מגה-בייט.
 */
async function commitBuild(request, response) {
  const cache = await caches.open(CACHE)
  const html = await response.clone().text()
  const direct = assetRefs(html)

  // אותה בנייה כמו זו ששמורה? רק מרעננים את הדף, בלי לסרוק כלום.
  const old = await cache.match(request)
  if (old) {
    const before = assetRefs(await old.text())
    if (before.length === direct.length && before.every(p => direct.includes(p))) {
      await cache.put(request, response)
      return
    }
  }

  // בנייה חדשה: נותנים לדף שתי שניות לבקש בעצמו את ה-JS וה-CSS שלו
  // (הבקשות שלו נשמרות במטמון בדרך הרגילה). בלי ההמתנה, הקבצים —
  // חצי מגה-בייט — הורדו פעמיים במקביל, בדיוק ברגע הפתיחה הראשונה
  // אחרי פריסה, ברשת סלולרית.
  await new Promise(resolve => setTimeout(resolve, 2000))

  // הקבצים שהדף טוען ישירות — חובה. חסר אחד? הדף הישן נשאר.
  for (const path of direct) {
    if (await cache.match(path)) continue
    const r = await fetch(path)
    if (!r.ok) return
    await cache.put(path, r)
  }
  await cache.put(request, response)

  // כל מה שהבנייה יכולה לטעון בהמשך (מסך המעקב, הספרייה) — ככל
  // שאפשר. כישלון כאן לא מבטל כלום: הקובץ פשוט יגיע כשיבקשו אותו.
  const wanted = new Set(direct)
  const queue = direct.filter(p => p.endsWith('.js'))
  while (queue.length > 0 && wanted.size < 200) {
    const path = queue.shift()
    let hit = await cache.match(path)
    if (!hit) {
      try {
        const r = await fetch(path)
        if (!r.ok) continue
        await cache.put(path, r.clone())
        hit = r
      } catch {
        continue
      }
    }
    for (const ref of assetRefs(await hit.text())) {
      if (wanted.has(ref)) continue
      wanted.add(ref)
      if (ref.endsWith('.js')) queue.push(ref)
    }
  }

  // ניקוי: קבצי בנייה שהבנייה הנוכחית לא מזכירה שייכים לבנייה ישנה.
  for (const key of await cache.keys()) {
    const path = new URL(key.url).pathname
    if (path.startsWith('/assets/') && !wanted.has(path)) await cache.delete(key)
  }
}

/** דף הבסיס, לניווט בלי רשת. הבקשה היא ל-"/" ולכן זה המפתח. */
async function appShell() {
  return (await caches.match('/')) ?? (await caches.match('/index.html'))
}

const offline = () =>
  new Response('אין חיבור לרשת', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })

/**
 * הבקשה לרשת. דף הבסיס עובר אימות מול השרת בכל פעם (no-cache): בלי
 * זה הדפדפן הגיש עותק מהמטמון של עצמו לעשר דקות אחרי פריסה, וטלפון
 * שנפתח מחדש המשיך להראות את הגרסה הישנה.
 */
function fetchFresh(request) {
  if (request.mode === 'navigate') {
    return fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
  }
  return fetch(request)
}

async function respond(request, release) {
  const fromNetwork = fetchFresh(request).then(response => {
    // רק תשובות תקינות נכנסות למטמון. בלי הבדיקה הזאת, שגיאת 500
    // רגעית מהשרת נשמרת — ומוגשת לך שוב כשאין רשת, כאילו זה הדף.
    if (response.ok) {
      const copy = response.clone()
      const saving =
        request.mode === 'navigate'
          ? commitBuild(request, copy)
          : caches.open(CACHE).then(cache => cache.put(request, copy))
      release(saving.catch(() => {}))
    } else {
      release()
    }
    return response
  })

  // גם אם נוותר עליה בהמשך, היא ממשיכה ברקע ומעדכנת את המטמון.
  // בלי הבליעה הזאת, כישלון מאוחר היה נספר כשגיאה שלא טופלה.
  fromNetwork.catch(() => release())

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

  // יש עותק שמור: נותנים לרשת שלוש שניות, ואז מגישים אותו. תשובה
  // לא תקינה (404 של קובץ שנמחק בפריסה, 500 רגעי) נחשבת כישלון —
  // קודם היא "ניצחה" את המטמון והוגשה במקום העותק הטוב שבו.
  try {
    return await Promise.race([
      fromNetwork.then(r => (r.ok ? r : Promise.reject(new Error(String(r.status))))),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS),
      ),
    ])
  } catch {
    return cached
  }
}
