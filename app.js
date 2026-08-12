/* Planner — a minimal personal calendar & school planner.
   No dependencies, no build step, no accounts. Data lives in localStorage. */
(() => {
'use strict';

/* ---------------- storage ---------------- */

const KEY = 'planner.v1';
const emptyDB = () => ({ classes: [], homework: [], notes: [], projects: [], events: [] });

const db = load();

function load() {
  const base = emptyDB();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) for (const k of Object.keys(base)) if (Array.isArray(raw[k])) base[k] = raw[k];
  } catch {}
  return base;
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }, 60);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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

/* ---------------- rendering ---------------- */

function render() {
  const inClass = state.tab === 'classes' && state.classId;
  $('#title').textContent =
    state.tab === 'calendar' ? `${MONTHS[state.month]} ${state.year}`
    : inClass ? className(state.classId)
    : state.tab === 'classes' ? 'Classes' : 'Projects';

  $('#prevMonth').hidden = $('#nextMonth').hidden = state.tab !== 'calendar';

  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-active', t.dataset.tab === state.tab);
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${state.tab}`;

  if (state.tab === 'calendar') renderCalendar();
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
  const c = { id: uid(), name, color: COLORS[db.classes.length % COLORS.length] };
  db.classes.push(c);
  return c.id;
}

function submitForm() {
  if (!ctx) return;
  const editing = ctx.mode === 'edit';

  if (ctx.mode === 'class') {
    const name = val('#f-name');
    if (!name) return flash('#f-name');
    if (ctx.id) Object.assign(byId(db.classes, ctx.id), { name, color: ctx.color });
    else db.classes.push({ id: uid(), name, color: ctx.color });
    return commit();
  }

  if (ctx.type === 'homework') {
    const title = val('#f-title');
    if (!title) return flash('#f-title');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const data = { title, classId, due: val('#f-due') || shift(today(), 1), details: val('#f-details') };
    if (editing) Object.assign(byId(db.homework, ctx.id), data);
    else db.homework.push({ id: uid(), done: false, ...data });

  } else if (ctx.type === 'note') {
    const text = val('#f-text');
    if (!text) return flash('#f-text');
    const classId = resolveClass();
    if (!classId) return flash('#f-newclass');
    const data = { text, classId, date: val('#f-date') || today() };
    if (editing) Object.assign(byId(db.notes, ctx.id), data);
    else db.notes.push({ id: uid(), ...data });

  } else if (ctx.type === 'project') {
    const name = val('#f-name');
    if (!name) return flash('#f-name');
    const data = {
      name, due: val('#f-due') || shift(today(), 7),
      status: val('#f-status') || 'todo', description: val('#f-desc')
    };
    if (editing) Object.assign(byId(db.projects, ctx.id), data);
    else db.projects.push({ id: uid(), ...data });

  } else {
    const title = val('#f-title');
    if (!title) return flash('#f-title');
    const data = { title, date: val('#f-date') || today(), details: val('#f-details') };
    if (editing) Object.assign(byId(db.events, ctx.id), data);
    else db.events.push({ id: uid(), ...data });
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
  if (ctx.mode === 'class') {
    const c = byId(db.classes, ctx.id);
    if (!confirm(`Delete “${c?.name}” and its homework and notes?`)) return;
    db.classes = db.classes.filter(x => x.id !== ctx.id);
    db.homework = db.homework.filter(x => x.classId !== ctx.id);
    db.notes = db.notes.filter(x => x.classId !== ctx.id);
    state.classId = null;
    return commit();
  }
  const key = LISTS[ctx.type];
  db[key] = db[key].filter(x => x.id !== ctx.id);
  commit();
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
addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || today() === openedOn) return;
  if (state.selected === openedOn) state.selected = today();
  openedOn = today();
  render();
});

render();
showView();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
