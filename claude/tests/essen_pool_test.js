// Pool Stufe 1: Vorschläge beim Tippen im Essensplan.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync('/tmp/essen_test.js', 'utf8');
let STUB = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);
// Zusätzlich ältere und künftige Einträge ausserhalb der angezeigten Woche.
STUB = STUB.replace("meal_plan: [", `meal_plan: [
    { id:'a1', household_id:'h1', datum:'2026-08-02', mahlzeit:'abend',  text:'Chinesische Nudelpfanne', fuer:null, rest_von:null },
    { id:'a2', household_id:'h1', datum:'2026-09-11', mahlzeit:'abend',  text:'Hähnchen-Curry',          fuer:null, rest_von:null },
    { id:'a3', household_id:'h1', datum:'2026-07-01', mahlzeit:'abend',  text:'chili sin carne',         fuer:null, rest_von:null },
    { id:'a4', household_id:'h1', datum:'2026-10-05', mahlzeit:'abend',  text:'Chiasamen-Pudding',       fuer:null, rest_von:null },
    { id:'a5', household_id:'h1', datum:'2026-06-01', mahlzeit:'mittag', text:'Müsli',                   fuer:null, rest_von:null },`);

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.clock.install({ time: new Date('2026-09-25T10:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript', body:STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1000);
  await page.click('#kachel-essen');
  await page.waitForTimeout(250);

  const platz = (d, m) => `#meal-plan-list li.essen-tag[data-datum="${d}"] .essen-platz[data-mahlzeit="${m}"]`;
  const vorschlaege = id => page.$$eval(`#meal-vorschlaege-${id} li button`, b => b.map(x => x.innerText.replace(/\s+/g,' ').trim()));
  const sichtbar = id => page.$eval(`#meal-vorschlaege-${id}`, e => e.style.display !== 'none');
  const tippe = async (id, text) => { await page.fill('#meal-text-' + id, text); await page.waitForTimeout(150); };

  console.log('=== Neuer Eintrag ===');
  await page.click(platz('2026-09-22', 'mittag') + ' .essen-leer');
  await page.waitForTimeout(200);
  await tippe('neu', 'c');
  check('Ein Zeichen: noch keine Vorschläge', await sichtbar('neu'), false);

  await tippe('neu', 'ch');
  check('Anfang zuerst (Treffer mittendrin danach), je nach Datum; Duplikate (auch Gross/Klein) nur einmal; künftiges als "geplant"',
    await vorschlaege('neu'),
    ['Chili sin Carne zuletzt 25.09.', 'Chinesische Nudelpfanne zuletzt 02.08.', 'Chiasamen-Pudding geplant 05.10.',
     'Pasta Hackfleisch zuletzt 25.09.', 'Flammkuchen zuletzt 21.09.', 'Hähnchen-Curry zuletzt 11.09.']);

  await tippe('neu', 'musli');
  check('Umlaute: "musli" findet Müsli', await vorschlaege('neu'), ['Müsli zuletzt 01.06.']);
  await tippe('neu', 'muesli');
  check('Umlaute: "muesli" findet Müsli', await vorschlaege('neu'), ['Müsli zuletzt 01.06.']);

  await tippe('neu', 'Müsli');
  check('Exakt Getipptes wird nicht noch einmal angeboten', await sichtbar('neu'), false);

  await tippe('neu', 'hähn');
  await page.click('#meal-vorschlaege-neu li button');
  await page.waitForTimeout(150);
  check('Tipp füllt den Namen ein', await page.inputValue('#meal-text-neu'), 'Hähnchen-Curry');
  check('Liste ist danach zu', await sichtbar('neu'), false);
  check('Es wurde noch nichts gespeichert',
    await page.evaluate(() => window.__log.filter(x => x.t === 'meal_plan').length), 0);
  check('Formular ist noch offen (Zuweisen möglich)', await page.$$eval('#meal-fuer-neu button', b => b.length > 0), true);

  // Person wählen, dann speichern
  const personKnopf = await page.$$('#meal-fuer-neu button');
  await personKnopf[personKnopf.length - 1].click();
  await page.click('.essen-formular .essen-knoepfe button');
  await page.waitForTimeout(300);
  const gespeichert = await page.evaluate(() => window.__db.meal_plan.find(x => x.datum === '2026-09-22' && x.mahlzeit === 'mittag'));
  check('Gespeichert mit Name und gewählter Person', gespeichert && [gespeichert.text, gespeichert.fuer], ['Hähnchen-Curry', 'u2']);

  console.log('\n=== Tastatur ===');
  await page.click(platz('2026-09-24', 'abend') + ' .essen-leer');
  await page.waitForTimeout(200);
  await tippe('neu', 'ch');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('Pfeil + Enter wählt, speichert aber nicht', await page.inputValue('#meal-text-neu'), 'Chinesische Nudelpfanne');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const d24 = await page.evaluate(() => window.__db.meal_plan.find(x => x.datum === '2026-09-24' && x.mahlzeit === 'abend'));
  check('Zweites Enter speichert', d24 && d24.text, 'Chinesische Nudelpfanne');

  console.log('\n=== Neu Gespeichertes landet im Pool ===');
  await page.click(platz('2026-09-26', 'mittag') + ' .essen-leer');
  await page.waitForTimeout(200);
  await tippe('neu', 'Nudelp');
  check('Nudelpfanne jetzt mit neuem Datum', await vorschlaege('neu'), ['Chinesische Nudelpfanne zuletzt 24.09.']);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Escape schliesst die Liste', await sichtbar('neu'), false);

  console.log('\n=== Bearbeiten ===');
  await page.click('.essen-knoepfe .neben-knopf'); // Abbrechen
  await page.waitForTimeout(200);
  await page.click(platz('2026-09-27', 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(200);
  const editId = await page.$eval('.essen-formular input[type=text]', e => e.id.replace('meal-text-', ''));
  await tippe(editId, 'Flamm');
  check('Vorschläge auch beim Bearbeiten', await vorschlaege(editId), ['Flammkuchen zuletzt 21.09.']);

  console.log('\n=== Layout ===');
  check('Kein horizontaler Überlauf auf 320 px',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
