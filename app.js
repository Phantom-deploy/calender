/* Planner — a minimal personal calendar & school planner.
   No dependencies, no build step, no accounts. Data lives in localStorage. */
(() => {
'use strict';

/* ---------------- storage ---------------- */

const KEY = 'planner.v1';
const KINDS = ['classes', 'homework', 'notes', 'projects', 'events', 'schedule', 'overrides'];

/* `deleted` holds tombstones (id -> time) so a delete on one device also
   removes the item on the others instead of being re-added by a merge. */
const emptyDB = () => ({ classes: [], homework: [], notes: [], projects: [], events: [],
  schedule: [], overrides: [], deleted: {} });

const db = load();

function load() {
  const base = emptyDB();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      for (const k of KINDS) if (Array.isArray(raw[k])) base[k] = raw[k];
      if (raw.deleted && typeof raw.deleted === 'object') base.deleted = raw.deleted;
    }
  } catch {}
  return base;
}

let saveTimer;
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

const COLORS = ['#2f6fed', '#e2694b', '#2fa86b', '#a25ddc', '#d9a01e', '#e0559a', '#3aa8c1', '#7a828e'];
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
  tab: 'calendar',
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
  for (const e of db.events) if (e.date === date) out.push({ kind: 'event', item: e, color: EVENT_COLOR });
  for (const n of db.notes) if (n.date === date) out.push({ kind: 'note', item: n, color: classColor(n.classId) });
  return out;
}


/* ---------------- school day (Pacific time) ----------------
   The bell schedule is San Diego local time, so the clock here is pinned to
   America/Los_Angeles no matter where the device thinks it is. Intl handles
   the DST switch for us. */

const BELL = window.BELL;
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

/* ---------------- rendering ---------------- */

function render() {
  const inClass = state.tab === 'classes' && state.classId;
  $('#title').textContent =
    state.tab === 'calendar' ? `${MONTHS[state.month]} ${state.year}`
    : state.tab === 'schedule' ? 'Schedule'
    : inClass ? className(state.classId)
    : state.tab === 'classes' ? 'Classes' : 'Projects';

  $('#prevMonth').hidden = $('#nextMonth').hidden = state.tab !== 'calendar';

  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-active', t.dataset.tab === state.tab);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${state.tab}`;

  if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'schedule') renderSchedule();
  else if (state.tab === 'classes') inClass ? renderClass() : renderClasses();
  else renderProjects();
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
    return `<div class="row${item.done ? ' is-done' : ''}">
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
    return `<button class="row" ${open}>
      <span class="swatch" style="background:${EVENT_COLOR}"></span>
      <span class="row-main">
        <span class="row-title">${esc(item.title)}</span>
        <span class="row-sub">${relLabel(item.date)}</span>
      </span>${CHEV}</button>`;
  }

  return `<button class="row" ${open}>
    <span class="swatch" style="background:${classColor(item.classId)}"></span>
    <span class="row-main">
      <span class="row-title">${esc(item.text.split('\n')[0])}</span>
      <span class="row-sub">${esc(className(item.classId))} · Note</span>
    </span>${CHEV}</button>`;
}

function renderClasses() {
  const rows = db.classes.map(c => {
    const open = db.homework.filter(h => h.classId === c.id && !h.done).length;
    const notes = db.notes.filter(n => n.classId === c.id).length;
    return `<button class="row" data-act="class" data-id="${c.id}">
      <span class="swatch" style="background:${c.color}"></span>
      <span class="row-main"><span class="row-title">${esc(c.name)}</span>
        <span class="row-sub">${open} open · ${notes} note${notes === 1 ? '' : 's'}</span>
      </span>${CHEV}</button>`;
  }).join('');

  $('#view-classes').innerHTML =
    (rows ? `<div class="card top">${rows}</div>`
          : `<p class="empty">No classes yet. Add one to start tracking homework and notes.</p>`) +
    `<div class="card gap"><button class="row" data-act="new-class">${PLUS}
      <span class="row-main"><span class="row-title accent">New Class</span></span></button></div>`;
}

function renderClass() {
  const c = byId(db.classes, state.classId);
  if (!c) { state.classId = null; return renderClasses(); }

  const hw = db.homework.filter(h => h.classId === c.id)
    .sort((a, b) => (a.done === b.done ? (a.due < b.due ? -1 : 1) : a.done ? 1 : -1));
  const notes = db.notes.filter(n => n.classId === c.id).sort((a, b) => a.date < b.date ? 1 : -1);

  const hwRows = hw.map(h => rowHTML({ kind: 'homework', item: h }, { hideClass: true })).join('');
  const noteRows = notes.map(n => `<button class="row" data-act="open" data-kind="note" data-id="${n.id}">
      <span class="row-main"><span class="note-body">${esc(n.text)}</span>
        <span class="row-sub">${dateLabel(n.date)}</span></span></button>`).join('');

  $('#view-classes').innerHTML = `
    <p class="back"><button class="link-btn" data-act="back">‹ Classes</button></p>
    <div class="section-head"><h2>Homework</h2>
      <button class="link-btn" data-act="add" data-type="homework" data-class="${c.id}">Add</button></div>
    ${hwRows ? `<div class="card">${hwRows}</div>` : `<p class="empty">No homework.</p>`}
    <div class="section-head"><h2>Notes</h2>
      <button class="link-btn" data-act="add" data-type="note" data-class="${c.id}">Add</button></div>
    ${noteRows ? `<div class="card">${noteRows}</div>` : `<p class="empty">No notes.</p>`}
    <div class="card gap-lg"><button class="row" data-act="edit-class" data-id="${c.id}">
      <span class="swatch" style="background:${c.color}"></span>
      <span class="row-main"><span class="row-title">Edit class</span></span>${CHEV}</button></div>`;
}

function renderProjects() {
  const list = [...db.projects].sort((a, b) => {
    const done = (statusOf(a).pct === 100) - (statusOf(b).pct === 100);
    return done || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
  });

  const rows = list.map(p => {
    const st = statusOf(p);
    const late = st.pct < 100 && p.due < today();
    return `<button class="row" data-act="open" data-kind="project" data-id="${p.id}">
      <span class="row-main">
        <span class="row-title">${esc(p.name)}</span>
        <span class="row-sub${late ? ' is-late' : ''}">${st.label} · ${relLabel(p.due)}</span>
        <span class="bar"><span style="width:${st.pct}%"></span></span>
      </span>${CHEV}</button>`;
  }).join('');

  $('#view-projects').innerHTML =
    (rows ? `<div class="card top">${rows}</div>`
          : `<p class="empty">No projects yet. Big assignments added here also show on the calendar.</p>`) +
    `<div class="card gap"><button class="row" data-act="add" data-type="project">${PLUS}
      <span class="row-main"><span class="row-title accent">New Project</span></span></button></div>`;
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

function heroHTML(plan, pos, now) {
  const dayName = parseISO(now.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  let tone = '', label = '', title = '', time = '', sub = '', bar = '';

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

  return `<div class="hero ${tone}" id="hero">
      <div class="hero-label">${esc(label)}</div>
      <div class="hero-title" id="heroTitle">${esc(title)}</div>
      ${time ? `<div class="hero-time" id="heroTime">${time}</div>` : ''}
      <div class="hero-sub" id="heroSub">${esc(sub)}</div>
      ${bar}
    </div>
    ${plan ? `<div class="section-head"><h2>${esc(plan.name)}</h2>
      <button class="link-btn" data-act="pick-plan">Change</button></div>
      <div class="card">${plan ? blocksHTML(pos) : ''}</div>` : ''}`;
}

function blocksHTML(pos) {
  const active = pos.block;
  return pos.blocks.map(b => {
    const cls = periodClass(b.period);
    const isNow = active && b.start === active.start;
    const done = pos.state === 'after' || (active && hhmmToSecs(b.end) <= hhmmToSecs(active.start));
    return `<div class="row block${isNow ? ' is-now' : ''}${done ? ' is-past' : ''}">
      <span class="block-time">${clockLabel(b.start)}</span>
      <span class="row-main">
        <span class="row-title">${esc(cls ? cls.name : b.label)}</span>
        <span class="row-sub">${cls ? esc(b.label) + ' · ' : ''}until ${clockLabel(b.end)}</span>
      </span>
      ${cls ? `<span class="swatch" style="background:${cls.color}"></span>` : ''}
    </div>`;
  }).join('');
}

function periodsHTML() {
  const rows = [1, 2, 3, 4, 5].map(n => {
    const cls = periodClass(n);
    return `<button class="row" data-act="period" data-period="${n}">
      <span class="block-time">P${n}</span>
      <span class="row-main">
        <span class="row-title${cls ? '' : ' is-muted'}">${cls ? esc(cls.name) : 'Add a class'}</span>
      </span>
      ${cls ? `<span class="swatch" style="background:${cls.color}"></span>` : ''}${CHEV}</button>`;
  }).join('');
  return `<div class="section-head"><h2>My periods</h2></div><div class="card">${rows}</div>`;
}

/** Update the countdown in place every second; redraw fully when the block changes. */
function tick() {
  if (state.tab !== 'schedule' || document.visibilityState !== 'visible') return stopTick();
  const now = ptNow();
  const plan = planFor(now.date, now.weekday);
  const pos = dayPosition(plan, now.secs);

  if (posKey(pos) !== tickKey) return renderSchedule();

  const time = $('#heroTime');
  if (time) time.textContent = countdown(pos.state === 'in' ? pos.left : pos.until);
  const bar = document.querySelector('.hero-bar > span');
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

function openSheet(html, context) {
  ctx = context || null;
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  wrap.hidden = false;
  document.body.classList.add('is-locked');
  sheet.scrollTop = 0;
  if (ctx?.autofocus !== false) sheet.querySelector('[data-autofocus]')?.focus();
  fitSheet();
}

function closeSheet() {
  wrap.hidden = true;
  sheet.innerHTML = '';
  sheet.style.bottom = sheet.style.maxHeight = '';
  ctx = null;
  document.body.classList.remove('is-locked');
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

function classField(selected) {
  const showNew = !db.classes.length;
  const options = db.classes.map(c =>
    `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('') +
    `<option value="__new"${showNew ? ' selected' : ''}>New class…</option>`;
  return `<div class="field"><label for="f-class">Class</label>
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
    const slot = byId(db.schedule, id);
    if (slot) touch(Object.assign(slot, { classId }));
    else db.schedule.push(touch({ id, period: ctx.period, classId }));
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
    const data = { title, date: val('#f-date') || today(), details: val('#f-details') };
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
  el.focus();
}

function removeItem() {
  if (!ctx) return;
  if (ctx.mode === 'period') {
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const id = `p${ctx.period}`;
    const slot = byId(db.schedule, id);
    if (slot) touch(Object.assign(slot, { classId }));
    else db.schedule.push(touch({ id, period: ctx.period, classId }));
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
    const wrongCode = e && (e.name === 'OperationError' || /operation-specific/i.test(e.message || ''));
    setStatus('error', wrongCode ? 'That code does not match this data' : (e.message || 'Could not reach the server'));
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
    <p class="hint">Enter this code on another device and both stay in step.</p>
    <p class="sync-status" id="syncStatus">${esc(syncLabel())}</p>
    <button class="btn" type="button" data-act="sync-now">Sync now</button>
    <button class="btn is-ghost" type="button" data-act="sync-off">Stop syncing on this device</button>`
  : `
    <p class="hint">Sync keeps the same homework, notes and projects on every device you use.
      No account: one code is the key, and your data is encrypted before it leaves this device.</p>
    ${SYNC_URL ? '' : `<div class="field"><label for="f-url">Server</label>
      <input id="f-url" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
        placeholder="https://…workers.dev" value="${esc(sync.url)}"></div>`}
    <button class="btn" type="button" data-act="sync-start">Start syncing</button>
    <p class="hint" style="text-align:center;margin:14px 4px 6px">or use a code from another device</p>
    <div class="field">
      <input id="f-code" type="text" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters"
        autocorrect="off" spellcheck="false" enterkeyhint="done"></div>
    <button class="btn is-soft" type="button" data-act="sync-connect">Connect</button>`;

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
      touch(h);
      save();
      render();
      if (h.done) document.querySelector(`.check[data-id="${h.id}"]`)?.classList.add('pop');
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

sheet.addEventListener('submit', e => { e.preventDefault(); submitForm(); });
sheet.addEventListener('input', e => e.target.classList.remove('is-bad'));
$('#scrim').addEventListener('click', closeSheet);
addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden) closeSheet(); });

$('#fab').addEventListener('click', () => openAdd({
  type: state.tab === 'projects' ? 'project' : 'homework',
  classId: state.classId || undefined
}));

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
    if (state.tab === t.dataset.tab && t.dataset.tab === 'classes') state.classId = null;
    state.tab = t.dataset.tab;
    if (state.tab !== 'schedule') stopTick();
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

/* hairline under the top bar once the page scrolls */
const topbar = document.querySelector('.topbar');
addEventListener('scroll', () => topbar.classList.toggle('is-scrolled', scrollY > 4), { passive: true });

/* roll over at midnight if the app is left open */
let openedOn = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    stopTick();
    scheduleSync(0);            // hand off pending edits before the app is put away
    return;
  }
  if (state.tab === 'schedule') renderSchedule();
  scheduleSync(300);            // and pick up whatever the other device did
  if (today() === openedOn) return;
  if (state.selected === openedOn) state.selected = today();
  openedOn = today();
  render();
});

addEventListener('online', () => scheduleSync(500));
setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 300000);

$('#syncBtn').addEventListener('click', openSyncSheet);

render();
showView();
loadSync();
paintSync();
if (sync.code) scheduleSync(400);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
