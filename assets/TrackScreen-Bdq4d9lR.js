import{r,j as e,L as $,E as B,t as _,a as g,b as q,s as F,c as f,l as N,d as S,w as z,e as Q,f as G,g as H,h as P,i as J,k as U,m as A,n as w,o as E,p as L,q as I,u as C,v as V,x as X,D as Z,y as ee,z as M,A as se,B as T,C as ne,F as te,G as ae,H as le,I as ie,J as de,K as oe,W as ce}from"./index-CymPZFL3.js";const R=`-- =====================================================================
--  מעקב עקביות — משימות וציונים יומיים
--
--  איך מריצים: Supabase ← SQL Editor ← New query ← להדביק ← Run.
--  אפשר להריץ שוב ושוב, לא יקרה כלום פעמיים.
--
--  ---------------------------------------------------------------
--  למה שתי טבלאות ולא אחת
--  ---------------------------------------------------------------
--  המודל כאן הוא טבלה דו-ממדית: שורה = משימה, עמודה = יום,
--  תא = הציון. זה מה שמאפשר לראות *איפה* השבוע נשבר ולא רק
--  שהוא היה בינוני — שורה ירוקה עם יום חמישי אדום אומרת משהו
--  אחר לגמרי משורה אדומה לאורך כל השבוע.
--
--  רשימת ימים עם ציון אחד ליום לא הייתה יכולה להראות את זה.
-- =====================================================================


-- --------------------------- 1. המשימות -----------------------------

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),

  user_id      uuid not null default auth.uid()
               references auth.users(id) on delete cascade,

  name         text not null check (length(trim(name)) > 0),

  -- משימה קבועה מופיעה מאליה בכל יום. חד-פעמית מופיעה רק ביום
  -- שנוצרה בו, או ביום שיש לה בו ציון.
  is_recurring boolean not null default true,

  -- ארכיון במקום מחיקה. משימה שהפסקת לעשות מפסיקה להופיע היום,
  -- אבל ההיסטוריה שלה נשארת — אחרת כל ניקוי של הרשימה היה מוחק
  -- חודשים של נתונים.
  active       boolean not null default true,

  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),

  -- האילוץ הזה נראה מיותר (id הוא כבר מפתח ראשי), והוא לא:
  -- בלעדיו אי אפשר להצביע על הצמד (id, user_id) ממפתח זר.
  -- ראה את ההסבר אצל task_entries.
  unique (id, user_id)
);


-- ------------------------ 2. הציונים היומיים ------------------------

create table if not exists public.task_entries (
  id         uuid primary key default gen_random_uuid(),

  user_id    uuid not null default auth.uid()
             references auth.users(id) on delete cascade,

  task_id    uuid not null,

  -- date ולא timestamptz, בכוונה: "מה עשיתי ביום שלישי" הוא תאריך,
  -- לא רגע בזמן. הצד של הדפדפן מחשב את היום לפי השעון המקומי
  -- (ראה dateKey ב-src/lib/format.ts), כדי שציון שנרשם ב-01:00
  -- בלילה יישב על היום שהתחיל אתמול בערב.
  day        date not null,

  -- 0 עד 10, ולא 1 עד 10.
  --
  -- 0 = "לא עשיתי". זה לא אותו דבר כמו שורה שלא קיימת, שמשמעותה
  -- "לא רשמתי". ההבדל בין השניים הוא כל הערך של הכלי: חודש שבו
  -- ויתרת על משימה צריך להיראות אחרת מחודש שבו רק שכחת לתעד.
  score      integer not null check (score between 0 and 10),

  note       text,
  created_at timestamptz not null default now(),

  -- ציון אחד לכל משימה ליום. עדכון דורס את הקודם (upsert).
  unique (task_id, day),

  -- מפתח זר על *שני* השדות יחד.
  --
  -- לו היה כאן references tasks(id) בלבד, שורה הייתה יכולה להצביע
  -- על משימה של משתמש אחר בעודה נושאת את ה-user_id שלך — וכללי
  -- האבטחה, שבודקים רק את user_id, היו מאשרים אותה. הצמד סוגר את
  -- הפרצה במסד הנתונים עצמו, במקום לסמוך על הדפדפן.
  foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);


-- ----------------------------- 3. אינדקסים ---------------------------
--
--  שאילתת מסך השבוע היא "כל הציונים שלי בטווח תאריכים" — בדיוק
--  הצמד שבאינדקס הראשון.

create index if not exists task_entries_day_idx  on public.task_entries (user_id, day);
create index if not exists task_entries_task_idx on public.task_entries (task_id, day);
create index if not exists tasks_order_idx       on public.tasks (user_id, active, sort_order);


-- -------------------- 4. אבטחה — Row Level Security ------------------
--
--  אותה תבנית בדיוק כמו בשאר הטבלאות בפרויקט: שורה שייכת למי
--  שה-user_id שלה שווה למשתמש המחובר, ואף אחד אחר לא רואה אותה.
--
--  שים לב שההפעלה היא פקודה נפרדת מהמדיניות. טבלה עם מדיניות
--  שלא הופעל עליה RLS היא טבלה פתוחה לרווחה.

alter table public.tasks        enable row level security;
alter table public.task_entries enable row level security;

drop policy if exists "tasks are private"        on public.tasks;
drop policy if exists "task entries are private" on public.task_entries;

create policy "tasks are private" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "task entries are private" on public.task_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
`;function k(s){if(s===null)return;const a=le(s);return{background:a.bg,borderColor:a.bg,color:a.fg}}function O({value:s,onPick:a}){return e.jsx("div",{className:"scale",children:Array.from({length:11},(h,t)=>e.jsx("button",{type:"button",className:"sc"+(s===t?" on":""),style:k(t),"aria-pressed":s===t,"aria-label":t===0?"לא עשיתי":`ציון ${t}`,onClick:()=>a(t),children:t},t))})}function re(){return e.jsxs("div",{className:"sec",children:[e.jsxs("div",{className:"errbox",style:{borderColor:"var(--brass)"},children:[e.jsx("b",{children:"חסרות הטבלאות של המעקב"}),"המעקב שומר את המשימות והציונים במסד הנתונים שלך, וצריך ליצור שם שתי טבלאות פעם אחת. זה לוקח חצי דקה ולא נוגע בכרטיסיות."]}),e.jsxs("ol",{style:{paddingInlineStart:20,lineHeight:1.9,fontSize:15},children:[e.jsx("li",{children:"להיכנס ל-Supabase ← הפרויקט שלך"}),e.jsx("li",{children:"בתפריט הצדדי: SQL Editor ← New query"}),e.jsx("li",{children:"להדביק את מה שלמטה וללחוץ Run"}),e.jsx("li",{children:"לחזור לכאן ולמשוך את המסך למטה כדי לרענן"})]}),e.jsx("button",{className:"cta",onClick:()=>{var s;(s=navigator.clipboard)==null||s.writeText(R).then(()=>_("הקוד הועתק")).catch(()=>_("ההעתקה נחסמה — אפשר לסמן ולהעתיק ידנית"))},children:"העתק את הקוד"}),e.jsx("pre",{className:"sqlbox",children:R})]})}function ue({note:s,onSave:a}){const[h,t]=r.useState(s.length>0),[l,d]=r.useState(s);return h?e.jsx("input",{className:"noteinput",value:l,placeholder:"הערה קצרה",onChange:n=>d(n.target.value),onBlur:()=>{l.trim()!==s.trim()&&a(l)},onKeyDown:n=>{n.key==="Enter"&&n.currentTarget.blur()}}):e.jsx("button",{type:"button",className:"notelink",onClick:()=>t(!0),children:"הוסף הערה"})}function K({label:s,recurring:a,onAdd:h}){const[t,l]=r.useState("");function d(){const n=t.trim();n&&(h(n),l(""))}return e.jsxs("div",{className:"addtask",children:[e.jsx("input",{value:t,placeholder:a?"שם המשימה":"משימה חד-פעמית להיום",onChange:n=>l(n.target.value),onKeyDown:n=>{n.key==="Enter"&&d()}}),e.jsx("button",{type:"button",className:"ghost",onClick:d,disabled:!t.trim(),children:s})]})}function he({tracker:s}){const[a,h]=r.useState(()=>g()),t=a===g();r.useEffect(()=>{s.ensureRange(a,a)},[a,s.ensureRange]);const l=r.useMemo(()=>q(s.tasks,a,s.entryMap),[s.tasks,s.entryMap,a]),d=l.filter(n=>F(s.entryMap,n.id,a)!==null).length;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>h(f(a,-1)),children:"יום קודם"}),e.jsxs("div",{className:"daylabel",children:[t?"היום":N(a),e.jsxs("em",{children:[d," מתוך ",l.length]})]}),e.jsx("button",{type:"button",className:"ghost",disabled:t,onClick:()=>h(f(a,1)),children:"יום הבא"})]}),l.length===0&&e.jsxs("div",{className:"empty",children:[e.jsx("p",{children:"אין משימות ליום הזה."}),e.jsx("p",{children:'אפשר להוסיף משימות קבועות בלשונית "משימות".'})]}),l.map(n=>{const c=s.entryMap.get(n.id+"|"+a)??null,u=(c==null?void 0:c.score)??null;return e.jsxs("div",{className:"taskcard",children:[e.jsxs("div",{className:"taskcard-head",children:[e.jsxs("span",{className:"taskcard-name",children:[n.name,!n.is_recurring&&e.jsx("em",{children:" · חד-פעמית"})]}),u!==null&&e.jsx("button",{type:"button",className:"taskcard-clear",onClick:()=>void s.clearRating(n.id,a),children:"נקה"})]}),e.jsx(O,{value:u,onPick:b=>void s.rate(n.id,a,b)}),u!==null&&e.jsx(ue,{note:(c==null?void 0:c.note)??"",onSave:b=>void s.setNote(n.id,a,b)},n.id+a)]},n.id)}),t&&e.jsx(K,{label:"הוסף",recurring:!1,onAdd:n=>void s.addTask(n,!1)})]})}function me({tracker:s}){const[a,h]=r.useState(()=>S(g())),[t,l]=r.useState(null),d=r.useMemo(()=>z(a),[a]),n=g(),c=a===S(n);r.useEffect(()=>{s.ensureRange(d[0],d[6]>n?n:d[6])},[d,n,s.ensureRange]);const u=r.useMemo(()=>Q(G(s.tasks,d,s.entryMap),d,s.entryMap),[s.tasks,s.entryMap,d]),b=r.useMemo(()=>H(u,d.length),[u,d.length]),y=t?s.tasks.find(o=>o.id===t.taskId)??null:null,j=t?F(s.entryMap,t.taskId,t.day):null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{l(null),h(f(a,-7))},children:"שבוע קודם"}),e.jsxs("div",{className:"daylabel",children:[P(a,n),e.jsx("em",{children:J(a)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:c,onClick:()=>{l(null),h(f(a,7))},children:"שבוע הבא"})]}),u.length===0?e.jsx("div",{className:"empty",children:e.jsx("p",{children:"אין משימות בשבוע הזה."})}):e.jsx("div",{className:"weekscroll",children:e.jsxs("div",{className:"weekgrid",children:[e.jsx("div",{className:"wg-corner"}),d.map(o=>e.jsxs("div",{className:"wg-head"+(o===n?" now":""),children:[U(o),e.jsx("em",{children:A(o)})]},o)),e.jsx("div",{className:"wg-head avg",children:"ממוצע"}),u.map(o=>e.jsxs(r.Fragment,{children:[e.jsx("div",{className:"wg-name",title:o.task.name,children:o.task.name}),o.scores.map((i,v)=>{const x=d[v],m=x>n||!o.belongs[v],p=(t==null?void 0:t.taskId)===o.task.id&&(t==null?void 0:t.day)===x;return e.jsx("button",{type:"button",disabled:m,className:"wg-cell"+(p?" sel":"")+(m?" off":""),style:m?void 0:k(i),"aria-label":`${o.task.name}, ${N(x)}, ${i===null?"אין ציון":"ציון "+i}`,onClick:()=>l(p?null:{taskId:o.task.id,day:x}),children:i===null?"":i},x)}),e.jsx("div",{className:"wg-avg",children:o.avg===null?"·":o.avg})]},o.task.id)),e.jsx("div",{className:"wg-name foot",children:"ממוצע יומי"}),b.map((o,i)=>e.jsx("div",{className:"wg-avg foot",children:o===null?"·":o},d[i])),e.jsx("div",{className:"wg-avg foot"})]})}),t&&y&&e.jsxs("div",{className:"sec editcell",children:[e.jsxs("div",{className:"head",children:[e.jsxs("h2",{children:[y.name," · ",N(t.day)]}),e.jsx("button",{type:"button",onClick:()=>l(null),children:"סגור"})]}),e.jsx(O,{value:j,onPick:o=>void s.rate(t.taskId,t.day,o)}),j!==null&&e.jsx("button",{type:"button",className:"notelink",onClick:()=>{s.clearRating(t.taskId,t.day)},children:"נקה את הציון"})]})]})}function D({task:s,index:a,count:h,canDelete:t,onRename:l,onMove:d,onArchive:n,onDelete:c}){const[u,b]=r.useState(!1),[y,j]=r.useState(s.name);return e.jsxs("div",{className:"trow",children:[u?e.jsx("input",{className:"trow-input",value:y,onChange:o=>j(o.target.value),onKeyDown:o=>{o.key==="Enter"&&o.currentTarget.blur()},onBlur:()=>{const o=y.trim();o&&o!==s.name?l(o):j(s.name),b(!1)}}):e.jsxs("button",{type:"button",className:"trow-name",onClick:()=>b(!0),children:[s.name,!s.is_recurring&&e.jsx("em",{children:" · חד-פעמית"}),!s.active&&e.jsx("em",{children:" · בארכיון"})]}),e.jsxs("div",{className:"trow-actions",children:[s.active&&e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",disabled:a===0,"aria-label":"הזז למעלה",onClick:()=>d(-1),children:"↑"}),e.jsx("button",{type:"button",disabled:a===h-1,"aria-label":"הזז למטה",onClick:()=>d(1),children:"↓"})]}),e.jsx("button",{type:"button",onClick:()=>n(!s.active),children:s.active?"לארכיון":"החזר"}),t&&e.jsx("button",{type:"button",className:"danger",onClick:c,children:"מחק"})]})]})}function xe({tracker:s}){const a=s.tasks.filter(n=>n.active),h=s.tasks.filter(n=>!n.active),t=r.useMemo(()=>{const n=new Map;for(const c of s.entries)n.set(c.task_id,(n.get(c.task_id)??0)+1);return n},[s.entries]),l=f(g(),-ce);function d(n){return(t.get(n.id)??0)===0&&oe(n)>=l}return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"sec",children:[e.jsx("h2",{children:"משימות פעילות"}),a.length===0&&e.jsx("div",{className:"hint",children:"אין עדיין משימות. הוסף אחת למטה."}),a.map((n,c)=>e.jsx(D,{task:n,index:c,count:a.length,canDelete:d(n),onRename:u=>void s.patchTask(n.id,{name:u}),onMove:u=>void s.moveTask(n.id,u),onArchive:u=>void s.patchTask(n.id,{active:u}),onDelete:()=>{s.removeTask(n.id),_("המשימה נמחקה")}},n.id)),e.jsx(K,{label:"הוסף משימה קבועה",recurring:!0,onAdd:n=>void s.addTask(n,!0)}),e.jsx("div",{className:"hint",children:'משימה קבועה מופיעה בכל יום מאליה. משימה חד-פעמית נוספת מלשונית "היום" ומופיעה רק בו.'})]}),h.length>0&&e.jsxs("div",{className:"sec",children:[e.jsx("h2",{children:"ארכיון"}),e.jsx("div",{className:"hint",style:{marginTop:0},children:"לא מופיעות ביום, וההיסטוריה שלהן נשמרת ברשת של השבוע."}),h.map(n=>e.jsx(D,{task:n,index:0,count:1,canDelete:d(n),onRename:c=>void s.patchTask(n.id,{name:c}),onMove:()=>{},onArchive:c=>void s.patchTask(n.id,{active:c}),onDelete:()=>{s.removeTask(n.id),_("המשימה נמחקה")}},n.id))]})]})}function W({tasks:s,value:a,onChange:h}){return e.jsxs("div",{className:"chips filterchips",children:[e.jsx("button",{type:"button",className:"chip"+(a===null?" on":""),onClick:()=>h(null),children:"הכול · ממוצע"}),s.map(t=>e.jsx("button",{type:"button",className:"chip"+(a===t.id?" on":""),onClick:()=>h(t.id),children:t.name},t.id))]})}function Y({tracker:s,day:a,onClose:h}){const t=ie(s.tasks,s.entryMap,a),l=de(s.tasks,s.entryMap,a);return e.jsxs("div",{className:"sec daydetail",children:[e.jsxs("div",{className:"head",children:[e.jsx("h2",{children:N(a)}),e.jsx("button",{type:"button",onClick:h,children:"סגור"})]}),t.length===0?e.jsx("div",{className:"hint",style:{marginTop:0},children:"לא נרשם כלום ביום הזה."}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"breakdown",children:t.map(d=>e.jsxs("span",{className:"bd",style:k(d.score),children:[d.name," ",e.jsx("b",{children:d.score})]},d.name))}),e.jsxs("div",{className:"hint",children:["ממוצע היום: ",l]})]})]})}function je({tracker:s,taskId:a,onTask:h}){const t=g(),[l,d]=r.useState(()=>w(t)),[n,c]=r.useState(null),u=r.useMemo(()=>E(l),[l]),b=l===w(t);r.useEffect(()=>{const i=u[u.length-1];s.ensureRange(u[0],i>t?t:i)},[u,t,s.ensureRange]);const y=r.useMemo(()=>u.map(i=>L(s.tasks,s.entryMap,i,a)),[u,s.tasks,s.entryMap,a]),j=y.filter(i=>i!==null),o=I(j);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{c(null),d(C(l,-1))},children:"חודש קודם"}),e.jsxs("div",{className:"daylabel",children:[V(l,t),e.jsx("em",{children:X(l)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:b,onClick:()=>{c(null),d(C(l,1))},children:"חודש הבא"})]}),e.jsx(W,{tasks:s.activeTasks,value:a,onChange:h}),e.jsxs("div",{className:"monthgrid",children:[Z.map(i=>e.jsx("div",{className:"mg-head",children:i},i)),Array.from({length:ee(l)},(i,v)=>e.jsx("div",{className:"mg-blank"},"blank"+v)),u.map((i,v)=>{const x=y[v],m=i>t;return e.jsxs("button",{type:"button",disabled:m,className:"mg-cell"+(n===i?" sel":"")+(m?" off":"")+(i===t?" now":""),style:m?void 0:k(x),"aria-label":`${N(i)}, ${x===null?"אין נתון":"ממוצע "+x}`,onClick:()=>c(n===i?null:i),children:[e.jsx("i",{children:A(i)}),x!==null&&e.jsx("b",{children:x})]},i)})]}),e.jsx("div",{className:"gridfoot",children:j.length===0?"אין עדיין נתונים בחודש הזה.":e.jsxs(e.Fragment,{children:["ממוצע החודש ",e.jsx("b",{children:o})," · ",j.length," ימים מדורגים"]})}),n&&e.jsx(Y,{tracker:s,day:n,onClose:()=>c(null)})]})}function be({tracker:s,taskId:a,onTask:h}){const t=g(),[l,d]=r.useState(()=>M(t)),[n,c]=r.useState(null),u=r.useMemo(()=>se(l),[l]),b=l===M(t);r.useEffect(()=>{const i=f(T(l,1),-1);s.ensureRange(l,i>t?t:i)},[l,t,s.ensureRange]);const y=r.useMemo(()=>u.map(i=>({monthStart:i,days:E(i).map(v=>({day:v,score:L(s.tasks,s.entryMap,v,a)}))})),[u,s.tasks,s.entryMap,a]),j=y.flatMap(i=>i.days.map(v=>v.score)).filter(i=>i!==null),o=I(j);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{c(null),d(T(l,-1))},children:"שנה קודמת"}),e.jsxs("div",{className:"daylabel",children:[ne(l,t),e.jsx("em",{children:te(l)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:b,onClick:()=>{c(null),d(T(l,1))},children:"שנה הבאה"})]}),e.jsx(W,{tasks:s.activeTasks,value:a,onChange:h}),e.jsx("div",{className:"yeargrid",children:y.map(i=>e.jsxs(r.Fragment,{children:[e.jsx("div",{className:"yg-month",children:ae(i.monthStart)}),Array.from({length:31},(v,x)=>{const m=i.days[x];if(!m)return e.jsx("div",{className:"yg-blank"},x);const p=m.day>t;return e.jsx("button",{type:"button",disabled:p,className:"yg-cell"+(n===m.day?" sel":"")+(p?" off":"")+(m.day===t?" now":""),style:p?void 0:k(m.score),"aria-label":`${N(m.day)}, ${m.score===null?"אין נתון":"ממוצע "+m.score}`,onClick:()=>c(n===m.day?null:m.day)},m.day)})]},i.monthStart))}),e.jsx("div",{className:"gridfoot",children:j.length===0?"אין עדיין נתונים בשנה הזאת.":e.jsxs(e.Fragment,{children:["ממוצע השנה ",e.jsx("b",{children:o})," · ",j.length," ימים מדורגים"]})}),n&&e.jsx(Y,{tracker:s,day:n,onClose:()=>c(null)})]})}const ve=[{id:"today",label:"היום"},{id:"week",label:"שבוע"},{id:"month",label:"חודש"},{id:"year",label:"שנה"},{id:"tasks",label:"משימות"}];function ge({tracker:s}){const[a,h]=r.useState("today"),[t,l]=r.useState(null),d=t!==null&&s.activeTasks.some(n=>n.id===t)?t:null;return s.needsMigration?e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"screen",children:"מעקב"}),e.jsx("div",{className:"saved"}),e.jsx(re,{})]}):s.loading&&s.tasks.length===0?e.jsx($,{label:"טוען את המעקב…"}):e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"screen",children:"מעקב"}),e.jsx("div",{className:"saved"}),s.error&&e.jsx(B,{message:s.error,onRetry:()=>void s.reload(),onDismiss:s.dismissError}),e.jsx("div",{className:"tabs",children:ve.map(n=>e.jsx("button",{type:"button",className:a===n.id?"on":"",onClick:()=>h(n.id),children:n.label},n.id))}),a==="today"&&e.jsx(he,{tracker:s}),a==="week"&&e.jsx(me,{tracker:s}),a==="month"&&e.jsx(je,{tracker:s,taskId:d,onTask:l}),a==="year"&&e.jsx(be,{tracker:s,taskId:d,onTask:l}),a==="tasks"&&e.jsx(xe,{tracker:s})]})}export{ge as TrackScreen};
