import{r as u,j as e,L as K,E as z,t as k,a as H,s as E,b as p,l as f,c as S,w as Q,d as G,e as J,f as P,g as U,h as V,i as X,k as A,m as w,n as L,o as I,p as O,q as R,u as Z,v as ee,D as se,x as ne,y as C,z as te,A as M,B as ae,C as le,F as ie,G as W,H as oe,I as de,J as ce,K as re,M as ue,W as he}from"./index-jYueSL8R.js";const D=`-- =====================================================================
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
`;function me(s){const l=new Date(s);return l.setHours(24,0,0,0),l.getTime()}const _=()=>oe(W,me);function T(s,l,i){const t=u.useRef(s);u.useEffect(()=>{const a=t.current;a!==s&&(t.current=s,i(d=>d===l(a)?l(s):d))},[s,i])}const xe=s=>s;function N(s){if(s===null)return;const l=de(s);return{background:l.bg,borderColor:l.bg,color:l.fg}}function Y({value:s,onPick:l}){return e.jsx("div",{className:"scale",children:Array.from({length:11},(i,t)=>e.jsx("button",{type:"button",className:"sc"+(s===t?" on":""),style:N(t),"aria-pressed":s===t,"aria-label":t===0?"לא עשיתי":`ציון ${t}`,onClick:()=>l(t),children:t},t))})}function je(){return e.jsxs("div",{className:"sec",children:[e.jsxs("div",{className:"errbox",style:{borderColor:"var(--brass)"},children:[e.jsx("b",{children:"חסרות הטבלאות של המעקב"}),"המעקב שומר את המשימות והציונים במסד הנתונים שלך, וצריך ליצור שם שתי טבלאות פעם אחת. זה לוקח חצי דקה ולא נוגע בכרטיסיות."]}),e.jsxs("ol",{style:{paddingInlineStart:20,lineHeight:1.9,fontSize:15},children:[e.jsx("li",{children:"להיכנס ל-Supabase ← הפרויקט שלך"}),e.jsx("li",{children:"בתפריט הצדדי: SQL Editor ← New query"}),e.jsx("li",{children:"להדביק את מה שלמטה וללחוץ Run"}),e.jsx("li",{children:"לחזור לכאן ולמשוך את המסך למטה כדי לרענן"})]}),e.jsx("button",{className:"cta",onClick:()=>{var s;(s=navigator.clipboard)==null||s.writeText(D).then(()=>k("הקוד הועתק")).catch(()=>k("ההעתקה נחסמה — אפשר לסמן ולהעתיק ידנית"))},children:"העתק את הקוד"}),e.jsx("pre",{className:"sqlbox",children:D})]})}function be({note:s,onSave:l}){const[i,t]=u.useState(s.length>0),[a,d]=u.useState(s);return i?e.jsx("input",{className:"noteinput",value:a,placeholder:"הערה קצרה",onChange:n=>d(n.target.value),onBlur:()=>{a.trim()!==s.trim()&&l(a)},onKeyDown:n=>{n.key==="Enter"&&n.currentTarget.blur()}}):e.jsx("button",{type:"button",className:"notelink",onClick:()=>t(!0),children:"הוסף הערה"})}function $({label:s,recurring:l,onAdd:i}){const[t,a]=u.useState("");function d(){const n=t.trim();n&&(i(n),a(""))}return e.jsxs("div",{className:"addtask",children:[e.jsx("input",{value:t,placeholder:l?"שם המשימה":"משימה חד-פעמית להיום",onChange:n=>a(n.target.value),onKeyDown:n=>{n.key==="Enter"&&d()}}),e.jsx("button",{type:"button",className:"ghost",onClick:d,disabled:!t.trim(),children:s})]})}function ve({tracker:s}){const l=_(),[i,t]=u.useState(l);T(l,xe,t);const a=i===l;u.useEffect(()=>{s.ensureRange(i,i)},[i,s.ensureRange]);const d=u.useMemo(()=>H(s.tasks,i,s.entryMap),[s.tasks,s.entryMap,i]),n=d.filter(c=>E(s.entryMap,c.id,i)!==null).length;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>t(p(i,-1)),children:"יום קודם"}),e.jsxs("div",{className:"daylabel",children:[a?"היום":f(i),e.jsxs("em",{children:[n," מתוך ",d.length]})]}),e.jsx("button",{type:"button",className:"ghost",disabled:a,onClick:()=>t(p(i,1)),children:"יום הבא"})]}),d.length===0&&e.jsxs("div",{className:"empty",children:[e.jsx("p",{children:"אין משימות ליום הזה."}),e.jsx("p",{children:'אפשר להוסיף משימות קבועות בלשונית "משימות".'})]}),d.map(c=>{const h=s.entryMap.get(c.id+"|"+i)??null,v=(h==null?void 0:h.score)??null;return e.jsxs("div",{className:"taskcard",children:[e.jsxs("div",{className:"taskcard-head",children:[e.jsxs("span",{className:"taskcard-name",children:[c.name,!c.is_recurring&&e.jsx("em",{children:" · חד-פעמית"})]}),v!==null&&e.jsx("button",{type:"button",className:"taskcard-clear",onClick:()=>void s.clearRating(c.id,i),children:"נקה"})]}),e.jsx(Y,{value:v,onPick:x=>void s.rate(c.id,i,x)}),v!==null&&e.jsx(be,{note:(h==null?void 0:h.note)??"",onSave:x=>void s.setNote(c.id,i,x)},c.id+i)]},c.id)}),a&&e.jsx($,{label:"הוסף",recurring:!1,onAdd:c=>void s.addTask(c,!1)})]})}function ge({tracker:s}){const l=_(),[i,t]=u.useState(()=>S(l));T(l,S,t);const[a,d]=u.useState(null),n=u.useMemo(()=>Q(i),[i]),c=i===S(l);u.useEffect(()=>{s.ensureRange(n[0],n[6]>l?l:n[6])},[n,l,s.ensureRange]);const h=u.useMemo(()=>G(J(s.tasks,n,s.entryMap),n,s.entryMap),[s.tasks,s.entryMap,n]),v=u.useMemo(()=>P(h,n.length),[h,n.length]),x=a?s.tasks.find(r=>r.id===a.taskId)??null:null,b=a?E(s.entryMap,a.taskId,a.day):null;return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{d(null),t(p(i,-7))},children:"שבוע קודם"}),e.jsxs("div",{className:"daylabel",children:[U(i,l),e.jsx("em",{children:V(i)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:c,onClick:()=>{d(null),t(p(i,7))},children:"שבוע הבא"})]}),h.length===0?e.jsx("div",{className:"empty",children:e.jsx("p",{children:"אין משימות בשבוע הזה."})}):e.jsx("div",{className:"weekscroll",children:e.jsxs("div",{className:"weekgrid",children:[e.jsx("div",{className:"wg-corner"}),n.map(r=>e.jsxs("div",{className:"wg-head"+(r===l?" now":""),children:[X(r),e.jsx("em",{children:A(r)})]},r)),e.jsx("div",{className:"wg-head avg",children:"ממוצע"}),h.map(r=>e.jsxs(u.Fragment,{children:[e.jsx("div",{className:"wg-name",title:r.task.name,children:r.task.name}),r.scores.map((o,g)=>{const j=n[g],m=j>l||!r.belongs[g],y=(a==null?void 0:a.taskId)===r.task.id&&(a==null?void 0:a.day)===j;return e.jsx("button",{type:"button",disabled:m,className:"wg-cell"+(y?" sel":"")+(m?" off":""),style:m?void 0:N(o),"aria-label":`${r.task.name}, ${f(j)}, ${o===null?"אין ציון":"ציון "+o}`,onClick:()=>d(y?null:{taskId:r.task.id,day:j}),children:o===null?"":o},j)}),e.jsx("div",{className:"wg-avg",children:r.avg===null?"·":r.avg})]},r.task.id)),e.jsx("div",{className:"wg-name foot",children:"ממוצע יומי"}),v.map((r,o)=>e.jsx("div",{className:"wg-avg foot",children:r===null?"·":r},n[o])),e.jsx("div",{className:"wg-avg foot"})]})}),a&&x&&e.jsxs("div",{className:"sec editcell",children:[e.jsxs("div",{className:"head",children:[e.jsxs("h2",{children:[x.name," · ",f(a.day)]}),e.jsx("button",{type:"button",onClick:()=>d(null),children:"סגור"})]}),e.jsx(Y,{value:b,onPick:r=>void s.rate(a.taskId,a.day,r)}),b!==null&&e.jsx("button",{type:"button",className:"notelink",onClick:()=>{s.clearRating(a.taskId,a.day)},children:"נקה את הציון"})]})]})}function F({task:s,index:l,count:i,canDelete:t,onRename:a,onMove:d,onArchive:n,onDelete:c}){const[h,v]=u.useState(!1),[x,b]=u.useState(s.name);return e.jsxs("div",{className:"trow",children:[h?e.jsx("input",{className:"trow-input",value:x,onChange:r=>b(r.target.value),onKeyDown:r=>{r.key==="Enter"&&r.currentTarget.blur()},onBlur:()=>{const r=x.trim();r&&r!==s.name?a(r):b(s.name),v(!1)}}):e.jsxs("button",{type:"button",className:"trow-name",onClick:()=>v(!0),children:[s.name,!s.is_recurring&&e.jsx("em",{children:" · חד-פעמית"}),!s.active&&e.jsx("em",{children:" · בארכיון"})]}),e.jsxs("div",{className:"trow-actions",children:[s.active&&e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",disabled:l===0,"aria-label":"הזז למעלה",onClick:()=>d(-1),children:"↑"}),e.jsx("button",{type:"button",disabled:l===i-1,"aria-label":"הזז למטה",onClick:()=>d(1),children:"↓"})]}),e.jsx("button",{type:"button",onClick:()=>n(!s.active),children:s.active?"לארכיון":"החזר"}),t&&e.jsx("button",{type:"button",className:"danger",onClick:c,children:"מחק"})]})]})}function ye({tracker:s}){const l=s.tasks.filter(n=>n.active),i=s.tasks.filter(n=>!n.active),t=u.useMemo(()=>{const n=new Map;for(const c of s.entries)n.set(c.task_id,(n.get(c.task_id)??0)+1);return n},[s.entries]),a=p(W(),-he);function d(n){return(t.get(n.id)??0)===0&&ue(n)>=a}return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"sec",children:[e.jsx("h2",{children:"משימות פעילות"}),l.length===0&&e.jsx("div",{className:"hint",children:"אין עדיין משימות. הוסף אחת למטה."}),l.map((n,c)=>e.jsx(F,{task:n,index:c,count:l.length,canDelete:d(n),onRename:h=>void s.patchTask(n.id,{name:h}),onMove:h=>void s.moveTask(n.id,h),onArchive:h=>void s.patchTask(n.id,{active:h}),onDelete:()=>{s.removeTask(n.id),k("המשימה נמחקה")}},n.id)),e.jsx($,{label:"הוסף משימה קבועה",recurring:!0,onAdd:n=>void s.addTask(n,!0)}),e.jsx("div",{className:"hint",children:'משימה קבועה מופיעה בכל יום מאליה. משימה חד-פעמית נוספת מלשונית "היום" ומופיעה רק בו.'})]}),i.length>0&&e.jsxs("div",{className:"sec",children:[e.jsx("h2",{children:"ארכיון"}),e.jsx("div",{className:"hint",style:{marginTop:0},children:"לא מופיעות ביום, וההיסטוריה שלהן נשמרת ברשת של השבוע."}),i.map(n=>e.jsx(F,{task:n,index:0,count:1,canDelete:d(n),onRename:c=>void s.patchTask(n.id,{name:c}),onMove:()=>{},onArchive:c=>void s.patchTask(n.id,{active:c}),onDelete:()=>{s.removeTask(n.id),k("המשימה נמחקה")}},n.id))]})]})}function B({tasks:s,value:l,onChange:i}){return e.jsxs("div",{className:"chips filterchips",children:[e.jsx("button",{type:"button",className:"chip"+(l===null?" on":""),onClick:()=>i(null),children:"הכול · ממוצע"}),s.map(t=>e.jsx("button",{type:"button",className:"chip"+(l===t.id?" on":""),onClick:()=>i(t.id),children:t.name},t.id))]})}function q({tracker:s,day:l,onClose:i}){const t=ce(s.tasks,s.entryMap,l),a=re(s.tasks,s.entryMap,l);return e.jsxs("div",{className:"sec daydetail",children:[e.jsxs("div",{className:"head",children:[e.jsx("h2",{children:f(l)}),e.jsx("button",{type:"button",onClick:i,children:"סגור"})]}),t.length===0?e.jsx("div",{className:"hint",style:{marginTop:0},children:"לא נרשם כלום ביום הזה."}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"breakdown",children:t.map(d=>e.jsxs("span",{className:"bd",style:N(d.score),children:[d.name," ",e.jsx("b",{children:d.score})]},d.name))}),e.jsxs("div",{className:"hint",children:["ממוצע היום: ",a]})]})]})}function pe({tracker:s,taskId:l,onTask:i}){const t=_(),[a,d]=u.useState(()=>w(t));T(t,w,d);const[n,c]=u.useState(null),h=u.useMemo(()=>L(a),[a]),v=a===w(t);u.useEffect(()=>{const o=h[h.length-1];s.ensureRange(h[0],o>t?t:o)},[h,t,s.ensureRange]);const x=u.useMemo(()=>h.map(o=>I(s.tasks,s.entryMap,o,l)),[h,s.tasks,s.entryMap,l]),b=x.filter(o=>o!==null),r=O(b);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{c(null),d(R(a,-1))},children:"חודש קודם"}),e.jsxs("div",{className:"daylabel",children:[Z(a,t),e.jsx("em",{children:ee(a)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:v,onClick:()=>{c(null),d(R(a,1))},children:"חודש הבא"})]}),e.jsx(B,{tasks:s.activeTasks,value:l,onChange:i}),e.jsxs("div",{className:"monthgrid",children:[se.map(o=>e.jsx("div",{className:"mg-head",children:o},o)),Array.from({length:ne(a)},(o,g)=>e.jsx("div",{className:"mg-blank"},"blank"+g)),h.map((o,g)=>{const j=x[g],m=o>t;return e.jsxs("button",{type:"button",disabled:m,className:"mg-cell"+(n===o?" sel":"")+(m?" off":"")+(o===t?" now":""),style:m?void 0:N(j),"aria-label":`${f(o)}, ${j===null?"אין נתון":"ממוצע "+j}`,onClick:()=>c(n===o?null:o),children:[e.jsx("i",{children:A(o)}),j!==null&&e.jsx("b",{children:j})]},o)})]}),e.jsx("div",{className:"gridfoot",children:b.length===0?"אין עדיין נתונים בחודש הזה.":e.jsxs(e.Fragment,{children:["ממוצע החודש ",e.jsx("b",{children:r})," · ",b.length," ימים מדורגים"]})}),n&&e.jsx(q,{tracker:s,day:n,onClose:()=>c(null)})]})}function fe({tracker:s,taskId:l,onTask:i}){const t=_(),[a,d]=u.useState(()=>C(t));T(t,C,d);const[n,c]=u.useState(null),h=u.useMemo(()=>te(a),[a]),v=a===C(t);u.useEffect(()=>{const o=p(M(a,1),-1);s.ensureRange(a,o>t?t:o)},[a,t,s.ensureRange]);const x=u.useMemo(()=>h.map(o=>({monthStart:o,days:L(o).map(g=>({day:g,score:I(s.tasks,s.entryMap,g,l)}))})),[h,s.tasks,s.entryMap,l]),b=x.flatMap(o=>o.days.map(g=>g.score)).filter(o=>o!==null),r=O(b);return e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"daynav",children:[e.jsx("button",{type:"button",className:"ghost",onClick:()=>{c(null),d(M(a,-1))},children:"שנה קודמת"}),e.jsxs("div",{className:"daylabel",children:[ae(a,t),e.jsx("em",{children:le(a)})]}),e.jsx("button",{type:"button",className:"ghost",disabled:v,onClick:()=>{c(null),d(M(a,1))},children:"שנה הבאה"})]}),e.jsx(B,{tasks:s.activeTasks,value:l,onChange:i}),e.jsx("div",{className:"yeargrid",children:x.map(o=>e.jsxs(u.Fragment,{children:[e.jsx("div",{className:"yg-month",children:ie(o.monthStart)}),Array.from({length:31},(g,j)=>{const m=o.days[j];if(!m)return e.jsx("div",{className:"yg-blank"},j);const y=m.day>t;return e.jsx("button",{type:"button",disabled:y,className:"yg-cell"+(n===m.day?" sel":"")+(y?" off":"")+(m.day===t?" now":""),style:y?void 0:N(m.score),"aria-label":`${f(m.day)}, ${m.score===null?"אין נתון":"ממוצע "+m.score}`,onClick:()=>c(n===m.day?null:m.day)},m.day)})]},o.monthStart))}),e.jsx("div",{className:"gridfoot",children:b.length===0?"אין עדיין נתונים בשנה הזאת.":e.jsxs(e.Fragment,{children:["ממוצע השנה ",e.jsx("b",{children:r})," · ",b.length," ימים מדורגים"]})}),n&&e.jsx(q,{tracker:s,day:n,onClose:()=>c(null)})]})}const Ne=[{id:"today",label:"היום"},{id:"week",label:"שבוע"},{id:"month",label:"חודש"},{id:"year",label:"שנה"},{id:"tasks",label:"משימות"}];function _e({tracker:s}){const[l,i]=u.useState("today"),[t,a]=u.useState(null),d=t!==null&&s.activeTasks.some(n=>n.id===t)?t:null;return s.needsMigration?e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"screen",children:"מעקב"}),e.jsx("div",{className:"saved"}),e.jsx(je,{})]}):s.loading&&s.tasks.length===0?e.jsx(K,{label:"טוען את המעקב…"}):e.jsxs(e.Fragment,{children:[e.jsx("h1",{className:"screen",children:"מעקב"}),e.jsx("div",{className:"saved"}),s.error&&e.jsx(z,{message:s.error,onRetry:()=>void s.reload(),onDismiss:s.dismissError}),e.jsx("div",{className:"tabs",children:Ne.map(n=>e.jsx("button",{type:"button",className:l===n.id?"on":"",onClick:()=>i(n.id),children:n.label},n.id))}),l==="today"&&e.jsx(ve,{tracker:s}),l==="week"&&e.jsx(ge,{tracker:s}),l==="month"&&e.jsx(pe,{tracker:s,taskId:d,onTask:a}),l==="year"&&e.jsx(fe,{tracker:s,taskId:d,onTask:a}),l==="tasks"&&e.jsx(ye,{tracker:s})]})}export{_e as TrackScreen};
