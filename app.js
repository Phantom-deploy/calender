/* Planner — a minimal personal calendar & school planner.
   No dependencies, no build step, no accounts. Data lives in localStorage. */
(() => {
'use strict';

/* ---------------- storage ---------------- */

const KEY = 'planner.v1';
const KINDS = ['classes', 'homework', 'notes', 'projects', 'events', 'schedule', 'overrides', 'focus'];

/* `deleted` holds tombstones (id -> time) so a delete on one device also
   removes the item on the others instead of being re-added by a merge. */
const emptyDB = () => ({ classes: [], homework: [], notes: [], projects: [], events: [],
  schedule: [], overrides: [], focus: [], deleted: {} });

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
const BELL = window.BELL || { schedules: {}, byDate: {}, byWeekday: [], pickable: [] };
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
  return { key, name: s.name, custom: !!override, rows: s.rows };
}

/** Where we are in the day: in a block, between blocks, or outside school hours. */
function dayPosition(plan, secs) {
  if (!plan) return { state: 'none' };
  const blocks = plan.rows.map(r => ({ label: r[0], start: r[1], end: r[2], period: r[3] }));
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

/* ---------------- rendering ---------------- */

function render() {
  const inClass = state.tab === 'schedule' && state.classId;
  $('#title').textContent =
    state.tab === 'home' ? homeTitle()
    : state.tab === 'calendar' ? `${MONTHS[state.month]} ${state.year}`
    : inClass ? className(state.classId)
    : state.tab === 'schedule' ? 'Schedule'
    : state.tab === 'focus' ? 'Focus' : 'Tasks';

  $('#prevMonth').hidden = $('#nextMonth').hidden = state.tab !== 'calendar';

  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-active', t.dataset.tab === state.tab);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${state.tab}`;

  if (state.tab === 'home') renderHome();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'schedule') inClass ? renderClass() : renderSchedule();
  else if (state.tab === 'focus') renderFocus();
  else renderTasks();
  paintFocusBanner();
}

function renderCalendar() {
  const wk = $('#weekdays');
  if (!wk.childElementCount) wk.innerHTML = WEEKDAYS.map(d => `<span>${d}</span>`).join('');

  const first = new Date(state.year, state.month, 1);
  const start = new Date(state.year, state.month, 1 - first.getDay());
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
  $('#grid').innerHTML = html;
  renderAgenda();
}

function renderAgenda(animate) {
  const el = $('#agenda');
  el.innerHTML = agendaHTML();
  if (animate) replay(el, 'anim-soft');
}

/** Restart an entrance animation on an element that is already on screen. */
function replay(el, cls) {
  el.classList.remove('anim-view', 'anim-soft', 'anim-left', 'anim-right');
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
  if (!c) { state.classId = null; return renderSchedule(); }

  const hw = db.homework.filter(h => h.classId === c.id)
    .sort((a, b) => (a.done === b.done ? (a.due < b.due ? -1 : 1) : a.done ? 1 : -1));
  const notes = db.notes.filter(n => n.classId === c.id).sort((a, b) => a.date < b.date ? 1 : -1);

  const hwRows = hw.map(h => rowHTML({ kind: 'homework', item: h }, { hideClass: true })).join('');
  const noteRows = notes.map(n => `<button class="row" data-act="open" data-kind="note" data-id="${n.id}">
      <span class="row-main"><span class="note-body">${esc(n.text)}</span>
        <span class="row-sub">${dateLabel(n.date)}</span></span></button>`).join('');

  const slot = db.schedule.find(x => x.classId === c.id);
  $('#view-schedule').innerHTML = `
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

function renderTasks() {
  const groups = taskGroups();
  const body = groups.map((g, i) => `
    <div class="section-head task-in" style="--i:${i}">
      <h2>${g.title}</h2><span class="count">${g.items.length}</span></div>
    <div class="card task-in${g.key === 'done' ? ' is-finished' : ''}" style="--i:${i}"
      >${g.items.map(taskRowHTML).join('')}</div>`).join('');

  $('#view-tasks').innerHTML =
    (body || `<p class="empty">Nothing to do. Homework and projects you add show up here,
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

function renderHome() {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);
  tickKey = posKey(pos);

  const { tonight, due } = homeWork();
  const panel = (title, items, empty) => `<section class="panel">
      <div class="panel-head"><h2>${title}</h2>
        <button class="link-btn" data-act="add" data-type="homework">Add</button></div>
      ${items.length
        ? items.map(h => rowHTML({ kind: 'homework', item: h })).join('')
        : `<p class="empty">${empty}</p>`}
    </section>`;

  $('#view-home').innerHTML =
    `<button class="hero-link" data-act="tab" data-to="schedule">${heroHTML(plan, pos, now, true)}</button>
    <div class="quick">
      <button class="btn" data-act="add" data-type="homework">Add homework</button>
      <div class="chips">
        <button class="chip" data-act="add" data-type="note">Note</button>
        <button class="chip" data-act="add" data-type="project">Project</button>
        <button class="chip" data-act="add" data-type="event">Date</button>
      </div>
    </div>
    ${panel('Do tonight', tonight, 'Nothing due tomorrow.')}
    ${panel('Still due', due, 'Nothing outstanding. Enjoy it.')}`;

  startTick();
}

/* ---------------- schedule view ---------------- */

let tickTimer = null, tickKey = '';

function renderSchedule() {
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);
  tickKey = posKey(pos);

  $('#view-schedule').innerHTML = heroHTML(plan, pos, now) + periodsHTML();
  startTick();
}

/** Identifies the current block, so the tick knows when to redraw the list. */
const posKey = pos => pos.state + '|' + (pos.block ? pos.block.start : (pos.next ? pos.next.start : ''));

function heroHTML(plan, pos, now, compact) {
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
    sub = `left · ends ${clockLabel(pos.block.end)}`;
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
    </div>
    ${compact || !plan ? '' : `<div class="section-head"><h2>${esc(plan.name)}</h2>
      <button class="link-btn" data-act="pick-plan">Change</button></div>
      <div class="card">${blocksHTML(pos)}</div>`}`;
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

/* Periods and classes are one section: a period row opens that class (its
   homework and notes), an empty one asks which class to put there, and any
   class without a period is listed underneath. */
function periodsHTML() {
  const rows = [1, 2, 3, 4, 5].map(n => {
    const cls = periodClass(n);
    const meta = blockMeta(n);
    const open = cls ? `data-act="class" data-id="${cls.id}"` : `data-act="period" data-period="${n}"`;
    return `<button class="row" ${open}>
      <span class="block-time">P${n}</span>
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

  return `<div class="section-head"><h2>Classes &amp; periods</h2></div>
    <div class="card">${rows}${spare}
      <button class="row" data-act="new-class">${PLUS}
        <span class="row-main"><span class="row-title accent">New class</span></span></button>
    </div>`;
}

/** Update the countdown in place every second; redraw fully when the block changes. */
function tick() {
  const onClock = state.tab === 'schedule' || state.tab === 'home';
  if (!onClock || document.visibilityState !== 'visible') return stopTick();
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);

  if (posKey(pos) !== tickKey) return state.tab === 'home' ? renderHome() : renderSchedule();

  // scope to the view on screen: home and schedule each have a hero
  const root = $(`#view-${state.tab}`);
  const time = root && root.querySelector('.hero-time');
  if (time) time.textContent = countdown(pos.state === 'in' ? pos.left : pos.until);
  const bar = root && root.querySelector('.hero-bar > span');
  if (bar && pos.state === 'in') bar.style.width = `${Math.round(pos.elapsed / pos.total * 100)}%`;
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
const baseDate = () => (state.tab === 'calendar' && state.selected !== today()) ? state.selected : today();

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
      <input id="f-due" type="date" value="${esc(v.due || defaultDue(1))}"></div>
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
  const segs = TYPES.map(t =>
    `<button type="button" data-act="type" data-type="${t.id}"${t.id === type ? ' class="is-active"' : ''}>${t.label}</button>`).join('');

  openSheet(`
    <div class="sheet-head"><h2 id="sheetTitle">New</h2>
      <button class="link-btn" data-act="close" type="button">Cancel</button></div>
    <div class="segmented">${segs}</div>
    <form id="form" novalidate>${formHTML(type, { classId: seed.classId })}
      <button class="btn" type="submit">Add</button>
    </form>`, { mode: 'add', type, seed });
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
    if (ctx.id) touch(Object.assign(byId(db.classes, ctx.id), { name, color: ctx.color }));
    else db.classes.push(touch({ id: uid(), name, color: ctx.color }));
    return commit();
  }

  if (ctx.type === 'homework') {
    const title = val('#f-title');
    if (!title) return flash('#f-title');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const data = { title, classId, due: val('#f-due') || shift(today(), 1), details: val('#f-details') };
    if (editing) touch(Object.assign(byId(db.homework, ctx.id), data));
    else db.homework.push(touch({ id: uid(), done: false, ...data }));

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
    if (!confirm(`Delete “${c?.name}” and its homework and notes?`)) return;
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
  const s = session();
  const phase = focusPhase(s, Date.now());
  const plan = focusPlan();

  if (focusActive()) {
    const label = phase.kind === 'break'
      ? `Break ${phase.index + 1} of ${phase.of}`
      : `Stretch ${phase.index + 1} of ${phase.of}`;
    $('#view-focus').innerHTML = `
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
    return;
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

  $('#view-focus').innerHTML = `
    <div class="focus-setup">
      ${step('total', 'Focus time', plan.totalMs / 60000, 'min')}
      ${step('breaks', 'Breaks', plan.breaks, '')}
      ${plan.breaks ? step('breakLen', 'Break length', plan.breakMs / 60000, 'min') : ''}
      <p class="focus-summary">${focusSummary(plan)}</p>
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
  if (state.tab === 'focus' && !isPhone()) {
    const t = $('#view-focus .calm-time');
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
const NEWS_ID = 'massive-update-1';

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
    eyebrow: 'What’s coming',
    title: 'A massive update',
    body: 'I’m now building the biggest one yet:',
    list: [
      'Fully customizable pages and elements, arranged to your liking',
      'A bunch of new elements',
      'Homework that already knows its class — taken from the one you’re in, or the one you just had, so adding it takes seconds',
      'Better sync'
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

/* ---------------- events ---------------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;

  switch (el.dataset.act) {
    /* selection moves in place so the day pill can animate */
    case 'pick': {
      if (el.dataset.date === state.selected) break;
      state.selected = el.dataset.date;
      for (const d of grid.querySelectorAll('.day.is-selected')) {
        d.classList.remove('is-selected');
        d.removeAttribute('aria-current');
      }
      el.classList.add('is-selected');
      el.setAttribute('aria-current', 'date');
      renderAgenda(true);
      break;
    }

    case 'toggle': {
      const h = byId(db.homework, el.dataset.id);
      if (!h) break;
      h.done = !h.done;
      h.completedAt = h.done ? stamp() : undefined;   // starts the 2-day countdown to removal
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
    case 'class': state.tab = 'schedule'; state.classId = el.dataset.id; render(); scrollTo(0, 0); showView(); break;
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

    case 'news': openNews(0); break;
    case 'news-back': newsGo(-1); break;
    case 'news-dot': {
      const to = +el.dataset.i;
      if (to !== ctx?.page) openNews(to, to > ctx.page ? 1 : -1);
      break;
    }
    case 'news-next':
      if (ctx?.page === NEWS.length - 1) closeSheet(); else newsGo(1);
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
      state.tab = el.dataset.to;
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
  replay($(`#view-${state.tab}`), 'anim-view');
}

function moveMonth(n) {
  const d = new Date(state.year, state.month + n, 1);
  state.month = d.getMonth();
  state.year = d.getFullYear();
  $('#title').textContent = `${MONTHS[state.month]} ${state.year}`;
  renderCalendar();
  replay(grid, n > 0 ? 'anim-right' : 'anim-left');
}

$('#prevMonth').addEventListener('click', () => moveMonth(-1));
$('#nextMonth').addEventListener('click', () => moveMonth(1));

/* tapping the month name jumps back to today */
$('#title').addEventListener('click', () => {
  if (state.tab !== 'calendar') return;
  const now = new Date();
  state.month = now.getMonth();
  state.year = now.getFullYear();
  state.selected = today();
  render();
  showView();
});

for (const t of document.querySelectorAll('.tab')) {
  t.addEventListener('click', () => {
    if (t.dataset.tab === 'schedule') state.classId = null;   // tapping Schedule leaves a class
    state.tab = t.dataset.tab;
    if (state.tab !== 'schedule' && state.tab !== 'home') stopTick();
    render();
    scrollTo(0, 0);
    showView();
  });
}

/* horizontal swipe on the grid changes month */
let sx = 0, sy = 0, swiping = false;
const grid = $('#grid');
grid.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true;
}, { passive: true });
grid.addEventListener('touchend', e => {
  if (!swiping) return;
  swiping = false;
  const t = e.changedTouches[0];
  const dx = t.clientX - sx, dy = t.clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.7) moveMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* theme */
const themeMeta = $('#themeColor');
const barMeta = $('#statusBar');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeMeta.content = t === 'dark' ? '#000000' : '#f6f7f9';
  // iOS reads this at launch: dark gets a black status bar instead of a white one.
  barMeta.content = t === 'dark' ? 'black' : 'default';
  try { localStorage.setItem('planner.theme', t); } catch {}
}
let storedTheme = null;
try { storedTheme = localStorage.getItem('planner.theme'); } catch {}
setTheme(storedTheme === 'dark' ? 'dark' : 'light');
$('#themeBtn').addEventListener('click', () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

/* hairline under the top bar once the page scrolls. The class is only touched
   when it actually changes, so a long scroll doesn't poke the DOM every frame. */
const topbar = document.querySelector('.topbar');
let scrolled = false;
addEventListener('scroll', () => {
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
  if (swept || state.tab === 'schedule' || state.tab === 'home') render();
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
  scheduleSync(0);
}, 300000);

/* While a session is running (or being set up) the other device should hear
   about it in seconds, not on the lazy five-minute cycle. */
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (focusActive() || state.tab === 'focus') scheduleSync(0);
}, 15000);

$('#syncBtn').addEventListener('click', openSyncSheet);

loadSync();
// Must come after loadSync: save() marks the change as unsent, and that only
// works once the sync code is loaded. Sweeping first would drop the flag and
// leave the deletion sitting on this device.
if (sweepCompleted()) save();   // catches homework finished 2+ days before this launch
render();
showView();
paintSync();
if (sync.code) scheduleSync(400);
startFocusWatch();
focusTick();

/* Once per device, and never over a focus session or an open sheet. Held
   back a beat so the app is on screen before it is asked to read anything. */
if (!newsSeen()) setTimeout(() => {
  if (wrap.hidden && !focusActive()) openNews(0);
}, 750);

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
