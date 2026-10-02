// Karten-Ansicht "Artikel hinzufügen" (artikel.js), einzeln.
// Stapel aus Skillet: skillet_einkauf_test.js, aus dem Essensplan: essen_test.js.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const STUB = eval(fs.readFileSync('/tmp/essen_test.js', 'utf8').match(/const STUB = (`[\s\S]*?`);/)[1]);

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}
const sichtbar = (p, id) => p.evaluate(id => getComputedStyle(document.getElementById(id)).display !== 'none', id);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 320, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r => r.fulfill({ status:200, contentType:'application/javascript', body: STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => showTab('liste')); await page.waitForTimeout(200);

  console.log('=== Karte öffnen ===');
  await page.click('#toggle-add-link'); await page.waitForTimeout(200);
  check('Eigene Ansicht mit Titel', [await sichtbar(page, 'tab-artikel'), await sichtbar(page, 'tab-liste'), await page.textContent('#bereich-titel')],
    [true, false, 'Neuer Artikel']);
  check('Kein Stapel-Kopf, kein "für alle", keine Doppelt-Box', [await sichtbar(page, 'karte-stapel-kopf'), await sichtbar(page, 'karte-laden-alle-zeile'), await sichtbar(page, 'karte-doppelt')], [false, false, false]);
  check('Knöpfe einzeln', [await page.textContent('#artikel-speichern'), await page.textContent('#artikel-zweit')], ['Speichern', 'Speichern & nächster']);
  check('Wichtigkeit: Normal aktiv', await page.$$eval('.karte-pille.aktiv', p => p.map(x => x.dataset.wert)), ['normal']);
  check('Nichts ragt seitlich heraus (320 px)', await page.evaluate(() => document.documentElement.scrollWidth <= 320), true);
  await page.click('#artikel-speichern'); await page.waitForTimeout(150);
  check('Ohne Namen: Hinweis statt Speichern', await page.textContent('#add-status'), 'Bitte einen Namen eingeben.');

  console.log('\n=== Vorschlag übernehmen, Speichern & nächster ===');
  await page.fill('#item-name', 'Zwieb'); await page.waitForTimeout(150);
  await page.click('#item-name-vorschlaege li:nth-child(1) button'); await page.waitForTimeout(150);
  check('Werte und "wie zuletzt"', await page.evaluate(() => [document.getElementById('item-menge').value, document.getElementById('item-store').value,
    document.getElementById('item-department').value, document.getElementById('hinweis-laden').textContent, document.getElementById('hinweis-abteilung').textContent]),
    ['3', 's1', 'd1', 'wie zuletzt', 'wie zuletzt']);
  await page.click('.karte-pille[data-wert="dringend"]');
  check('Wichtigkeit "Dringend" gewählt', await page.inputValue('#item-priority'), 'dringend');
  await page.selectOption('#item-department', '');
  check('Selbst geändert: "wie zuletzt" verschwindet', await page.textContent('#hinweis-abteilung'), '');
  await page.selectOption('#item-department', 'd1');
  await page.screenshot({ path: '/tmp/karte_einzeln_320.png', fullPage: true });
  await page.click('#artikel-zweit'); await page.waitForTimeout(350);
  check('Angelegt mit allen Werten', await page.evaluate(() => window.__db.shopping_items.filter(i => i.id.startsWith('n')).map(i => [i.name, i.menge, i.einheit, i.store_id, i.department_id, i.priority])),
    [['Zwiebeln', 3, 'stueck', 's1', 'd1', 'dringend']]);
  check('Karte bleibt offen, leer für den nächsten Artikel', [await sichtbar(page, 'tab-artikel'), await page.inputValue('#item-name'), await page.inputValue('#item-menge')], [true, '', '']);
  check('Laden bleibt stehen, Wichtigkeit zurück auf Normal', [await page.inputValue('#item-store'), await page.inputValue('#item-priority')], ['s1', 'normal']);
  check('Meldung', await page.textContent('#add-status'), '„Zwiebeln“ hinzugefügt.');

  console.log('\n=== Doppeltes ===');
  await page.fill('#item-name', 'Zwiebeln'); await page.fill('#item-menge', '2'); await page.dispatchEvent('#item-menge', 'input');
  check('Gerade angelegt, also offen: wird erhöht', await page.textContent('#karte-doppelt'),
    'Steht schon auf der Liste: Zwiebeln – 3 Stück„Speichern“ setzt die Menge auf 5 Stück.');
  await page.click('#artikel-zweit'); await page.waitForTimeout(350);
  check('Erhöht statt doppelt angelegt', await page.evaluate(() => window.__db.shopping_items.filter(i => i.name === 'Zwiebeln' && i.status === 'offen').map(i => i.menge)), [5]);
  check('Meldung beim Erhöhen', await page.textContent('#add-status'), '„Zwiebeln“: erhöht auf 5 Stück.');
  await page.fill('#item-name', 'Olivenöl'); await page.fill('#item-menge', '1'); await page.selectOption('#item-einheit', 'flasche'); await page.dispatchEvent('#item-name', 'input');
  check('Andere Einheit: zusätzlich', await page.textContent('#karte-doppelt'),
    'Steht schon auf der Liste: Olivenöl – 1 lAndere Einheit – „Speichern“ trägt es zusätzlich ein.');
  await page.click('#artikel-speichern'); await page.waitForTimeout(350);
  check('Zusätzlich eingetragen', await page.evaluate(() => window.__db.shopping_items.filter(i => i.name === 'Olivenöl').map(i => [i.menge, i.einheit])), [[1, 'liter'], [1, 'flasche']]);
  check('"Speichern" schließt die Karte, Meldung in der Liste', [await sichtbar(page, 'tab-liste'), await sichtbar(page, 'tab-artikel'), await page.textContent('#liste-status')],
    [true, false, '„Olivenöl“: zusätzlich.']);

  console.log('\n=== Zurück-Taste und Zahnrad ===');
  await page.click('#toggle-add-link'); await page.waitForTimeout(150);
  await page.goBack(); await page.waitForTimeout(250);
  check('Zurück-Taste schließt die Karte, Einkaufsliste bleibt', [await sichtbar(page, 'tab-liste'), await sichtbar(page, 'tab-artikel'), await sichtbar(page, 'start-view')], [true, false, false]);
  await page.click('#toggle-add-link'); await page.waitForTimeout(150);
  await page.click('#zurueck-btn'); await page.waitForTimeout(250);
  check('‹ schließt die Karte ebenso', [await sichtbar(page, 'tab-liste'), await sichtbar(page, 'tab-artikel')], [true, false]);
  await page.click('#toggle-add-link'); await page.waitForTimeout(150);
  await page.click('#settings-btn'); await page.waitForTimeout(250);
  check('Zahnrad aus der Karte: Einkaufslisten-Einstellungen offen', await page.$$eval('#tab-einstellungen .settings-group[open]', g => g.map(x => x.dataset.gruppe)), ['einkaufsliste']);
  await page.goBack(); await page.waitForTimeout(250);
  check('Zurück aus den Einstellungen: wieder die Karte', await sichtbar(page, 'tab-artikel'), true);

  check('Keine Fehler', errors, []);
  await browser.close();
  console.log(failures === 0 ? '\n>>> ALLE TESTS BESTANDEN' : `\n>>> ${failures} FEHLGESCHLAGEN`);
})();
