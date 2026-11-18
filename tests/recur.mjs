import { chromium } from 'playwright';
const style = process.argv[2] || 'notebook';
const theme = process.argv[3] || 'light';
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`); if (!cond) fails++; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts|_a\/hit|Failed to load/.test(m.text())) errors.push(m.text()); });
await page.route('**/_a/hit', r => r.fulfill({ body: '{"ok":true}' }));
await page.route('**/fonts.googleapis.com/**', r => r.abort());
const tips = ['addblk','blkopts','edit','gear','guess','icons','pages','pencil','picker','school','tourAddBlk','tourHero','tourPencil','tourSchedule','tourSettings','tourTask','tourToHome','tourToSchedule','trayicons'];
await page.addInitScript(([tips, style, theme]) => {
  if (localStorage.getItem('planner.onboard')) return;
  const now = Date.now();
  localStorage.setItem('planner.onboard', '1');
  localStorage.setItem('planner.lightNotebook', '1'); localStorage.setItem('planner.pageTurnOn', '1');
  localStorage.setItem('planner.tips.v1', JSON.stringify(tips));
  localStorage.setItem('planner.news', 'update-live-1');
  localStorage.setItem('planner.prefs.v1', JSON.stringify({ style, theme, pageTurn: 0 })); localStorage.setItem('planner.theme', theme);
  localStorage.setItem('planner.layout.v1', JSON.stringify({ pages: [{ id: 'home', name: 'Home', icon: 'home', blocks: [{ id: 'b1', t: 'recur' }, { id: 'b2', t: 'tasks' }] }] }));
  localStorage.setItem('planner.v1', JSON.stringify({ classes: [{ id: 'c1', name: 'Math', color: '#2f6fed', updatedAt: now }],
    recurs: [{ id: 'old', title: 'Read 20 min', classId: 'c1', updatedAt: now }], deleted: {} }));
}, [tips, style, theme]);
await page.goto((process.env.BASE || 'http://localhost:8080/'));
await page.waitForTimeout(800);
const norm = s => s.replace(/\s+/g, ' ');
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('planner.v1')));
const text = async () => norm(await page.locator('main').innerText());

ok(`the page is in ${style} style`, await page.evaluate(() => document.documentElement.dataset.style) === style);
ok('a rule from before repeats existed still reads as every school day', (await text()).includes('every school day'), await text());

// weekly rule from the Repeats block
await page.click('[data-act="recur-add"]');
await page.fill('#r-title', 'Vocab quiz');
ok('the day picker is hidden until Weekly is chosen', await page.locator('#r-days-f').isHidden());
await page.selectOption('#r-freq', 'weekly');
ok('choosing Weekly shows the day picker', await page.locator('#r-days-f').isVisible());
const startWd = await page.evaluate(() => new Date(document.querySelector('#r-start').value + 'T00:00').getDay());
ok('Weekly preselects the start date’s weekday', await page.locator(`.r-days [data-d="${startWd}"].is-active`).count() === 1);
await page.click('.r-days [data-d="5"]');
await page.fill('#f-time', '08:00');
await page.click('#form button[type=submit]');
await page.waitForTimeout(400);
let d = await db();
const quiz = d.recurs.find(r => r.title === 'Vocab quiz');
ok('the weekly rule is saved with its days and time', quiz && quiz.freq === 'weekly' && quiz.time === '08:00' && quiz.days.includes(5), JSON.stringify(quiz));
const quizHw = d.homework.filter(h => h.id.startsWith(`r${quiz.id}:`));
ok('exactly one upcoming copy of the weekly rule exists', quizHw.length === 1, JSON.stringify(quizHw));
ok('that copy carries the due time', quizHw[0]?.time === '08:00');
ok('the copy lands on a chosen weekday', quiz.days.includes(new Date(quizHw[0].due + 'T00:00').getDay()));
ok('the Repeats row says when it repeats and at what time', (await text()).includes('8:00 AM'), await text());

// monthly rule from the ordinary New homework sheet
await page.click('[data-act="add"][data-type="homework"]');
ok('a new homework sheet offers Repeat, defaulting to Never', await page.locator('#r-freq').inputValue() === '');
await page.fill('#f-title', 'Reading log');
await page.fill('#f-due', '2026-12-31');
await page.selectOption('#r-freq', 'monthly');
ok('choosing a repeat reveals the end date', await page.locator('#r-end-f').isVisible());
await page.click('#form button[type=submit]');
await page.waitForTimeout(400);
d = await db();
const log = d.recurs.find(r => r.title === 'Reading log');
ok('homework with a repeat becomes a rule starting on its due date', log && log.freq === 'monthly' && log.start === '2026-12-31', JSON.stringify(log));
ok('the first copy is on its start date', d.homework.some(h => h.id === `r${log.id}:2026-12-31`));
ok('the rule reads as monthly on the 31st', (await text()).includes('monthly on the 31st'), await text());

// a plain homework with a time, no repeat
await page.click('[data-act="add"][data-type="homework"]');
await page.fill('#f-title', 'Worksheet');
await page.fill('#f-time', '15:30');
await page.click('#form button[type=submit]');
await page.waitForTimeout(400);
d = await db();
ok('homework set to Never stays a single item', !d.recurs.some(r => r.title === 'Worksheet') && d.homework.filter(h => h.title === 'Worksheet').length === 1);
ok('a single item shows its due time', (await text()).includes('3:30 PM'));

// editing a rule updates the copy already on the list
await page.click(`[data-act="recur-edit"][data-id="${quiz.id}"]`);
ok('a saved weekly rule opens with its days still chosen', await page.locator('.r-days [data-d="5"].is-active').count() === 1);
await page.fill('#r-title', 'Vocab quiz v2');
await page.click('#form button[type=submit]');
await page.waitForTimeout(400);
d = await db();
ok('editing a rule renames its upcoming copy', d.homework.some(h => h.id.startsWith(`r${quiz.id}:`) && h.title === 'Vocab quiz v2'));

// switching the rule to a weekday it no longer lands on drops the stale copy
const before = d.homework.find(h => h.id.startsWith(`r${quiz.id}:`)).due;
await page.click(`[data-act="recur-edit"][data-id="${quiz.id}"]`);
await page.selectOption('#r-freq', 'monthly');
await page.fill('#r-start', '2027-01-15');
await page.click('#form button[type=submit]');
await page.waitForTimeout(400);
d = await db();
const copies = d.homework.filter(h => h.id.startsWith(`r${quiz.id}:`));
ok('a copy the new rule no longer lands on is removed', !copies.some(h => h.due === before), JSON.stringify(copies));
ok('and the new rule’s copy takes its place', copies.length === 1 && copies[0].due === '2027-01-15', JSON.stringify(copies));

// reloading never duplicates
await page.reload(); await page.waitForTimeout(800);
const d2 = await db();
ok('a reload makes no duplicate copies', d2.homework.length === d.homework.length, `${d.homework.length} -> ${d2.homework.length}`);

// stop repeating from inside the sheet
await page.click(`[data-act="recur-edit"][data-id="${log.id}"]`);
await page.click('#form [data-act="recur-del"]');
await page.waitForTimeout(400);
d = await db();
ok('Stop repeating removes the rule and closes the sheet', !d.recurs.some(r => r.id === log.id) && await page.locator('#form').count() === 0);

// end before start is refused
await page.click('[data-act="recur-add"]');
await page.fill('#r-title', 'Bad');
await page.fill('#r-start', '2026-12-10');
await page.fill('#r-end', '2026-12-01');
await page.click('#form button[type=submit]');
ok('an end date before the start is refused', await page.locator('#r-end.is-bad').count() === 1);
await page.click('[data-act="close"]');
await page.waitForTimeout(400);

ok('no script errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
