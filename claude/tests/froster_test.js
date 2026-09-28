// Froster und Reste-Ziel.
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
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.clock.install({ time: new Date('2026-09-25T10:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  let dialogAntwort = true; const dialoge = [];
  page.on('dialog', d => { dialoge.push(d.message()); dialogAntwort ? d.accept() : d.dismiss(); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript', body:STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1000);

  const platz = (d, m) => `#meal-plan-list li.essen-tag[data-datum="${d}"] .essen-platz[data-mahlzeit="${m}"]`;
  const zeile = id => `#meal-plan-list .froster-zeile[data-froster-id="${id}"]`;
  const namen = () => page.$$eval('#meal-plan-list .froster-name', e => e.map(x => x.textContent.trim()));
  const hinweis = () => page.$eval('#meal-plan-list li.essen-hinweis', e => e.textContent).catch(() => null);
  const fz = id => page.evaluate(i => Object.assign({}, window.__db.freezer_items.find(x => x.id === i)), id);
  const mp = (d, m) => page.evaluate(([d, m]) => window.__db.meal_plan.filter(x => x.datum === d && x.mahlzeit === m)
    .map(x => ({ id: x.id, text: x.text, fuer: x.fuer, rest_von: x.rest_von || null })), [d, m]);
  const warte = () => page.waitForTimeout(250);

  console.log('=== Startbildschirm ===');
  check('Banner sichtbar', await page.$eval('#start-hinweis', e => getComputedStyle(e).display), 'flex');
  check('Banner-Text', await page.$eval('#start-hinweis', e => e.innerText.replace(/\s+/g, ' ').trim()),
    '❄ Heute rausnehmen: Linsensuppe für morgen Abend');
  check('Kacheln bleiben sichtbar (kein Überlauf)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.click('#kachel-essen'); await warte();

  console.log('\n=== Froster-Zeile ===');
  check('Zeile zeigt 3 (gegessen und abgehakt zählen nicht)',
    await page.$eval('#meal-plan-list .froster-kopf', e => e.innerText.replace(/\s+/g, ' ').trim()), '❄ Im Froster (3) ▾');
  check('Anfangs zugeklappt', (await namen()).length, 0);
  await page.click('#meal-plan-list .froster-kopf'); await warte();
  check('Aufgeklappt, älteste zuerst', await namen(), ['Gulasch', 'Linsensuppe', 'Chili sin Carne']);
  check('Über drei Monate: farbig', await page.$eval(zeile('f2') + ' small', e => [e.textContent, e.className]), ['seit 14.05.', 'froster-alt']);
  check('Jünger: nicht farbig', await page.$eval(zeile('f1') + ' small', e => [e.textContent, e.className]), ['seit 12.09.', '']);
  check('Eingeplant: Ziel und Erinnerung, kein Einplanen-Knopf',
    await page.$eval(zeile('f3'), e => [e.querySelector('small').textContent, !!e.querySelector('.froster-einplanen')]),
    ['→ Samstag Abend · heute rausnehmen', false]);
  check('Plan-Eintrag aus dem Froster ist markiert',
    await page.$eval(platz('2026-09-22', 'mittag') + ' .essen-eintrag', e => e.innerText.replace(/\s+/g, ' ').trim()),
    'Bolognese ❄ aus dem Froster');

  console.log('\n=== Aus dem Froster einplanen ===');
  await page.click(zeile('f1') + ' .froster-einplanen'); await warte();
  check('Auswahl offen, "Heute" vorgewählt',
    await page.$eval('#ziel-f-f1 [data-art=tag] button.an', e => e.textContent), 'Heute');
  // Samstag Abend ist belegt (Linsensuppe) -- ablehnen
  dialogAntwort = false;
  await page.click('#ziel-f-f1 [data-art=tag] button[data-datum="2026-09-26"]');
  await page.click('#ziel-f-f1 [data-art=mahlzeit] button[data-mahlzeit="abend"]');
  await page.click(zeile('f1') + ' .froster-ziel .essen-knoepfe button');
  await warte();
  check('Belegt: es wird gefragt', dialoge[dialoge.length - 1], 'Samstag Abend steht für Beide schon „Linsensuppe". Ersetzen?');
  check('Abgelehnt: Samstag unverändert', await mp('2026-09-26', 'abend'), [{ id:'mf3', text:'Linsensuppe', fuer:null, rest_von:null }]);
  check('Abgelehnt: Chili nicht verknüpft', (await fz('f1')).meal_plan_id, null);
  dialogAntwort = true;
  // Sonntag Mittag für Jan
  await page.click('#ziel-f-f1 [data-art=tag] button[data-datum="2026-09-27"]');
  await page.click('#ziel-f-f1 [data-art=mahlzeit] button[data-mahlzeit="mittag"]');
  await page.click('#meal-fuer-f-f1 button[data-fuer="u1"]');
  await page.click(zeile('f1') + ' .froster-ziel .essen-knoepfe button');
  await warte();
  const so = await mp('2026-09-27', 'mittag');
  check('Plan-Eintrag angelegt, für Jan, ohne "Rest"', so.map(x => [x.text, x.fuer, x.rest_von]), [['Chili sin Carne', 'u1', null]]);
  check('Froster-Eintrag verknüpft', (await fz('f1')).meal_plan_id, so[0] && so[0].id);
  check('ID sieht aus wie eine UUID', /^[0-9a-f-]{36}$/.test(so[0] && so[0].id), true);
  check('Hinweis', await hinweis(), '„Chili sin Carne" steht jetzt Sonntag Mittag im Plan.');
  check('Zeile zeigt jetzt das Ziel', await page.$eval(zeile('f1') + ' small', e => e.textContent), '→ Sonntag Mittag');
  check('Im Plan markiert', await page.$eval(platz('2026-09-27', 'mittag') + ' .essen-eintrag', e => e.innerText.replace(/\s+/g, ' ').trim()),
    'Jan Chili sin Carne ❄ aus dem Froster');

  console.log('\n=== Ersetzen gibt das Verdrängte zurück in den Froster ===');
  await page.click(zeile('f2') + ' .froster-einplanen'); await warte();
  await page.click('#ziel-f-f2 [data-art=tag] button[data-datum="2026-09-26"]');
  await page.click('#ziel-f-f2 [data-art=mahlzeit] button[data-mahlzeit="abend"]');
  await page.click(zeile('f2') + ' .froster-ziel .essen-knoepfe button');
  await warte();
  check('Samstag Abend jetzt Gulasch (derselbe Eintrag)', await mp('2026-09-26', 'abend'), [{ id:'mf3', text:'Gulasch', fuer:null, rest_von:null }]);
  check('Gulasch verknüpft', (await fz('f2')).meal_plan_id, 'mf3');
  check('Linsensuppe wieder frei im Froster', (await fz('f3')).meal_plan_id, null);
  check('Linsensuppe zeigt wieder "seit"', await page.$eval(zeile('f3') + ' small', e => e.textContent), 'seit 03.08.');

  console.log('\n=== Aufgebraucht ===');
  await page.click(zeile('f3') + ' .froster-weg'); await warte();
  check('Abgehakt mit heutigem Datum', (await fz('f3')).aufgebraucht_am, '2026-09-25');
  check('Verschwindet aus der Liste', await namen(), ['Gulasch', 'Chili sin Carne']);
  check('Zähler', await page.$eval('#meal-plan-list .froster-kopf', e => e.innerText.replace(/\s+/g, ' ').trim()), '❄ Im Froster (2) ▴');

  console.log('\n=== Reste: anderes Ziel ===');
  await page.click(platz('2026-09-25', 'abend') + ' .essen-eintrag'); await warte();
  const pid = await page.$eval('.essen-formular input[type=text]', e => e.id.replace('meal-text-', ''));
  await page.fill('#meal-text-' + pid, 'Pasta Hackfleisch GEÄNDERT');
  await page.click('.essen-formular .rest-mehr'); await warte();
  check('"…" zeichnet nicht neu: Eingabe bleibt', await page.inputValue('#meal-text-' + pid), 'Pasta Hackfleisch GEÄNDERT');
  check('Auswahl sichtbar', await page.$eval('#rest-ziel-' + pid, e => e.style.display), 'block');
  check('Tage ab dem Tag danach: Morgen zuerst',
    await page.$$eval(`#ziel-r-${pid} [data-art=tag] button`, b => b.map(x => x.textContent)), ['Morgen', 'So 27.', 'Mo 28.', 'Di 29.', 'Mi 30.', 'Do 1.', '…']);
  await page.fill('#meal-text-' + pid, 'Pasta Hackfleisch');
  await page.click(`#ziel-r-${pid} [data-art=tag] button[data-datum="2026-09-28"]`);
  await page.click(`#ziel-r-${pid} [data-art=mahlzeit] button[data-mahlzeit="abend"]`);
  await page.click('#rest-ziel-' + pid + ' .essen-knoepfe button');
  await warte();
  check('Rest am Montag Abend, mit Kochtag', await mp('2026-09-28', 'abend'),
    [{ id: (await mp('2026-09-28', 'abend'))[0]?.id, text:'Pasta Hackfleisch', fuer:null, rest_von:'2026-09-25' }]);
  check('Hinweis', await hinweis(), '„Pasta Hackfleisch" steht jetzt auch Montag Abend.');

  console.log('\n=== Reste: freies Datum ===');
  await page.click(platz('2026-09-25', 'abend') + ' .essen-eintrag'); await warte();
  await page.click('.essen-formular .rest-mehr');
  await page.click(`#ziel-r-${pid} .ziel-mehr`);
  check('Datumsfeld erscheint', await page.$eval(`#ziel-r-${pid} .ziel-datum`, e => e.style.display), 'block');
  await page.fill(`#ziel-r-${pid} .ziel-datum`, '2026-10-20');
  await page.$eval(`#ziel-r-${pid} .ziel-datum`, e => e.dispatchEvent(new Event('change')));
  check('"…" zeigt das Datum und ist gewählt',
    await page.$eval(`#ziel-r-${pid} .ziel-mehr`, e => [e.textContent, e.classList.contains('an')]), ['20.10.', true]);
  await page.click('#rest-ziel-' + pid + ' .essen-knoepfe button');
  await warte();
  check('Rest am 20.10. Mittag', (await mp('2026-10-20', 'mittag')).map(x => x.text), ['Pasta Hackfleisch']);
  check('Hinweis mit Datum, weil mehr als eine Woche weg', await hinweis(), '„Pasta Hackfleisch" steht jetzt auch Dienstag, 20.10. Mittag.');

  console.log('\n=== In den Froster ===');
  await page.click(platz('2026-09-27', 'abend') + ' .essen-eintrag'); await warte();
  await page.click('.essen-formular .rest-mehr');
  await page.click('.essen-formular .froster-knopf');
  await warte();
  const neu = await page.evaluate(() => window.__db.freezer_items.filter(x => x.name === 'Ofengemüse').map(x => [x.eingefroren_am, x.meal_plan_id || null, x.household_id]));
  check('Froster-Eintrag angelegt', neu, [['2026-09-25', null, 'h1']]);
  check('Plan-Eintrag bleibt stehen', (await mp('2026-09-27', 'abend')).map(x => x.text), ['Ofengemüse']);
  check('Hinweis', await hinweis(), '„Ofengemüse" liegt jetzt im Froster.');
  check('Im Froster sichtbar', await namen(), ['Gulasch', 'Chili sin Carne', 'Ofengemüse']);

  console.log('\n=== "→ morgen Mittag" unverändert ===');
  await page.click(platz('2026-09-23', 'abend') + ' .essen-eintrag'); await warte();
  await page.click('.essen-formular .rest-knopf:not(.rest-mehr)'); await warte();
  check('Donnerstag Mittag belegt: Rückfrage wie bisher', dialoge[dialoge.length - 1], 'Donnerstag Mittag steht für Beide schon „Chili sin Carne". Ersetzen?');

  console.log('\n=== Layout 320 px mit offener Auswahl ===');
  await page.click(zeile('f1') + ' .froster-weg').catch(() => {});
  await warte();
  await page.click(zeile('f2') + ' .froster-einplanen').catch(() => {});
  await warte();
  check('Kein horizontaler Überlauf', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/froster_320.png', fullPage: false });

  console.log('\n=== Zurück zum Start: Banner folgt den Daten ===');
  await page.evaluate(() => history.back()); await page.waitForTimeout(400);
  check('Banner jetzt Gulasch', await page.$eval('#start-hinweis', e => e.innerText.replace(/\s+/g, ' ').trim()),
    '❄ Heute rausnehmen: Gulasch für morgen Abend');

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
