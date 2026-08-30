/* Planner — a minimal personal calendar & school planner.
   No dependencies, no build step, no accounts. Data lives in localStorage. */
(() => {
'use strict';

/* ---------------- storage ---------------- */

const KEY = 'planner.v1';
const KINDS = ['classes', 'homework', 'notes', 'projects', 'events', 'schedule', 'overrides', 'focus',
  'grades', 'links', 'moods', 'photos', 'recurs'];

/* `deleted` holds tombstones (id -> time) so a delete on one device also
   removes the item on the others instead of being re-added by a merge. */
const emptyDB = () => ({ classes: [], homework: [], notes: [], projects: [], events: [],
  schedule: [], overrides: [], focus: [],
  grades: [], links: [], moods: [], photos: [], recurs: [], deleted: {} });

let saveTimer;              // declared before load() runs, since persist() below needs it
let migratedOnLoad = false;
const db = load();
// load() only builds the object in memory; without this the backfilled
// completedAt below is lost the moment the tab closes (nothing else had a
// reason to save yet), and every relaunch would silently hand out a fresh
// 2-day countdown forever instead of the one-time grace period intended.
if (migratedOnLoad) persist();

function load() {
  const base = emptyDB();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      for (const k of KINDS) if (Array.isArray(raw[k])) base[k] = raw[k];
      if (raw.deleted && typeof raw.deleted === 'object') base.deleted = raw.deleted;
    }
  } catch {}
  // Homework completed before this feature existed has no completedAt, so it
  // would never be swept. Give it a one-time 2-day countdown starting now,
  // rather than judging it by an old edit time and deleting it on the spot.
  for (const h of base.homework) if (h.done && !h.completedAt) { h.completedAt = Date.now(); migratedOnLoad = true; }
  return base;
}

/** Write to localStorage only — used when applying data that came from sync. */
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }, 60);
}

/** A local edit: store it and send it to the other devices. */
function save() {
  persist();
  markDirty();
  scheduleSync();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const stamp = () => Date.now();

/** Mark an item as changed now, so the newest edit wins when devices merge. */
const touch = item => { item.updatedAt = stamp(); return item; };
const tombstone = id => { db.deleted[id] = stamp(); };

const COMPLETED_TTL = 2 * 86400000;   // finished homework clears itself after 2 days

/** Quietly remove homework that's been checked off for more than two days.
    Goes through the normal tombstone path so the removal syncs like any
    other delete, instead of quietly reappearing on another device. */
function sweepCompleted() {
  const cutoff = stamp() - COMPLETED_TTL;
  const stale = db.homework.filter(h => h.done && h.completedAt && h.completedAt <= cutoff);
  if (!stale.length) return false;
  for (const h of stale) tombstone(h.id);
  const staleIds = new Set(stale.map(h => h.id));
  db.homework = db.homework.filter(h => !staleIds.has(h.id));
  return true;
}

/* ---------------- preferences ----------------
   Small, per-device choices. Not synced: a phone and a laptop can reasonably
   disagree about density or week start, and none of it is data. */

const PREFS_KEY = 'planner.prefs.v1';
const PREF_DEFAULTS = {
  school: 'delnorte',    // which school's bell schedule to follow
  style: 'notebook',     // notebook | default \u2014 notebook is the default
  pageTurn: 0,           // opt-in page-turn transition (notebook only)
  full: 0,               // opt-in: the whole page is one sheet, no cards
  rot: {},               // school -> { date, i }: what rotation day that date was
  theme: 'light',        // light | dark | auto (auto follows the evening)
  mon: 0,                // week starts Monday
  t24: 0,                // 24-hour clock
  due: 1,                // new homework defaults this many days out
  sleep: 8.5,            // hours the sleep block plans for
  compact: 0,            // tighter spacing everywhere
  motion: 1,             // 0 turns decorative animation off
  confirm: 1,            // ask before deleting classes and pages
  tonightHide: 0         // hide "Do tonight" until school is out
};
let prefs = { ...PREF_DEFAULTS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch {}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

const confirmMaybe = msg => !prefs.confirm || confirm(msg);

/* ---------------- local stats ----------------
   What some blocks learn from: how long each class's homework really takes,
   on-time vs late per class, which days you finished everything, focus-session
   days, and which add types you actually use. Per-device on purpose. */

const STATS_KEY = 'planner.stats.v1';
let stats = { perClass: {}, days: {}, focusDays: {}, usage: {} };
try { Object.assign(stats, JSON.parse(localStorage.getItem(STATS_KEY)) || {}); } catch {}

function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
}

/** Called when homework gets checked off: feed the per-class averages. */
function recordDone(h) {
  const pc = stats.perClass[h.classId] || (stats.perClass[h.classId] = { n: 0, ms: 0, onTime: 0, late: 0 });
  pc.n++;
  pc.ms += Math.max(0, Math.min(7 * 86400000, stamp() - (h.createdAt || h.updatedAt)));
  h.due >= today() ? pc.onTime++ : pc.late++;
  stats.days[today()] = (stats.days[today()] | 0) + 1;
  saveStats();
}

/** A class's typical minutes per assignment, or a sane default. */
function classMinutes(classId) {
  const pc = stats.perClass[classId];
  if (!pc || !pc.n) return 25;
  return Math.min(180, Math.max(5, Math.round(pc.ms / pc.n / 60000)));
}

/* ---------------- dates (local, no timezone math) ---------------- */

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const shift = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dateLabel = s =>
  parseISO(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Today" · "Tomorrow" · "Friday" · "3 days late" · "Fri, Aug 14" */
function relLabel(s) {
  const n = daysBetween(today(), s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days late`;
  if (n <= 6) return parseISO(s).toLocaleDateString(undefined, { weekday: 'long' });
  return dateLabel(s);
}

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLORS = [
  '#2f6fed', '#4c8dff', '#12a594', '#3aa8c1', '#2fa86b', '#6fa83c',
  '#d9a01e', '#e8863c', '#e2694b', '#d94f5c', '#e0559a', '#c2569e',
  '#a25ddc', '#7a5af8', '#5b6bd6', '#8a6f5a', '#d3d7dc', '#6b7280', '#374151'
];
const PROJECT_COLOR = '#7a5af8';
const EVENT_COLOR = '#e0a13a';
const STATUSES = [
  { id: 'todo', label: 'Not started', pct: 0 },
  { id: 'doing', label: 'In progress', pct: 50 },
  { id: 'done', label: 'Done', pct: 100 }
];
const LISTS = { homework: 'homework', note: 'notes', project: 'projects', event: 'events' };

const byId = (list, id) => list.find(x => x.id === id);
const className = id => byId(db.classes, id)?.name || 'No class';
const classColor = id => byId(db.classes, id)?.color || '#7a828e';
const statusOf = p => STATUSES.find(s => s.id === p.status) || STATUSES[0];

const CHEV = '<span class="chev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></span>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TICK_ACCENT = '<span class="tick-on"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
const PLUS = '<svg class="plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/* ---------------- app state ---------------- */

const state = {
  tab: 'home',
  edit: false,              // block edit mode
  classId: null,          // set while viewing one class
  selected: today(),
  month: new Date().getMonth(),
  year: new Date().getFullYear()
};

/** Dated items on one day, in display order. */
function itemsOn(date) {
  const out = [];
  for (const h of db.homework) if (h.due === date) out.push({ kind: 'homework', item: h, color: classColor(h.classId) });
  for (const p of db.projects) if (p.due === date) out.push({ kind: 'project', item: p, color: PROJECT_COLOR });
  for (const e of db.events) if (e.date === date) out.push({ kind: 'event', item: e, color: e.classId ? classColor(e.classId) : EVENT_COLOR });
  for (const n of db.notes) if (n.date === date) out.push({ kind: 'note', item: n, color: classColor(n.classId) });
  return out;
}


/* ---------------- school day (Pacific time) ----------------
   The bell schedule is San Diego local time, so the clock here is pinned to
   America/Los_Angeles no matter where the device thinks it is. Intl handles
   the DST switch for us. */

/* Falls back to an empty table: if bell.js ever fails to load, the app still
   runs and simply shows no school day, rather than dying on first paint. */
const SCHOOLS = window.SCHOOLS || {};
const SCHOOL_ORDER = (window.SCHOOL_ORDER || []).filter(k => SCHOOLS[k]);
const NO_SCHOOL = { name: '', schedules: {}, byDate: {}, byWeekday: [], pickable: [], periods: [] };

/* The school you picked drives every clock in the app. Anyone who used this
   before schools existed keeps Del Norte, which is what they had. */
let BELL = SCHOOLS[prefs.school] || SCHOOLS.delnorte || window.BELL || NO_SCHOOL;

function setSchool(key) {
  if (!SCHOOLS[key]) return;
  prefs.school = key;
  savePrefs();
  BELL = SCHOOLS[key];
  render();
}

/** The period slots this school actually runs. */
const periodList = () => BELL.periods || [1, 2, 3, 4, 5];

/* ---------------- block rotation ----------------
   Some schools run the same block at the same time every day but put a
   different class in it — Oak Valley's first block is period 1 one day and
   period 2 the next. A row's period is then an array, one entry per rotation
   day, and this works out which entry today wants.

   Which calendar day is "odd" is published as an image and shifts around
   holidays, so the app does not guess: you tell it once, it anchors on that
   date, and from then on it counts school days forward. */

const rotNames = () => BELL.rotation?.names || null;

/** School days from one date to another, sign included. */
function schoolDaysBetween(from, to) {
  if (from === to) return 0;
  const back = to < from;
  const [a, b] = back ? [to, from] : [from, to];
  let n = 0;
  for (let d = a, i = 0; d !== b && i < 400; d = shift(d, 1), i++) {
    if (planForDate(d)) n++;
  }
  return back ? -n : n;
}

/** Which rotation day a date is, 0-based. 0 until you say otherwise. */
function rotIndex(date) {
  const names = rotNames();
  if (!names) return 0;
  const a = prefs.rot?.[prefs.school];
  if (!a) return 0;
  const n = names.length;
  return (((a.i + schoolDaysBetween(a.date, date || ptNow().date)) % n) + n) % n;
}

/** Anchor the rotation: "today is this one", and every later day follows. */
function setRot(i) {
  prefs.rot = { ...(prefs.rot || {}), [prefs.school]: { date: ptNow().date, i } };
  savePrefs();
  render();
}

/** A row's period for a given day: plain number, or the rotation's pick. */
const rowPeriod = (row, date) =>
  Array.isArray(row[3]) ? row[3][rotIndex(date)] : row[3];
const PT = 'America/Los_Angeles';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ptFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PT, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

/** Current San Diego date, weekday and seconds-since-midnight. */
function ptNow() {
  const p = {};
  for (const part of ptFormat.formatToParts(new Date())) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: DAY_NAMES.indexOf(p.weekday),
    secs: +p.hour * 3600 + +p.minute * 60 + +p.second
  };
}

const hhmmToSecs = t => { const [h, m] = t.split(':').map(Number); return h * 3600 + m * 60; };

/** "3:35 PM" from "15:35" */
function clockLabel(t) {
  const [h, m] = t.split(':').map(Number);
  if (prefs.t24) return `${h}:${pad(m)}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ampm}`;
}

/** Which bell schedule a given day uses: your override, then the calendar, then the weekday. */
function planFor(date, weekday) {
  const override = byId(db.overrides, date);
  const key = (override && BELL.schedules[override.key] && override.key)
    || BELL.byDate[date]
    || BELL.byWeekday[weekday];
  if (!key) return null;
  const s = BELL.schedules[key];
  return { key, name: s.name, custom: !!override, rows: s.rows, date };
}

/** Where we are in the day: in a block, between blocks, or outside school hours. */
function dayPosition(plan, secs) {
  if (!plan) return { state: 'none' };
  const blocks = plan.rows.map(r => ({ label: r[0], start: r[1], end: r[2], period: rowPeriod(r, plan.date) }));
  const first = blocks[0], last = blocks[blocks.length - 1];

  if (secs < hhmmToSecs(first.start)) {
    return { state: 'before', next: first, until: hhmmToSecs(first.start) - secs, blocks };
  }
  if (secs >= hhmmToSecs(last.end)) return { state: 'after', blocks };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], start = hhmmToSecs(b.start), end = hhmmToSecs(b.end);
    if (secs >= start && secs < end) {
      return {
        state: 'in', block: b, next: blocks[i + 1], blocks,
        left: end - secs, elapsed: secs - start, total: end - start
      };
    }
    const nxt = blocks[i + 1];
    if (nxt && secs >= end && secs < hhmmToSecs(nxt.start)) {
      return { state: 'passing', next: nxt, blocks, until: hhmmToSecs(nxt.start) - secs };
    }
  }
  return { state: 'after', blocks };
}

/** 48:12 under an hour, 1:22:04 over it. */
function countdown(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The class you put in a period slot, if any. */
function periodClass(period) {
  if (!period) return null;
  const slot = byId(db.schedule, `p${period}`);
  return slot ? byId(db.classes, slot.classId) : null;
}

function blockTitle(b) {
  const c = periodClass(b.period);
  return c ? c.name : b.label;
}

/** "Rm 402 · Mr. Diaz" for a period, when they've been filled in. */
function blockMeta(period) {
  const slot = period && byId(db.schedule, `p${period}`);
  if (!slot) return '';
  return [slot.room && `Rm ${slot.room}`, slot.teacher].filter(Boolean).join(' · ');
}

/* ---------------- the block library ----------------
   Every block is one function returning an HTML string. The per-instance
   scraps some blocks need (a flashcard’s position, a break timer) live in
   blkState, keyed by block id — ephemeral on purpose. */

const blkState = {};

/** "Next: Chem · in 6 min · Rm 402" — or the countdown to freedom. */
function nextUpLine(plan, pos) {
  if (!plan || pos.state === 'none' || pos.state === 'after') return 'No more classes today.';
  const b = pos.state === 'in' ? (pos.next || null) : pos.next;
  if (!b) return `Last one — out at ${clockLabel(pos.block.end)}.`;
  const mins = Math.max(1, Math.ceil((pos.state === 'in' ? pos.left : pos.until) / 60));
  const meta = blockMeta(b.period);
  return `Next: <b>${esc(blockTitle(b))}</b> · ${pos.state === 'in' ? 'in ' : ''}${mins} min${meta ? ` · ${esc(meta)}` : ''}`;
}

const nowCtx = () => {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  return { now, plan, pos: dayPosition(plan, now.secs) };
};

function nextupHTML() {
  const { plan, pos } = nowCtx();
  return `<div class="card gap"><div class="row nextup"><span class="row-main" data-nextup>${nextUpLine(plan, pos)}</span></div></div>`;
}

/* -- live: progress ring, time-until-free, lunch, where-next -- */

function ringInner(plan, pos) {
  if (!plan || pos.state === 'none' || pos.state === 'after') {
    return `<div class="ring-wrap"><span class="ring-idle">—</span><span class="ring-sub">no class</span></div>`;
  }
  const inB = pos.state === 'in';
  const pct = inB ? pos.elapsed / pos.total : 0;
  const cls = inB && pos.block.period ? periodClass(pos.block.period) : null;
  const col = cls ? cls.color : 'var(--accent)';
  const C = 2 * Math.PI * 44;
  return `<div class="ring-wrap">
    <svg class="ring" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="44" class="ring-bg"/>
      <circle cx="50" cy="50" r="44" class="ring-fg" style="stroke:${col};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct)}"/>
    </svg>
    <span class="ring-mid"><b>${inB ? countdown(pos.left) : countdown(pos.until)}</b>
      <i>${inB ? esc(blockTitle(pos.block)) : 'until ' + esc(blockTitle(pos.next))}</i></span>
  </div>`;
}

function freeInner(plan, pos) {
  if (!plan || pos.state === 'none') return `<span class="row-title">No school today.</span>`;
  if (pos.state === 'after') return `<span class="row-title">You’re free.</span><span class="row-sub">Done for the day.</span>`;
  const last = pos.blocks[pos.blocks.length - 1];
  const { now } = nowCtx();
  const secs = hhmmToSecs(last.end) - now.secs;
  const left = pos.blocks.filter(b => b.period && hhmmToSecs(b.end) > now.secs).length;
  return `<span class="row-title">${countdown(Math.max(0, secs))} until free</span>
    <span class="row-sub">${left} class${left === 1 ? '' : 'es'} left · out at ${clockLabel(last.end)}</span>`;
}

function lunchInner(plan, pos) {
  if (!plan) return '';
  const { now } = nowCtx();
  const row = plan.rows.find(r => /lunch/i.test(r[0]));
  if (!row) return '';
  const a = hhmmToSecs(row[1]), b = hhmmToSecs(row[2]);
  if (now.secs < a) return `<span class="row-title">Lunch at ${clockLabel(row[1])}</span><span class="row-sub">${countdown(a - now.secs)} to go</span>`;
  if (now.secs < b) return `<span class="row-title">${countdown(b - now.secs)} of lunch left</span><span class="row-sub">ends ${clockLabel(row[2])}</span>`;
  return `<span class="row-title">Lunch is over</span><span class="row-sub">was ${clockLabel(row[1])}–${clockLabel(row[2])}</span>`;
}

function whereInner(plan, pos) {
  if (!plan || pos.state === 'none' || pos.state === 'after') return `<span class="row-title">Nowhere — done.</span>`;
  const b = pos.state === 'in' ? pos.next : pos.next;
  if (!b) return `<span class="row-title">Last block — stay put.</span>`;
  const meta = blockMeta(b.period);
  return `<span class="row-title">${esc(blockTitle(b))}</span>
    <span class="row-sub">${meta ? esc(meta) + ' · ' : ''}${clockLabel(b.start)}</span>`;
}

const LIVE_INNER = { ring: ringInner, free: freeInner, lunch: lunchInner, where: whereInner };
const liveCard = (type, cls = '') => {
  const { plan, pos } = nowCtx();
  const inner = LIVE_INNER[type](plan, pos);
  if (!inner && !state.edit) return '';
  return `<div class="card gap ${cls}"><div class="row live-row"><span class="row-main" data-live="${type}">
    ${inner || '<span class="row-sub">Only shows on days it applies.</span>'}</span></div></div>`;
};

/* -- schedule extras -- */

function classcardHTML(cfg) {
  const c = byId(db.classes, cfg.classId) || db.classes[0];
  if (!c) return `<p class="empty">Make a class first — this card follows one.</p>`;
  const meet = nextMeeting(c.id);
  const hw = db.homework.filter(h => h.classId === c.id && !h.done).sort((a, b) => a.due < b.due ? -1 : 1);
  const notes = db.notes.filter(n => n.classId === c.id).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 2);
  const links = db.links.filter(l => l.classId === c.id).slice(0, 3);
  return `<section class="panel">
    <div class="panel-head"><h2><span class="swatch" style="background:${c.color}"></span> ${esc(c.name)}</h2>
      <button class="link-btn" data-act="class" data-id="${c.id}">Open</button></div>
    <p class="cc-meet">${meet ? `Next: <b>${meet.when}</b>${blockMeta(meet.row[3]) ? ' · ' + esc(blockMeta(meet.row[3])) : ''}` : 'Not placed in a period yet.'}</p>
    ${hw.slice(0, 3).map(h => rowHTML({ kind: 'homework', item: h }, { hideClass: true })).join('') ||
      '<p class="empty">Nothing owed. Lovely.</p>'}
    ${notes.map(n => `<p class="cc-note">“${esc(n.text.split('\n')[0]).slice(0, 60)}”</p>`).join('')}
    ${links.length ? `<p class="cc-links">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ')}</p>` : ''}
  </section>`;
}

function weekglanceHTML() {
  const days = nextSchoolDays(5);
  if (!days.length) return `<p class="empty">No school on the horizon.</p>`;
  const cols = days.map(({ date, plan }) => {
    const d = parseISO(date);
    const due = db.homework.filter(h => !h.done && h.due === date).length +
      db.projects.filter(pr => pr.status !== 'done' && pr.due === date).length;
    const odd = BELL.byDate[date];
    return `<button class="wg-col${odd ? ' is-odd' : ''}" data-act="pick" data-date="${date}">
      <i>${d.toLocaleDateString(undefined, { weekday: 'short' })}</i><b>${d.getDate()}</b>
      <em>${odd ? esc(plan.name.split(' ')[0]) : due ? due + ' due' : '·'}</em></button>`;
  }).join('');
  return `<div class="card gap"><div class="wg">${cols}</div></div>`;
}

function daydiffHTML() {
  const { now } = nowCtx();
  const o = byId(db.overrides, now.date);
  return `<div class="card gap"><button class="row" data-act="pick-plan">
    <span class="row-main"><span class="row-title">${o ? 'Today is different' : 'Is today different?'}</span>
      <span class="row-sub">${o ? esc(BELL.schedules[o.key]?.name || '') + ' · resets at midnight' : 'Swap today’s bell schedule — just for today'}</span>
    </span>${CHEV}</button></div>`;
}

function compareHTML(cfg) {
  const a = BELL.schedules[cfg.a] ? cfg.a : 'regular';
  const b = BELL.schedules[cfg.b] ? cfg.b : 'minimum';
  const A = BELL.schedules[a], B = BELL.schedules[b];
  if (!A || !B) return '';
  // align by block label, not by position — otherwise one inserted break
  // marks every later row "different" and the highlight means nothing
  const bMap = new Map(B.rows.map(r => [r[0], r]));
  const used = new Set();
  const cell = r => r ? `${esc(r[0])} <i>${clockLabel(r[1])}–${clockLabel(r[2])}</i>` : '—';
  let rows = A.rows.map(ra => {
    const rb = bMap.get(ra[0]);
    if (rb) used.add(ra[0]);
    const diff = !rb || ra[1] !== rb[1] || ra[2] !== rb[2];
    return `<div class="cmp-row${diff ? ' is-diff' : ''}"><span>${cell(ra)}</span><span>${cell(rb)}</span></div>`;
  }).join('');
  rows += B.rows.filter(r => !used.has(r[0])).map(rb =>
    `<div class="cmp-row is-diff"><span>—</span><span>${cell(rb)}</span></div>`).join('');
  return `<div class="card gap cmp"><div class="cmp-head"><span>${esc(A.name)}</span><span>${esc(B.name)}</span></div>${rows}</div>`;
}

function countdownHTML(cfg) {
  const date = cfg.date || shift(today(), 30);
  const n = daysBetween(today(), date);
  const num = n > 0 ? n : 0;
  return `<div class="hero cd">
    <div class="hero-label">${esc(cfg.label || 'Countdown')}</div>
    <div class="hero-time">${num}</div>
    <div class="hero-sub">${n < 0 ? 'already happened' : n === 0 ? 'is today' : `day${num === 1 ? '' : 's'} to go · ${dateLabel(date)}`}</div>
  </div>`;
}

/* -- homework & tasks -- */

const addhwHTML = () => `<button class="btn blk-btn" data-act="add" data-type="homework">Add homework</button>`;

function masterHTML() {
  const order = [...TYPES].sort((x, y) => (stats.usage[y.id] | 0) - (stats.usage[x.id] | 0));
  return `<div class="card gap"><div class="mstr">
    ${order.map((t, i) => `<button class="mstr-b${i === 0 ? ' is-main' : ''}" data-act="add" data-type="${t.id}">${PLUS}${t.label}</button>`).join('')}
  </div></div>`;
}

function duetodayHTML() {
  const t = today();
  const items = db.homework.filter(h => !h.done && h.due === t);
  if (!items.length) return `<div class="card gap reward"><b>Nothing due today.</b><span>Genuinely done. Go outside.</span></div>`;
  return `<section class="panel"><div class="panel-head"><h2>Due today</h2></div>
    ${items.map(h => rowHTML({ kind: 'homework', item: h })).join('')}</section>`;
}

function byclassHTML() {
  const period = new Map(db.schedule.map(x => [x.classId, x.period]));
  const ordered = [...db.classes].sort((a, b) => (period.get(a.id) || 9) - (period.get(b.id) || 9));
  const secs = ordered.map(c => {
    const hw = db.homework.filter(h => h.classId === c.id && !h.done).sort((a, b) => a.due < b.due ? -1 : 1);
    if (!hw.length) return '';
    return `<div class="section-head"><h2><span class="swatch" style="background:${c.color}"></span> ${esc(c.name)}</h2>
      <span class="count">${hw.length}</span></div>
    <div class="card">${hw.map(h => rowHTML({ kind: 'homework', item: h }, { hideClass: true })).join('')}</div>`;
  }).join('');
  return secs || `<p class="empty">Every class is clear.</p>`;
}

function quickdoneHTML() {
  const tm = shift(today(), 1);
  const items = db.homework.filter(h => !h.done && h.due <= tm).sort((a, b) => a.due < b.due ? -1 : 1);
  if (!items.length) return `<div class="card gap reward"><b>All clear.</b><span>Nothing to burn down.</span></div>`;
  return `<div class="card gap">${items.map(h => `
    <div class="row qd"><button class="check qd-c" data-act="toggle" data-id="${h.id}" aria-label="Mark done">${TICK}</button>
      <span class="row-main"><span class="row-title">${esc(h.title)}</span></span></div>`).join('')}</div>`;
}

function overdueHTML() {
  const t = today();
  const items = db.homework.filter(h => !h.done && h.due < t);
  if (!items.length) return state.edit ? `<p class="empty">Invisible until something is overdue — pure signal.</p>` : '';
  return `<section class="panel is-alert"><div class="panel-head"><h2>Overdue</h2><span class="count">${items.length}</span></div>
    ${items.map(h => rowHTML({ kind: 'homework', item: h })).join('')}</section>`;
}

function pickSpot(cfg) {
  const open = db.homework.filter(h => !h.done);
  return (cfg.pin && open.find(h => h.id === cfg.pin)) ||
    [...open].sort((a, b) => a.due < b.due ? -1 : 1)[0];
}

function spotlightHTML(cfg) {
  const h = pickSpot(cfg);
  if (!h) return `<p class="empty">Nothing to spotlight. Enjoy the dark stage.</p>`;
  return `<div class="hero spot">
    <div class="hero-label">${esc(className(h.classId))}</div>
    <div class="hero-title">${esc(h.title)}</div>
    <div class="hero-sub">${relLabel(h.due)}${h.details ? ' · ' + esc(h.details) : ''}</div>
    <div class="spot-acts"><button class="chip" data-act="toggle" data-id="${h.id}">Done</button>
      <button class="chip" data-act="open" data-kind="homework" data-id="${h.id}">Open</button></div>
  </div>`;
}

function subtasksHTML(cfg) {
  const h = pickSpot(cfg);
  if (!h) return `<p class="empty">No assignment to break into steps.</p>`;
  const steps = h.steps || [];
  return `<section class="panel"><div class="panel-head"><h2>Steps · ${esc(h.title)}</h2></div>
    ${steps.map((st, i) => `<div class="row qd"><button class="check${st.d ? '' : ''}${st.d ? ' ' : ''}" data-act="step-tog" data-h="${h.id}" data-i="${i}"
      aria-pressed="${!!st.d}" style="${st.d ? 'background:var(--accent);border-color:var(--accent);color:var(--on-accent)' : ''}">${TICK}</button>
      <span class="row-main"><span class="row-title${st.d ? ' is-muted' : ''}" style="${st.d ? 'text-decoration:line-through' : ''}">${esc(st.t)}</span></span></div>`).join('')}
    <div class="row"><input class="step-new" data-h="${h.id}" placeholder="Add a step…" enterkeyhint="done"></div>
  </section>`;
}

function meterHTML() {
  const days = nextSchoolDays(7);
  if (!days.length) return `<p class="empty">A quiet stretch — no school days ahead.</p>`;
  let peak = 1;
  const per = days.map(({ date }) => {
    const items = db.homework.filter(h => !h.done && h.due === date);
    const mins = items.reduce((sum, h) => sum + classMinutes(h.classId), 0);
    peak = Math.max(peak, mins);
    return { date, mins };
  });
  return `<div class="card gap"><div class="meter">
    ${per.map(x => `<span class="mt-col"><i style="height:${Math.round(x.mins / peak * 100)}%"></i>
      <b>${parseISO(x.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</b></span>`).join('')}
  </div><p class="mt-sub">Weighted by what each class’s work has actually taken you.</p></div>`;
}

function turninHTML() {
  const { plan } = nowCtx();
  if (!plan) return state.edit ? `<p class="empty">Shows on school days, pairing due work with the period it’s handed in.</p>` : '';
  const t = today();
  const due = db.homework.filter(h => !h.done && h.due <= t);
  const rows = due.map(h => {
    const slot = db.schedule.find(x => x.classId === h.classId);
    const row = slot && plan.rows.find(r => rowPeriod(r, t) === slot.period);
    if (!row) return '';
    return `<div class="row"><span class="block-time">P${slot.period}<b>${clockLabel(row[1])}</b></span>
      <span class="row-main"><span class="row-title">${esc(h.title)}</span>
      <span class="row-sub">hand in · ${esc(className(h.classId))}</span></span></div>`;
  }).filter(Boolean).join('');
  if (!rows) return state.edit ? `<p class="empty">Nothing to hand in today.</p>` : '';
  return `<div class="section-head"><h2>Hand in today</h2></div><div class="card">${rows}</div>`;
}

function triageScore(h) {
  return daysBetween(today(), h.due) * 100 + (h.details ? -5 : 0) - classMinutes(h.classId) / 10;
}

function triageHTML() {
  const open = db.homework.filter(h => !h.done);
  if (!open.length) return `<p class="empty">Nothing to put in order.</p>`;
  let manual = [];
  try { manual = JSON.parse(localStorage.getItem('planner.triage') || '[]'); } catch {}
  const sorted = [...open].sort((a, b) => {
    const ia = manual.indexOf(a.id), ib = manual.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return triageScore(a) - triageScore(b);
  });
  return `<div class="section-head"><h2>Do first</h2></div>
    <div class="card tri-zone">${sorted.map((h, i) => `
      <div class="row" data-tid="${h.id}"><span class="blk-handle tri-h" data-drag>
        <svg viewBox="0 0 24 24"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg></span>
      <span class="tri-n">${i + 1}</span>
      <span class="row-main"><span class="row-title">${esc(h.title)}</span>
        <span class="row-sub">${esc(className(h.classId))} · ${relLabel(h.due)}</span></span></div>`).join('')}</div>
    <p class="mt-sub">A suggestion, not a schedule — drag anything you disagree with.</p>`;
}

function doneweekHTML() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shift(today(), -i));
  const total = days.reduce((n, d) => n + (stats.days[d] | 0), 0);
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = shift(today(), -i);
    if (!planForDate(d)) continue;               // school days only
    if (stats.days[d] | 0) streak++; else break;
  }
  return `<div class="card gap dw"><div class="dw-top"><b>${total}</b><span>finished this week</span>
    <b class="dw-s">${streak}</b><span>day streak</span></div>
    <div class="dw-dots">${days.map(d => `<i class="${(stats.days[d] | 0) ? 'is-on' : ''}"></i>`).join('')}</div></div>`;
}

function projectsHTML() {
  const list = [...db.projects].sort((a, b) => a.due < b.due ? -1 : 1);
  if (!list.length) return `<p class="empty">No long-term projects. May it last.</p>`;
  return `<div class="card gap">${list.map(pr => {
    const st = statusOf(pr);
    const stale = st.id === 'todo' && daysBetween(today(), pr.due) <= 7 && daysBetween(today(), pr.due) >= 0;
    return `<div class="row task"><button class="check is-project${st.id === 'doing' ? ' is-mid' : ''}" data-act="cycle" data-id="${pr.id}" aria-label="Status: ${st.label}">${TICK}</button>
      <button class="row-main" data-act="open" data-kind="project" data-id="${pr.id}">
        <span class="row-title">${esc(pr.name)}</span>
        <span class="row-sub${stale ? ' is-late' : ''}">${stale ? '⚠ due soon and not started' : st.label + ' · ' + relLabel(pr.due)}</span>
      </button>${CHEV}</div>`;
  }).join('')}</div>`;
}

function estimateHTML() {
  const { mins, per } = estimateTonight();
  if (!mins) return `<div class="card gap reward"><b>≈ 0 minutes tonight.</b><span>Nothing due through tomorrow.</span></div>`;
  const parts = [...per.entries()].map(([cid, m]) => `${esc(className(cid))} ${fmtDur(m)}`).join(' · ');
  return `<div class="card gap est"><b>≈ ${fmtDur(mins)} tonight</b>
    <span>${parts}</span><i>Learned from what your homework actually takes.</i></div>`;
}

function recurHTML() {
  const rows = db.recurs.map(r => `<div class="row">
    <span class="swatch" style="background:${classColor(r.classId)}"></span>
    <span class="row-main"><span class="row-title">${esc(r.title)}</span>
      <span class="row-sub">${esc(className(r.classId))} · every school day</span></span>
    <button class="blk-x" data-act="recur-del" data-id="${r.id}" aria-label="Stop repeating">
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('');
  return `<section class="panel"><div class="panel-head"><h2>Repeats</h2>
      <button class="link-btn" data-act="recur-add">Add</button></div>
    ${rows || `<p class="empty">Standing work — “read 20 min” — recreated each school day, never on breaks.</p>`}</section>`;
}

/* -- calendar -- */

function upcomingHTML() {
  const soon = upcoming(today());
  return `<section class="panel"><div class="panel-head"><h2>Coming up</h2></div>
    ${soon.length ? soon.map(x => rowHTML(x)).join('') : `<p class="empty">Three quiet weeks ahead.</p>`}</section>`;
}

function weekcalHTML() {
  const start = shift(today(), -((weekdayOf(today()) - (prefs.mon ? 1 : 0) + 7) % 7));
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = shift(start, i);
    const plan = planForDate(d);
    const items = itemsOn(d);
    cols += `<div class="wc-col${d === today() ? ' is-today' : ''}">
      <b>${parseISO(d).toLocaleDateString(undefined, { weekday: 'short' })} ${parseISO(d).getDate()}</b>
      <i>${plan ? esc(plan.name.replace(' day', '')) : 'no school'}</i>
      ${items.slice(0, 4).map(x => `<span class="wc-it" style="border-color:${x.color}">${esc((x.item.title || x.item.name || x.item.text || '').split('\n')[0]).slice(0, 22)}</span>`).join('')}
    </div>`;
  }
  return `<div class="card gap wc-wrap"><div class="wc">${cols}</div></div>`;
}

function datesHTML() {
  const list = db.events.filter(e => e.date >= today()).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 6);
  return `<section class="panel"><div class="panel-head"><h2>Important dates</h2>
      <button class="link-btn" data-act="add" data-type="event">Add</button></div>
    ${list.length ? list.map(e => rowHTML({ kind: 'event', item: e })).join('') : `<p class="empty">No dates on the horizon.</p>`}</section>`;
}

function testsHTML() {
  const list = testItems();
  if (!list.length) return `<p class="empty">No tests detected — anything titled “test”, “quiz” or “exam” lands here on its own.</p>`;
  return `<div class="card gap">${list.map(x => `
    <div class="row"><span class="swatch" style="background:${classColor(x.classId)}"></span>
      <span class="row-main"><span class="row-title">${esc(x.title)}</span>
        <span class="row-sub">${esc(className(x.classId))}</span></span>
      <span class="due${daysBetween(today(), x.date) <= 2 ? ' is-late' : ''}">${daysBetween(today(), x.date)}d</span></div>`).join('')}</div>`;
}

function heatHTML() {
  const days = prefs.mon ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS;
  const first = new Date(state.year, state.month, 1);
  const lead = (first.getDay() - (prefs.mon ? 1 : 0) + 7) % 7;
  const start = new Date(state.year, state.month, 1 - lead);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = iso(d);
    const n = db.homework.filter(h => h.due === key).length + db.projects.filter(pr => pr.due === key).length;
    cells += `<span class="hm-day${d.getMonth() !== state.month ? ' is-out' : ''}"
      style="--h:${Math.min(1, n / 4)}">${d.getDate()}</span>`;
  }
  return `<div class="card gap hm"><div class="cal-week">${days.map(d => `<span>${d}</span>`).join('')}</div>
    <div class="hm-grid">${cells}</div>
    <p class="mt-sub">Darker means heavier — crunch weeks visible before you’re in them.</p></div>`;
}

function exceptionsHTML() {
  const list = milestones();
  if (!list.length) return `<p class="empty">No unusual days coming — the calendar is plain sailing.</p>`;
  return `<section class="panel"><div class="panel-head"><h2>Different days ahead</h2></div>
    ${list.map(m => `<div class="row"><span class="block-time">${parseISO(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      <span class="row-main"><span class="row-title">${esc(m.name)}</span>
        <span class="row-sub">${relLabel(m.date)}</span></span></div>`).join('')}</section>`;
}

/* -- notes & reference -- */

function notesHTML() {
  const list = [...db.notes].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 5);
  const rows = list.map(n => rowHTML({ kind: 'note', item: n })).join('');
  return `<section class="panel"><div class="panel-head"><h2>Notes</h2>
      <button class="link-btn" data-act="add" data-type="note">Add</button></div>
    ${rows || `<p class="empty">Nothing written down yet.</p>`}</section>`;
}

function notebookHTML(cfg) {
  const c = byId(db.classes, cfg.classId) || db.classes[0];
  if (!c) return `<p class="empty">Make a class first.</p>`;
  const list = db.notes.filter(n => n.classId === c.id).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 6);
  return `<section class="panel"><div class="panel-head"><h2>${esc(c.name)} notebook</h2>
      <button class="link-btn" data-act="add" data-type="note" data-class="${c.id}">Add</button></div>
    ${list.map(n => `<button class="row" data-act="open" data-kind="note" data-id="${n.id}">
      <span class="row-main"><span class="note-body">${esc(n.text)}</span>
      <span class="row-sub">${dateLabel(n.date)} · ${esc(planForDate(n.date)?.name || 'no school')}</span></span></button>`).join('') ||
      `<p class="empty">Empty notebook — for now.</p>`}</section>`;
}

const captureHTML = () => `<div class="card gap cap"><input class="cap-in" placeholder="Jot something — filed to ${esc(className(guessClass()) || 'No class')} — press return"
  enterkeyhint="done" autocapitalize="sentences"></div>`;

const pinnedHTML = cfg => `<div class="card gap pinned"><span class="pin-ic">📌</span>
  <span class="pin-t">${esc(cfg.text || 'Pin something you keep forgetting — a locker code, a formula.')}</span></div>`;

function cardsHTML(cfg, b) {
  const testCls = new Set(testItems().map(x => x.classId).filter(Boolean));
  const pool = db.notes.filter(n => testCls.size ? testCls.has(n.classId) : true);
  if (!pool.length) return `<p class="empty">Flashcards build themselves from notes — for classes with a test coming, once you have both.</p>`;
  const st = b ? (blkState[b.id] || (blkState[b.id] = { i: 0, flip: 0 })) : { i: 0, flip: 0 };
  const n = pool[st.i % pool.length];
  const lines = n.text.split('\n');
  const front = lines[0], back = lines.slice(1).join('\n') || '(that’s the whole note)';
  return `<div class="hero fc" data-act="card-flip" data-bid="${b ? b.id : ''}">
    <div class="hero-label">${esc(className(n.classId))} · ${st.i % pool.length + 1}/${pool.length}${testCls.size ? ' · test soon' : ''}</div>
    <div class="fc-body">${esc(st.flip ? back : front)}</div>
    <div class="hero-sub">${st.flip ? 'tap for the front' : 'tap to flip'}</div>
    <button class="chip fc-next" data-act="card-next" data-bid="${b ? b.id : ''}">Next</button>
  </div>`;
}

const refcardHTML = cfg => `<div class="card gap ref"><pre>${esc(cfg.text || 'a² + b² = c²\nPV = nRT\n— keep what you keep re-looking-up')}</pre></div>`;

function linksHTML() {
  const cur = guessClass();
  const list = [...db.links].sort((a, b) => (b.classId === cur) - (a.classId === cur));
  return `<section class="panel"><div class="panel-head"><h2>Links</h2>
      <button class="link-btn" data-act="link-add">Add</button></div>
    ${list.map(l => `<div class="row"><span class="swatch" style="background:${l.classId ? classColor(l.classId) : 'var(--muted)'}"></span>
      <a class="row-main lnk" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="row-title">${esc(l.label)}${l.classId === cur && cur ? ' <em class="lnk-now">now</em>' : ''}</span>
        <span class="row-sub">${esc(l.classId ? className(l.classId) : l.url.replace(/^https?:\/\//, '').slice(0, 40))}</span></a>
      <button class="blk-x" data-act="link-edit" data-id="${l.id}" aria-label="Edit link">
        <svg viewBox="0 0 24 24"><path d="M14.5 5.5l4 4L8 20l-4.6 1L4.4 16.4z"/></svg></button></div>`).join('') ||
    `<p class="empty">Canvas, Drive, class sites — the current class’s links float to the top during that class.</p>`}</section>`;
}

function photoHTML() {
  const shots = [...db.photos].sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1).slice(0, 8);
  return `<section class="panel"><div class="panel-head"><h2>Photo notes</h2>
      <button class="link-btn" data-act="photo-add">Snap</button></div>
    ${shots.length ? `<div class="ph-grid">${shots.map(x => `
      <button class="ph" data-act="photo-open" data-id="${x.id}"><img src="${x.img}" alt="">
        <i>${esc(className(x.classId) || '')}</i></button>`).join('')}</div>`
    : `<p class="empty">A photo of the whiteboard, auto-tagged with the class and day — the two things you’d never remember to add.</p>`}
    <input type="file" id="photoIn" accept="image/*" capture="environment" hidden></section>`;
}

/* -- focus & wellbeing -- */

const focusgoHTML = () => {
  const plan = focusPlan();
  return `<button class="btn blk-btn is-soft" data-act="focus-start">Start ${plan.totalMs / 60000} min focus</button>`;
};

function fstreakHTML() {
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = shift(today(), -i);
    if (!planForDate(d)) continue;
    if (stats.focusDays[d]) streak++; else if (i > 0 || !stats.focusDays[d]) { if (i === 0 && !stats.focusDays[d]) continue; break; }
  }
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(shift(today(), -i));
  return `<div class="card gap dw"><div class="dw-top"><b>${streak}</b><span>school-day focus streak</span></div>
    <div class="dw-dots">${days.map(d => `<i class="${stats.focusDays[d] ? 'is-on' : ''}"></i>`).join('')}</div>
    <p class="mt-sub">Weekends and breaks can’t break it — only school days count.</p></div>`;
}

function breakremHTML(cfg, b) {
  const { plan, pos } = nowCtx();
  if (plan && (pos.state === 'in' || pos.state === 'passing' || pos.state === 'before')) {
    return state.edit ? `<p class="empty">Silent during the school day — wakes up for evening studying.</p>` : '';
  }
  const st = b ? (blkState[b.id] || (blkState[b.id] = { at: Date.now() })) : { at: Date.now() };
  const mins = Math.floor((Date.now() - st.at) / 60000);
  return `<div class="card gap br"><span class="row-main" data-live="br">
      <span class="row-title">${mins >= 25 ? 'Take five — you’ve earned it.' : 'Break reminder is on.'}</span>
      <span class="row-sub">${mins} min since your last break</span></span>
    <button class="chip" data-act="break-took" data-bid="${b ? b.id : ''}">Took it</button></div>`;
}

function sleepHTML() {
  const tm = shift(today(), 1);
  const plan = planForDate(tm);
  if (!plan) return `<div class="card gap est"><b>No school tomorrow.</b><span>Sleep in — this block will nag you again on a school night.</span></div>`;
  const first = plan.rows[0][1];
  const [fh, fm] = first.split(':').map(Number);
  let bedMins = fh * 60 + fm - prefs.sleep * 60 - 30;   // 30 min to get up and out
  if (bedMins < 0) bedMins += 1440;
  const bed = `${String(Math.floor(bedMins / 60)).padStart(2, '0')}:${pad(bedMins % 60)}`;
  return `<div class="card gap est"><b>Asleep by ${clockLabel(bed)}</b>
    <span>for ${prefs.sleep} h before tomorrow’s ${clockLabel(first)} start</span>
    <i>Computed from tomorrow’s actual first bell — late starts give the hour back.</i></div>`;
}

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

function moodHTML() {
  const t = today();
  const mine = byId(db.moods, t);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(shift(t, -i));
  return `<div class="card gap mood">
    <div class="mood-row">${MOODS.map((m, i) => `<button class="mood-b${mine?.v === i + 1 ? ' is-on' : ''}"
      data-act="mood-set" data-v="${i + 1}">${m}</button>`).join('')}</div>
    <div class="mood-strip">${days.map(d => {
      const v = byId(db.moods, d)?.v;
      const load = db.homework.filter(h => h.due === d).length;
      return `<span class="mood-c"><i class="mood-dot" style="opacity:${v ? .3 + v * .14 : .08}"></i>
        <i class="mood-bar" style="height:${Math.min(14, load * 4)}px"></i></span>`;
    }).join('')}</div>
    <p class="mt-sub">Mood above, workload below — patterns show themselves.</p></div>`;
}

/* -- progress & insight -- */

function classAvg(cid) {
  const gs = db.grades.filter(g => g.classId === cid);
  if (!gs.length) return null;
  const got = gs.reduce((n, g) => n + g.score, 0);
  const max = gs.reduce((n, g) => n + g.max, 0);
  return max ? got / max * 100 : null;
}

function gradesHTML() {
  if (!db.classes.length) return `<p class="empty">Make a class first.</p>`;
  return `<section class="panel"><div class="panel-head"><h2>Grades</h2></div>
    ${db.classes.map(c => {
      const avg = classAvg(c.id);
      const n = db.grades.filter(g => g.classId === c.id).length;
      return `<div class="row"><span class="swatch" style="background:${c.color}"></span>
        <span class="row-main"><span class="row-title">${esc(c.name)}</span>
          <span class="row-sub">${avg === null ? 'no grades yet' : `${avg.toFixed(1)}% · ${n} grade${n === 1 ? '' : 's'}`}</span></span>
        <button class="chip" data-act="whatif" data-id="${c.id}">What if?</button>
        <button class="chip" data-act="grade-add" data-id="${c.id}">+</button></div>`;
    }).join('')}</section>`;
}

const GPA_PTS = a => a >= 90 ? 4 : a >= 80 ? 3 : a >= 70 ? 2 : a >= 60 ? 1 : 0;

function gpaHTML(cfg) {
  const scored = db.classes.map(c => ({ c, a: classAvg(c.id) })).filter(x => x.a !== null);
  if (!scored.length) return `<p class="empty">Enter some grades and the number appears.</p>`;
  const w = !!cfg.weighted;
  const gpa = scored.reduce((n, x) => n + GPA_PTS(x.a) + (w && x.c.h ? 1 : 0), 0) / scored.length;
  return `<div class="hero cd"><div class="hero-label">GPA · ${w ? 'weighted' : 'unweighted'}</div>
    <div class="hero-time">${gpa.toFixed(2)}</div>
    <div class="hero-sub">across ${scored.length} graded class${scored.length === 1 ? '' : 'es'}
      ${scored.some(x => x.c.h) ? ' · honors counted' : ''}</div></div>`;
}

function completionHTML() {
  const rows = db.classes.map(c => {
    const pc = stats.perClass[c.id];
    if (!pc || !(pc.onTime + pc.late)) return '';
    const pct = Math.round(pc.onTime / (pc.onTime + pc.late) * 100);
    return `<div class="row"><span class="swatch" style="background:${c.color}"></span>
      <span class="row-main"><span class="row-title">${esc(c.name)}</span>
        <span class="row-sub${pct < 70 ? ' is-late' : ''}">${pct}% on time · ${pc.late} late</span></span></div>`;
  }).filter(Boolean).join('');
  return rows ? `<section class="panel"><div class="panel-head"><h2>On time, by class</h2></div>${rows}</section>`
    : `<p class="empty">Finish some homework and the pattern shows — per class, where it’s fixable.</p>`;
}

function reviewHTML() {
  let done = 0;
  for (let i = 0; i < 7; i++) done += stats.days[shift(today(), -i)] | 0;
  const late = db.homework.filter(h => !h.done && h.due < today()).length;
  const week = shift(today(), 7);
  const ahead = db.homework.filter(h => !h.done && h.due > today() && h.due <= week).length;
  const test = testItems()[0];
  return `<div class="card gap rev"><b>Your week, written for you</b>
    <p>You finished <b>${done}</b> thing${done === 1 ? '' : 's'} this week${late ? `, and <b>${late}</b> slipped past due` : ' — nothing slipped'}.
    Next seven days: <b>${ahead}</b> due${test ? `, and <b>${esc(test.title)}</b> ${relLabel(test.date).toLowerCase()}` : ''}.</p></div>`;
}

/* -- utility & layout -- */

const SHORTCUTS = {
  hw: { l: 'Homework', act: 'data-act="add" data-type="homework"' },
  note: { l: 'Note', act: 'data-act="add" data-type="note"' },
  event: { l: 'Date', act: 'data-act="add" data-type="event"' },
  project: { l: 'Project', act: 'data-act="add" data-type="project"' },
  focus: { l: 'Focus', act: 'data-act="focus-start"' },
  sync: { l: 'Sync', act: 'data-act="sync-now"' },
  theme: { l: 'Theme', act: 'data-act="theme-cycle"' },
  settings: { l: 'Settings', act: 'data-act="settings"' }
};

function shortcutsHTML(cfg) {
  const acts = (cfg.acts && cfg.acts.length ? cfg.acts : ['hw', 'note', 'focus', 'settings']).filter(a => SHORTCUTS[a]);
  return `<div class="chips gap">${acts.map(a => `<button class="chip" ${SHORTCUTS[a].act}>${SHORTCUTS[a].l}</button>`).join('')}</div>`;
}

function searchHTML() {
  return `<div class="card gap srch"><input class="search-in" placeholder="Search everything…" enterkeyhint="search">
    <div class="search-out"></div></div>`;
}

function searchResults(qs) {
  qs = qs.trim().toLowerCase();
  if (!qs) return '';
  const hit = [];
  const t = today();
  const dist = d => Math.abs(daysBetween(t, d)) + (d < t ? 40 : 0);   // soon beats stale
  for (const h of db.homework) if ((h.title + ' ' + (h.details || '')).toLowerCase().includes(qs))
    hit.push({ k: 'homework', item: h, s: dist(h.due) + (h.done ? 100 : 0) });
  for (const e of db.events) if (e.title.toLowerCase().includes(qs)) hit.push({ k: 'event', item: e, s: dist(e.date) });
  for (const pr of db.projects) if (pr.name.toLowerCase().includes(qs)) hit.push({ k: 'project', item: pr, s: dist(pr.due) });
  for (const n of db.notes) if (n.text.toLowerCase().includes(qs)) hit.push({ k: 'note', item: n, s: dist(n.date) + 10 });
  for (const c of db.classes) if (c.name.toLowerCase().includes(qs)) hit.push({ k: 'class', item: c, s: -1 });
  hit.sort((a, b) => a.s - b.s);
  if (!hit.length) return `<p class="empty">Nothing matches.</p>`;
  return hit.slice(0, 8).map(x => x.k === 'class'
    ? `<button class="row" data-act="class" data-id="${x.item.id}"><span class="swatch" style="background:${x.item.color}"></span>
       <span class="row-main"><span class="row-title">${esc(x.item.name)}</span><span class="row-sub">Class</span></span>${CHEV}</button>`
    : rowHTML({ kind: x.k, item: x.item })).join('');
}

function syncstatHTML() {
  const bad = sync.code && (sync.status === 'error' || sync.dirty);
  if (!bad && sync.code && !state.edit) return '';   // silence is the feature
  if (!sync.code) return `<div class="card gap"><button class="row" data-act="sync">
    <span class="row-main"><span class="row-title">Sync is off</span>
      <span class="row-sub">One code keeps every device in step</span></span>${CHEV}</button></div>`;
  return `<div class="card gap ${bad ? 'is-alert' : ''}"><button class="row" data-act="sync">
    <span class="row-main"><span class="row-title">${bad ? 'Sync needs attention' : 'Synced'}</span>
      <span class="row-sub">${esc(syncLabel())}</span></span>${CHEV}</button></div>`;
}

const themeblkHTML = () => `<div class="card gap"><div class="set-row"><span class="set-info">
    <span class="row-title">Theme</span><span class="row-sub">Auto goes dark for the evening</span></span>
  ${setSeg('theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']])}</div></div>`;

function headerHTML(cfg) {
  const { plan, pos } = nowCtx();
  const cur = pos.state === 'in' && pos.block.period ? periodClass(pos.block.period) : null;
  const text = (cfg.text || 'Section')
    .replace('{class}', cur ? cur.name : 'Free')
    .replace('{day}', new Date().toLocaleDateString(undefined, { weekday: 'long' }));
  return `<div class="section-head"><h2>${esc(text)}</h2></div>`;
}

const spacerHTML = () => `<div class="blk-spacer"></div>`;
const stickerHTML = cfg => `<div class="sticker">${esc(cfg.emoji || '😎')}</div>`;
const blankHTML = () => state.edit
  ? `<div class="add-blk is-ghosted"><span>An empty block — proof this page is yours. Swap it for anything.</span></div>`
  : `<div class="blk-spacer"></div>`;


/* ---------------- block registry ----------------
   n = name · c = category (the plan's sections) · d = what it is ·
   sm = the one behavior that earns its place. Everything renders lazily. */

const CAT = {
  live: 'Live time & schedule', work: 'Homework & tasks', cal: 'Calendar',
  notes: 'Notes & reference', well: 'Focus & wellbeing', prog: 'Progress & insight',
  util: 'Utility & layout'
};

const clsOpts = (sel) => `<div class="field"><label for="o-class">Class</label>
  <select id="o-class">${db.classes.map(c =>
    `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;

const BLOCKS = {
  hero: { n: 'Class timer', c: 'live', d: 'The current period, counting down big.',
    sm: 'Never goes dead — flips itself through passing period, lunch and after-school on its own.',
    html(cfg) {
      const { now, plan, pos } = nowCtx();
      tickKey = posKey(pos);
      const core = heroHTML(plan, pos, now);
      const tgt = cfg.link && findPage('bell');
      return tgt && tgt.id !== state.tab
        ? `<button class="hero-link" data-act="tab" data-to="${tgt.id}">${core}</button>` : core;
    } },
  bell: { n: 'Bell schedule', c: 'live', d: 'The whole day, block by block.',
    sm: 'Scrolls itself to the current block and dims what’s already over.',
    html: () => bellHTML() },
  periods: { n: 'Classes & periods', c: 'live', d: 'Your timetable — classes, rooms, teachers.',
    sm: 'Defined once, mapped onto whatever bell schedule the day uses — late starts included.',
    html: () => periodsHTML() },
  classcard: { n: 'Class card', c: 'live', d: 'One class in full: next meeting, its work, its notes.',
    sm: 'Says when the class next meets in plain words — “next: tomorrow, 2nd period”.',
    html: (cfg) => classcardHTML(cfg),
    opts: cfg => clsOpts(cfg.classId), read: () => ({ classId: val('#o-class') }) },
  nextup: { n: 'Next up', c: 'live', d: 'One line: what’s next, when, where.',
    sm: 'In the last block it counts to dismissal instead of pointing at a class that doesn’t exist.',
    html: () => nextupHTML() },
  ring: { n: 'Period ring', c: 'live', d: 'The current block as a progress ring.',
    sm: 'The ring is drawn in that class’s color — readable from across the room.',
    html: () => liveCard('ring', 'ring-card') },
  weekglance: { n: 'Week at a glance', c: 'live', d: 'The next five school days in a strip.',
    sm: 'Minimum days, finals and late starts are marked automatically from the bell calendar.',
    html: () => weekglanceHTML() },
  daydiff: { n: 'Today is different', c: 'live', d: 'Swap today’s bell schedule.',
    sm: 'Suggests the likely alternates first, and un-swaps itself at midnight.',
    html: () => daydiffHTML() },
  countdown: { n: 'Countdown', c: 'live', d: 'Big number of days to a date.',
    sm: 'Offers the school calendar’s real milestones instead of a blank date field.',
    html: cfg => countdownHTML(cfg),
    opts: cfg => `${milestones().length ? `<div class="field"><label for="o-mile">A real milestone</label>
        <select id="o-mile"><option value="">Custom…</option>${milestones().map(m =>
          `<option value="${m.date}|${esc(m.name)}">${esc(m.name)} · ${dateLabel(m.date)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="o-label">Label</label>
        <input id="o-label" type="text" value="${esc(cfg.label)}" placeholder="Winter break"></div>
      <div class="field"><label for="o-date">Date</label>
        <input id="o-date" type="date" value="${esc(cfg.date || shift(today(), 30))}"></div>`,
    read: () => {
      const m = val('#o-mile');
      if (m) { const [date, label] = m.split('|'); return { date, label }; }
      return { label: val('#o-label'), date: val('#o-date') };
    } },
  untilfree: { n: 'Time until free', c: 'live', d: 'Counts to the end of your last class.',
    sm: 'Also says how many classes are left — the number you actually want by 6th period.',
    html: () => liveCard('free') },
  lunch: { n: 'Lunch timer', c: 'live', d: 'How long lunch has left.',
    sm: 'Only exists on days that actually have a lunch block.',
    html: () => liveCard('lunch') },
  wherenext: { n: 'Where am I next', c: 'live', d: 'Next room and teacher, big.',
    sm: 'Deliberately shows the next room — the only one you need while walking.',
    html: () => liveCard('where') },
  compare: { n: 'Schedule comparison', c: 'live', d: 'Two bell schedules side by side.',
    sm: 'Highlights only the rows that differ.',
    html: cfg => compareHTML(cfg),
    opts: cfg => ['a', 'b'].map((k, i) => `<div class="field"><label for="o-${k}">${i ? 'Against' : 'Compare'}</label>
      <select id="o-${k}">${BELL.pickable.map(key =>
        `<option value="${key}"${(cfg[k] || (i ? 'minimum' : 'regular')) === key ? ' selected' : ''}>${esc(BELL.schedules[key].name)}</option>`).join('')}</select></div>`).join(''),
    read: () => ({ a: val('#o-a'), b: val('#o-b') }) },

  addhw: { n: 'Add homework', c: 'work', d: 'The one big button.',
    sm: 'The class is pre-picked from where you are — or the class you just walked out of.',
    html: () => addhwHTML() },
  master: { n: 'Master add', c: 'work', d: 'One row for all four types.',
    sm: 'Ordered by what you actually add most; dates come from the page you’re on.',
    html: () => masterHTML() },
  quick: { n: 'Quick add', c: 'work', d: 'Big homework button plus chips.',
    sm: 'The classic Home arrangement, with the same class guessing underneath.',
    html: () => quickHTML() },
  tasks: { n: 'All tasks', c: 'work', d: 'Everything open, grouped by deadline.',
    sm: 'Overdue floats to the top in red; checking off never makes the list jump.',
    html: () => tasksHTML() },
  duetoday: { n: 'Due today', c: 'work', d: 'Just today. Nothing else.',
    sm: 'When it’s empty it says so as a reward, not a blank card.',
    html: () => duetodayHTML() },
  due: { n: 'Still due', c: 'work', d: 'Due today or already late, together.',
    sm: 'Merged on purpose: at 4 pm they’re the same problem. Late items keep their day count.',
    html: () => dueHTML() },
  tonight: { n: 'Do tonight', c: 'work', d: 'What’s due tomorrow.',
    sm: 'Can wait until school’s out to appear (Settings) — it’s an evening block.',
    html: () => {
      if (prefs.tonightHide && !state.edit) {
        const { plan, pos } = nowCtx();
        if (plan && pos.state !== 'after' && pos.state !== 'none') return '';
      }
      return tonightHTML();
    } },
  byclass: { n: 'Homework by class', c: 'work', d: 'Open work under each class.',
    sm: 'Ordered by your period order, not the alphabet — the shape of your day.',
    html: () => byclassHTML() },
  quickdone: { n: 'Quick complete', c: 'work', d: 'A big-target burn-down list.',
    sm: 'Checked items stay put with an undo — nothing reshuffles under your finger.',
    html: () => quickdoneHTML() },
  overdue: { n: 'Overdue only', c: 'work', d: 'The nag block.',
    sm: 'Removes itself entirely when nothing is overdue — if you can see it, act.',
    html: () => overdueHTML() },
  spotlight: { n: 'Assignment spotlight', c: 'work', d: 'One assignment, large.',
    sm: 'Auto-pins whatever is nearest due until you pin something yourself.',
    html: cfg => spotlightHTML(cfg) },
  meter: { n: 'Workload meter', c: 'work', d: 'How heavy the week ahead looks.',
    sm: 'Weighted by how long each class’s work has actually taken you, not by counting items.',
    html: () => meterHTML() },
  subtasks: { n: 'Subtasks', c: 'work', d: 'Break one assignment into steps.',
    sm: 'The assignment completes itself when the last step is checked.',
    html: cfg => subtasksHTML(cfg) },
  recur: { n: 'Recurring homework', c: 'work', d: 'Standing work, like nightly reading.',
    sm: 'Regenerates on school days only — never on weekends or breaks.',
    html: () => recurHTML() },
  turnin: { n: 'Turn-in reminder', c: 'work', d: 'Don’t forget to actually hand it in.',
    sm: 'Pairs each due item with the period that class meets today.',
    html: () => turninHTML() },
  triage: { n: 'Priority triage', c: 'work', d: 'A proposed order for tonight.',
    sm: 'Scored from due date, size and your pace — then drag anything you disagree with.',
    html: () => triageHTML() },
  doneweek: { n: 'Done this week', c: 'work', d: 'What you finished, plus a streak.',
    sm: 'The streak counts school days only, so weekends can’t break it.',
    html: () => doneweekHTML() },
  projects: { n: 'Long-term projects', c: 'work', d: 'Multi-week work with status.',
    sm: 'Warns when a due date closes in and the status never left “not started”.',
    html: () => projectsHTML() },
  estimate: { n: 'Homework estimate', c: 'work', d: 'How long tonight will take.',
    sm: 'Learns your real pace per class — nobody estimates their own homework honestly.',
    html: () => estimateHTML() },

  month: { n: 'Month calendar', c: 'cal', d: 'The month, dotted with what’s on.',
    sm: 'Dots wear class colors, and a long-press on a day adds straight to it.',
    html: () => monthHTML() },
  weekcal: { n: 'Week calendar', c: 'cal', d: 'This week, one column per day.',
    sm: 'Bell type and assignments share a column — so a test on a minimum day is visible.',
    html: () => weekcalHTML() },
  upcoming: { n: 'Agenda', c: 'cal', d: 'A rolling list of what’s coming.',
    sm: 'Always starts at now — it can’t decay into a list of things you already missed.',
    html: () => upcomingHTML() },
  agenda: { n: 'Day detail', c: 'cal', d: 'Whatever the selected day holds.',
    sm: 'Follows the day picked in any calendar on the same page — two blocks, one instrument.',
    html: () => `<div class="agenda">${agendaHTML()}</div>` },
  dates: { n: 'Important dates', c: 'cal', d: 'Trips, picture day, spirit week.',
    sm: 'Tag one to a class and it wears that class’s color.',
    html: () => datesHTML() },
  tests: { n: 'Test countdown', c: 'cal', d: 'What’s being tested, and in how many days.',
    sm: 'Collects anything titled test, quiz or exam automatically — no second list.',
    html: () => testsHTML() },
  heat: { n: 'Workload heat map', c: 'cal', d: 'The month shaded by how busy each day is.',
    sm: 'Crunch weeks become visible before you’re inside them.',
    html: () => heatHTML() },
  exceptions: { n: 'Different days ahead', c: 'cal', d: 'Upcoming non-standard days.',
    sm: 'Read straight from the bell calendar — learn about minimum days from your planner.',
    html: () => exceptionsHTML() },

  notes: { n: 'My notes', c: 'notes', d: 'The latest things you wrote down.',
    sm: 'A new note auto-tags the class you’re sitting in.',
    html: () => notesHTML() },
  notebook: { n: 'Class notebook', c: 'notes', d: 'All of one class’s notes.',
    sm: 'Each note is labeled with what kind of day it was — “the late-start Wednesday” is findable.',
    html: cfg => notebookHTML(cfg),
    opts: cfg => clsOpts(cfg.classId), read: () => ({ classId: val('#o-class') }) },
  capture: { n: 'Quick capture', c: 'notes', d: 'A scratchpad that asks nothing.',
    sm: 'Type and hit return — filed to the class you’re in, classified never.',
    html: () => captureHTML() },
  pinned: { n: 'Pinned note', c: 'notes', d: 'One note that never scrolls away.',
    sm: 'Locker combo, a formula, the wifi password — always exactly where you put it.',
    html: cfg => pinnedHTML(cfg),
    opts: cfg => `<div class="field"><label for="o-text">The note</label>
      <textarea id="o-text" rows="2">${esc(cfg.text)}</textarea></div>`,
    read: () => ({ text: val('#o-text') }) },
  cards: { n: 'Flashcards', c: 'notes', d: 'Self-quizzing from your own notes.',
    sm: 'Builds its deck from notes in classes that have a test coming up.',
    html: (cfg, b) => cardsHTML(cfg, b) },
  refcard: { n: 'Reference card', c: 'notes', d: 'The stuff you keep re-looking-up.',
    sm: 'Monospaced, line-for-line, and still legible in dark mode.',
    html: cfg => refcardHTML(cfg),
    opts: cfg => `<div class="field"><label for="o-text">Contents</label>
      <textarea id="o-text" rows="4">${esc(cfg.text)}</textarea></div>`,
    read: () => ({ text: val('#o-text') }) },
  links: { n: 'Link stash', c: 'notes', d: 'Canvas, Drive, class sites.',
    sm: 'The class you’re in right now floats its links to the top.',
    html: () => linksHTML() },
  photo: { n: 'Photo note', c: 'notes', d: 'A picture of the whiteboard.',
    sm: 'Auto-tagged with class and day — the two things you’d never add by hand.',
    html: () => photoHTML() },

  focus: { n: 'Focus session', c: 'well', d: 'Timed studying, phone locked out.',
    sm: 'Suggests a length sized to what you actually owe tonight.',
    html: () => focusHTML() },
  focusgo: { n: 'Start focus button', c: 'well', d: 'One tap, last-used plan.',
    sm: 'No setup screen — the moment you decide to study is a bad time for options.',
    html: () => focusgoHTML() },
  fstreak: { n: 'Focus streak', c: 'well', d: 'Consecutive days with a session.',
    sm: 'Counts school days only — a weekend can’t break a streak you never had.',
    html: () => fstreakHTML() },
  breakrem: { n: 'Break reminder', c: 'well', d: 'Stand up. Look away.',
    sm: 'Silent during class blocks; only speaks up while you study at home.',
    html: (cfg, b) => breakremHTML(cfg, b) },
  sleep: { n: 'Sleep countdown', c: 'well', d: 'When to be asleep tonight.',
    sm: 'Counted back from tomorrow’s actual first bell — late starts give you the hour.',
    html: () => sleepHTML() },
  mood: { n: 'Mood check', c: 'well', d: 'One tap, once a day.',
    sm: 'Shown against workload over time — patterns surface without a journal.',
    html: () => moodHTML() },

  grades: { n: 'Grade tracker', c: 'prog', d: 'Grades you enter, averaged per class.',
    sm: '“What do I need on the final to keep an A?” — the only question that matters, answered.',
    html: () => gradesHTML() },
  gpa: { n: 'GPA snapshot', c: 'prog', d: 'The number, big.',
    sm: 'Weighted and unweighted, honors/AP understood.',
    html: cfg => gpaHTML(cfg),
    opts: cfg => `<div class="field"><label for="o-w">Weighting</label>
      <select id="o-w"><option value="0"${!cfg.weighted ? ' selected' : ''}>Unweighted</option>
      <option value="1"${cfg.weighted ? ' selected' : ''}>Weighted (honors +1)</option></select></div>`,
    read: () => ({ weighted: +val('#o-w') }) },
  completion: { n: 'Completion stats', c: 'prog', d: 'On time vs late, per class.',
    sm: 'Per class, where it’s fixable — never one global judgement.',
    html: () => completionHTML() },
  review: { n: 'Weekly review', c: 'prog', d: 'Your week, summarized.',
    sm: 'Writes itself from the week’s data — reflection with zero effort.',
    html: () => reviewHTML() },

  shortcuts: { n: 'Shortcut row', c: 'util', d: 'Three or four mini actions in one row.',
    sm: 'Each slot triggers another block’s main action — a page compressed to a strip.',
    html: cfg => shortcutsHTML(cfg),
    opts: cfg => {
      const acts = (cfg.acts && cfg.acts.length ? cfg.acts : ['hw', 'note', 'focus', 'settings']);
      return [0, 1, 2, 3].map(i => `<div class="field"><label for="o-s${i}">Slot ${i + 1}</label>
        <select id="o-s${i}"><option value="">—</option>${Object.entries(SHORTCUTS).map(([k, v]) =>
          `<option value="${k}"${acts[i] === k ? ' selected' : ''}>${v.l}</option>`).join('')}</select></div>`).join('');
    },
    read: () => ({ acts: [0, 1, 2, 3].map(i => val('#o-s' + i)).filter(Boolean) }) },
  search: { n: 'Search everything', c: 'util', d: 'One field over all of it.',
    sm: 'Ranked by how soon each result matters — tomorrow beats last term.',
    html: () => searchHTML() },
  syncstat: { n: 'Sync status', c: 'util', d: 'Whether your devices agree.',
    sm: 'Invisible while everything is fine — so its appearance means something.',
    html: () => syncstatHTML() },
  themeblk: { n: 'Theme switch', c: 'util', d: 'Light, dark, or automatic.',
    sm: 'Auto flips after sunset — evening homework shouldn’t start with a white flash.',
    html: () => themeblkHTML() },
  header: { n: 'Section header', c: 'util', d: 'A label that splits the page.',
    sm: 'Accepts {class} and {day} — a header that stays correct by itself.',
    html: cfg => headerHTML(cfg),
    opts: cfg => `<div class="field"><label for="o-text">Text</label>
      <input id="o-text" type="text" value="${esc(cfg.text)}" placeholder="Morning · or {class}"></div>`,
    read: () => ({ text: val('#o-text') }) },
  spacer: { n: 'Spacer', c: 'util', d: 'Breathing room.',
    sm: 'Collapses on small screens rather than wasting them.',
    html: () => spacerHTML() },
  sticker: { n: 'Sticker', c: 'util', d: 'Pure personality. Zero function.',
    sm: 'Deliberately none — not everything on your page has to be productive.',
    html: cfg => stickerHTML(cfg),
    opts: cfg => `<div class="field"><label for="o-emoji">Emoji</label>
      <input id="o-emoji" type="text" value="${esc(cfg.emoji)}" maxlength="4" placeholder="😎"></div>`,
    read: () => ({ emoji: val('#o-emoji') }) },
  blank: { n: 'Empty block', c: 'util', d: 'The deliberate blank.',
    sm: 'The teaching block: visible proof the page is made of parts you may change.',
    html: () => blankHTML() }
};

/* Blocks whose numbers move by the second. */
const LIVE_TYPES = new Set(['hero', 'bell', 'nextup', 'ring', 'untilfree', 'lunch', 'wherenext', 'breakrem']);
const activeLive = () => activePage().blocks.some(b => LIVE_TYPES.has(b.t));

/* ---------------- pages & layout ----------------
   v2: the app is a set of pages, each a stack of blocks, and the bottom tray
   is the page list. The layout is per-device on purpose — a phone and a
   laptop can reasonably want different arrangements — so it lives outside
   the synced database and v1 clients never see it. */

const LAYOUT_KEY = 'planner.layout.v1';
const PAGE_LIMIT = 7;
const bid = () => 'b' + Math.random().toString(36).slice(2, 8);

/* The migration: a layout reproducing the five fixed tabs exactly, so an
   existing user updates and finds the planner they had — then discovers
   it has become editable underneath. */
const defaultPages = () => [
  { id: 'calendar', name: 'Calendar', icon: 'cal',
    blocks: [{ id: bid(), t: 'month' }, { id: bid(), t: 'agenda' }] },
  { id: 'schedule', name: 'Schedule', icon: 'clock',
    blocks: [{ id: bid(), t: 'hero' }, { id: bid(), t: 'bell' }, { id: bid(), t: 'periods' }] },
  { id: 'home', name: 'Home', icon: 'home', home: true,
    blocks: [{ id: bid(), t: 'hero', cfg: { link: 1 } }, { id: bid(), t: 'quick' },
             { id: bid(), t: 'tonight' }, { id: bid(), t: 'due' }] },
  { id: 'focus', name: 'Focus', icon: 'target', blocks: [{ id: bid(), t: 'focus' }] },
  { id: 'tasks', name: 'Tasks', icon: 'tasks', blocks: [{ id: bid(), t: 'tasks' }] }
];

const homePage = () => ({ id: 'home', name: 'Home', icon: 'home', home: true,
  blocks: [{ id: bid(), t: 'hero', cfg: { link: 1 } }, { id: bid(), t: 'quick' },
           { id: bid(), t: 'tonight' }, { id: bid(), t: 'due' }] });

/* Repair whatever comes out of storage: Home must exist and be undeletable,
   unknown block types (from a newer version) are dropped rather than crashing,
   and the tray is capped. */
function fixLayout(l) {
  let pages = (Array.isArray(l.pages) ? l.pages : []).filter(p => p && p.id && Array.isArray(p.blocks));
  pages = pages.slice(0, PAGE_LIMIT);
  for (const p of pages) {
    p.name = String(p.name || 'Page').slice(0, 24);
    p.blocks = p.blocks.filter(b => b && BLOCKS[b.t]).map(b => ({ id: b.id || bid(), t: b.t, cfg: b.cfg }));
    p.home = p.id === 'home';
  }
  if (!pages.some(p => p.home)) pages.splice(Math.min(2, pages.length), 0, homePage());
  return { pages };
}

function loadLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    if (l && Array.isArray(l.pages) && l.pages.length) return fixLayout(l);
  } catch {}
  return null;
}

function saveLayout() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}

const pageById = id => layout.pages.find(p => p.id === id);
const activePage = () => pageById(state.tab) || layout.pages[0];
const activeSection = () => $('#view-' + activePage().id);
/** Query inside the page on screen — pages keep stale DOM while hidden. */
const q = sel => activeSection()?.querySelector(sel);
const pageHas = (p, t) => p.blocks.some(b => b.t === t);
const activeHas = t => pageHas(activePage(), t);
const findPage = t => layout.pages.find(p => pageHas(p, t));

/* The five original tab glyphs; any other icon value renders as an emoji. */
const ICONS = {
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="4.8" width="17.6" height="15.4" rx="3"/><path d="M3.2 9.6h17.6M8 3.2v3.2M16 3.2v3.2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 10.4 12 3.8l8.4 6.6"/><path d="M5.6 11.9v7.3a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1v-7.3"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.2"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 7.4l1.9 1.9 3.1-3.4M3.4 16.4l1.9 1.9 3.1-3.4M11.6 7.6h9M11.6 16.6h9"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v12l-4 4H5z"/><path d="M15 20.5v-4h4"/></svg>'
};

const iconOf = p => ICONS[p.icon] || `<span class="tab-emoji">${esc(p.icon || '•')}</span>`;

function renderTabs() {
  $('#tabbar').innerHTML = layout.pages.map(p => `
    <button class="tab${p.home ? ' tab-home' : ''}${p.id === state.tab ? ' is-active' : ''}"
      data-act="tab" data-to="${p.id}" type="button">
      ${p.home ? `<span class="home-orb">${iconOf(p)}</span>` : iconOf(p)}
      <span>${esc(p.name)}</span></button>`).join('');
}

/** Keep <main>'s sections in step with the page list. */
function ensureSections() {
  const main = $('#main');
  const want = new Set(layout.pages.map(p => 'view-' + p.id));
  for (const el of [...main.querySelectorAll('.view')]) if (!want.has(el.id)) el.remove();
  for (const p of layout.pages) if (!$('#view-' + p.id)) {
    const el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-' + p.id;
    el.hidden = true;
    main.appendChild(el);
  }
}

/* ---------------- the class you probably mean ----------------
   The context layer's first use: adding homework or a note pre-picks the
   class you are in — or, during passing period, lunch or a break, the class
   you just walked out of, because that is when work gets written down.
   After school it is the last class you actually had today. The guess is
   only a default in a visible dropdown; it is never applied silently. */
function guessClass() {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  if (!plan) return null;
  const pos = dayPosition(plan, now.secs);
  if (pos.state === 'in' && pos.block.period) {
    const c = periodClass(pos.block.period);
    if (c) return c.id;
  }
  let last = null;
  for (const r of plan.rows) {
    if (r[3] && hhmmToSecs(r[2]) <= now.secs) {
      const c = periodClass(r[3]);
      if (c) last = c.id;
    }
  }
  return last;
}

/* ---------------- rendering ---------------- */

function titleFor(p) {
  if (state.edit) return 'Edit \u00b7 ' + p.name;
  if (state.classId) return className(state.classId);
  if (pageHas(p, 'month')) return `${MONTHS[state.month]} ${state.year}`;
  if (p.home) return homeTitle();
  return p.name;
}

/** One block's markup — bare normally; wrapped with edit chrome in edit mode. */
function blockWrap(b) {
  const def = BLOCKS[b.t];
  if (!def) return '';
  const body = def.html(b.cfg || {}, b);
  if (!state.edit) return body;
  return `<div class="blk" data-bid="${b.id}">
    <div class="blk-bar">
      <span class="blk-handle" data-drag aria-label="Drag to reorder">
        <svg viewBox="0 0 24 24"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg>
      </span>
      <button class="blk-name" data-act="blk-opts" data-bid="${b.id}" type="button">${def.n}</button>
      <button class="blk-x" data-act="blk-del" data-bid="${b.id}" type="button" aria-label="Remove block">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="blk-body">${body}</div>
  </div>`;
}

function pageHTML(p) {
  let html = p.blocks.map(blockWrap).join('');
  if (state.edit) {
    if (!p.blocks.length) html += `<p class="empty">An empty page. Add your first block.</p>`;
    html += `<button class="add-blk" data-act="blk-add" type="button">${PLUS}<span>Add block</span></button>
      <div class="card gap-lg"><button class="row" data-act="pg-manage">
        <span class="row-main"><span class="row-title accent">Pages\u2026</span>
        <span class="row-sub">Rename, reorder, icons, add or remove</span></span>${CHEV}</button></div>`;
  } else if (!p.blocks.length) {
    html = `<p class="empty">This page is empty. Tap the pencil up top to add blocks \u2014 timers, lists, buttons, whatever you want here.</p>`;
  }
  return html;
}

/** The live countdown only runs when something on screen needs it. */
function syncTick() {
  const live = !state.edit && !state.classId && activeLive();
  if (live && document.visibilityState === 'visible') startTick(); else stopTick();
}

function render() {
  ensureSections();
  renderTabs();
  const p = activePage();
  $('#title').textContent = titleFor(p);
  $('#prevMonth').hidden = $('#nextMonth').hidden = state.edit || state.classId || !pageHas(p, 'month');
  $('#editBtn').classList.toggle('is-on', state.edit);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + p.id;
  if (state.classId) renderClass();
  else activeSection().innerHTML = pageHTML(p);
  paintFocusBanner();
  syncTick();
}

function monthHTML() {
  const days = prefs.mon ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS;
  const wk = days.map(d => `<span>${d}</span>`).join('');
  const first = new Date(state.year, state.month, 1);
  const lead = (first.getDay() - (prefs.mon ? 1 : 0) + 7) % 7;
  const start = new Date(state.year, state.month, 1 - lead);
  const now = today();
  let html = '';

  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = iso(d);
    const dots = itemsOn(key).slice(0, 3).map(x => `<i style="background:${x.color}"></i>`).join('');
    const cls = ['day'];
    if (d.getMonth() !== state.month) cls.push('is-out');
    if (key === now) cls.push('is-today');
    if (key === state.selected) cls.push('is-selected');
    html += `<button type="button" class="${cls.join(' ')}" data-act="pick" data-date="${key}"
      aria-label="${dateLabel(key)}"${key === state.selected ? ' aria-current="date"' : ''}>
      <span class="dnum">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  return `<div class="cal"><div class="cal-week" aria-hidden="true">${wk}</div>
    <div class="cal-grid" aria-label="Days">${html}</div></div>`;
}

/** Redraw just the agenda block on the page, if it has one. */
function refreshAgenda(animate) {
  const el = q('.agenda');
  if (!el) return;
  el.innerHTML = agendaHTML();
  if (animate) replay(el, 'anim-soft');
}

/** Restart an entrance animation on an element that is already on screen. */
function replay(el, cls) {
  el.classList.remove('anim-view', 'anim-soft', 'anim-left', 'anim-right', 'anim-turn');
  void el.offsetWidth;
  el.classList.add(cls);
}

function agendaHTML() {
  const sel = state.selected;
  const isToday = sel === today();
  const rows = itemsOn(sel).map(x => rowHTML(x)).join('');

  let html = `<div class="section-head"><h2>${isToday ? 'Today' : dateLabel(sel)}</h2>
    <button class="link-btn" data-act="add">Add</button></div>`;
  html += rows ? `<div class="card">${rows}</div>` : `<p class="empty">Nothing on this day.</p>`;

  if (isToday) {
    const late = db.homework.filter(h => !h.done && h.due < sel).sort((a, b) => a.due < b.due ? -1 : 1);
    if (late.length) {
      html += `<div class="section-head"><h2>Overdue</h2></div><div class="card">` +
        late.map(h => rowHTML({ kind: 'homework', item: h })).join('') + `</div>`;
    }
    const soon = upcoming(sel);
    if (soon.length) {
      html += `<div class="section-head"><h2>Upcoming</h2></div><div class="card">` +
        soon.map(x => rowHTML(x)).join('') + `</div>`;
    }
  }
  return html;
}

/** Next unfinished items after `from`, within three weeks. */
function upcoming(from) {
  const out = [];
  const limit = shift(from, 21);
  for (const h of db.homework) if (!h.done && h.due > from && h.due <= limit) out.push({ kind: 'homework', item: h, date: h.due });
  for (const p of db.projects) if (p.status !== 'done' && p.due > from && p.due <= limit) out.push({ kind: 'project', item: p, date: p.due });
  for (const e of db.events) if (e.date > from && e.date <= limit) out.push({ kind: 'event', item: e, date: e.date });
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).slice(0, 6);
}

function rowHTML({ kind, item }, opts = {}) {
  const open = `data-act="open" data-kind="${kind}" data-id="${item.id}"`;

  if (kind === 'homework') {
    const late = !item.done && item.due < today();
    // inside a class the class name is redundant; show the details instead
    const sub = opts.hideClass
      ? [relLabel(item.due), item.details].filter(Boolean).join(' · ')
      : `${className(item.classId)} · ${relLabel(item.due)}`;
    // `open` also sits on the outer div: the chevron and its padding are
    // outside the row-main button, so without it those areas look tappable
    // (the chevron says so) but silently do nothing.
    return `<div class="row${item.done ? ' is-done' : ''}" ${open}>
      <button class="check" data-act="toggle" data-id="${item.id}" aria-pressed="${!!item.done}" aria-label="Mark done">${TICK}</button>
      <button class="row-main" ${open}>
        <span class="row-title">${esc(item.title)}</span>
        <span class="row-sub${late ? ' is-late' : ''}">${esc(sub)}</span>
      </button>${CHEV}</div>`;
  }

  if (kind === 'project') {
    const st = statusOf(item);
    return `<button class="row" ${open}>
      <span class="swatch" style="background:${PROJECT_COLOR}"></span>
      <span class="row-main">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">${st.label} · ${relLabel(item.due)}</span>
      </span><span class="tag">Project</span>${CHEV}</button>`;
  }

  if (kind === 'event') {
    const sub = item.classId ? `${className(item.classId)} · ${relLabel(item.date)}` : relLabel(item.date);
    return `<button class="row" ${open}>
      <span class="swatch" style="background:${item.classId ? classColor(item.classId) : EVENT_COLOR}"></span>
      <span class="row-main">
        <span class="row-title">${esc(item.title)}</span>
        <span class="row-sub">${esc(sub)}</span>
      </span>${CHEV}</button>`;
  }

  return `<button class="row" ${open}>
    <span class="swatch" style="background:${classColor(item.classId)}"></span>
    <span class="row-main">
      <span class="row-title">${esc(item.text.split('\n')[0])}</span>
      <span class="row-sub">${esc(className(item.classId))} · Note</span>
    </span>${CHEV}</button>`;
}

function renderClass() {
  const c = byId(db.classes, state.classId);
  if (!c) { state.classId = null; return render(); }

  const hw = db.homework.filter(h => h.classId === c.id)
    .sort((a, b) => (a.done === b.done ? (a.due < b.due ? -1 : 1) : a.done ? 1 : -1));
  const notes = db.notes.filter(n => n.classId === c.id).sort((a, b) => a.date < b.date ? 1 : -1);

  const hwRows = hw.map(h => rowHTML({ kind: 'homework', item: h }, { hideClass: true })).join('');
  const noteRows = notes.map(n => `<button class="row" data-act="open" data-kind="note" data-id="${n.id}">
      <span class="row-main"><span class="note-body">${esc(n.text)}</span>
        <span class="row-sub">${dateLabel(n.date)}</span></span></button>`).join('');

  const slot = db.schedule.find(x => x.classId === c.id);
  activeSection().innerHTML = `
    <p class="back"><button class="link-btn" data-act="back">‹ Schedule</button></p>
    <section class="panel">
      <div class="panel-head"><h2>Homework</h2>
        <button class="link-btn" data-act="add" data-type="homework" data-class="${c.id}">Add</button></div>
      ${hwRows || `<p class="empty">Nothing set yet.</p>`}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Notes</h2>
        <button class="link-btn" data-act="add" data-type="note" data-class="${c.id}">Add</button></div>
      ${noteRows || `<p class="empty">No notes yet.</p>`}
    </section>
    <div class="card gap-lg">
      ${slot ? `<button class="row" data-act="period" data-period="${slot.period}">
        <span class="block-time">P${slot.period}</span>
        <span class="row-main"><span class="row-title">Period, room &amp; teacher</span>
          ${blockMeta(slot.period) ? `<span class="row-sub">${esc(blockMeta(slot.period))}</span>` : ''}
        </span>${CHEV}</button>` : ''}
      <button class="row" data-act="edit-class" data-id="${c.id}">
        <span class="swatch" style="background:${c.color}"></span>
        <span class="row-main"><span class="row-title">Edit class</span></span>${CHEV}</button>
    </div>`;
}

/* ---------------- tasks ----------------
   Homework and projects in one list, bucketed by deadline. Finished items
   drop to the bottom, but only on the next build — checking something off
   leaves it where it is, so the list never jumps under your finger. */

const TASK_GROUPS = [
  ['late', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'],
  ['week', 'This week'], ['later', 'Later'], ['done', 'Done']
];

function taskGroups() {
  const t = today(), tm = shift(t, 1), wk = shift(t, 7);
  const all = [];
  for (const h of db.homework) all.push({ kind: 'homework', item: h, due: h.due, done: !!h.done });
  for (const p of db.projects) all.push({ kind: 'project', item: p, due: p.due, done: statusOf(p).pct === 100 });
  all.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);

  const bucket = new Map(TASK_GROUPS.map(([key]) => [key, []]));
  for (const x of all) {
    bucket.get(x.done ? 'done'
      : x.due < t ? 'late'
      : x.due === t ? 'today'
      : x.due === tm ? 'tomorrow'
      : x.due <= wk ? 'week' : 'later').push(x);
  }
  return TASK_GROUPS.map(([key, title]) => ({ key, title, items: bucket.get(key) }))
    .filter(g => g.items.length);
}

/** The deadline, only where the group heading doesn't already say it. */
function dueChip(x) {
  if (x.done) return '';
  const n = daysBetween(today(), x.due);
  if (n < 0) return `<span class="due is-late">${-n}d late</span>`;
  if (n <= 1) return '';
  const d = parseISO(x.due);
  return `<span class="due">${n <= 7
    ? d.toLocaleDateString(undefined, { weekday: 'short' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
}

function taskRowHTML(x) {
  const it = x.item, hw = x.kind === 'homework';
  const st = hw ? null : statusOf(it);
  const sub = hw
    ? [className(it.classId), it.details].filter(Boolean).join(' · ')
    : `Project · ${st.label}`;
  const mark = hw
    ? `<button class="check" data-act="toggle" data-id="${it.id}" aria-pressed="${!!it.done}"
        aria-label="Mark done">${TICK}</button>`
    : `<button class="check is-project${st.id === 'doing' ? ' is-mid' : ''}" data-act="cycle"
        data-id="${it.id}" aria-label="Status: ${st.label}">${TICK}</button>`;

  // the open action sits on the outer div too, so the due chip and chevron
  // — outside the row-main button — are tappable like the rest of the row
  const open = `data-act="open" data-kind="${x.kind}" data-id="${it.id}"`;
  return `<div class="row task${x.done ? ' is-done' : ''}" ${open}>${mark}
    <button class="row-main" ${open}>
      <span class="row-title">${esc(hw ? it.title : it.name)}</span>
      ${sub ? `<span class="row-sub">${esc(sub)}</span>` : ''}
    </button>${dueChip(x)}${CHEV}</div>`;
}

function tasksHTML() {
  const groups = taskGroups();
  const body = groups.map((g, i) => `
    <div class="section-head task-in" style="--i:${i}">
      <h2>${g.title}</h2><span class="count">${g.items.length}</span></div>
    <div class="card task-in${g.key === 'done' ? ' is-finished' : ''}" style="--i:${i}"
      >${g.items.map(taskRowHTML).join('')}</div>`).join('');

  return (body || `<p class="empty">Nothing to do. Homework and projects you add show up here,
      with the closest deadline first.</p>`) +
    `<div class="card gap"><button class="row" data-act="add" data-type="homework">${PLUS}
      <span class="row-main"><span class="row-title accent">New task</span></span></button></div>`;
}

/** Re-run the tick animation on a control that is already on screen. */
function popCheck(btn) {
  btn.classList.remove('pop');
  void btn.offsetWidth;
  btn.classList.add('pop');
}



/* ---------------- home ---------------- */

function homeTitle() {
  const d = parseISO(ptNow().date);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Tonight = due tomorrow. Still due = today or already late. */
function homeWork() {
  const t = ptNow().date;
  const tm = shift(t, 1);
  const open = db.homework.filter(h => !h.done);
  return {
    tonight: open.filter(h => h.due === tm),
    due: open.filter(h => h.due <= t).sort((a, b) => a.due < b.due ? -1 : 1)
  };
}

const sectionPanel = (title, items, empty) => `<section class="panel">
    <div class="panel-head"><h2>${title}</h2>
      <button class="link-btn" data-act="add" data-type="homework">Add</button></div>
    ${items.length
      ? items.map(h => rowHTML({ kind: 'homework', item: h })).join('')
      : `<p class="empty">${empty}</p>`}
  </section>`;

const quickHTML = () => `<div class="quick">
    <button class="btn" data-act="add" data-type="homework">Add homework</button>
    <div class="chips">
      <button class="chip" data-act="add" data-type="note">Note</button>
      <button class="chip" data-act="add" data-type="project">Project</button>
      <button class="chip" data-act="add" data-type="event">Date</button>
    </div>
  </div>`;

const tonightHTML = () => sectionPanel('Do tonight', homeWork().tonight, 'Nothing due tomorrow.');
const dueHTML = () => sectionPanel('Still due', homeWork().due, 'Nothing outstanding. Enjoy it.');

/* ---------------- schedule view ---------------- */

let tickTimer = null, tickKey = '';

/** Identifies the current block, so the tick knows when to redraw the list. */
const posKey = pos => pos.state + '|' + (pos.block ? pos.block.start : (pos.next ? pos.next.start : ''));

/** Just the hero card. The day's block list is the bell block's job now. */
function heroHTML(plan, pos, now) {
  const dayName = parseISO(now.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  let tone = '', label = '', title = '', time = '', sub = '', bar = '', meta = '';

  if (pos.state === 'none') {
    label = dayName;
    title = 'No school today';
    sub = 'Enjoy it.';
  } else if (pos.state === 'before') {
    label = 'Starts soon';
    title = blockTitle(pos.next);
    time = countdown(pos.until);
    sub = `until ${clockLabel(pos.next.start)}`;
  } else if (pos.state === 'in') {
    tone = 'is-live';
    label = pos.block.period ? pos.block.label : 'Right now';
    title = blockTitle(pos.block);
    time = countdown(pos.left);
    sub = `left \u00b7 ends ${clockLabel(pos.block.end)}`;
    meta = blockMeta(pos.block.period);
    bar = `<span class="hero-bar"><span style="width:${Math.round(pos.elapsed / pos.total * 100)}%"></span></span>`;
  } else if (pos.state === 'passing') {
    tone = 'is-live';
    label = 'Passing period';
    title = blockTitle(pos.next);
    time = countdown(pos.until);
    sub = `until ${clockLabel(pos.next.start)}`;
  } else {
    label = dayName;
    title = 'School\u2019s out';
    sub = 'Done for the day.';
  }

  return `<div class="hero ${tone}">
      <div class="hero-label">${esc(label)}</div>
      <div class="hero-title">${esc(title)}</div>
      ${time ? `<div class="hero-time">${time}</div>` : ''}
      <div class="hero-sub">${esc(sub)}</div>
      ${meta ? `<div class="hero-meta">${esc(meta)}</div>` : ''}
      ${bar}
    </div>`;
}

function blocksHTML(pos) {
  const active = pos.block;
  return pos.blocks.map(b => {
    const cls = periodClass(b.period);
    const isNow = active && b.start === active.start;
    const done = pos.state === 'after' || (active && hhmmToSecs(b.end) <= hhmmToSecs(active.start));
    const sub = [cls ? esc(b.label) : '', esc(blockMeta(b.period))].filter(Boolean).join(' · ');
    return `<div class="row block${isNow ? ' is-now' : ''}${done ? ' is-past' : ''}">
      <span class="block-time"><b>${clockLabel(b.start)}</b>${clockLabel(b.end)}</span>
      <span class="row-main">
        <span class="row-title">${esc(cls ? cls.name : b.label)}</span>
        ${sub ? `<span class="row-sub">${sub}</span>` : ''}
      </span>
      ${cls ? `<span class="swatch" style="background:${cls.color}"></span>` : ''}
    </div>`;
  }).join('');
}

/** "Odd day" — only for schools that actually rotate. Tap to correct it. */
function rotChip(date) {
  const names = rotNames();
  if (!names) return '';
  const set = !!prefs.rot?.[prefs.school];
  return `<button class="rot-chip${set ? '' : ' is-unset'}" data-act="rot-flip">
    ${set ? esc(names[rotIndex(date)]) : 'Which day is today?'}</button>`;
}

/** The whole day's bell schedule under its plan name, with Change. */
function bellHTML() {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);
  tickKey = posKey(pos);
  if (!plan) return '';
  return `<div class="section-head"><h2>${esc(plan.name)}</h2>
      ${rotChip(now.date)}
      <button class="link-btn" data-act="pick-plan">Change</button></div>
    <div class="card">${blocksHTML(pos)}</div>`;
}

/* Periods and classes are one section: a period row opens that class (its
   homework and notes), an empty one asks which class to put there, and any
   class without a period is listed underneath. */
function periodsHTML() {
  const rNow = ptNow();
  const rPlan = planFor(rNow.date, rNow.weekday);
  const meeting = new Set((rPlan ? rPlan.rows : [])
    .map(r => rowPeriod(r, rNow.date)).filter(Boolean));
  const rotates = !!rotNames();

  const rows = periodList().map(n => {
    const cls = periodClass(n);
    const meta = blockMeta(n);
    const open = cls ? `data-act="class" data-id="${cls.id}"` : `data-act="period" data-period="${n}"`;
    const meetsToday = rotates && meeting.has(n);
    return `<button class="row${rotates && !meetsToday ? ' is-offday' : ''}" ${open}>
      <span class="block-time">P${n}${meetsToday ? '<b class="rot-dot">today</b>' : ''}</span>
      <span class="row-main">
        <span class="row-title${cls ? '' : ' is-muted'}">${cls ? esc(cls.name) : 'Add a class'}</span>
        ${meta ? `<span class="row-sub">${esc(meta)}</span>` : ''}
      </span>
      ${cls ? `<span class="swatch" style="background:${cls.color}"></span>` : ''}${CHEV}</button>`;
  }).join('');

  const placed = new Set(db.schedule.map(x => x.classId));
  const spare = db.classes.filter(c => !placed.has(c.id)).map(c => {
    const hw = db.homework.filter(h => h.classId === c.id && !h.done).length;
    return `<button class="row" data-act="class" data-id="${c.id}">
      <span class="block-time">—</span>
      <span class="row-main"><span class="row-title">${esc(c.name)}</span>
        <span class="row-sub">${hw} open</span></span>
      <span class="swatch" style="background:${c.color}"></span>${CHEV}</button>`;
  }).join('');

  const none = !periodList().length;
  return `<div class="section-head"><h2>Classes &amp; periods</h2>${rotChip()}</div>
    ${none && BELL.note ? `<p class="empty">${esc(BELL.note)}</p>` : ''}
    <div class="card">${rows}${spare}
      <button class="row" data-act="new-class">${PLUS}
        <span class="row-main"><span class="row-title accent">New class</span></span></button>
    </div>`;
}

/** Update the countdown in place every second; redraw fully when the block changes. */
function tick() {
  if (document.visibilityState !== 'visible') return stopTick();
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);

  // crossing a block boundary changes more than the numbers: redraw the page
  if (posKey(pos) !== tickKey) return render();

  const time = q('.hero-time');
  if (time) time.textContent = countdown(pos.state === 'in' ? pos.left : pos.until);
  const bar = q('.hero-bar > span');
  if (bar && pos.state === 'in') bar.style.width = `${Math.round(pos.elapsed / pos.total * 100)}%`;
  const nu = q('[data-nextup]');
  if (nu) nu.innerHTML = nextUpLine(plan, pos);
  for (const el of activeSection().querySelectorAll('[data-live]')) {
    const fn = LIVE_INNER[el.dataset.live];
    if (fn) el.innerHTML = fn(plan, pos) || el.innerHTML;
  }
}

function startTick() {
  stopTick();
  tickTimer = setInterval(tick, 1000);
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function openPeriodSheet(period) {
  const slot = byId(db.schedule, `p${period}`);
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Period ${period}</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <form id="form" novalidate>
      ${classField(slot?.classId)}
      <div class="field-row">
        <div class="field"><label for="f-room">Room <span class="opt">(optional)</span></label>
          <input id="f-room" type="text" value="${esc(slot?.room)}" placeholder="402" autocapitalize="characters"></div>
        <div class="field"><label for="f-teacher">Teacher <span class="opt">(optional)</span></label>
          <input id="f-teacher" type="text" value="${esc(slot?.teacher)}" placeholder="Mr. Diaz" autocapitalize="words"></div>
      </div>
      <button class="btn" type="submit">Save</button>
      ${slot ? '<button class="btn is-ghost" type="button" data-act="period-clear">Remove from schedule</button>' : ''}
    </form>`, { mode: 'period', period, autofocus: false });
}

function openPlanSheet() {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const rows = BELL.pickable.map(key => `<button class="row" data-act="set-plan" data-key="${key}">
      <span class="row-main"><span class="row-title">${esc(BELL.schedules[key].name)}</span>
      <span class="row-sub">${clockLabel(BELL.schedules[key].rows[0][1])} – ${clockLabel(BELL.schedules[key].rows.at(-1)[2])}</span></span>
      ${plan && plan.key === key ? TICK_ACCENT : ''}</button>`).join('');
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Today\u2019s schedule</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    <p class="hint">Only for today. Tomorrow goes back to the normal bell schedule.</p>
    <div class="card">${rows}</div>
    ${byId(db.overrides, now.date) ? '<button class="btn is-ghost" type="button" data-act="clear-plan">Use the normal schedule</button>' : ''}`,
    { mode: 'plan', autofocus: false });
}

/* ---------------- sheet ---------------- */

const wrap = $('#sheetWrap'), sheet = $('#sheet');
let ctx = null;   // { mode, type, id, seed, color }

/* Locking with `overflow: hidden` alone collapses the scrollable area and the
   browser clamps the offset, so the page behind jumps. Pin the body instead
   and put the offset back on close. */
let lockedAt = 0;

function lockPage() {
  // Already pinned: scrollY reads 0 while the body is fixed, so locking a
  // second time (paging a sheet, switching the add type) would forget where
  // the page actually was and drop it at the top on close.
  if (document.body.classList.contains('is-locked')) return;
  lockedAt = window.scrollY || 0;
  document.body.style.top = `-${lockedAt}px`;
  document.body.classList.add('is-locked');
}

function unlockPage() {
  if (!document.body.classList.contains('is-locked')) return;
  document.body.classList.remove('is-locked');
  document.body.style.top = '';
  window.scrollTo(0, lockedAt);
}

function openSheet(html, context) {
  ctx = context || null;
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  wrap.hidden = false;
  lockPage();
  sheet.scrollTop = 0;
  // preventScroll: focusing a field inside the overlay would otherwise scroll
  // the page behind it, so the list you came from jumps while you type.
  if (ctx?.autofocus !== false) sheet.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
  fitSheet();
}

function closeSheet() {
  wrap.hidden = true;
  sheet.innerHTML = '';
  sheet.style.bottom = sheet.style.maxHeight = '';
  ctx = null;
  unlockPage();
}

/* Keep the sheet above the iOS keyboard. */
const vv = window.visualViewport;
function fitSheet() {
  if (!vv || wrap.hidden) return;
  const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  sheet.style.bottom = overlap ? `${overlap}px` : '';
  sheet.style.maxHeight = overlap ? `${vv.height - 12}px` : '';
}
if (vv) {
  vv.addEventListener('resize', fitSheet);
  vv.addEventListener('scroll', fitSheet);
}

const TYPES = [
  { id: 'homework', label: 'Homework' },
  { id: 'note', label: 'Note' },
  { id: 'project', label: 'Project' },
  { id: 'event', label: 'Date' }
];

/** The day new items land on: the day you're looking at, otherwise today. */
const baseDate = () => (activeHas('month') && state.selected !== today()) ? state.selected : today();

/** Due dates default forward only when you're on today (homework → tomorrow). */
const defaultDue = offset => baseDate() === today() ? shift(today(), offset) : baseDate();

/** `optional` adds a "No class" choice and skips forcing "New class…" as the
    default pick when there are no classes yet — a date isn't always tied to
    one, unlike homework or a note. */
function classField(selected, { optional = false } = {}) {
  const showNew = !optional && !db.classes.length;
  const none = optional ? `<option value=""${!selected ? ' selected' : ''}>No class</option>` : '';
  const options = none + db.classes.map(c =>
    `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('') +
    `<option value="__new"${showNew ? ' selected' : ''}>New class…</option>`;
  return `<div class="field"><label for="f-class">Class${optional ? ' <span class="opt">(optional)</span>' : ''}</label>
      <select id="f-class">${options}</select></div>
    <div class="field" id="newClassField"${showNew ? '' : ' hidden'}>
      <label for="f-newclass">New class name</label>
      <input id="f-newclass" type="text" placeholder="e.g. Biology" autocapitalize="words" enterkeyhint="done"></div>`;
}

function formHTML(type, v = {}) {
  if (type === 'homework') return `
    <div class="field"><label for="f-title">Title</label>
      <input id="f-title" type="text" data-autofocus value="${esc(v.title)}" placeholder="Worksheet 3"
        autocapitalize="sentences" enterkeyhint="done"></div>
    ${classField(v.classId)}
    <div class="field"><label for="f-due">Due</label>
      <input id="f-due" type="date" value="${esc(v.due || defaultDue(prefs.due))}"></div>
    <div class="field"><label for="f-details">Details <span class="opt">(optional)</span></label>
      <textarea id="f-details" rows="2" placeholder="Pages 40–42" autocapitalize="sentences">${esc(v.details)}</textarea></div>`;

  if (type === 'note') return `
    ${classField(v.classId)}
    <div class="field"><label for="f-text">Note</label>
      <textarea id="f-text" rows="4" data-autofocus placeholder="Test covers chapters 4–6"
        autocapitalize="sentences">${esc(v.text)}</textarea></div>
    <div class="field"><label for="f-date">Date</label>
      <input id="f-date" type="date" value="${esc(v.date || baseDate())}"></div>`;

  if (type === 'project') return `
    <div class="field"><label for="f-name">Project</label>
      <input id="f-name" type="text" data-autofocus value="${esc(v.name)}" placeholder="History essay"
        autocapitalize="sentences" enterkeyhint="done"></div>
    <div class="field"><label for="f-due">Due</label>
      <input id="f-due" type="date" value="${esc(v.due || defaultDue(7))}"></div>
    <div class="field"><label for="f-status">Status</label>
      <select id="f-status">${STATUSES.map(s =>
        `<option value="${s.id}"${s.id === (v.status || 'todo') ? ' selected' : ''}>${s.label}</option>`).join('')}</select></div>
    <div class="field"><label for="f-desc">Description <span class="opt">(optional)</span></label>
      <textarea id="f-desc" rows="2" autocapitalize="sentences">${esc(v.description)}</textarea></div>`;

  return `
    <div class="field"><label for="f-title">Title</label>
      <input id="f-title" type="text" data-autofocus value="${esc(v.title)}" placeholder="Field trip"
        autocapitalize="sentences" enterkeyhint="done"></div>
    ${classField(v.classId, { optional: true })}
    <div class="field"><label for="f-date">Date</label>
      <input id="f-date" type="date" value="${esc(v.date || baseDate())}"></div>
    <div class="field"><label for="f-details">Details <span class="opt">(optional)</span></label>
      <textarea id="f-details" rows="2" autocapitalize="sentences">${esc(v.details)}</textarea></div>`;
}

function openAdd(seed = {}) {
  const type = seed.type || 'homework';
  // the class you're in (or just left) is almost always the right answer
  let guessed = false;
  if (!seed.classId && (type === 'homework' || type === 'note')) {
    const g = guessClass();
    if (g) { seed = { ...seed, classId: g }; guessed = true; }
  }
  const segs = TYPES.map(t =>
    `<button type="button" data-act="type" data-type="${t.id}"${t.id === type ? ' class="is-active"' : ''}>${t.label}</button>`).join('');

  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">New</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <div class="segmented">${segs}</div>
    <form id="form" novalidate>${formHTML(type, { classId: seed.classId })}
      <button class="btn" type="submit">Add</button>
    </form>`, { mode: 'add', type, seed });
  if (guessed) tip('guess', '.sheet #f-class', { round: 15, delay: 560 });
}

function openEdit(kind, id) {
  const item = byId(db[LISTS[kind]], id);
  if (!item) return;
  const titles = { homework: 'Homework', note: 'Note', project: 'Project', event: 'Date' };
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">${titles[kind]}</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <form id="form" novalidate>${formHTML(kind, item)}
      <button class="btn" type="submit">Save</button>
      <button class="btn is-ghost" type="button" data-act="delete">Delete</button>
    </form>`, { mode: 'edit', type: kind, id, autofocus: false });
}

function openClassSheet(id) {
  const c = id ? byId(db.classes, id) : null;
  const color = c ? c.color : COLORS[db.classes.length % COLORS.length];
  const swatches = COLORS.map(col =>
    `<button type="button" class="color${col === color ? ' is-on' : ''}" data-act="color" data-color="${col}"
      style="background:${col}" aria-label="Color ${col}"></button>`).join('');

  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">${c ? 'Edit Class' : 'New Class'}</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <form id="form" novalidate>
      <div class="field"><label for="f-name">Name</label>
        <input id="f-name" type="text" data-autofocus value="${esc(c?.name)}" placeholder="Math"
          autocapitalize="words" enterkeyhint="done"></div>
      <div class="field"><label>Color</label><div class="colors">${swatches}</div></div>
      <label class="check-row"><input type="checkbox" id="f-honors"${c?.h ? ' checked' : ''}>
        <span>Honors / AP <span class="opt">(weighs GPA +1)</span></span></label>
      <button class="btn" type="submit">${c ? 'Save' : 'Add Class'}</button>
      ${c ? '<button class="btn is-ghost" type="button" data-act="delete">Delete Class</button>' : ''}
    </form>`, { mode: 'class', id: id || null, color, autofocus: !c });
}

/* ---------------- saving ---------------- */

const val = sel => sheet.querySelector(sel)?.value.trim() ?? '';

/** Read the class picker, creating the class when "New class…" is chosen. */
function resolveClass() {
  const sel = sheet.querySelector('#f-class');
  if (!sel) return null;
  if (sel.value !== '__new') return sel.value;
  const name = val('#f-newclass');
  if (!name) return null;
  const c = touch({ id: uid(), name, color: COLORS[db.classes.length % COLORS.length] });
  db.classes.push(c);
  return c.id;
}

function submitForm() {
  if (!ctx) return;
  const editing = ctx.mode === 'edit';
  if (ctx.mode === 'add' && ctx.type) {
    stats.usage[ctx.type] = (stats.usage[ctx.type] | 0) + 1;
    saveStats();
  }

  if (ctx.mode === 'pg-icon') {
    const v = val('#ic-in');
    if (!v) return flash('#ic-in');
    const pg = pageById(ctx.pgId);
    if (pg) { pg.icon = v.slice(0, 4); saveLayout(); renderTabs(); }
    openPagesSheet();
    return;
  }

  if (ctx.mode === 'grade') {
    const name = val('#g-name');
    const score = parseFloat(val('#g-score'));
    const max = parseFloat(val('#g-max')) || 100;
    if (!name) return flash('#g-name');
    if (isNaN(score)) return flash('#g-score');
    db.grades.push(touch({ id: uid(), classId: ctx.classId, name, score, max }));
    return commit();
  }

  if (ctx.mode === 'link') {
    const label = val('#l-label');
    let url = val('#l-url');
    if (!label) return flash('#l-label');
    if (!url) return flash('#l-url');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const classId = resolveClass();
    if (classId === null) return flash('#f-newclass');
    const data = { label, url, classId };
    if (ctx.id) touch(Object.assign(byId(db.links, ctx.id), data));
    else db.links.push(touch({ id: uid(), ...data }));
    return commit();
  }

  if (ctx.mode === 'recur') {
    const title = val('#r-title');
    if (!title) return flash('#r-title');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    db.recurs.push(touch({ id: uid(), title, classId }));
    ensureRecur();
    return commit();
  }

  if (ctx.mode === 'blk-opts') {
    const pg = activePage();
    const b = pg.blocks.find(x => x.id === ctx.bid);
    const def = b && BLOCKS[b.t];
    if (def?.read) b.cfg = { ...(b.cfg || {}), ...def.read() };
    closeSheet();
    return commitLayout();
  }

  if (ctx.mode === 'period') {
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const id = `p${ctx.period}`;
    const data = { classId, room: val('#f-room'), teacher: val('#f-teacher') };
    const slot = byId(db.schedule, id);
    if (slot) touch(Object.assign(slot, data));
    else db.schedule.push(touch({ id, period: ctx.period, ...data }));
    return commit();
  }

  if (ctx.mode === 'class') {
    const name = val('#f-name');
    if (!name) return flash('#f-name');
    const h = sheet.querySelector('#f-honors')?.checked ? 1 : 0;
    if (ctx.id) touch(Object.assign(byId(db.classes, ctx.id), { name, color: ctx.color, h }));
    else db.classes.push(touch({ id: uid(), name, color: ctx.color, h }));
    return commit();
  }

  if (ctx.type === 'homework') {
    const title = val('#f-title');
    if (!title) return flash('#f-title');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const data = { title, classId, due: val('#f-due') || shift(today(), 1), details: val('#f-details') };
    if (editing) touch(Object.assign(byId(db.homework, ctx.id), data));
    else db.homework.push(touch({ id: uid(), done: false, createdAt: stamp(), ...data }));

  } else if (ctx.type === 'note') {
    const text = val('#f-text');
    if (!text) return flash('#f-text');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const data = { text, classId, date: val('#f-date') || today() };
    if (editing) touch(Object.assign(byId(db.notes, ctx.id), data));
    else db.notes.push(touch({ id: uid(), ...data }));

  } else if (ctx.type === 'project') {
    const name = val('#f-name');
    if (!name) return flash('#f-name');
    const data = {
      name, due: val('#f-due') || shift(today(), 7),
      status: val('#f-status') || 'todo', description: val('#f-desc')
    };
    if (editing) touch(Object.assign(byId(db.projects, ctx.id), data));
    else db.projects.push(touch({ id: uid(), ...data }));

  } else {
    const title = val('#f-title');
    if (!title) return flash('#f-title');
    // resolveClass() returns '' for "No class" (fine here) and null only when
    // "New class…" was picked and left blank — that's the one real error
    const classId = resolveClass();
    if (classId === null) return flash('#f-newclass');
    const data = { title, classId, date: val('#f-date') || today(), details: val('#f-details') };
    if (editing) touch(Object.assign(byId(db.events, ctx.id), data));
    else db.events.push(touch({ id: uid(), ...data }));
  }
  commit();
}

function commit() {
  save();
  closeSheet();
  render();
}

function flash(sel) {
  const el = sheet.querySelector(sel);
  if (!el) return;
  el.classList.add('is-bad');
  el.focus({ preventScroll: true });
}

function removeItem() {
  if (!ctx) return;
  if (ctx.mode === 'period') {
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const id = `p${ctx.period}`;
    const data = { classId, room: val('#f-room'), teacher: val('#f-teacher') };
    const slot = byId(db.schedule, id);
    if (slot) touch(Object.assign(slot, data));
    else db.schedule.push(touch({ id, period: ctx.period, ...data }));
    return commit();
  }

  if (ctx.mode === 'class') {
    const c = byId(db.classes, ctx.id);
    if (!confirmMaybe(`Delete “${c?.name}” and its homework and notes?`)) return;
    for (const x of db.homework) if (x.classId === ctx.id) tombstone(x.id);
    for (const x of db.notes) if (x.classId === ctx.id) tombstone(x.id);
    tombstone(ctx.id);
    db.classes = db.classes.filter(x => x.id !== ctx.id);
    db.homework = db.homework.filter(x => x.classId !== ctx.id);
    db.notes = db.notes.filter(x => x.classId !== ctx.id);
    state.classId = null;
    return commit();
  }
  const key = LISTS[ctx.type];
  tombstone(ctx.id);
  db[key] = db[key].filter(x => x.id !== ctx.id);
  commit();
}


/* ---------------- focus sessions ----------------
   Only the plan and the moment it started are stored, so every device derives
   the same phase from the wall clock. Nothing needs to stream second by
   second — a device that learns about the session once stays in step on its
   own, and a phone that was asleep catches up the instant it wakes. */

const FOCUS_ID = 'session';
const DEFAULT_PLAN = { totalMs: 30 * 60000, breaks: 2, breakMs: 5 * 60000 };
const REMINDER_LEAD = 60000;          // soft chime one minute before a break ends

/* field -> [step, smallest, largest] for the − value + controls */
const FOCUS_LIMITS = { total: [5, 5, 240], breaks: [1, 0, 8], breakLen: [1, 1, 60] };

const session = () => byId(db.focus, FOCUS_ID);

/** The plan to start next: whatever was used last, else a sensible default. */
function focusPlan() {
  const s = session();
  return s ? { totalMs: s.totalMs, breaks: s.breaks, breakMs: s.breakMs } : { ...DEFAULT_PLAN };
}

const focusSpan = s => s.totalMs + s.breaks * s.breakMs;

/** Where a session is right now: a study stretch, a break, or finished. */
function focusPhase(s, now) {
  if (!s || !s.startedAt) return { kind: 'idle' };
  if (s.endedAt) return { kind: 'idle' };
  let t = now - s.startedAt;
  if (t < 0) t = 0;
  if (t >= focusSpan(s)) return { kind: 'done', endsAt: s.startedAt + focusSpan(s) };

  const segMs = s.totalMs / (s.breaks + 1);
  for (let i = 0; i <= s.breaks; i++) {
    if (t < segMs) {
      return { kind: 'focus', index: i, of: s.breaks + 1, left: segMs - t, total: segMs,
               endsAt: now + (segMs - t) };
    }
    t -= segMs;
    if (i < s.breaks) {
      if (t < s.breakMs) {
        return { kind: 'break', index: i, of: s.breaks, left: s.breakMs - t, total: s.breakMs,
                 endsAt: now + (s.breakMs - t) };
      }
      t -= s.breakMs;
    }
  }
  return { kind: 'done', endsAt: s.startedAt + focusSpan(s) };
}

const focusActive = () => {
  const s = session();
  return !!s && !s.endedAt && Date.now() < s.startedAt + focusSpan(s);
};

/* A phone gets the restriction screen; anything with a real pointer or a wide
   window carries on as normal. Nothing to configure — it just reads the
   device it is running on. */
const isPhone = () => matchMedia('(max-width: 820px)').matches && matchMedia('(pointer: coarse)').matches;

/* A session begun on the computer has no way out anywhere: the point is that
   it cannot be talked out of. One begun on the phone can be ended from the
   phone, and only by holding the button down. */
function canExitHere() {
  const s = session();
  if (!s) return false;
  return isPhone() ? s.startedOn === 'phone' : true;   // a computer can always stop it
}

function startFocus(plan) {
  const now = stamp();
  const data = { startedAt: now, totalMs: plan.totalMs, breaks: plan.breaks, breakMs: plan.breakMs,
                 startedOn: isPhone() ? 'phone' : 'computer', endedAt: null };
  const s = session();
  if (s) touch(Object.assign(s, data));
  else db.focus.push(touch({ id: FOCUS_ID, ...data }));
  alarmDismissed = -1;
  audioUnlock();
  save();
  render();
}

function endFocus() {
  const s = session();
  if (!s) return;
  if (stamp() - s.startedAt > 10 * 60000) { stats.focusDays[today()] = 1; saveStats(); }
  touch(Object.assign(s, { endedAt: stamp() }));
  stopAlarm();
  audioRelease();
  save();
  render();
  paintLock();      // drop the lock now rather than on the next tick
}

/* ---------------- sound ----------------
   Started from the tap that begins a session, so it counts as user-initiated
   audio. A silent loop keeps the output alive while the phone is idle, and
   the chime and alarm are scheduled on the audio clock rather than with
   setTimeout, so they still fire when the page is backgrounded and JS timers
   are being throttled. */

let actx = null, keepAlive = null, alarmNodes = [], alarmOn = false, alarmDismissed = -1;

function audioUnlock() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!keepAlive) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      gain.gain.value = 0.0001;              // inaudible, but keeps the output open
      osc.frequency.value = 40;
      osc.connect(gain).connect(actx.destination);
      osc.start();
      keepAlive = { osc, gain };
    }
    silentLoop();
  } catch {}
}

/** iOS keeps a page's audio running in the background while a media element is
    playing, so a looping silent clip buys us the alarm later on. */
function silentLoop() {
  let el = $('#silence');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'silence';
    el.loop = true;
    el.setAttribute('playsinline', '');
    // 0.1s of silence
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
    document.body.appendChild(el);
  }
  el.play().catch(() => {});
}

function audioRelease() {
  $('#silence')?.pause();
}

function beep(at, freq, ms, vol = 0.22) {
  if (!actx) return null;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.02);
  gain.gain.setValueAtTime(vol, at + ms / 1000 - 0.05);
  gain.gain.linearRampToValueAtTime(0, at + ms / 1000);
  osc.connect(gain).connect(actx.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
  return osc;
}

/** Two soft notes, a minute before the break ends. */
function playReminder(inMs) {
  if (!actx) return;
  const at = actx.currentTime + Math.max(0, inMs) / 1000;
  beep(at, 660, 260, 0.16);
  beep(at + 0.32, 880, 320, 0.16);
}

/** Insistent, and pre-scheduled so it rings even if this tab is frozen. */
function startAlarm(inMs = 0) {
  if (!actx || alarmOn) return;
  alarmOn = true;
  const base = actx.currentTime + Math.max(0, inMs) / 1000;
  for (let i = 0; i < 300; i++) {           // ~10 minutes of ringing
    const at = base + i * 2;
    alarmNodes.push(beep(at, 880, 220, 0.3), beep(at + 0.3, 990, 220, 0.3), beep(at + 0.6, 880, 260, 0.3));
  }
}

function stopAlarm() {
  alarmOn = false;
  for (const n of alarmNodes) { try { n && n.stop(); } catch {} }
  alarmNodes = [];
}


/* ---------------- focus screens ---------------- */

const mmss = ms => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

const LOCK_LINES = [
  'Stay with what you are working on right now.',
  'Beat the urge to check your phone.',
  'Keep going until the timer ends.',
  'You can check it when the session is over.'
];

function renderFocus() {
  if (activeHas('focus') && !state.classId) render();
}

function focusHTML() {
  const s = session();
  const phase = focusPhase(s, Date.now());
  const plan = focusPlan();

  if (focusActive()) {
    const label = phase.kind === 'break'
      ? `Break ${phase.index + 1} of ${phase.of}`
      : `Stretch ${phase.index + 1} of ${phase.of}`;
    return `
      <div class="calm ${phase.kind === 'break' ? 'is-break' : ''}">
        <p class="calm-label">${label}</p>
        <p class="calm-time">${mmss(phase.left)}</p>
        <p class="calm-note">${phase.kind === 'break'
          ? 'Break — your phone is free until this runs out.'
          : 'Your phone is put away. Keep going.'}</p>
        <span class="calm-bar"><span style="width:${Math.round((1 - phase.left / phase.total) * 100)}%"></span></span>
        <button class="stop-btn" data-act="hold-stop"><span class="hold-fill"></span>
          <span class="hold-text">HOLD TO STOP</span></button>
        <p class="stop-hint">Hold for 7 seconds</p>
      </div>`;
  }

  const step = (field, label, value, unit) => `
    <div class="step">
      <span class="step-label">${label}</span>
      <div class="step-row">
        <button class="step-btn" data-act="focus-step" data-field="${field}" data-dir="-1" aria-label="Less ${label}">−</button>
        <span class="step-value">
          <input class="step-input" type="text" inputmode="numeric" data-field="${field}"
            value="${value}" aria-label="${label}">${unit ? `<span class="step-unit">${unit}</span>` : ''}
        </span>
        <button class="step-btn" data-act="focus-step" data-field="${field}" data-dir="1" aria-label="More ${label}">+</button>
      </div>
    </div>`;

  return `
    <div class="focus-setup">
      ${step('total', 'Focus time', plan.totalMs / 60000, 'min')}
      ${step('breaks', 'Breaks', plan.breaks, '')}
      ${plan.breaks ? step('breakLen', 'Break length', plan.breakMs / 60000, 'min') : ''}
      <p class="focus-summary">${focusSummary(plan)}</p>
      ${(() => { const e = estimateTonight().mins;
        const sug = e >= 10 ? Math.min(240, Math.max(15, Math.round(e / 5) * 5)) : 0;
        return sug && sug !== plan.totalMs / 60000
          ? `<button class="chip focus-sug" data-act="focus-suggest" data-min="${sug}">Suggested: ${sug} min \u2014 sized to tonight</button>` : '';
      })()}
      <button class="btn" data-act="focus-start">Start focus</button>
    </div>`;
}

function focusSummary(p) {
  const mins = p.totalMs / 60000;
  return p.breaks
    ? `${mins} min focus → ${p.breaks} break${p.breaks > 1 ? 's' : ''} → ${p.breakMs / 60000} min each`
    : `${mins} min focus, no breaks`;
}

/** Write one field back into the stored plan, clamped to something sensible. */
function setFocusField(field, minutes) {
  const [, low, high] = FOCUS_LIMITS[field];
  const v = Math.min(high, Math.max(low, minutes));
  const plan = focusPlan();
  if (field === 'total') plan.totalMs = v * 60000;
  if (field === 'breaks') plan.breaks = v;
  if (field === 'breakLen') plan.breakMs = v * 60000;
  const s = session();
  if (s) touch(Object.assign(s, plan));
  else db.focus.push(touch({ id: FOCUS_ID, startedAt: 0, endedAt: null, ...plan }));
  save();
  return v;
}

const fieldValue = (field, plan) =>
  field === 'total' ? plan.totalMs / 60000 : field === 'breaks' ? plan.breaks : plan.breakMs / 60000;

const clockOf = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The full-screen phone states. Nothing else on the page is reachable. */
function paintLock() {
  const lock = $('#lock');
  const s = session();
  const phase = focusPhase(s, Date.now());
  const show = focusActive() && isPhone();

  if (!show) {
    if (!lock.hidden) {
      lock.hidden = true;
      lock.innerHTML = '';
      lock.dataset.mode = '';   // clear it, or the next session in the same mode never rebuilds
      document.body.classList.remove('is-locked');
    }
    return;
  }

  const ringing = phase.kind === 'focus' && phase.index > 0 && alarmDismissed < phase.index;
  const mode = ringing ? 'alarm' : phase.kind;

  if (lock.dataset.mode !== mode) {
    lock.dataset.mode = mode;
    lock.className = `lock is-${mode}`;
    const syncBtn = `<button class="lock-sync" data-act="lock-sync">Sync</button>`;
    lock.innerHTML = mode === 'break' ? `
        <div class="lock-label">Break ${phase.index + 1} of ${phase.of}</div>
        <div class="lock-big">HAVE FUN</div>
        <div class="lock-time" id="lockTime">${mmss(phase.left)}</div>
        <div class="lock-note">Back to it when this hits zero.</div>
        ${syncBtn}`
      : mode === 'alarm' ? `
        <div class="lock-big">TIME'S UP</div>
        <div class="lock-note">Hold the button to stop the alarm and start studying.</div>
        <button class="hold" data-act="hold-study"><span class="hold-fill"></span>
          <span class="hold-text">I WILL STUDY NOW</span></button>
        ${syncBtn}`
      : `
        <div class="lock-label">Stretch ${phase.index + 1} of ${phase.of}</div>
        <div class="lock-big">DO NOT USE</div>
        <div class="lock-time" id="lockTime">${mmss(phase.left)}</div>
        <p class="lock-line" id="lockLine">${LOCK_LINES[0]}</p>
        ${syncBtn}
        ${canExitHere() ? `<button class="lock-out" data-act="hold-end"><span class="hold-fill"></span>
          <span class="hold-text">Hold to end</span></button>` : ''}`;
    lock.hidden = false;
    if (!wrap.hidden) closeSheet();   // don't leave a sheet stranded under the lock
    document.body.classList.add('is-locked');
  } else {
    const t = $('#lockTime');
    if (t) t.textContent = mmss(phase.left);
  }

  // one sentence at a time, changed slowly enough to stay calm
  const line = $('#lockLine');
  if (line) {
    const i = Math.floor(Date.now() / 15000) % LOCK_LINES.length;
    if (line.dataset.i !== String(i)) {
      line.dataset.i = String(i);
      line.classList.remove('is-in');
      void line.offsetWidth;
      line.textContent = LOCK_LINES[i];
      line.classList.add('is-in');
    }
  }
}

/** A quiet strip on the computer so it is obvious a session is running. */
function paintFocusBanner() {
  let bar = $('#focusBar');
  const on = focusActive() && !isPhone();
  if (!on) { bar?.remove(); document.body.classList.remove('has-focusbar'); return; }
  const phase = focusPhase(session(), Date.now());
  if (!bar) {
    bar = document.createElement('button');
    bar.id = 'focusBar';
    bar.className = 'focus-bar';
    bar.dataset.act = 'tab';
    bar.dataset.to = 'focus';
    document.body.appendChild(bar);
  }
  bar.classList.toggle('is-break', phase.kind === 'break');
  bar.innerHTML = `<span class="dot"></span>
    <span>${phase.kind === 'break' ? 'Break' : 'Focus'} · ${mmss(phase.left)} left</span>
    <span class="focus-bar-note">${phase.kind === 'break' ? 'phone is on break' : 'phone is locked'}</span>`;
  document.body.classList.add('has-focusbar');
}

/* The lock hides everything else, so this is the only way to make the phone
   check in when it hasn't picked up a change on its own yet. */
let lockSyncTimer = null;

async function lockSync(btn) {
  const say = (text, ms = 2200) => {
    btn.textContent = text;
    clearTimeout(lockSyncTimer);
    lockSyncTimer = setTimeout(() => { btn.textContent = 'Sync'; btn.classList.remove('is-busy'); }, ms);
  };
  if (!sync.code) return say('Sync is off');
  if (sync.busy) return;

  btn.classList.add('is-busy');
  btn.textContent = 'Checking…';
  clearTimeout(lockSyncTimer);
  await syncNow();
  btn.classList.remove('is-busy');
  if (!focusActive()) return;                  // the session ended: the lock is on its way out
  say(sync.status === 'error' ? (sync.note || 'No connection') : 'Up to date');
}

/* One clock drives the whole thing: it repaints the lock screen, keeps the
   banner honest, and fires the chime and alarm at the right moments. */
let focusWatch = null, lastPhaseKey = '';

function focusTick() {
  const s = session();
  if (!focusActive()) {
    if (lastPhaseKey) { lastPhaseKey = ''; stopAlarm(); render(); }
    paintLock(); paintFocusBanner();
    return;
  }
  const phase = focusPhase(s, Date.now());
  const key = phase.kind + phase.index;

  if (key !== lastPhaseKey) {
    lastPhaseKey = key;
    if (phase.kind === 'break') {
      // both are pinned to the audio clock now, so a sleeping tab still rings
      playReminder(phase.left - REMINDER_LEAD);
      startAlarm(phase.left);
    }
    if (state.tab === 'focus') renderFocus();
  }
  paintLock();
  paintFocusBanner();
  if (!isPhone()) {
    const t = q('.calm-time');
    if (t) t.textContent = mmss(phase.left);
  }
}

function startFocusWatch() {
  if (!focusWatch) focusWatch = setInterval(focusTick, 1000);
}

/* ---------------- sync ----------------
   No account: one shared code is the identity *and* the encryption key.
   The code never leaves the device — the server sees a hash of it for the
   record name and an AES-GCM blob it cannot read. Devices merge per item by
   "newest edit wins", so two phones editing offline both keep their work. */

const SYNC_URL = 'https://planner-sync.aryan-malik8u8.workers.dev';
const SYNC_KEY = 'planner.sync';
const CODE_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford-style: no I, L, O or U
const TOMB_TTL = 120 * 86400000;        // forget tombstones after ~4 months

const sync = { code: null, url: SYNC_URL, rev: 0, at: 0, status: 'off', note: '', dirty: false, busy: false };

function loadSync() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (s && s.code) {
      sync.code = s.code;
      sync.url = s.url || SYNC_URL;
      sync.rev = s.rev | 0;
      sync.at = s.at | 0;
      sync.dirty = !!s.dirty;      // edits that never made it out last time
      sync.status = 'idle';
    }
  } catch {}
}

function saveSync() {
  try {
    localStorage.setItem(SYNC_KEY, sync.code
      ? JSON.stringify({ code: sync.code, url: sync.url, rev: sync.rev, at: sync.at, dirty: sync.dirty })
      : '');
  } catch {}
}

/* Remembered across launches: an edit made offline still gets sent even if
   the app is closed before it can reach the server. */
function markDirty() {
  if (!sync.code || sync.dirty) return;
  sync.dirty = true;
  saveSync();
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map(x => CODE_CHARS[x % 32]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** Accepts any spacing/casing, forgives I/L/O typos, returns XXXX-XXXX-XXXX or null. */
function cleanCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');   // safe: none of I, L, O are in the alphabet
  if (s.length !== 12 || [...s].some(c => !CODE_CHARS.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

let keyCache = { code: null, key: null, id: null };

async function codeKeys(code) {
  if (keyCache.code === code) return keyCache;
  const digest = await crypto.subtle.digest('SHA-256', enc.encode('planner.id.v1|' + code));
  const id = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('planner.key.v1'), iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache = { code, key, id };
  return keyCache;
}

async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return b64(iv) + '.' + b64(new Uint8Array(ct));
}

async function open_(key, blob) {
  const [iv, ct] = String(blob).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

/** Fold a remote snapshot into the local one. Returns true if local changed. */
function mergeInto(local, remote) {
  if (!remote || typeof remote !== 'object') return false;
  let changed = false;

  for (const [id, t] of Object.entries(remote.deleted || {})) {
    if ((local.deleted[id] || 0) < t) { local.deleted[id] = t; changed = true; }
  }

  for (const kind of KINDS) {
    const byKey = new Map(local[kind].map(x => [x.id, x]));
    for (const r of (Array.isArray(remote[kind]) ? remote[kind] : [])) {
      if (!r || typeof r.id !== 'string') continue;
      const mine = byKey.get(r.id);
      if (!mine || (r.updatedAt || 0) > (mine.updatedAt || 0)) { byKey.set(r.id, r); changed = true; }
    }
    const kept = [...byKey.values()].filter(x => (local.deleted[x.id] || 0) <= (x.updatedAt || 0));
    if (kept.length !== local[kind].length) changed = true;
    local[kind] = kept;
  }

  const cutoff = stamp() - TOMB_TTL;
  for (const [id, t] of Object.entries(local.deleted)) if (t < cutoff) delete local.deleted[id];
  return changed;
}

function setStatus(status, note = '') {
  sync.status = status;
  sync.note = note;
  paintSync();
}

async function syncNow() {
  if (!sync.code || !sync.url || sync.busy) return;
  if (!navigator.onLine) return setStatus('offline');
  if (!crypto.subtle) return setStatus('error', 'Needs a secure (https) connection');

  sync.busy = true;
  setStatus('syncing');
  try {
    const { key, id } = await codeKeys(sync.code);
    const base = sync.url.replace(/\/+$/, '') + '/' + id;

    let remote = await (await fetchOK(base, { cache: 'no-store' })).json();
    let pulled = false;
    if (remote.blob) {
      pulled = mergeInto(db, await open_(key, remote.blob));
      if (pulled) { persist(); render(); }
    }

    if (pulled || sync.dirty || !remote.blob) {
      let res = await put(base, remote.rev, key);
      if (res.status === 409) {                   // someone else wrote first
        const fresh = await res.json();
        if (fresh.blob) { if (mergeInto(db, await open_(key, fresh.blob))) { persist(); render(); } }
        res = await put(base, fresh.rev, key);
      }
      if (!res.ok) throw new Error('server ' + res.status);
      sync.rev = (await res.json()).rev;
      sync.dirty = false;
    }

    sync.at = stamp();
    saveSync();
    setStatus('ok');
  } catch (e) {
    const msg = (e && e.message) || '';
    const wrongCode = e && (e.name === 'OperationError' || /operation-specific/i.test(msg));
    setStatus('error',
      wrongCode ? 'That code does not match this data'
      : /429/.test(msg) ? 'Syncing too often — it will catch up shortly'
      : msg || 'Could not reach the server');
  } finally {
    sync.busy = false;
  }
}

async function put(base, rev, key) {
  return fetch(base, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rev, blob: await seal(key, db) })
  });
}

async function fetchOK(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('server ' + r.status);
  return r;
}

let syncTimer;
function scheduleSync(delay = 2500) {
  if (!sync.code) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

function syncLabel() {
  if (!sync.code) return 'Off';
  if (sync.status === 'syncing') return 'Syncing…';
  if (sync.status === 'offline') return 'Offline — will sync later';
  if (sync.status === 'error') return sync.note || 'Sync problem';
  if (!sync.at) return 'Ready';
  const mins = Math.round((stamp() - sync.at) / 60000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `Synced ${hrs} h ago` : `Synced ${Math.round(hrs / 24)} d ago`;
}

/** Reflect sync state on the toolbar icon and inside the sheet, without a re-render. */
function paintSync() {
  const btn = $('#syncBtn');
  btn.classList.toggle('is-busy', sync.status === 'syncing');
  btn.classList.toggle('is-bad', sync.status === 'error');
  btn.classList.toggle('is-on', sync.status === 'ok' || sync.status === 'idle');
  const line = sheet.querySelector('#syncStatus');
  if (line) {
    line.textContent = syncLabel();
    line.className = 'sync-status' + (sync.status === 'error' ? ' is-bad' : '');
  }
}

function openSyncSheet() {
  const on = !!sync.code;
  const body = on ? `
    <p class="sync-code" data-act="sync-copy" title="Tap to copy">${esc(sync.code)}</p>
    <p class="hint">On your other device, open Sync and choose <b>I already have a code</b>,
      then enter this. Anyone using this code sees this data, so keep it to yourself.</p>
    <p class="sync-status" id="syncStatus">${esc(syncLabel())}</p>
    <button class="btn" type="button" data-act="sync-now">Sync now</button>
    <button class="btn is-ghost" type="button" data-act="sync-off">Stop syncing on this device</button>`
  : `
    <p class="hint">Keeps the same homework, notes and projects on every device you use.
      No account: one code is the key, and your data is encrypted before it leaves this device.</p>
    ${SYNC_URL ? '' : `<div class="field"><label for="f-url">Server</label>
      <input id="f-url" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
        placeholder="https://…workers.dev" value="${esc(sync.url)}"></div>`}
    <button class="btn" type="button" data-act="sync-start">Set up my first device</button>
    <p class="hint sync-or">Makes a brand-new code just for you</p>
    <div class="field"><label for="f-code">I already have a code</label>
      <input id="f-code" type="text" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters"
        autocorrect="off" spellcheck="false" enterkeyhint="done"></div>
    <button class="btn is-soft" type="button" data-act="sync-connect">Connect this device</button>`;

  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Sync</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    ${body}`, { mode: 'sync', autofocus: false });
  paintSync();
}

async function startSync(code) {
  const url = (sheet.querySelector('#f-url')?.value || sync.url).trim();
  if (!url) return flash('#f-url');
  sync.url = url;
  sync.code = code;
  sync.rev = 0;
  sync.at = 0;
  sync.dirty = true;
  keyCache = { code: null, key: null, id: null };
  saveSync();
  openSyncSheet();
  await syncNow();
  openSyncSheet();
}


/* Press and hold, so the alarm can't be swatted away half-asleep. */
const HOLD_MS = 3000;          // the alarm dismissal stays at three seconds
const EXIT_HOLD_MS = 5000;     // ending from the phone takes longer still
const STOP_HOLD_MS = 7000;     // and stopping from the computer longer again
let holdTimer = null;

function beginHold(btn, done, ms = HOLD_MS) {
  cancelHold();
  btn.style.setProperty('--hold', ms + 'ms');
  btn.classList.add('is-holding');
  holdTimer = setTimeout(() => { btn.classList.remove('is-holding'); holdTimer = null; done(); }, ms);
}

function cancelHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  for (const b of document.querySelectorAll('.is-holding')) b.classList.remove('is-holding');
}

for (const ev of ['pointerdown']) {
  document.addEventListener(ev, e => {
    const btn = e.target.closest('[data-act="hold-study"], [data-act="hold-end"], [data-act="hold-stop"]');
    if (!btn) return;
    e.preventDefault();
    const act = btn.dataset.act;
    beginHold(btn, () => {
      if (act === 'hold-study') {
        const phase = focusPhase(session(), Date.now());
        alarmDismissed = phase.kind === 'focus' ? phase.index : alarmDismissed;
        stopAlarm();
        $('#lock').dataset.mode = '';        // force a repaint into the study screen
        paintLock();
      } else if (canExitHere()) {
        endFocus();
      }
    }, act === 'hold-end' ? EXIT_HOLD_MS : act === 'hold-stop' ? STOP_HOLD_MS : HOLD_MS);
  }, { passive: false });
}
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(ev, cancelHold);
}

/* ---------------- what's next ----------------
   A short, paged announcement. It opens by itself once per device; the strip
   above the app keeps it reachable afterwards. Bump NEWS_ID to announce
   something new and every device sees that one once. */

const NEWS_KEY = 'planner.news';
const NEWS_ID = 'update-live-1';

const NEWS_ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.1C7.6 17.6 4.3 14.5 4.3 10.6a3.9 3.9 0 017.7-1.2 3.9 3.9 0 017.7 1.2c0 3.9-3.3 7-7.7 9.5z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.6l1.8 4.9 4.9 1.8-4.9 1.8L11 17l-1.8-4.9L4.3 10.3l4.9-1.8z"/><path d="M18 15.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4l6.8 2.5v5c0 4.1-2.8 7.4-6.8 9.1-4-1.7-6.8-5-6.8-9.1v-5z"/><path d="M9.3 11.9l1.9 1.9 3.5-3.8"/></svg>'
};

const NEWS = [
  {
    icon: 'heart',
    eyebrow: 'Thank you',
    title: 'Thx for using Calendar',
    body: 'I didn’t expect this to grow so much.'
  },
  {
    icon: 'spark',
    eyebrow: 'It’s here',
    title: 'The massive update',
    body: 'Everything I promised, now running:',
    list: [
      'Pages and blocks you arrange yourself — tap the pencil on any page',
      'Sixty-six blocks to build from, each with something clever in it',
      'Homework that already knows its class — the one you’re in, or the one you just left',
      'A settings page, custom page icons, and a lot of small polish'
    ]
  },
  {
    icon: 'shield',
    gold: true,
    eyebrow: 'My promise',
    title: 'It will always remain free',
    body: 'I do not plan to add ads or distractions.',
    note: 'Spread this app as much as possible — thx for the support.'
  }
];

/* A read that throws (private mode, storage off) counts as seen: better to
   stay quiet than to reopen the same announcement on every launch. */
function newsSeen() {
  try { return localStorage.getItem(NEWS_KEY) === NEWS_ID; } catch { return true; }
}

function markNewsSeen() {
  try { localStorage.setItem(NEWS_KEY, NEWS_ID); } catch {}
}

function openNews(page = 0, dir = 0) {
  const n = NEWS[page];
  const last = page === NEWS.length - 1;
  // reuses the month-change slides, so paging costs no new keyframes
  const anim = dir > 0 ? 'anim-right' : dir < 0 ? 'anim-left' : 'anim-soft';
  const dots = NEWS.map((_, i) =>
    `<button class="news-dot${i === page ? ' is-on' : ''}" type="button"
      data-act="news-dot" data-i="${i}" aria-label="Screen ${i + 1} of ${NEWS.length}"
      ${i === page ? 'aria-current="true"' : ''}></button>`).join('');

  openSheet(`
    <div class="news${n.gold ? ' is-gold' : ''}">
      <div class="news-screen ${anim}">
        <span class="news-icon">${NEWS_ICONS[n.icon]}</span>
        <p class="news-eyebrow">${n.eyebrow}</p>
        <h2 class="news-title" id="sheetTitle">${n.title}</h2>
        <p class="news-body">${n.body}</p>
        ${n.list ? `<ul class="news-list">${n.list.map(x =>
          `<li>${TICK}<span>${x}</span></li>`).join('')}</ul>` : ''}
        ${n.note ? `<p class="news-note">${n.note}</p>` : ''}
      </div>
      <div class="news-foot">
        <span class="news-dots">${dots}</span>
        ${page ? '<button class="link-btn" type="button" data-act="news-back">Back</button>' : ''}
        <button class="btn news-next" type="button" data-act="news-next">${last ? 'Got it' : 'Next'}</button>
      </div>
    </div>`, { mode: 'news', page, autofocus: false });

  markNewsSeen();
}

/** Step between screens, staying inside the deck. */
function newsGo(dir) {
  if (ctx?.mode !== 'news') return;
  const page = ctx.page + dir;
  if (page < 0 || page >= NEWS.length) return;
  openNews(page, dir);
}

/* swipe between screens, the same gesture the calendar uses for months */
let nsx = 0, nsy = 0, nswipe = false;
sheet.addEventListener('touchstart', e => {
  if (ctx?.mode !== 'news' || e.touches.length !== 1) return;
  nsx = e.touches[0].clientX;
  nsy = e.touches[0].clientY;
  nswipe = true;
}, { passive: true });

sheet.addEventListener('touchend', e => {
  if (!nswipe) return;
  nswipe = false;
  const t = e.changedTouches[0];
  const dx = t.clientX - nsx, dy = t.clientY - nsy;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) newsGo(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------------- schedule & data helpers (for blocks) ---------------- */

const weekdayOf = isoStr => parseISO(isoStr).getDay();
const planForDate = d => planFor(d, weekdayOf(d));

/** The next `n` days that actually have school, starting from `from`. */
function nextSchoolDays(n, from = today()) {
  const out = [];
  for (let i = 0; i < 45 && out.length < n; i++) {
    const d = shift(from, i);
    const plan = planForDate(d);
    if (plan) out.push({ date: d, plan });
  }
  return out;
}

/** When a class next meets: "today · 1:18 PM", "tomorrow", or a weekday. */
function nextMeeting(classId) {
  const slot = db.schedule.find(x => x.classId === classId);
  if (!slot) return null;
  const now = ptNow();
  for (let i = 0; i < 14; i++) {
    const d = shift(now.date, i);
    const plan = planForDate(d);
    const row = plan && plan.rows.find(r => rowPeriod(r, d) === slot.period);
    if (!row) continue;
    if (i === 0 && hhmmToSecs(row[2]) <= now.secs) continue;   // already over today
    const when = i === 0 ? `today \u00b7 ${clockLabel(row[1])}`
      : i === 1 ? 'tomorrow'
      : parseISO(d).toLocaleDateString(undefined, { weekday: 'long' });
    return { when, row, date: d };
  }
  return null;
}

/** Real dates worth counting down to, straight from the bell calendar. */
function milestones() {
  const t = today();
  return Object.entries(BELL.byDate || {})
    .filter(([d]) => d >= t)
    .sort((a, b) => a[0] < b[0] ? -1 : 1)
    .slice(0, 8)
    .map(([d, k]) => ({ date: d, name: BELL.schedules[k]?.name || k }));
}

const TEST_RE = /\b(test|quiz|exam|final|midterm)\b/i;

/** Anything that looks like a test, collected automatically. */
function testItems() {
  const out = [];
  for (const h of db.homework) if (!h.done && h.due >= today() && TEST_RE.test(h.title)) out.push({ date: h.due, title: h.title, classId: h.classId });
  for (const e of db.events) if (e.date >= today() && TEST_RE.test(e.title)) out.push({ date: e.date, title: e.title, classId: e.classId });
  return out.sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 6);
}

/** Tonight's realistic minutes, from what each class has actually cost you. */
function estimateTonight() {
  const t = today(), tm = shift(t, 1);
  let mins = 0;
  const per = new Map();
  for (const h of db.homework) if (!h.done && h.due <= tm) {
    const m = classMinutes(h.classId);
    mins += m;
    per.set(h.classId, (per.get(h.classId) || 0) + m);
  }
  return { mins, per };
}

const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' m' : ''}`.trim() : `${m} min`;

/* Standing homework regenerates itself on school days only — weekends and
   anything the bell calendar knows about are skipped automatically. */
function ensureRecur() {
  const t = today();
  if (!planForDate(t)) return false;
  let made = false;
  for (const r of db.recurs) {
    const id = `r${r.id}:${t}`;
    if (byId(db.homework, id) || db.deleted[id]) continue;
    db.homework.push(touch({ id, title: r.title, classId: r.classId, due: t,
      details: '', done: false, createdAt: stamp() }));
    made = true;
  }
  if (made) save();
  return made;
}

/* ---------------- settings ---------------- */

function setRow(label, control, hint) {
  return `<div class="set-row"><span class="set-info"><span class="row-title">${label}</span>
    ${hint ? `<span class="row-sub">${hint}</span>` : ''}</span>${control}</div>`;
}

const setSeg = (pref, opts) => `<span class="set-seg" data-pref="${pref}">
  ${opts.map(([v, l]) => `<button type="button" data-act="set-pref" data-pref="${pref}" data-v="${v}"
    class="${String(prefs[pref]) === String(v) ? 'is-active' : ''}">${l}</button>`).join('')}</span>`;

const setTog = pref => setSeg(pref, [[1, 'On'], [0, 'Off']]);

function openSettings() {
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Settings</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>

    <div class="section-head"><h2>Style</h2></div>
    <div class="card">
      <button class="row" data-act="style-set" data-v="notebook">
        <span class="stylep stylep-nb"><i></i><i></i><i></i></span>
        <span class="row-main"><span class="row-title">Notebook</span>
          <span class="row-sub">Paper, ink and a handwritten feel</span></span>
        ${prefs.style !== 'default' ? TICK_ACCENT : CHEV}</button>
      <button class="row" data-act="style-set" data-v="default">
        <span class="stylep stylep-def"><i></i><i></i><i></i></span>
        <span class="row-main"><span class="row-title">Default</span>
          <span class="row-sub">Plain and quick \u2014 the lighter option</span></span>
        ${prefs.style === 'default' ? TICK_ACCENT : CHEV}</button>
    </div>
    ${prefs.style !== 'default' ? `<div class="card set-card">
      ${setRow('Full notebook', setTog('full'),
        'One continuous sheet \u2014 no cards, and the paper scrolls with you. Off by default.')}
      ${setRow('Page turns', setTog('pageTurn'), 'Pages flip like paper when you switch. Off by default.')}
    </div>` : ''}
    ${prefs.style !== 'default' ? `<p class="hint style-note">Notebook Style may load slightly slower because of its additional visual details and animations. We\u2019ll still keep it optimized and as lightweight as possible.</p>` : ''}

    <div class="section-head"><h2>Appearance</h2></div>
    <div class="card set-card">
      ${setRow('Theme', setSeg('theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']]), 'Auto goes dark for the evening')}
      ${setRow('Compact layout', setTog('compact'), 'Tighter spacing everywhere')}
      ${setRow('Animations', setTog('motion'))}
    </div>

    <div class="section-head"><h2>Time &amp; dates</h2></div>
    <div class="card set-card">
      ${setRow('Week starts on', setSeg('mon', [[0, 'Sun'], [1, 'Mon']]))}
      ${setRow('Clock', setSeg('t24', [[0, '12 h'], [1, '24 h']]))}
      ${setRow('New homework due', setSeg('due', [[0, 'Today'], [1, 'Tomorrow'], [2, '+2 days']]))}
      ${setRow('Sleep target', setSeg('sleep', [[8, '8 h'], [8.5, '8\u00bd'], [9, '9 h']]), 'What the sleep block plans for')}
    </div>

    <div class="section-head"><h2>Behavior</h2></div>
    <div class="card set-card">
      ${setRow('Confirm deletes', setTog('confirm'), 'Ask before removing classes or pages')}
      ${setRow('\u201cDo tonight\u201d waits', setTog('tonightHide'), 'Hidden until school is out for the day')}
    </div>

    <div class="section-head"><h2>School</h2></div>
    <div class="card">
      <button class="row" data-act="school-pick"><span class="row-main">
        <span class="row-title">${esc(BELL.name || 'Pick a school')}</span>
        <span class="row-sub${BELL.stale ? ' is-late' : ''}">${esc(BELL.level || '')}${
          BELL.year ? ' \u00b7 ' + esc(BELL.year) : ''}${
          BELL.stale ? ' \u00b7 the school has not updated this yet' : ''}</span>
        </span>${CHEV}</button>
    </div>

    <div class="section-head"><h2>Data</h2></div>
    <div class="card">
      <button class="row" data-act="export"><span class="row-main">
        <span class="row-title">Export everything</span>
        <span class="row-sub">A JSON file of your data, layout and settings</span></span>${CHEV}</button>
      <button class="row" data-act="sync"><span class="row-main">
        <span class="row-title">Sync</span>
        <span class="row-sub">${sync.code ? 'On \u00b7 tap to manage' : 'Off \u00b7 set up a code'}</span></span>${CHEV}</button>
      <button class="row" data-act="erase"><span class="row-main">
        <span class="row-title" style="color:var(--danger)">Erase this device</span>
        <span class="row-sub">Everything local. Synced copies survive.</span></span>${CHEV}</button>
    </div>

    <p class="hint set-about">Planner \u00b7 the massive update, live.
      <button class="link-btn" data-act="news" type="button">What\u2019s new</button></p>`,
    { mode: 'settings', autofocus: false });
  tip('gear', '.sheet .set-card', { round: 16, delay: 520 });
  tip('school', '.sheet [data-act="school-pick"]', { round: 14 });
}

/** The school list, grouped, with a warning on any stale source. */
function schoolRows(cur, act) {
  const groups = {};
  for (const k of SCHOOL_ORDER) (groups[SCHOOLS[k].level] ||= []).push(k);
  return Object.entries(groups).map(([level, keys]) => `
    <div class="section-head"><h2>${esc(level)}</h2></div>
    <div class="card">${keys.map(k => {
      const sc = SCHOOLS[k];
      return `<button class="row" data-act="${act}" data-school="${k}">
        <span class="row-main"><span class="row-title">${esc(sc.name)}</span>
          <span class="row-sub${sc.stale ? ' is-late' : ''}">${sc.periods.length
            ? `${sc.periods.length} periods \u00b7 ${esc(sc.year)}` : esc(sc.year)}${
            sc.stale ? ' \u00b7 not yet updated by the school' : ''}</span></span>
        ${k === cur ? TICK_ACCENT : CHEV}</button>`;
    }).join('')}</div>`).join('');
}

function openSchoolSheet() {
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Your school</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    <p class="hint">Every bell schedule here was copied from that school\u2019s own
      printer-friendly page. Schools change them \u2014 if a time looks wrong,
      trust your school, not this app.</p>
    ${schoolRows(prefs.school, 'school-set')}`, { mode: 'school', autofocus: false });
}

function exportData() {
  const blob = new Blob([JSON.stringify({ db, layout, prefs, exported: new Date().toISOString() }, null, 1)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `planner-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- edit mode: pickers & sheets ---------------- */

const PAGE_TMPLS = [
  { id: 'empty', n: 'Empty', d: 'Start from nothing.', icon: '\u2726', blocks: [] },
  { id: 'today', n: 'Today', d: 'Timer, what\u2019s next, what\u2019s due.', icon: '\u2600\ufe0f', blocks: ['hero', 'nextup', 'quick', 'due'] },
  { id: 'hub', n: 'Homework hub', d: 'The add button and every task.', icon: '\ud83d\udcda', blocks: ['quick', 'tasks'] },
  { id: 'study', n: 'Study', d: 'A focus session and your notes.', icon: '\ud83c\udfaf', blocks: ['focus', 'notes'] },
  { id: 'cal', n: 'Calendar', d: 'Month grid plus the day\u2019s agenda.', icon: 'cal', blocks: ['month', 'agenda'] },
  { id: 'sched', n: 'Schedule', d: 'Bell schedule and your classes.', icon: 'clock', blocks: ['hero', 'bell', 'periods'] },
  { id: 'min', n: 'Minimal', d: 'A timer and one list. That\u2019s it.', icon: '\u25cb', blocks: ['hero', 'due'] }
];

/* The block picker: seven collapsible sections, a search box, and a live
   preview of every block rendered from your real data. Only open sections
   render, so sixty-plus blocks stay cheap. */
const pickerUI = { q: '', open: new Set(['live']) };

function bpPreview(def) {
  let h = '';
  try { h = def.html({}) || ''; } catch {}
  return h || `<p class="empty">Appears only when it has something to say.</p>`;
}

function bpRow([t, def]) {
  return `<button class="bp" data-act="blk-pick" data-t="${t}" type="button">
    <span class="bp-info"><b>${def.n}</b><i>${def.d}</i><em>\u2726 ${def.sm}</em></span>
    <span class="bp-prev"><span class="bp-scale">${bpPreview(def)}</span></span>
  </button>`;
}

function paintPicker() {
  const body = sheet.querySelector('#bp-body');
  if (!body) return;
  const qy = pickerUI.q.trim().toLowerCase();
  if (qy) {
    const hits = Object.entries(BLOCKS).filter(([, d]) =>
      (d.n + ' ' + d.d + ' ' + d.sm).toLowerCase().includes(qy));
    body.innerHTML = hits.length
      ? `<div class="bp-list">${hits.map(bpRow).join('')}</div>`
      : `<p class="empty">No block matches \u201c${esc(pickerUI.q)}\u201d.</p>`;
    return;
  }
  body.innerHTML = Object.entries(CAT).map(([key, label]) => {
    const items = Object.entries(BLOCKS).filter(([, d]) => d.c === key);
    const openSec = pickerUI.open.has(key);
    return `<button class="bp-sec${openSec ? ' is-open' : ''}" data-act="bp-sec" data-cat="${key}" type="button">
        <span>${label}</span><i>${items.length}</i>${CHEV}</button>
      ${openSec ? `<div class="bp-list" id="sec-${key}">${items.map(bpRow).join('')}</div>` : ''}`;
  }).join('');
}

function openBlockPicker() {
  pickerUI.q = '';
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Add a block</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    <div class="field bp-search"><input id="bp-q" type="search" placeholder="Search ${Object.keys(BLOCKS).length} blocks\u2026"
      autocapitalize="off" autocorrect="off"></div>
    <div class="bp-chips">${Object.entries(CAT).map(([k, l]) =>
      `<button class="chip" data-act="bp-jump" data-cat="${k}" type="button">${l.split(' ')[0]}</button>`).join('')}</div>
    <div id="bp-body"></div>`, { mode: 'blk-add', autofocus: false });
  paintPicker();
  tip('picker', '.sheet .bp-search', { round: 16, delay: 520 });
}

function openBlockOpts(id) {
  const pg = activePage();
  const b = pg.blocks.find(x => x.id === id);
  if (!b) return;
  const def = BLOCKS[b.t];
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">${def.n}</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    <form id="form" novalidate>
      ${def.opts ? def.opts(b.cfg || {}) : ''}
      <div class="card"><div class="row">
        <span class="row-main"><span class="row-title">Position</span></span>
        <button class="step-btn" data-act="blk-move" data-dir="-1" type="button" aria-label="Move up">\u2191</button>
        <button class="step-btn" data-act="blk-move" data-dir="1" type="button" aria-label="Move down">\u2193</button>
      </div></div>
      ${def.opts ? '<button class="btn" type="submit">Save</button>' : ''}
      <button class="btn is-ghost" type="button" data-act="blk-del" data-bid="${b.id}">Remove block</button>
    </form>`, { mode: 'blk-opts', bid: id, autofocus: false });
  tip('blkopts', '.sheet #form', { round: 16, delay: 520 });
}

function openPagesSheet() {
  const rows = layout.pages.map(pg => `
    <div class="pg-row" data-pgid="${pg.id}">
      <span class="blk-handle" data-drag aria-label="Drag to reorder">
        <svg viewBox="0 0 24 24"><path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/></svg>
      </span>
      <button class="pg-ic" data-act="pg-icon" data-pg="${pg.id}" type="button" aria-label="Change icon">${iconOf(pg)}</button>
      <input class="pg-name" data-pg="${pg.id}" value="${esc(pg.name)}" maxlength="18" aria-label="Page name">
      ${pg.home ? '<span class="tag">Fixed</span>'
        : `<button class="blk-x" data-act="pg-del" data-pg="${pg.id}" type="button" aria-label="Delete page">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`}
    </div>`).join('');
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Pages</h2>
      <button class="link-btn" data-act="close" type="button">Done</button></div>
    <p class="hint">Drag to reorder the tray. Home stays, but its blocks are yours to change.</p>
    <div class="pg-list">${rows}</div>
    ${layout.pages.length < PAGE_LIMIT
      ? `<button class="btn is-soft" type="button" data-act="pg-add">New page</button>`
      : `<p class="hint sync-or">The tray is full \u2014 seven pages is the limit.</p>`}`,
    { mode: 'pages', autofocus: false });
  tip('pages', '.sheet .pg-list', { round: 16, delay: 520 });
}

function openNewPageSheet() {
  const rows = PAGE_TMPLS.map(t => `
    <button class="row" data-act="pg-tmpl" data-tmpl="${t.id}" type="button">
      <span class="pg-ic">${ICONS[t.icon] || `<span class="tab-emoji">${t.icon}</span>`}</span>
      <span class="row-main"><span class="row-title">${t.n}</span>
        <span class="row-sub">${t.d}</span></span>${CHEV}</button>`).join('');
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">New page</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <div class="card">${rows}</div>`, { mode: 'pg-add', autofocus: false });
}

/* a quiet, single-color icon set that matches the theme's grey */
const MONO_ICONS = {
  book: '<path d="M5 4.5h9a3 3 0 013 3v12h-9a3 3 0 00-3 3z"/><path d="M5 4.5v15"/>',
  star: '<path d="M12 4l2.3 4.9 5.2.6-3.9 3.6 1 5.2-4.6-2.6-4.6 2.6 1-5.2L4.5 9.5l5.2-.6z"/>',
  flag: '<path d="M6 21V4.5M6 4.5h11l-2.5 3.5L17 11.5H6"/>',
  heart: '<path d="M12 20.1C7.6 17.6 4.3 14.5 4.3 10.6a3.9 3.9 0 017.7-1.2 3.9 3.9 0 017.7 1.2c0 3.9-3.3 7-7.7 9.5z"/>',
  flask: '<path d="M10 4h4M11 4v5l-5 9a1.8 1.8 0 001.6 2.7h8.8A1.8 1.8 0 0018 18l-5-9V4"/>',
  globe: '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8M12 3.6c-4.8 4.9-4.8 11.9 0 16.8 4.8-4.9 4.8-11.9 0-16.8z"/>',
  pencil: '<path d="M14.5 5.5l4 4L8 20l-4.6 1L4.4 16.4z"/><path d="M13 7l4 4"/>',
  music: '<path d="M9 18.5V6l10-2v12.5"/><circle cx="6.8" cy="18.5" r="2.3"/><circle cx="16.8" cy="16.5" r="2.3"/>',
  bolt: '<path d="M13 3.5L5.5 13.5h5l-1 7 7.5-10h-5z"/>',
  leaf: '<path d="M5.5 18.5C5.5 10 12 5 19.5 4.5c.5 7.5-4 14-13 14z"/><path d="M5.5 18.5C8 14 12 10.5 16 8.5"/>',
  coffee: '<path d="M5 9h11v7a4 4 0 01-4 4H9a4 4 0 01-4-4z"/><path d="M16 10.5h1.5a2.5 2.5 0 010 5H16M8 4.5v2M12 4.5v2"/>',
  chat: '<path d="M4.5 6.5a2 2 0 012-2h11a2 2 0 012 2v8a2 2 0 01-2 2H10l-4.5 3.5V16.5h-1a2 2 0 01-2-2z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  gamepad: '<rect x="3.5" y="7.5" width="17" height="9.5" rx="4.5"/><path d="M8 10.5v3.5M6.2 12.2h3.6M15.5 11h.01M17.7 13h.01"/>',
  cap: '<path d="M12 5l9.5 4L12 13 2.5 9z"/><path d="M6.5 11v4.5c0 1.2 2.5 2.6 5.5 2.6s5.5-1.4 5.5-2.6V11"/>'
};
for (const [k, path] of Object.entries(MONO_ICONS)) {
  ICONS[k] = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

const ICON_EMOJI = ['\ud83d\udcda','\u2600\ufe0f','\ud83c\udfaf','\u2b50','\ud83d\udd25','\ud83c\udfa8','\ud83c\udfb5','\ud83c\udfc0','\u26bd','\ud83e\udde0','\ud83d\udcdd','\ud83d\udcc6','\u23f0','\ud83c\udf19','\ud83c\udf3f','\ud83d\udc9c','\ud83e\udd8b','\u2728','\ud83d\ude80','\ud83c\udf55','\u2615','\ud83d\udcbb','\ud83c\udfae','\u2726'];

function openIconSheet(pgId) {
  const svgs = Object.keys(ICONS).map(k =>
    `<button class="ic-opt" data-act="icon-set" data-pg="${pgId}" data-ic="${k}" type="button">${ICONS[k]}</button>`).join('');
  const emo = ICON_EMOJI.map(e =>
    `<button class="ic-opt" data-act="icon-set" data-pg="${pgId}" data-ic="${e}" type="button"><span class="tab-emoji">${e}</span></button>`).join('');
  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">Icon</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <div class="section-head"><h2>Simple \u2014 matches the theme</h2></div>
    <div class="ic-grid">${svgs}</div>
    <div class="section-head"><h2>Colorful</h2></div>
    <div class="ic-grid">${emo}</div>
    <div class="section-head"><h2>Type your own</h2></div>
    <form id="form" class="ic-own" novalidate>
      <div class="field"><input id="ic-in" type="text" maxlength="4"
        placeholder="Any emoji from your keyboard" enterkeyhint="done"></div>
      <button class="btn is-soft" type="submit">Use it</button>
    </form>`, { mode: 'pg-icon', pgId, autofocus: false });
  tip('icons', '.sheet .ic-own', { round: 16, delay: 520 });
}

/** Let a card be rubbed out before the layout forgets it. Falls straight
    through when motion is off, so nothing ever waits on an animation. */
function eraseThen(el, done) {
  if (!el || !prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
  el.classList.add('is-erasing');
  let fired = false;
  const go = () => { if (!fired) { fired = true; done(); } };
  el.addEventListener('animationend', go, { once: true });
  setTimeout(go, 420);            // never strand the change on a dropped event
}

/** Save a layout change and repaint whatever it touched. */
function commitLayout() {
  saveLayout();
  render();
}

/* ---------------- drag to reorder ----------------
   One engine for page blocks and the pages sheet. The dragged element rides
   the pointer on a transform; a displaced sibling FLIPs into its new slot,
   so the whole thing stays on the compositor. */
let drag = null;

function flipTo(el) {
  const a = el.getBoundingClientRect();
  return () => {
    const b = el.getBoundingClientRect();
    const dy = a.top - b.top;
    if (!dy) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform .22s var(--ease)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    });
  };
}

document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h) return;
  const item = h.closest('[data-bid], [data-pgid], [data-tid]');
  if (!item) return;
  e.preventDefault();
  drag = { item, zone: item.parentElement, y0: e.clientY, moved: 0 };
  item.classList.add('is-drag');
}, { passive: false });

document.addEventListener('pointermove', e => {
  if (!drag) return;
  let dy = e.clientY - drag.y0;
  drag.moved = Math.max(drag.moved, Math.abs(dy));
  const it = drag.item;
  const r = it.getBoundingClientRect();
  const mid = r.top + r.height / 2;
  for (const sib of drag.zone.children) {
    if (sib === it || !(sib.dataset.bid || sib.dataset.pgid || sib.dataset.tid)) continue;
    const sr = sib.getBoundingClientRect();
    const before = !!(sib.compareDocumentPosition(it) & Node.DOCUMENT_POSITION_FOLLOWING);
    if ((before && mid < sr.top + sr.height / 2) || (!before && mid > sr.top + sr.height / 2)) {
      const play = flipTo(sib);
      // a = where the card visually is right now (transform included)
      const a = it.getBoundingClientRect();
      it.style.transform = '';
      drag.zone.insertBefore(it, before ? sib : sib.nextSibling);
      // b = its new resting slot; keep the card glued to the finger
      const b = it.getBoundingClientRect();
      drag.y0 = e.clientY - (a.top - b.top);
      dy = e.clientY - drag.y0;
      play();
      break;
    }
  }
  it.style.transform = `translateY(${dy}px)`;
});

function endDrag() {
  if (!drag) return;
  const { item, zone, moved } = drag;
  drag = null;
  item.classList.remove('is-drag');
  item.style.transform = '';
  if (moved < 6) return;
  if (item.dataset.tid) {
    // the triage list: your order beats the score from now on
    const order = [...zone.querySelectorAll('[data-tid]')].map(x => x.dataset.tid);
    try { localStorage.setItem('planner.triage', JSON.stringify(order)); } catch {}
    render();
  } else if (item.dataset.bid) {
    const order = [...zone.querySelectorAll('[data-bid]')].map(x => x.dataset.bid);
    const pg = activePage();
    pg.blocks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    saveLayout();
  } else {
    const order = [...zone.querySelectorAll('[data-pgid]')].map(x => x.dataset.pgid);
    layout.pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    saveLayout();
    renderTabs();
  }
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/* ---------------- spotlight ----------------
   The first time you meet a new part of the app, the page dims around it and
   a card says what it is. Each tip fires once ever, per device — a guide, not
   a nag: nothing repeats, and anything dismisses with a tap. */

const TIPS_KEY = 'planner.tips.v1';
let tipsSeen = new Set();
try { tipsSeen = new Set(JSON.parse(localStorage.getItem(TIPS_KEY)) || []); } catch {}

const TIPS = {
  pencil: { t: 'Your planner is yours now',
    d: 'Every page is built from blocks you pick. Tap the pencil to rearrange this one — add things, drag them around, throw them out.' },
  edit: { t: 'Edit mode',
    d: 'Drag the handle to reorder. Tap a block\u2019s name for its settings, or the \u00d7 to remove it. Nothing here is permanent.' },
  addblk: { t: 'Add anything',
    d: 'Sixty-six blocks, grouped by what they do \u2014 timers, task lists, calendars, notes, grades. A page can hold as many as you like.' },
  picker: { t: 'Browse or search',
    d: 'Sections open one at a time, every preview is built from your own data, and the \u2726 line tells you the clever thing that block does.' },
  blkopts: { t: 'Block settings',
    d: 'Some blocks take a little configuration \u2014 a date, a class, a label. You can also nudge the block up or down from here.' },
  pages: { t: 'Your tray',
    d: 'Rename pages, drag them into order, give each an icon, or add one from a template. Up to seven, and Home always stays.' },
  icons: { t: 'Pick or type an icon',
    d: 'The simple glyphs match your theme and the colourful set is emoji \u2014 or scroll down and type any emoji straight from your keyboard.' },
  gear: { t: 'Settings lives here',
    d: 'Your school and its bell schedule, the theme (including auto-dark for the evening), week start, clock format, density, and a full backup of your data.' },
  trayicons: { t: 'Make the tray yours',
    d: 'In edit mode, open Pages to rename anything, drag the tabs into order, and give each one its own icon \u2014 a simple glyph, an emoji, or one you type yourself.' },
  school: { t: 'Your school',
    d: 'Pick your school and the whole app follows its bell schedule \u2014 period times, late starts, minimum days and finals. Change it here whenever you like.' },
  guess: { t: 'It picked the class for you',
    d: 'Filled in from the class you\u2019re in \u2014 or the one you just walked out of, since that\u2019s when homework gets set. Change it any time.' }
};

const markTip = id => {
  tipsSeen.add(id);
  try { localStorage.setItem(TIPS_KEY, JSON.stringify([...tipsSeen])); } catch {}
};

const spot = document.createElement('div');
spot.className = 'spot';
spot.hidden = true;
document.body.appendChild(spot);

let tipQueue = [], tipNow = null, tipTimer = null;

/** Queue a tip. Silently ignored once seen, or while the app is busy. */
function tip(id, sel, opts = {}) {
  if (tipsSeen.has(id) || !TIPS[id]) return;
  if (tipNow?.id === id || tipQueue.some(x => x.id === id)) return;
  tipQueue.push({ id, sel, ...opts });
  if (!tipNow) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(runTip, opts.delay ?? 420);
  }
}

const tipsBlocked = () => !!document.querySelector('.setup') || focusActive();

function runTip() {
  if (tipNow) return;
  if (tipsBlocked()) { tipQueue = []; return; }
  const item = tipQueue.shift();
  if (!item) return;
  const el = document.querySelector(item.sel);
  // whatever it describes has gone: drop it, but leave it unseen for later
  if (!el || !el.getBoundingClientRect().width) return runTip();

  tipNow = item;
  const T = TIPS[item.id];
  spot.innerHTML = `<div class="sp-hole"></div>
    <div class="sp-card" role="dialog" aria-label="${esc(T.t)}">
      <b>${esc(T.t)}</b><p>${esc(T.d)}</p>
      <button class="btn" type="button" data-act="tip-ok">Got it</button>
    </div>`;
  spot.hidden = false;
  placeTip();
  requestAnimationFrame(placeTip);   // again, once the card has a real height
  addEventListener('resize', placeTip);
  addEventListener('scroll', placeTip, true);
}

function placeTip() {
  if (!tipNow) return;
  const el = document.querySelector(tipNow.sel);
  if (!el) return closeTip();
  const r = el.getBoundingClientRect();
  const pad = tipNow.pad ?? 8;
  const hole = spot.querySelector('.sp-hole');
  const card = spot.querySelector('.sp-card');
  if (!hole || !card) return;
  const top = Math.max(4, r.top - pad);
  const left = Math.max(4, r.left - pad);
  const w = Math.min(innerWidth - left - 4, r.width + pad * 2);
  const h = Math.min(innerHeight - top - 4, r.height + pad * 2);
  hole.style.cssText = `top:${top}px;left:${left}px;width:${w}px;height:${h}px;` +
    `border-radius:${tipNow.round ?? 14}px`;

  const ch = card.offsetHeight || 160;
  // below the hole when it fits, otherwise above — never off screen
  if (innerHeight - (top + h) > ch + 22) {
    card.style.top = `${top + h + 14}px`;
    card.style.bottom = 'auto';
  } else {
    card.style.top = 'auto';
    card.style.bottom = `${Math.max(12, innerHeight - top + 14)}px`;
  }
}

function closeTip() {
  if (tipNow) markTip(tipNow.id);
  tipNow = null;
  spot.hidden = true;
  spot.innerHTML = '';
  removeEventListener('resize', placeTip);
  removeEventListener('scroll', placeTip, true);
  if (tipQueue.length) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(runTip, 240);
  }
}

spot.addEventListener('click', closeTip);

/* ---------------- events ---------------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;

  switch (el.dataset.act) {
    /* selection moves in place so the day pill can animate */
    case 'pick': {
      if (el.dataset.date === state.selected) break;
      state.selected = el.dataset.date;
      const g = el.closest('.cal-grid');
      for (const d of g.querySelectorAll('.day.is-selected')) {
        d.classList.remove('is-selected');
        d.removeAttribute('aria-current');
      }
      el.classList.add('is-selected');
      el.setAttribute('aria-current', 'date');
      refreshAgenda(true);
      break;
    }

    case 'toggle': {
      const h = byId(db.homework, el.dataset.id);
      if (!h) break;
      h.done = !h.done;
      h.completedAt = h.done ? stamp() : undefined;   // starts the 2-day countdown to removal
      if (h.done) recordDone(h);
      touch(h);
      save();
      // In Tasks the row stays where it is, so only that row changes — no
      // rebuild, and nothing shifts under the finger that just tapped it.
      if (state.tab === 'tasks') {
        el.closest('.row')?.classList.toggle('is-done', h.done);
        el.setAttribute('aria-pressed', String(h.done));
        if (h.done) popCheck(el);
        break;
      }
      render();
      if (h.done) document.querySelector(`.check[data-id="${h.id}"]`)?.classList.add('pop');
      break;
    }

    /* Not started → In progress → Done, straight from the list. */
    case 'cycle': {
      const p = byId(db.projects, el.dataset.id);
      if (!p) break;
      const next = STATUSES[(STATUSES.indexOf(statusOf(p)) + 1) % STATUSES.length];
      p.status = next.id;
      touch(p);
      save();
      const row = el.closest('.row');
      row?.classList.toggle('is-done', next.pct === 100);
      el.classList.toggle('is-mid', next.id === 'doing');
      el.setAttribute('aria-label', `Status: ${next.label}`);
      const sub = row?.querySelector('.row-sub');
      if (sub) sub.textContent = `Project · ${next.label}`;
      if (next.pct === 100) popCheck(el);
      break;
    }

    case 'open': openEdit(el.dataset.kind, el.dataset.id); break;
    case 'class': state.classId = el.dataset.id; render(); scrollTo(0, 0); showView(); break;
    case 'back': state.classId = null; render(); showView(); break;
    case 'new-class': openClassSheet(null); break;
    case 'edit-class': openClassSheet(el.dataset.id); break;

    case 'add':
      openAdd({
        type: el.dataset.type || 'homework',
        classId: el.dataset.class || state.classId || undefined
      });
      break;

    case 'type': openAdd({ ...(ctx?.seed || {}), type: el.dataset.type }); break;
    case 'close': closeSheet(); break;
    case 'delete': removeItem(); break;

    case 'blk-add': openBlockPicker(); break;

    case 'bp-sec': {
      const k = el.dataset.cat;
      pickerUI.open.has(k) ? pickerUI.open.delete(k) : pickerUI.open.add(k);
      paintPicker();
      break;
    }

    case 'bp-jump': {
      const k = el.dataset.cat;
      pickerUI.open.add(k);
      pickerUI.q = '';
      const qEl = sheet.querySelector('#bp-q');
      if (qEl) qEl.value = '';
      paintPicker();
      sheet.querySelector(`#sec-${k}`)?.previousElementSibling?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      break;
    }
    case 'blk-opts': openBlockOpts(el.dataset.bid); break;

    case 'blk-pick': {
      const pg = activePage();
      pg.blocks.push({ id: bid(), t: el.dataset.t });
      closeSheet();
      commitLayout();
      const added = activeSection().querySelector(`[data-bid="${pg.blocks.at(-1).id}"]`);
      if (added) { added.scrollIntoView({ block: 'center' }); replay(added, 'anim-soft'); }
      break;
    }

    case 'blk-del': {
      const id = el.dataset.bid || ctx?.bid;
      const card = activeSection().querySelector(`.blk[data-bid="${id}"]`);
      if (ctx?.mode === 'blk-opts') closeSheet();
      eraseThen(card, () => {
        const pg = activePage();
        pg.blocks = pg.blocks.filter(b => b.id !== id);
        commitLayout();
      });
      break;
    }

    case 'blk-move': {
      const pg = activePage();
      const i = pg.blocks.findIndex(b => b.id === ctx?.bid);
      const j = i + (+el.dataset.dir);
      if (i < 0 || j < 0 || j >= pg.blocks.length) break;
      [pg.blocks[i], pg.blocks[j]] = [pg.blocks[j], pg.blocks[i]];
      saveLayout();
      render();
      break;
    }

    case 'pg-manage': openPagesSheet(); break;
    case 'pg-add': openNewPageSheet(); break;

    case 'pg-tmpl': {
      const t = PAGE_TMPLS.find(x => x.id === el.dataset.tmpl);
      if (!t || layout.pages.length >= PAGE_LIMIT) break;
      const pg = { id: 'p' + bid(), name: t.id === 'empty' ? 'New page' : t.n,
        icon: t.icon, blocks: t.blocks.map(x => ({ id: bid(), t: x })) };
      layout.pages.push(pg);
      state.tab = pg.id;
      closeSheet();
      commitLayout();
      showView();
      break;
    }

    case 'pg-del': {
      const pg = pageById(el.dataset.pg);
      if (!pg || pg.home) break;
      if (!confirmMaybe(`Delete the \u201c${pg.name}\u201d page? Its blocks go with it \u2014 your data stays.`)) break;
      eraseThen(el.closest('.pg-row'), () => {
        layout.pages = layout.pages.filter(x => x.id !== pg.id);
        if (state.tab === pg.id) state.tab = 'home';
        saveLayout();
        render();
        openPagesSheet();
      });
      break;
    }

    case 'pg-icon': openIconSheet(el.dataset.pg); break;

    case 'icon-set': {
      const pg = pageById(el.dataset.pg);
      if (pg) { pg.icon = el.dataset.ic; saveLayout(); renderTabs(); }
      openPagesSheet();
      break;
    }

    case 'tip-ok': closeTip(); break;

    case 'settings': openSettings(); break;

    case 'focus-suggest':
      setFocusField('total', +el.dataset.min);
      renderFocus();
      break;

    case 'theme-cycle':
      prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
      savePrefs();
      applyTheme();
      break;

    case 'mood-set': {
      const t = today();
      const m = byId(db.moods, t);
      if (m) touch(Object.assign(m, { v: +el.dataset.v }));
      else db.moods.push(touch({ id: t, v: +el.dataset.v }));
      save();
      render();
      break;
    }

    case 'card-flip': case 'card-next': {
      const st = blkState[el.dataset.bid];
      if (!st) break;
      if (el.dataset.act === 'card-next' || e.target.closest('[data-act="card-next"]')) { st.i++; st.flip = 0; }
      else st.flip = st.flip ? 0 : 1;
      render();
      break;
    }

    case 'break-took': {
      const st = blkState[el.dataset.bid];
      if (st) st.at = Date.now();
      render();
      break;
    }

    case 'step-tog': {
      const h = byId(db.homework, el.dataset.h);
      if (!h || !h.steps) break;
      h.steps[+el.dataset.i].d = h.steps[+el.dataset.i].d ? 0 : 1;
      // the whole assignment closes itself when the last step does
      if (h.steps.every(st => st.d) && !h.done) {
        h.done = true;
        h.completedAt = stamp();
        recordDone(h);
      }
      touch(h);
      save();
      render();
      break;
    }

    case 'grade-add':
      openSheet(`
        <div class="sheet-head"><h2 id="sheetTitle">Grade \u00b7 ${esc(className(el.dataset.id))}</h2>
          <button class="link-btn" data-act="close" type="button">Cancel</button></div>
        <form id="form" novalidate>
          <div class="field"><label for="g-name">What was it</label>
            <input id="g-name" type="text" data-autofocus placeholder="Unit 3 test"></div>
          <div class="field-row">
            <div class="field"><label for="g-score">Score</label>
              <input id="g-score" type="number" inputmode="decimal" placeholder="87"></div>
            <div class="field"><label for="g-max">Out of</label>
              <input id="g-max" type="number" inputmode="decimal" value="100"></div>
          </div>
          <button class="btn" type="submit">Save grade</button>
        </form>`, { mode: 'grade', classId: el.dataset.id });
      break;

    case 'whatif': {
      const cid = el.dataset.id;
      const avg = classAvg(cid);
      openSheet(`
        <div class="sheet-head"><h2 id="sheetTitle">What if \u00b7 ${esc(className(cid))}</h2>
          <button class="link-btn" data-act="close" type="button">Done</button></div>
        <p class="hint">Current average: <b>${avg === null ? '\u2014' : avg.toFixed(1) + '%'}</b></p>
        <div class="field-row">
          <div class="field"><label for="wi-w">Final worth (%)</label>
            <input id="wi-w" type="number" inputmode="decimal" value="20"></div>
          <div class="field"><label for="wi-t">Target (%)</label>
            <input id="wi-t" type="number" inputmode="decimal" value="90"></div>
        </div>
        <div class="hero cd wi"><div class="hero-label">You need</div>
          <div class="hero-time" id="wi-out">\u2014</div>
          <div class="hero-sub">on the final to land your target</div></div>`,
        { mode: 'whatif', classId: cid, autofocus: false });
      // seed the first calculation
      sheet.querySelector('#wi-w').dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }

    case 'link-add': case 'link-edit': {
      const l = el.dataset.id ? byId(db.links, el.dataset.id) : null;
      openSheet(`
        <div class="sheet-head"><h2 id="sheetTitle">${l ? 'Edit link' : 'New link'}</h2>
          <button class="link-btn" data-act="close" type="button">Cancel</button></div>
        <form id="form" novalidate>
          <div class="field"><label for="l-label">Name</label>
            <input id="l-label" type="text" ${l ? '' : 'data-autofocus'} value="${esc(l?.label)}" placeholder="Canvas"></div>
          <div class="field"><label for="l-url">Address</label>
            <input id="l-url" type="url" inputmode="url" autocapitalize="off" value="${esc(l?.url)}" placeholder="https://\u2026"></div>
          ${classField(l?.classId, { optional: true })}
          <button class="btn" type="submit">${l ? 'Save' : 'Add link'}</button>
          ${l ? '<button class="btn is-ghost" type="button" data-act="link-del">Delete</button>' : ''}
        </form>`, { mode: 'link', id: l?.id || null, autofocus: !l });
      break;
    }

    case 'link-del':
      tombstone(ctx.id);
      db.links = db.links.filter(x => x.id !== ctx.id);
      commit();
      break;

    case 'recur-add':
      openSheet(`
        <div class="sheet-head"><h2 id="sheetTitle">Repeats every school day</h2>
          <button class="link-btn" data-act="close" type="button">Cancel</button></div>
        <form id="form" novalidate>
          <div class="field"><label for="r-title">Title</label>
            <input id="r-title" type="text" data-autofocus placeholder="Read 20 minutes"></div>
          ${classField(guessClass())}
          <button class="btn" type="submit">Start repeating</button>
        </form>`, { mode: 'recur' });
      break;

    case 'recur-del':
      tombstone(el.dataset.id);
      db.recurs = db.recurs.filter(r => r.id !== el.dataset.id);
      save();
      render();
      break;

    case 'photo-add': q('#photoIn')?.click(); break;

    case 'photo-open': {
      const ph = byId(db.photos, el.dataset.id);
      if (!ph) break;
      openSheet(`
        <div class="sheet-head"><h2 id="sheetTitle">${esc(className(ph.classId) || 'Photo')}</h2>
          <button class="link-btn" data-act="close" type="button">Done</button></div>
        <img class="ph-full" src="${ph.img}" alt="">
        <p class="hint">${dateLabel(ph.date)}</p>
        <button class="btn is-ghost" type="button" data-act="photo-del" data-id="${ph.id}">Delete photo</button>`,
        { mode: 'photo', autofocus: false });
      break;
    }

    case 'photo-del':
      tombstone(el.dataset.id);
      db.photos = db.photos.filter(x => x.id !== el.dataset.id);
      commit();
      break;

    case 'set-pref': {
      const k = el.dataset.pref;
      const v = el.dataset.v;
      prefs[k] = isNaN(+v) ? v : +v;
      savePrefs();
      applyPrefs();
      for (const b of sheet.querySelectorAll(`[data-act="set-pref"][data-pref="${k}"]`))
        b.classList.toggle('is-active', b === el);
      render();
      break;
    }

    case 'rot-flip': {
      const names = rotNames();
      if (!names) break;
      // the first tap says what today is; later taps correct it
      setRot(prefs.rot?.[prefs.school] ? (rotIndex() + 1) % names.length : 0);
      break;
    }

    case 'style-set':
      if (prefs.style === el.dataset.v) break;
      prefs.style = el.dataset.v;
      savePrefs();
      applyStyle();
      render();
      openSettings();       // refresh the sheet so the tick and the note follow
      break;

    case 'school-pick': openSchoolSheet(); break;

    case 'school-set':
      setSchool(el.dataset.school);
      closeSheet();
      openSettings();
      break;

    case 'export': exportData(); break;

    case 'erase':
      if (!confirm('Erase everything on this device? This cannot be undone here.')) break;
      if (!confirm('Really erase? Synced copies on other devices survive; this one starts over.')) break;
      try {
        for (const k of ['planner.v1', LAYOUT_KEY, PREFS_KEY, STATS_KEY, 'planner.sync',
          'planner.theme', 'planner.news', 'planner.onboard', 'planner.vid']) localStorage.removeItem(k);
      } catch {}
      location.reload();
      break;

    case 'news': openNews(0); break;
    case 'news-back': newsGo(-1); break;
    case 'news-dot': {
      const to = +el.dataset.i;
      if (to !== ctx?.page) openNews(to, to > ctx.page ? 1 : -1);
      break;
    }
    case 'news-next':
      if (ctx?.page === NEWS.length - 1) {
        closeSheet();
        tip('pencil', '#editBtn', { round: 22, delay: 500 });
        tip('gear', '#gearBtn', { round: 22 });
      } else newsGo(1);
      break;

    case 'period': openPeriodSheet(+el.dataset.period); break;
    case 'pick-plan': openPlanSheet(); break;

    case 'set-plan': {
      const date = ptNow().date;
      const cur = byId(db.overrides, date);
      if (cur) touch(Object.assign(cur, { key: el.dataset.key }));
      else db.overrides.push(touch({ id: date, date, key: el.dataset.key }));
      commit();
      break;
    }

    case 'clear-plan': {
      const date = ptNow().date;
      tombstone(date);
      db.overrides = db.overrides.filter(o => o.id !== date);
      commit();
      break;
    }

    case 'period-clear': {
      const id = `p${ctx.period}`;
      tombstone(id);
      db.schedule = db.schedule.filter(x => x.id !== id);
      commit();
      break;
    }

    case 'tab':
      state.tab = pageById(el.dataset.to) ? el.dataset.to : layout.pages[0].id;
      state.classId = null;
      render();
      scrollTo(0, 0);
      showView();
      break;

    case 'lock-sync': lockSync(el); break;

    case 'focus-step': {
      const field = el.dataset.field;
      const [stepBy] = FOCUS_LIMITS[field];
      setFocusField(field, fieldValue(field, focusPlan()) + stepBy * +el.dataset.dir);
      renderFocus();
      break;
    }

    case 'focus-start': startFocus(focusPlan()); break;
    case 'focus-end': endFocus(); break;

    case 'sync': openSyncSheet(); break;
    case 'sync-start': startSync(newCode()); break;
    case 'sync-now': syncNow(); break;

    case 'sync-connect': {
      const code = cleanCode(sheet.querySelector('#f-code')?.value);
      if (code) startSync(code); else flash('#f-code');
      break;
    }

    case 'sync-off':
      sync.code = null;
      sync.dirty = false;
      keyCache = { code: null, key: null, id: null };
      saveSync();
      setStatus('off');
      openSyncSheet();
      break;

    case 'sync-copy':
      navigator.clipboard?.writeText(sync.code).then(() => {
        el.dataset.copied = '1';
        setTimeout(() => delete el.dataset.copied, 1200);
      }).catch(() => {});
      break;

    case 'color':
      if (ctx) {
        ctx.color = el.dataset.color;
        for (const b of sheet.querySelectorAll('.color')) b.classList.toggle('is-on', b === el);
      }
      break;
  }
});

sheet.addEventListener('change', e => {
  const nm = e.target.closest('.pg-name');
  if (nm) {
    const pg = pageById(nm.dataset.pg);
    if (pg && nm.value.trim()) { pg.name = nm.value.trim(); saveLayout(); renderTabs(); }
    return;
  }
  if (e.target.id !== 'f-class') return;
  const isNew = e.target.value === '__new';
  sheet.querySelector('#newClassField').hidden = !isNew;
  if (isNew) sheet.querySelector('#f-newclass').focus();
});

/* Typing straight into a value: keep it to digits, commit on blur or Enter. */
document.addEventListener('input', e => {
  const el = e.target.closest('.step-input');
  if (!el) return;
  el.value = el.value.replace(/[^0-9]/g, '').slice(0, 3);
});

document.addEventListener('change', e => {
  const el = e.target.closest('.step-input');
  if (!el) return;
  const v = setFocusField(el.dataset.field, parseInt(el.value, 10) || 0);
  el.value = v;
  renderFocus();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest('.step-input')) { e.preventDefault(); e.target.blur(); }
});

/* what-if calculator: recompute as either number changes */
sheet.addEventListener('input', e => {
  if (ctx?.mode !== 'whatif' || !e.target.closest('#wi-w, #wi-t')) return;
  const w = (parseFloat(sheet.querySelector('#wi-w').value) || 0) / 100;
  const t = parseFloat(sheet.querySelector('#wi-t').value) || 0;
  const a = classAvg(ctx.classId) ?? 100;
  const out = sheet.querySelector('#wi-out');
  if (!w) { out.textContent = '\u2014'; return; }
  const need = (t - a * (1 - w)) / w;
  out.textContent = need <= 0 ? 'anything' : need > 120 ? 'not possible' : need.toFixed(0) + '%';
});

/* quick capture: return files the thought and clears the box */
document.addEventListener('keydown', e => {
  const cap = e.target.closest?.('.cap-in');
  if (!cap || e.key !== 'Enter') return;
  e.preventDefault();
  const text = cap.value.trim();
  if (!text) return;
  db.notes.push(touch({ id: uid(), text, classId: guessClass() || '', date: today() }));
  save();
  cap.value = '';
  cap.placeholder = 'Saved. Another?';
});

/* the block picker's search */
sheet.addEventListener('input', e => {
  if (e.target.id !== 'bp-q' || ctx?.mode !== 'blk-add') return;
  pickerUI.q = e.target.value;
  paintPicker();
});

/* live search over everything */
document.addEventListener('input', e => {
  const inp = e.target.closest?.('.search-in');
  if (!inp) return;
  const out = inp.parentElement.querySelector('.search-out');
  if (out) out.innerHTML = searchResults(inp.value);
});

/* subtasks: a new step commits on change */
document.addEventListener('change', e => {
  const st = e.target.closest?.('.step-new');
  if (st) {
    const h = byId(db.homework, st.dataset.h);
    const t = st.value.trim();
    if (h && t) {
      (h.steps || (h.steps = [])).push({ t, d: 0 });
      touch(h);
      save();
      render();
    }
    return;
  }
  const ph = e.target.closest?.('#photoIn');
  if (ph && ph.files?.[0]) addPhoto(ph.files[0]);
});

/** Shrink a snapshot to something the sync blob can afford, then file it. */
function addPhoto(file) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 720 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    db.photos.push(touch({ id: uid(), classId: guessClass() || '', date: today(),
      img: cv.toDataURL('image/jpeg', 0.6) }));
    // the stash stays small: oldest beyond a dozen are really deleted
    const extra = db.photos.length - 12;
    if (extra > 0) {
      const old = [...db.photos].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, extra);
      for (const x of old) tombstone(x.id);
      const dead = new Set(old.map(x => x.id));
      db.photos = db.photos.filter(x => !dead.has(x.id));
    }
    save();
    render();
  };
  img.src = URL.createObjectURL(file);
}

sheet.addEventListener('submit', e => { e.preventDefault(); submitForm(); });
sheet.addEventListener('input', e => e.target.classList.remove('is-bad'));
$('#scrim').addEventListener('click', closeSheet);
addEventListener('keydown', e => {
  if (wrap.hidden) return;
  if (e.key === 'Escape') return closeSheet();
  // arrow keys page the announcement on a computer
  if (ctx?.mode !== 'news') return;
  if (e.key === 'ArrowRight') newsGo(1);
  else if (e.key === 'ArrowLeft') newsGo(-1);
});

/** Show the active view with a soft entrance. */
function showView() {
  const turn = prefs.pageTurn && prefs.style !== 'default';
  replay(activeSection(), turn ? 'anim-turn' : 'anim-view');
  // the bell block finds its own place: the current row comes to you
  if (!state.edit) requestAnimationFrame(() =>
    q('.row.block.is-now')?.scrollIntoView({ block: 'nearest' }));
}

function moveMonth(n) {
  const d = new Date(state.year, state.month + n, 1);
  state.month = d.getMonth();
  state.year = d.getFullYear();
  render();
  const g = q('.cal-grid');
  if (g) replay(g, n > 0 ? 'anim-right' : 'anim-left');
}

$('#prevMonth').addEventListener('click', () => moveMonth(-1));
$('#nextMonth').addEventListener('click', () => moveMonth(1));

/* tapping the month name jumps back to today */
$('#title').addEventListener('click', () => {
  if (!activeHas('month') || state.classId || state.edit) return;
  const now = new Date();
  state.month = now.getMonth();
  state.year = now.getFullYear();
  state.selected = today();
  render();
  showView();
});

/* horizontal swipe on any month grid changes month */
let sx = 0, sy = 0, swipeGrid = null;
document.addEventListener('touchstart', e => {
  const g = e.target.closest?.('.cal-grid');
  if (!g || e.touches.length !== 1) return;
  swipeGrid = g;
  sx = e.touches[0].clientX;
  sy = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!swipeGrid) return;
  swipeGrid = null;
  const t = e.changedTouches[0];
  const dx = t.clientX - sx, dy = t.clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.7) moveMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* long-press a calendar day to add straight to it */
let dayLP = null, dayLPFired = false;
document.addEventListener('pointerdown', e => {
  const day = e.target.closest?.('.day[data-date]');
  if (!day || state.edit) return;
  dayLPFired = false;
  dayLP = setTimeout(() => {
    dayLPFired = true;
    state.selected = day.dataset.date;
    render();
    openAdd({ type: 'homework' });
  }, 500);
});
for (const ev of ['pointerup', 'pointercancel', 'pointermove']) {
  document.addEventListener(ev, e => {
    if (!dayLP) return;
    if (ev !== 'pointermove' || (e.movementX ** 2 + e.movementY ** 2) > 25) {
      clearTimeout(dayLP);
      dayLP = null;
    }
  });
}
document.addEventListener('click', e => {
  if (dayLPFired && e.target.closest?.('.day[data-date]')) {
    e.stopPropagation();
    e.preventDefault();
    dayLPFired = false;
  }
}, true);

/* pencil: flip the whole page into (or out of) edit mode */
$('#editBtn').addEventListener('click', () => {
  state.edit = !state.edit;
  state.classId = null;
  render();
  showView();
  if (state.edit) {
    tip('edit', '.view:not([hidden]) .blk', { round: 18 });
    tip('addblk', '.view:not([hidden]) .add-blk', { round: 18 });
    tip('trayicons', '.view:not([hidden]) [data-act="pg-manage"]', { round: 18 });
  }
});

/* theme — driven by prefs; "auto" goes dark for the evening. The resolved
   value still lands in planner.theme so the pre-paint script in <head>
   keeps painting the right background on the next launch. */
const themeMeta = $('#themeColor');
const barMeta = $('#statusBar');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#000000' : '#f6f7f9';
  // iOS reads this at launch: dark gets a black status bar instead of a white one.
  barMeta.content = t === 'dark' ? 'black' : 'default';
  try { localStorage.setItem('planner.theme', t); } catch {}
}

function applyTheme() {
  const hr = new Date().getHours();
  const t = prefs.theme === 'auto' ? (hr >= 19 || hr < 7 ? 'dark' : 'light') : prefs.theme;
  if (document.documentElement.dataset.theme !== t) setTheme(t);
  else setTheme(t);
}

/* The notebook face loads only when the style is chosen — Default never
   downloads anything. Offline it quietly falls back to the system stack. */
function ensureNotebookFont() {
  if (document.getElementById('nbFont')) return;
  const l = document.createElement('link');
  l.id = 'nbFont';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@400;500;700&display=swap';
  document.head.appendChild(l);
}

function applyStyle() {
  const nb = prefs.style !== 'default';
  const root = document.documentElement;
  root.dataset.style = nb ? 'notebook' : 'default';
  // full only means anything on paper
  if (nb && prefs.full) root.dataset.full = '1'; else delete root.dataset.full;
  if (nb) ensureNotebookFont();
  // a stale drift would freeze the paper off-register once it stops updating
  if (typeof paperMoves === 'function' && !paperMoves()) root.style.setProperty('--nb-sy', 0);
}

/** Density and motion preferences are just body classes the CSS reads. */
function applyPrefs() {
  document.body.classList.toggle('is-compact', !!prefs.compact);
  document.body.classList.toggle('no-motion', !prefs.motion);
  applyStyle();
  applyTheme();
}

/* first run of prefs on a device that already chose a theme the old way */
try {
  if (!localStorage.getItem(PREFS_KEY) && localStorage.getItem('planner.theme') === 'dark') {
    prefs.theme = 'dark';
    savePrefs();
  }
} catch {}
applyPrefs();
$('#gearBtn').addEventListener('click', openSettings);

/* hairline under the top bar once the page scrolls. The class is only touched
   when it actually changes, so a long scroll doesn't poke the DOM every frame. */
const topbar = document.querySelector('.topbar');
let scrolled = false;

/* Half-notebook paints the paper on a fixed layer, so it would hold still
   while the writing slides over it. Handing the CSS the scroll position lets
   the ruled lines and punch holes drift with the page. One custom property a
   frame, only on a half page, and never when motion is turned down. */
let paperRaf = 0;
const paperDrift = () => {
  paperRaf = 0;
  document.documentElement.style.setProperty('--nb-sy', Math.round(scrollY));
};

function paperMoves() {
  return prefs.style !== 'default' && !prefs.full && prefs.motion;
}

addEventListener('scroll', () => {
  if (paperMoves() && !paperRaf) paperRaf = requestAnimationFrame(paperDrift);
  const now = scrollY > 4;
  if (now === scrolled) return;
  scrolled = now;
  topbar.classList.toggle('is-scrolled', now);
}, { passive: true });

/* roll over at midnight if the app is left open */
let openedOn = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    stopTick();
    scheduleSync(0);            // hand off pending edits before the app is put away
    return;
  }
  const swept = sweepCompleted();
  if (swept) save();
  if (swept || activeLive()) render();
  scheduleSync(300);            // and pick up whatever the other device did
  if (today() === openedOn) return;
  if (state.selected === openedOn) state.selected = today();
  openedOn = today();
  render();
});

addEventListener('online', () => scheduleSync(500));
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (sweepCompleted()) { save(); render(); }
  if (ensureRecur()) render();
  if (prefs.theme === 'auto') applyTheme();
  scheduleSync(0);
}, 300000);

/* While a session is running (or being set up) the other device should hear
   about it in seconds, not on the lazy five-minute cycle. */
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (focusActive() || activeHas('focus')) scheduleSync(0);
}, 15000);

$('#syncBtn').addEventListener('click', openSyncSheet);

/* ---------------- first run ----------------
   A short walkthrough, then the fork: start from a template (pick 4 of the
   5 classic sections \u2014 the fifth tray slot stays an Empty page, visible
   proof the app is made of parts you control) or start from scratch.
   Existing users never see any of this; their data migrates silently. */

const SU_TILES = [
  { id: 'home', n: 'Home', d: 'The hub: timer, quick add, what\u2019s due.', ic: 'home', lock: 1 },
  { id: 'calendar', n: 'Calendar', d: 'Month grid, dotted with your work.', ic: 'cal' },
  { id: 'schedule', n: 'Schedule', d: 'Bell schedule and your classes.', ic: 'clock' },
  { id: 'tasks', n: 'Tasks', d: 'Everything open, by deadline.', ic: 'tasks' },
  { id: 'focus', n: 'Focus', d: 'Timed studying, phone locked out.', ic: 'target' }
];

function suPlatform() {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return 'installed';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const SU_A2HS = {
  installed: `<div class="su-step">${TICK_ACCENT}<span><b>Already installed</b>
    You\u2019re running from the home screen \u2014 nothing to do here.</span></div>`,
  ios: `<div class="su-step"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5L12 3.5l4 4"/><rect x="5" y="10.5" width="14" height="10" rx="2.5"/></svg>
      <span><b>1 \u00b7 Open in Safari</b> Only Safari can install \u2014 Chrome on iPhone can\u2019t.</span></div>
    <div class="su-step"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5L12 3.5l4 4"/><rect x="5" y="10.5" width="14" height="10" rx="2.5"/></svg>
      <span><b>2 \u00b7 Tap Share</b> The square with the arrow, at the bottom of Safari.</span></div>
    <div class="su-step"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/></svg>
      <span><b>3 \u00b7 Add to Home Screen</b> It launches like a real app and works offline.</span></div>`,
  android: `<div class="su-step"><svg viewBox="0 0 24 24"><circle cx="12" cy="5.4" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.6" r="1.4"/></svg>
      <span><b>1 \u00b7 Open Chrome\u2019s menu</b> The three dots, top right.</span></div>
    <div class="su-step"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/></svg>
      <span><b>2 \u00b7 Add to Home screen</b> Or \u201cInstall app\u201d, if Chrome offers it.</span></div>`,
  desktop: `<div class="su-step"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M12 9v5M9.5 11.5L12 14l2.5-2.5"/></svg>
      <span><b>Install from the address bar</b> Most desktop browsers show a small install icon on the right of the address bar. Optional \u2014 the site works either way.</span></div>`
};

let su = null;   // { el, step, picked }

function suHTML() {
  const skip = `<button class="su-skip" data-su="skip" type="button">Skip</button>`;
  const next = t => `<div class="su-foot"><button class="btn" data-su="next" type="button">${t}</button></div>`;
  if (su.step === 0) return `<div class="su">${skip}<div class="su-body">
      <span class="news-icon">${NEWS_ICONS.spark}</span>
      <h1>A planner that knows your school day</h1>
      <p>It follows the bell schedule live \u2014 which period you\u2019re in, what\u2019s next,
        what\u2019s due \u2014 and everything stays on your device.</p>
    </div>${next('Get started')}</div>`;
  if (su.step === 1) return `<div class="su">${skip}<div class="su-body">
      <h1>Which school?</h1>
      <p>Pick yours and the app follows its real bell schedule \u2014 period times,
        late-start Wednesdays, minimum days and finals.</p>
      <div class="su-schools">${SCHOOL_ORDER.map(k => {
        const sc = SCHOOLS[k];
        return `<button class="su-school${prefs.school === k ? ' is-on' : ''}"
          data-su="school" data-k="${k}" type="button">
          <b>${esc(sc.name)}</b><i>${esc(sc.level)}${sc.periods.length ? ` \u00b7 ${sc.periods.length} periods` : ''}</i>
          <span class="su-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        </button>`;
      }).join('')}</div>
    </div>${next('Continue')}</div>`;

  if (su.step === 2) return `<div class="su">${skip}<div class="su-body">
      <h1>Pick a style</h1>
      <p>The whole app follows it, and Settings can change it any time.</p>
      <div class="su-styles">
        <button class="su-style${prefs.style !== 'default' ? ' is-on' : ''}" data-su="style" data-v="notebook" type="button">
          <span class="stylep stylep-nb"><i></i><i></i><i></i></span>
          <b>Notebook</b><i>Paper, ink, and a handwritten feel.</i>
          <span class="su-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        </button>
        <button class="su-style${prefs.style === 'default' ? ' is-on' : ''}" data-su="style" data-v="default" type="button">
          <span class="stylep stylep-def"><i></i><i></i><i></i></span>
          <b>Default</b><i>Plain and quick \u2014 the lighter option.</i>
          <span class="su-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        </button>
      </div>
      ${prefs.style !== 'default' ? `<p class="su-hint style-note">Notebook Style may load slightly slower because of its additional visual details and animations. We\u2019ll still keep it optimized and as lightweight as possible.</p>` : ''}
    </div>${next('Continue')}</div>`;

  if (su.step === 3) return `<div class="su">${skip}<div class="su-body">
      <span class="news-icon">${NEWS_ICONS.heart}</span>
      <h1>Tell it your classes once</h1>
      <p>Put a class in each period and the whole app wakes up: timers show real
        class names, and new homework already knows which class it belongs to.</p>
      <p>You can do it any time on the Schedule page \u2014 no need to now.</p>
    </div>${next('Continue')}</div>`;
  if (su.step === 4) return `<div class="su">${skip}<div class="su-body">
      <span class="news-icon">${NEWS_ICONS.shield}</span>
      <h1>Put it on your home screen</h1>
      <p>Installed, it opens instantly, works offline, and keeps your data safer.</p>
      <div class="su-steps">${SU_A2HS[suPlatform()]}</div>
    </div>${next('Continue')}</div>`;
  if (su.step === 5) return `<div class="su">${skip}<div class="su-body">
      <h1>How do you want to start?</h1>
      <div class="su-fork">
        <button class="su-card" data-su="tmpl" type="button">
          <b>Start with a template</b>
          <span>Pick four ready-made pages. One extra stays empty \u2014 yours to build.</span>
        </button>
        <button class="su-card" data-su="scratch" type="button">
          <b>Create from scratch</b>
          <span>Just Home, plus the block menu. Build every page yourself.</span>
        </button>
      </div>
    </div></div>`;
  // step 5: the template picker
  const tiles = SU_TILES.map(t => `
    <button class="su-tile${su.picked.has(t.id) ? ' is-on' : ''}${t.lock ? ' is-lock' : ''}"
      data-su="tile" data-id="${t.id}" type="button">
      <span class="su-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      ${ICONS[t.ic]}<b>${t.n}</b><i>${t.d}</i>
    </button>`).join('');
  const n = su.picked.size;
  return `<div class="su">${skip}<div class="su-body">
      <h1>Pick your four</h1>
      <p>Home always comes along. A fifth, empty page is added too \u2014 so you can
        see everything here is a block you can move.</p>
      <div class="su-grid">${tiles}</div>
      <p class="su-hint">${n === 4 ? 'Ready.' : `${n} of 4 picked`}</p>
    </div>
    <div class="su-foot"><button class="btn" data-su="build" type="button"
      ${n === 4 ? '' : 'disabled'}>Build my planner</button></div></div>`;
}

function suPaint() {
  su.el.innerHTML = suHTML();
  su.el.scrollTop = 0;
}

function suFinish(pages, edit) {
  layout = fixLayout({ pages });
  saveLayout();
  try { localStorage.setItem('planner.onboard', '1'); } catch {}
  state.tab = 'home';
  state.edit = !!edit;
  render();
  showView();
  su.el.classList.add('is-out');
  const el = su.el;
  su = null;
  setTimeout(() => {
    el.remove();
    tip('pencil', '#editBtn', { round: 22, delay: 400 });
    tip('gear', '#gearBtn', { round: 22 });
  }, 320);
}

function openSetup() {
  // someone meeting the app for the first time has nothing to catch up on
  markNewsSeen();
  su = { el: document.createElement('div'), step: 0, picked: new Set(['home']) };
  su.el.className = 'setup';
  document.body.appendChild(su.el);
  su.el.addEventListener('click', e => {
    const b = e.target.closest('[data-su]');
    if (!b || !su) return;
    const act = b.dataset.su;
    if (act === 'next') { su.step++; suPaint(); }
    else if (act === 'skip') suFinish(defaultPages());
    else if (act === 'scratch') suFinish([homePage()], true);
    else if (act === 'tmpl') { su.step = 6; suPaint(); }
    else if (act === 'style') {
      prefs.style = b.dataset.v;
      savePrefs();
      applyStyle();          // the setup screen restyles itself: a live preview
      suPaint();
    }
    else if (act === 'school') { setSchool(b.dataset.k); suPaint(); }
    else if (act === 'tile') {
      const id = b.dataset.id;
      if (id === 'home') return;               // locked in
      su.picked.has(id) ? su.picked.delete(id) : su.picked.add(id);
      if (su.picked.size > 4) {                 // room for only four
        for (const x of su.picked) if (x !== 'home' && x !== id) { su.picked.delete(x); break; }
      }
      suPaint();
    }
    else if (act === 'build' && su.picked.size === 4) {
      const pages = defaultPages().filter(pg => su.picked.has(pg.id));
      pages.push({ id: 'p' + bid(), name: 'Your page', icon: '\u2726', blocks: [] });
      suFinish(pages);
    }
  });
  suPaint();
}

/* Layout bootstrap. An existing user (there is v1 data) silently gets the
   default layout that reproduces the old five tabs; a brand-new user gets
   the same for now and the setup flow decides otherwise. */
let layout = loadLayout();
const isFresh = !layout && !localStorage.getItem(KEY);
if (!layout) {
  layout = { pages: defaultPages() };
  if (!isFresh) saveLayout();
}
if (!pageById(state.tab)) state.tab = (layout.pages.find(pg => pg.home) || layout.pages[0]).id;

loadSync();
// Must come after loadSync: save() marks the change as unsent, and that only
// works once the sync code is loaded. Sweeping first would drop the flag and
// leave the deletion sitting on this device.
if (sweepCompleted()) save();   // catches homework finished 2+ days before this launch
ensureRecur();
render();
showView();
paintSync();
if (isFresh && !localStorage.getItem('planner.onboard')) openSetup();
if (sync.code) scheduleSync(400);
startFocusWatch();
focusTick();

/* Once per device, and never over a focus session or an open sheet. Held
   back a beat so the app is on screen before it is asked to read anything. */
if (!newsSeen()) setTimeout(() => {
  if (wrap.hidden && !focusActive() && !document.querySelector('.setup')) openNews(0);
}, 750);
else {
  tip('pencil', '#editBtn', { round: 22, delay: 900 });
  tip('gear', '#gearBtn', { round: 22 });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------------- visit counting ----------------
   Counts one visit per launch, and enough to tell how many separate devices
   that adds up to. The id is a random string this device makes up for itself
   and keeps locally; it says nothing about who you are, and nothing else is
   collected — no IP, no location, no third-party script. Failure is silent
   and never blocks anything: if the counter is down, the app does not care. */

const VID_KEY = 'planner.vid';

function visitorId() {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      const r = crypto.getRandomValues(new Uint8Array(12));
      id = [...r].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch { return null; }        // storage blocked: this visit simply is not counted
}

/* A return after this long counts as a fresh visit. An installed app is
   normally resumed rather than reloaded, so without this its users would be
   counted once on install and then effectively never again, while someone in
   a browser tab counts on every open — the two would not be comparable. */
const VISIT_GAP = 30 * 60000;
let lastCount = 0;

function countVisit() {
  if (!SYNC_URL || !location.protocol.startsWith('http')) return;
  const v = visitorId();
  if (!v) return;
  lastCount = Date.now();
  fetch(SYNC_URL.replace(/\/+$/, '') + '/_a/hit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      v,
      // whether it was opened as an installed app rather than a browser tab
      s: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    }),
    keepalive: true
  }).catch(() => {});
}

/* Wait for the page to settle, but never longer than a moment: an idle
   callback with no deadline can be starved indefinitely on a busy page, and
   the visit would simply never be counted. */
function countWhenIdle() {
  if (window.requestIdleCallback) window.requestIdleCallback(countVisit, { timeout: 3000 });
  else setTimeout(countVisit, 1200);
}

// Only count a tab someone is actually looking at, so a background prerender
// is not mistaken for a person.
if (document.visibilityState === 'visible') countWhenIdle();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Either the launch happened in the background and this is the first time
  // it has been seen, or it is a real return after a long gap.
  if (!lastCount || Date.now() - lastCount > VISIT_GAP) countWhenIdle();
});
})();
