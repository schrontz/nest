// Pflanzen: Übersicht nach Zimmer als Foto-Kacheln, Detailansicht, Gießen.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync('/tmp/essen_test.js', 'utf8');
let STUB = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);
const pl = (id, name, room, img, extra = {}) => Object.assign({ id, name, species: null, room_id: room, household_id: 'h1',
  created_by: 'u1', notes: null, image_path: img ? `households/h1/plants/${id}.jpg` : null }, extra);
const ct = (id, plant, type, status, due) => ({ id, plant_id: plant, type, status, due_date: due, household_id: 'h1',
  assigned_to: null, recurrence_interval_value: 1, recurrence_interval_unit: 'woche', completed_at: null, completed_by: null, created_by: 'u1' });
const daten = {
  rooms: [{ id:'r2', name:'Schlafzimmer', household_id:'h1' }, { id:'r1', name:'Balkon', household_id:'h1' }],
  plants: [
    pl('p1', 'Basilikum', 'r1', true), pl('p2', 'Rosmarin', 'r1', true),
    pl('p3', 'Paradiesvogelblume', 'r2', true, { species: 'Strelitzia reginae', notes: 'Mag es hell.' }),
    pl('p4', 'Efeutute', 'r2', true), pl('p5', 'Bogenhanf', 'r2', true), pl('p6', 'Neuer Ableger', null, false)
  ],
  plant_care_tasks: [
    ct('t1', 'p1', 'giessen', 'offen', '2026-09-26'),
    ct('t2', 'p2', 'giessen', 'erledigt', '2026-10-03'),
    ct('t3', 'p3', 'giessen', 'offen', '2026-09-28'),
    ct('t3d', 'p3', 'duengen', 'offen', '2026-09-20'),
    ct('t4', 'p4', 'giessen', 'offen', '2026-10-02'),
    ct('t5', 'p5', 'duengen', 'offen', '2026-09-28')
  ]
};
STUB = STUB.replace("rooms: [], plants: [], plant_care_tasks: [],",
  `rooms: ${JSON.stringify(daten.rooms)}, plants: ${JSON.stringify(daten.plants)}, plant_care_tasks: ${JSON.stringify(daten.plant_care_tasks)},`);
const FOTO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#7a9"/></svg>');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.clock.install({ time: new Date('2026-09-28T10:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  let dialogAntwort = true; const dialoge = [];
  page.on('dialog', d => { dialoge.push(d.message()); dialogAntwort ? d.accept() : d.dismiss(); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r => r.fulfill({ status:200, contentType:'application/javascript', body:STUB }));
  await page.route('**/x/households/**', r => r.fulfill({ status:200, contentType:'image/svg+xml', body: FOTO }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1000);
  await page.click('#kachel-pflanzen'); await page.waitForTimeout(250);

  const status = id => page.evaluate(i => window.__db.plant_care_tasks.find(t => t.id === i).status, id);
  const kachel = id => `#plant-list li.p-kachel[data-plant-id="${id}"]`;

  console.log('=== Übersicht ===');
  check('Zimmer alphabetisch, "Ohne Zimmer" am Ende, mit Anzahl',
    await page.$$eval('#plant-list .p-raum h3', h => h.map(x => x.textContent.replace(/\s+/g, ' ').trim())),
    ['Balkon (2)', 'Schlafzimmer (3)', 'Ohne Zimmer (1)']);
  check('Im Zimmer nach Namen', await page.$$eval('#plant-list li.p-gruppe[data-zimmer=r2] .p-name', n => n.map(x => x.textContent)),
    ['Bogenhanf', 'Efeutute', 'Paradiesvogelblume']);
  check('Hinweise: überfällig vor heute, Gießen vor dem Rest', await page.$$eval('#plant-list li.p-kachel', l => l.map(k => [k.dataset.plantId,
    (k.querySelector('.p-hinweis') || {}).textContent || null, (k.querySelector('.p-hinweis') || { className: '' }).className.replace('p-hinweis', '').trim() || null])),
    [['p1', '💧 überfällig', 'rot'], ['p2', null, null], ['p5', '🌱 heute', 'gelb'], ['p4', null, null],
     ['p3', '🌱 überfällig', 'rot'], ['p6', null, null]]);
  check('Tropfen nur mit Gieß-Pflege; gegossen = ✓', await page.$$eval('#plant-list li.p-kachel', l => l.map(k => {
    const t = k.querySelector('.p-tropfen'); return t ? t.textContent.trim() : null; })), ['💧', '✓', null, '💧', '💧', null]);
  check('Ohne Foto: gezeichnete Pflanze', await page.$eval(kachel('p6'), k => !!k.querySelector('.p-leer') && !k.querySelector('img')), true);
  check('Foto mit Lazy Loading', await page.$eval(kachel('p1') + ' img', i => i.getAttribute('loading')), 'lazy');
  check('"💧 alle" nur, wo es Offenes zu gießen gibt',
    await page.$$eval('#plant-list li.p-gruppe', g => g.map(x => [x.dataset.zimmer, !!x.querySelector('.p-alle')])),
    [['r1', true], ['r2', true], ['__ohne__', false]]);
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  console.log('\n=== Tropfen ===');
  await page.click(kachel('p1') + ' .p-tropfen'); await page.waitForTimeout(250);
  check('Gießen abgehakt', await status('t1'), 'erledigt');
  check('Bleibt in der Übersicht (öffnet keine Detailansicht)', await page.$$eval('#plant-list li.plant-detail', e => e.length), 0);
  check('Kachel zeigt ✓, Hinweis weg', await page.$eval(kachel('p1'), k => [k.querySelector('.p-tropfen').textContent.trim(), !!k.querySelector('.p-hinweis')]), ['✓', false]);
  await page.click(kachel('p2') + ' .p-tropfen'); await page.waitForTimeout(250);
  check('Zweiter Tipp auf ✓ macht es rückgängig', await status('t2'), 'offen');

  console.log('\n=== "💧 alle" ===');
  dialogAntwort = false;
  await page.click('#plant-list li.p-gruppe[data-zimmer=r2] .p-alle'); await page.waitForTimeout(200);
  check('Rückfrage', dialoge[dialoge.length - 1], '2 Pflanzen in „Schlafzimmer“ als gegossen markieren?');
  check('Abgelehnt: nichts geändert', [await status('t3'), await status('t4')], ['offen', 'offen']);
  dialogAntwort = true;
  await page.click('#plant-list li.p-gruppe[data-zimmer=r2] .p-alle'); await page.waitForTimeout(300);
  check('Alle offenen Gieß-Pflegen im Zimmer abgehakt, auch die noch nicht fällige', [await status('t3'), await status('t4')], ['erledigt', 'erledigt']);
  check('Düngen bleibt unberührt', [await status('t3d'), await status('t5')], ['offen', 'offen']);
  check('Knopf verschwindet, wenn nichts mehr offen ist', await page.$$eval('#plant-list li.p-gruppe[data-zimmer=r2] .p-alle', e => e.length), 0);
  await page.click('#plant-list li.p-gruppe[data-zimmer=r1] .p-alle'); await page.waitForTimeout(300);
  check('Einzahl in der Rückfrage', dialoge[dialoge.length - 1], '1 Pflanze in „Balkon“ als gegossen markieren?');

  console.log('\n=== Detailansicht ===');
  await page.click(kachel('p3') + ' .p-name'); await page.waitForTimeout(250);
  check('Detail offen', await page.$$eval('#plant-list li.plant-detail#plant-p3', e => e.length), 1);
  check('Kopf mit Art und Zimmer', await page.$eval('li.plant-detail .item-name', e => e.innerText.replace(/\s+/g, ' ').trim()),
    'Paradiesvogelblume Strelitzia reginae · Schlafzimmer');
  check('Notiz', await page.$eval('li.plant-detail .plant-notiz', e => e.textContent), 'Mag es hell.');
  check('Pflege-Punkte wie bisher', [await page.$$eval('li.plant-detail .care-task', e => e.length), await page.$$eval('li.plant-detail .care-task-add-btn', e => e.length)], [2, 1]);
  check('"+ Pflanze hinzufügen" ausgeblendet', await page.isVisible('#toggle-plant-add-link'), false);
  await page.click('li.plant-detail .plant-stift'); await page.waitForTimeout(200);
  check('Stift öffnet das Bearbeiten, mit Löschen', await page.$$eval('#plant-list li.plant-card.editing .plant-loeschen', e => e.length), 1);
  await page.click('#plant-list li.plant-card.editing .edit-actions button:nth-child(2)'); await page.waitForTimeout(200);
  check('Abbrechen: zurück zum Detail', await page.$$eval('#plant-list li.plant-detail', e => e.length), 1);
  await page.click('#plant-list .p-zurueck'); await page.waitForTimeout(200);
  check('Zurück zur Übersicht', [await page.$$eval('#plant-list li.p-kachel', e => e.length), await page.isVisible('#toggle-plant-add-link')], [6, true]);

  console.log('\n=== Aus der Aufgabenliste und beim Wiederbetreten ===');
  await page.evaluate(() => { showTab('aufgaben'); springeZuPflanze('p5'); }); await page.waitForTimeout(250);
  check('springeZuPflanze öffnet die Detailansicht', await page.$$eval('#plant-list li.plant-detail#plant-p5', e => e.length), 1);
  await page.evaluate(() => { showTab('liste'); showTab('pflanzen'); }); await page.waitForTimeout(250);
  check('Bereich neu betreten: Übersicht', await page.$$eval('#plant-list li.plant-detail', e => e.length), 0);

  console.log('\n=== Löschen aus dem Detail ===');
  await page.click(kachel('p6')); await page.waitForTimeout(200);
  await page.click('li.plant-detail .plant-stift'); await page.waitForTimeout(150);
  await page.click('#plant-list .plant-loeschen'); await page.waitForTimeout(350);
  check('Gelöscht, zurück in der Übersicht', [await page.evaluate(() => window.__db.plants.some(p => p.id === 'p6')), await page.$$eval('#plant-list li.p-kachel', e => e.length)], [false, 5]);
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
