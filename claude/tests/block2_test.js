// Block 2: Aufgaben-Kachel mit Vorlauf, Gekauftes und Erledigtes ausblenden.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync('/tmp/essen_test.js', 'utf8');
const BASIS = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);

// Heute ist Freitag, 25.09.2026.
const ch = (id, title, due, extra = {}) => Object.assign({ id, title, due_date: due, assigned_to: 'u1', status: 'offen', created_by: 'u1',
  household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null,
  completed_at: null, completed_by: null, priority: 'normal' }, extra);
const w = (n, u) => ({ recurrence_interval_value: n, recurrence_interval_unit: u });

function stub(chores, items) {
  return BASIS
    .replace("rooms: [], plants: [], plant_care_tasks: [], chores: [],", `rooms: [], plants: [], plant_care_tasks: [], chores: ${JSON.stringify(chores)},`)
    .replace(/shopping_items: \[[\s\S]*?\n  \],/, `shopping_items: ${JSON.stringify(items)},`);
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}
const kachel = (p, id) => p.evaluate(id => ({
  zahl: getComputedStyle(document.getElementById('kachel-zahl-'+id)).display === 'none' ? null : document.getElementById('kachel-zahl-'+id).textContent,
  rot: document.getElementById('kachel-zahl-'+id).classList.contains('warnung'),
  info: [...document.getElementById('kachel-info-'+id).children].map(z => z.textContent).join('\n')
}), id);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  async function seite(chores, items) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.clock.install({ time: new Date('2026-09-25T10:00:00') });
    page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
    page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
    await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
      r.fulfill({ status:200, contentType:'application/javascript', body: stub(chores, items) }));
    await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
    await page.waitForTimeout(900);
    return page;
  }

  console.log('=== Kachel: zählt nur, was ansteht ===');
  let page = await seite([
    ch('a', 'Fenster putzen', '2026-09-23'),                          // einmalig, überfällig
    ch('b', 'Müll', '2026-09-27', w(1, 'woche')),                      // Vorlauf 2 Tage -> zählt
    ch('c', 'Bettwäsche', '2026-09-28', w(1, 'woche')),                // 3 Tage weg -> nicht
    ch('d', 'Kühlschrank', '2026-10-02', w(1, 'monat')),               // Vorlauf 7 Tage -> zählt
    ch('e', 'Arzttermin', '2026-09-27'),                               // einmalig, 2 Tage weg -> nicht
    ch('f', 'Keller ausmisten', null),                                 // ohne Termin -> nicht
    ch('g', 'Erledigt', '2026-09-24', { status: 'erledigt', completed_at: '2026-09-24T10:00:00Z' })
  ], []);
  check('Überfällig, Vorlauf-Treffer, ohne Termin und zu früh ausgenommen',
    await kachel(page, 'aufgaben'), { zahl:'3', rot:true, info:'Nächste: Fenster putzen (überfällig)' });
  await page.close();

  page = await seite([
    ch('c', 'Bettwäsche', '2026-09-28', w(1, 'woche')),
    ch('e', 'Arzttermin', '2026-10-03'),
    ch('f', 'Keller ausmisten', null)
  ], []);
  check('Nichts steht an: keine Zahl, nächster Termin', await kachel(page, 'aufgaben'), { zahl:null, rot:false, info:'Nichts fällig\nNächste: 28.9.' });
  check('Die Liste selbst bleibt vollständig', await page.evaluate(() => { showTab('aufgaben'); return document.querySelectorAll('#chore-list li').length; }), 3);
  await page.close();

  page = await seite([ch('f', 'Keller ausmisten', null)], []);
  check('Nur Aufgaben ohne Termin', await kachel(page, 'aufgaben'), { zahl:null, rot:false, info:'Nichts fällig' });
  await page.close();

  page = await seite([], []);
  check('Gar nichts offen: wie bisher', await kachel(page, 'aufgaben'), { zahl:null, rot:false, info:'Nichts offen' });
  await page.close();

  console.log('\n=== Einkaufsliste: Gekauftes nach 30 Tagen ausblenden ===');
  const it = (id, name, extra) => Object.assign({ id, name, menge: 1, einheit: 'stueck', store_id: 's1', department_id: null,
    status: 'gekauft', created_by: 'u1', household_id: 'h1', priority: 'normal' }, extra);
  page = await seite([], [
    it('i1', 'Zwiebeln', { created_at: '2026-09-20T10:00:00Z', gekauft_am: '2026-09-22T10:00:00Z' }),
    it('i2', 'Mozzarella', { created_at: '2026-08-01T10:00:00Z', gekauft_am: '2026-08-10T10:00:00Z' }),   // alt
    it('i3', 'Kaffee', { created_at: '2026-08-10T10:00:00Z', gekauft_am: '2026-09-24T10:00:00Z' }),      // lange notiert, gestern gekauft
    it('i4', 'Brot', { created_at: '2026-09-15T10:00:00Z', gekauft_am: null }),                            // ohne Kaufdatum
    it('i5', 'Olivenöl', { status: 'offen', created_at: '2026-07-01T10:00:00Z', gekauft_am: null })        // offen, alt
  ]);
  await page.evaluate(() => showTab('liste')); await page.waitForTimeout(200);
  check('Link zählt nur die letzten 30 Tage', await page.textContent('#toggle-gekauft-link'), 'Gekauft anzeigen (3)');
  check('Hinweis zugeklappt unsichtbar', await page.isVisible('#gekauft-ausgeblendet'), false);
  await page.click('#toggle-gekauft-link'); await page.waitForTimeout(150);
  check('Nach Kaufdatum, zuletzt Gekauftes oben',
    await page.$$eval('#item-list-gekauft li', l => l.map(x => x.innerText.split('\n')[0].trim().split(/\s+/)[0])), ['Kaffee', 'Zwiebeln', 'Brot']);
  check('Hinweis auf Ausgeblendetes', await page.textContent('#gekauft-ausgeblendet'),
    'Ältere Einkäufe (1) ausgeblendet, sie bleiben in den Vorschlägen.');
  check('Hinweis sichtbar', await page.isVisible('#gekauft-ausgeblendet'), true);
  check('Offener alter Artikel bleibt offen sichtbar', await page.$$eval('#item-list-offen li', l => l.some(x => x.innerText.includes('Olivenöl'))), true);
  await page.evaluate(() => { const f = document.getElementById('toggle-add-link'); if (f && document.getElementById('item-name').offsetParent === null) f.click(); });
  await page.fill('#item-name', 'mozz'); await page.waitForTimeout(150);
  check('Ausgeblendetes bleibt in den Vorschlägen', await page.$$eval('#item-name-vorschlaege li button', b => b.map(x => x.innerText.split('\n')[0].trim())), ['Mozzarella']);
  await page.close();

  console.log('\n=== Aufgaben: alte erledigte ausblenden ===');
  page = await seite([
    ch('x', 'Keller', null, { status: 'erledigt', completed_at: '2026-08-01T10:00:00Z' }),
    ch('y', 'Steuer', null, { status: 'erledigt', completed_at: '2026-09-20T10:00:00Z' }),
    ch('z', 'Müll', '2026-09-27', w(1, 'woche'))
  ], []);
  await page.evaluate(() => showTab('aufgaben')); await page.waitForTimeout(200);
  check('Nur jüngere Erledigte sichtbar', await page.$$eval('#chore-list li', l => l.map(x => x.innerText.split(/[\n–]/)[0].trim())), ['Müll', 'Steuer']);
  check('Hinweis', await page.textContent('#chores-ausgeblendet'), 'Ältere erledigte Aufgaben (1) ausgeblendet.');
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
