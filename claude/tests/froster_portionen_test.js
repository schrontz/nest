// Froster: Portionen und "+ Etwas einfrieren".
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync('/tmp/essen_test.js', 'utf8');
let STUB = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);
STUB = STUB.replace("meal_plan: [", `freezer_items: [
    { id:'f1', household_id:'h1', name:'Chili sin Carne', eingefroren_am:'2026-09-12', created_at:'2026-09-12T18:00:00Z', aufgebraucht_am:null, meal_plan_id:null },
    { id:'f2', household_id:'h1', name:'Gulasch',         eingefroren_am:'2026-05-14', created_at:'2026-05-14T18:00:00Z', aufgebraucht_am:null, meal_plan_id:null },
    { id:'f3', household_id:'h1', name:'Linsensuppe',     eingefroren_am:'2026-08-03', created_at:'2026-08-03T18:00:00Z', aufgebraucht_am:null, meal_plan_id:'mf3' },
    { id:'f4', household_id:'h1', name:'Bolognese',       eingefroren_am:'2026-07-01', created_at:'2026-07-01T18:00:00Z', aufgebraucht_am:null, meal_plan_id:'mf4' },
    { id:'f5', household_id:'h1', name:'Erbsensuppe',     eingefroren_am:'2026-06-01', created_at:'2026-06-01T18:00:00Z', aufgebraucht_am:'2026-06-20', meal_plan_id:null }
  ],
  meal_plan: [
    { id:'mf3', household_id:'h1', datum:'2026-09-26', mahlzeit:'abend',  text:'Linsensuppe', fuer:null, rest_von:null },
    { id:'mf4', household_id:'h1', datum:'2026-09-22', mahlzeit:'mittag', text:'Bolognese',   fuer:null, rest_von:null },`);

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  let dialogAntwort = true; const dialoge = [];
  async function seite(stub) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.clock.install({ time: new Date('2026-09-25T10:00:00') });
    page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
    page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
    page.on('dialog', d => { dialoge.push(d.message()); dialogAntwort ? d.accept() : d.dismiss(); });
    await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
      r.fulfill({ status:200, contentType:'application/javascript', body: stub }));
    await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
    await page.waitForTimeout(1000);
    await page.click('#kachel-essen'); await page.waitForTimeout(250);
    return page;
  }
  const warte = p => p.waitForTimeout(250);
  const kopf = p => p.$eval('#meal-plan-list .froster-kopf', e => e.innerText.replace(/\s+/g, ' ').trim());
  const zeilen = p => p.$$eval('#meal-plan-list .froster-zeile', z => z.map(x =>
    x.querySelector('.froster-name').textContent.trim() + ' | ' + x.querySelector('small').textContent.trim()));
  const hinweis = p => p.$eval('#meal-plan-list li.essen-hinweis', e => e.textContent).catch(() => null);
  const fz = (p, name) => p.evaluate(n => window.__db.freezer_items.filter(x => x.name === n)
    .map(x => [x.eingefroren_am, x.meal_plan_id || null, x.aufgebraucht_am || null]), name);

  console.log('=== Leerer Froster ===');
  const leer = STUB.replace(/freezer_items: \[[\s\S]*?\n  \],/, 'freezer_items: [],');
  let page = await seite(leer);
  check('Zeile steht auch leer da', await kopf(page), '❄ Im Froster (0) ▾');
  await page.click('#meal-plan-list .froster-kopf'); await warte(page);
  check('Aufgeklappt: Hinweis und "+ Etwas einfrieren"',
    [await page.textContent('.froster-leer'), await page.textContent('.froster-neu-knopf button')],
    ['Noch nichts eingefroren.', '+ Etwas einfrieren']);
  await page.close();

  page = await seite(STUB);
  console.log('\n=== Einfrieren mit Portionen ===');
  await page.click('#meal-plan-list li.essen-tag[data-datum="2026-09-25"] .essen-platz[data-mahlzeit="abend"] .essen-eintrag'); await warte(page);
  const pid = await page.$eval('.essen-formular input[type=text]', e => e.id.replace('meal-text-', ''));
  await page.click('.essen-formular .rest-mehr');
  const stepper = '#portionen-r-' + pid;
  await page.click(stepper + ' button:first-child');
  check('Minimum 1', await page.textContent(stepper + ' span'), '1');
  check('Knopf bei 1 wie bisher', await page.textContent('[data-portionen-knopf="r-' + pid + '"]'), '❄ In den Froster');
  for (let i = 0; i < 12; i++) await page.click(stepper + ' button:last-child');
  check('Maximum 10', await page.textContent(stepper + ' span'), '10');
  for (let i = 0; i < 7; i++) await page.click(stepper + ' button:first-child');
  check('Knopf nennt die Zahl', await page.textContent('[data-portionen-knopf="r-' + pid + '"]'), '❄ 3 Portionen in den Froster');
  await page.click('[data-portionen-knopf="r-' + pid + '"]'); await warte(page);
  check('Drei Einträge, heute eingefroren', await fz(page, 'Pasta Hackfleisch'), [['2026-09-25', null, null], ['2026-09-25', null, null], ['2026-09-25', null, null]]);
  check('Hinweis', await hinweis(page), '„Pasta Hackfleisch" (3 Portionen) liegt jetzt im Froster.');
  await page.click('#meal-plan-list .froster-kopf'); await warte(page);
  check('Zähler zählt Portionen', await kopf(page), '❄ Im Froster (6) ▴');
  check('Gebündelt in einer Zeile', (await zeilen(page)).filter(z => z.startsWith('Pasta')), ['Pasta Hackfleisch | 3 Portionen · seit 25.09.']);

  console.log('\n=== Einplanen und Abhaken wirken auf eine Portion ===');
  const pasta = '#meal-plan-list .froster-zeile[data-portionen="3"]';
  await page.click(pasta + ' .froster-einplanen'); await warte(page);
  const fid = await page.$eval('#meal-plan-list .froster-ziel', e => e.closest('.froster-zeile').dataset.frosterId);
  await page.click(`#ziel-f-${fid} [data-art=tag] button[data-datum="2026-09-30"]`);
  await page.click(`#meal-plan-list .froster-zeile[data-froster-id="${fid}"] .froster-ziel .essen-knoepfe button`); await warte(page);
  check('Eine Portion eingeplant, zwei frei', (await fz(page, 'Pasta Hackfleisch')).map(x => !!x[1]).sort(), [false, false, true]);
  // Reihenfolge wie im Froster üblich: älteste zuerst, die eingeplante Portion war die älteste.
  check('Liste: geplante Portion eigene Zeile, Bündel mit 2', (await zeilen(page)).filter(z => z.startsWith('Pasta')),
    ['Pasta Hackfleisch | → Mittwoch Mittag', 'Pasta Hackfleisch | 2 Portionen · seit 25.09.']);
  await page.click('#meal-plan-list .froster-zeile[data-portionen="2"] .froster-weg'); await warte(page);
  check('Abhaken nimmt eine Portion', (await fz(page, 'Pasta Hackfleisch')).filter(x => x[2]).length, 1);
  check('Rest: eine Portion, ohne Portionen-Angabe', (await zeilen(page)).filter(z => z.startsWith('Pasta')),
    ['Pasta Hackfleisch | → Mittwoch Mittag', 'Pasta Hackfleisch | seit 25.09.']);

  console.log('\n=== "+ Etwas einfrieren" ===');
  await page.click('.froster-neu-knopf button'); await warte(page);
  check('Datum steht auf heute, nicht in die Zukunft wählbar',
    await page.$eval('#froster-neu-datum', e => [e.value, e.max]), ['2026-09-25', '2026-09-25']);
  await page.click('.froster-neu .essen-knoepfe button'); await warte(page);
  check('Ohne Namen: Hinweis, nichts gespeichert', [await page.textContent('#froster-neu-status'), (await fz(page, '')).length], ['Bitte einen Namen eingeben.', 0]);
  await page.fill('#froster-neu-name', 'Gemüsebrühe');
  await page.fill('#froster-neu-datum', '2026-10-01');
  await page.click('.froster-neu .essen-knoepfe button'); await warte(page);
  check('Zukunftsdatum abgelehnt', [await page.textContent('#froster-neu-status'), (await fz(page, 'Gemüsebrühe')).length], ['Das Datum liegt in der Zukunft.', 0]);
  await page.fill('#froster-neu-datum', '2026-09-01');
  await page.click('#portionen-neu button:last-child');
  await page.click('.froster-neu .essen-knoepfe button'); await warte(page);
  check('Zwei Portionen, zurückdatiert', await fz(page, 'Gemüsebrühe'), [['2026-09-01', null, null], ['2026-09-01', null, null]]);
  check('Hinweis', await hinweis(page), '„Gemüsebrühe" (2 Portionen) liegt jetzt im Froster.');
  check('Formular zu, Liste zeigt das Bündel', [await page.$$eval('.froster-neu', e => e.length), (await zeilen(page)).filter(z => z.startsWith('Gemüse'))],
    [0, ['Gemüsebrühe | 2 Portionen · seit 01.09.']]);
  await page.click('.froster-neu-knopf button'); await warte(page);
  await page.fill('#froster-neu-name', 'Gemüsebrühe');
  await page.press('#froster-neu-name', 'Enter'); await warte(page);
  check('Anderer Tag: eigene Zeile (Enter speichert)', (await zeilen(page)).filter(z => z.startsWith('Gemüse')),
    ['Gemüsebrühe | 2 Portionen · seit 01.09.', 'Gemüsebrühe | seit 25.09.']);
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.click('.froster-neu-knopf button'); await warte(page);
  check('Kein Überlauf mit offenem Formular', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/fp.png', fullPage: false });

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
