// Übergabe aus Skillet: Link mit ?einkauf=...&rezept=... öffnet die Karten (artikel.js).
// Nutzt die In-Memory-Datenbank aus essen_test.js (Schreibvorgänge wirken wirklich).
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const STUB_BASIS = eval(fs.readFileSync('/tmp/essen_test.js', 'utf8').match(/const STUB = (`[\s\S]*?`);/)[1])
  .replace("onAuthStateChange: cb => setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0)",
           "onAuthStateChange: cb => { window.__authCb = cb; if (!window.__abgemeldet) setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0); }");
if (!STUB_BASIS.includes('window.__authCb = cb')) throw new Error('Attrappe aus essen_test.js hat sich geändert');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

async function neueSeite(browser, opts = {}) {
  const page = await browser.newPage({ viewport: { width: opts.breite || 375, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  await page.addInitScript(o => {
    if (o.abgemeldet) window.__abgemeldet = true;
    for (const [k, v] of Object.entries(o.speicher || {})) localStorage.setItem(k, v);
  }, { abgemeldet: !!opts.abgemeldet, speicher: opts.speicher || {} });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript', body: STUB_BASIS }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html') + (opts.query || ''));
  await page.waitForTimeout(1200);
  return { page, errors };
}
const sichtbar = (p, id) => p.evaluate(id => getComputedStyle(document.getElementById(id)).display !== 'none', id);
const felder = p => p.evaluate(() => ({
  name: document.getElementById('item-name').value, menge: document.getElementById('item-menge').value,
  einheit: document.getElementById('item-einheit').value, laden: document.getElementById('item-store').value,
  abteilung: document.getElementById('item-department').value,
  hinweise: [document.getElementById('hinweis-laden').textContent, document.getElementById('hinweis-abteilung').textContent]
}));
const neueArtikel = p => p.evaluate(() => window.__db.shopping_items.filter(i => i.id.startsWith('n'))
  .map(i => [i.name, i.menge, i.einheit, i.store_id, i.department_id]));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const zeilen = '400 g Rindergulasch\n2 Zwiebeln\nPaprikapulver edelsüß\nOlivenöl\n1 Bund Petersilie';
  const link = '?einkauf=' + encodeURIComponent(zeilen) + '&rezept=' + encodeURIComponent('Gulasch nach Omas Art');

  console.log('=== Link aus Skillet öffnet die Karten ===');
  let { page, errors } = await neueSeite(browser, { breite: 320, query: link });
  check('Karte schwebt über der Einkaufsliste', [await sichtbar(page, 'tab-artikel'), await sichtbar(page, 'tab-liste'), await page.textContent('#karte-titel')], [true, true, 'Aus Skillet']);
  check('Rezept und Zähler', await page.textContent('#karte-unterzeile'), 'Gulasch nach Omas Art · Zutat 1 von 5');
  check('Fünf Punkte, der erste aktiv', await page.$$eval('.karte-punkt', p => p.map(x => x.classList.contains('jetzt'))), [true, false, false, false, false]);
  check('Erste Karte vorausgefüllt', await felder(page), { name:'Rindergulasch', menge:'400', einheit:'gramm', laden:'', abteilung:'', hinweise:['', ''] });
  check('Knöpfe im Stapel', [await page.textContent('#artikel-speichern'), await page.textContent('#artikel-zweit'), await page.textContent('#karte-rest')],
    ['Übernehmen & weiter', 'Überspringen', 'Restliche 5 so übernehmen, wie vorgeschlagen']);
  check('Adresszeile ist wieder sauber', await page.evaluate(() => location.search), '');
  check('Übergabe ist aus dem Speicher entfernt', await page.evaluate(() => localStorage.getItem('nest_skillet_einkauf')), null);
  check('Nichts wurde automatisch eingetragen', await neueArtikel(page), []);
  check('Nichts ragt seitlich heraus (320 px)', await page.evaluate(() => document.documentElement.scrollWidth <= 320), true);

  console.log('\n=== Laden für alle, wie zuletzt ===');
  await page.selectOption('#item-store', 's1');
  await page.check('#karte-laden-alle');
  await page.click('#artikel-speichern'); await page.waitForTimeout(300);
  check('Zweite Karte: Laden "für alle", Abteilung "wie zuletzt"', await felder(page),
    { name:'Zwiebeln', menge:'2', einheit:'stueck', laden:'s1', abteilung:'d1', hinweise:['für alle gewählt', 'wie zuletzt'] });
  check('Kein Doppelt-Hinweis (Zwiebeln sind gekauft, nicht offen)', await sichtbar(page, 'karte-doppelt'), false);
  await page.screenshot({ path: '/tmp/karte_skillet_320.png', fullPage: true });
  await page.click('#artikel-speichern'); await page.waitForTimeout(300);
  check('Dritte Karte: Paprika', (await felder(page)).name, 'Paprikapulver edelsüß');
  await page.click('#artikel-zweit'); await page.waitForTimeout(300);

  console.log('\n=== Doppeltes ===');
  check('Vierte Karte: Olivenöl steht offen drauf', await page.textContent('#karte-doppelt'),
    'Steht schon auf der Liste: Olivenöl – 1 l„Übernehmen“ lässt es dabei.');
  await page.screenshot({ path: '/tmp/karte_doppelt_320.png', fullPage: true });
  await page.fill('#item-menge', '0.5');
  await page.dispatchEvent('#item-menge', 'input');
  check('Mit Menge 0,5 l: wird erhöht', await page.textContent('#karte-doppelt'),
    'Steht schon auf der Liste: Olivenöl – 1 l„Übernehmen“ setzt die Menge auf 1,5 l.');
  await page.click('#karte-rest'); await page.waitForTimeout(500);

  console.log('\n=== Zusammenfassung ===');
  check('Überschrift', await page.textContent('#karte-zusammenfassung-titel'), '4 Zutaten auf der Liste');
  check('Je Zutat, was passiert ist', await page.$$eval('#karte-zusammenfassung-liste li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim())),
    ['Rindergulasch – 400 g neu', 'Zwiebeln – 2 Stück neu', 'Paprikapulver edelsüß übersprungen', 'Olivenöl erhöht auf 1,5 l', 'Petersilie – 1 Bund neu']);
  check('In der Datenbank (Petersilie mit dem Laden "für alle")', await neueArtikel(page), [
    ['Rindergulasch', 400, 'gramm', 's1', null], ['Zwiebeln', 2, 'stueck', 's1', 'd1'], ['Petersilie', 1, 'bund', 's1', null]]);
  check('Olivenöl wurde erhöht, nicht doppelt angelegt',
    await page.evaluate(() => window.__db.shopping_items.filter(i => i.name === 'Olivenöl').map(i => [i.id, i.menge, i.einheit])), [['i2', 1.5, 'liter']]);
  await page.screenshot({ path: '/tmp/karte_fertig_320.png', fullPage: true });
  await page.click('#karte-zusammenfassung button'); await page.waitForTimeout(300);
  check('"Fertig" führt zur Einkaufsliste', [await sichtbar(page, 'tab-liste'), await sichtbar(page, 'tab-artikel')], [true, false]);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Zurück-Taste mitten im Stapel ===');
  ({ page, errors } = await neueSeite(browser, { query: link }));
  await page.click('#artikel-speichern'); await page.waitForTimeout(250);
  await page.goBack(); await page.waitForTimeout(250);
  check('Zurück: Einkaufsliste statt App verlassen', [await sichtbar(page, 'tab-liste'), await sichtbar(page, 'tab-artikel')], [true, false]);
  await page.goForward(); await page.waitForTimeout(250);
  check('Vorwärts: dieselbe Karte wieder', await page.textContent('#karte-unterzeile'), 'Gulasch nach Omas Art · Zutat 2 von 5');
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Neuladen ohne Link ===');
  ({ page, errors } = await neueSeite(browser));
  check('Start wie immer', await sichtbar(page, 'start-view'), true);
  check('Keine Karte', await sichtbar(page, 'tab-artikel'), false);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Alte Übergabe verfällt ===');
  ({ page, errors } = await neueSeite(browser, { speicher: { nest_skillet_einkauf: JSON.stringify({ zeilen: 'Mehl', rezept: 'Alt', zeit: Date.now() - 13 * 3600 * 1000 }) } }));
  check('Nach 13 Stunden: Start statt Karten', [await sichtbar(page, 'start-view'), await sichtbar(page, 'tab-artikel')], [true, false]);
  check('Alte Übergabe ist trotzdem weggeräumt', await page.evaluate(() => localStorage.getItem('nest_skillet_einkauf')), null);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Link, bevor man angemeldet ist ===');
  ({ page, errors } = await neueSeite(browser, { abgemeldet: true, query: '?einkauf=' + encodeURIComponent('3 Eier') }));
  check('Ohne Anmeldung: Link ist gemerkt', await page.evaluate(() => JSON.parse(localStorage.getItem('nest_skillet_einkauf')).zeilen), '3 Eier');
  await page.evaluate(() => window.__authCb('SIGNED_IN', { user: { id: 'u1', email: 'j@x.de' } }));
  await page.waitForTimeout(900);
  check('Nach der Anmeldung: Karte mit den Eiern', [await sichtbar(page, 'tab-artikel'), (await felder(page)).name, (await felder(page)).menge], [true, 'Eier', '3']);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Obergrenze: höchstens 50 Karten, Titel gekürzt ===');
  const viele = Array.from({ length: 120 }, (_, i) => `${i + 1} g Zutat${i + 1}`).join('\n');
  ({ page, errors } = await neueSeite(browser, { query: '?einkauf=' + encodeURIComponent(viele) + '&rezept=' + encodeURIComponent('X'.repeat(200)) }));
  const unter = await page.textContent('#karte-unterzeile');
  check('Unterzeile nennt die Grenze', unter.endsWith('Zutat 1 von 50 (nur die ersten 50, 70 weggelassen)'), true);
  check('Titel auf 60 Zeichen gekürzt', unter.split(' · ')[0].length, 60);
  await page.click('#karte-rest'); await page.waitForTimeout(500);
  check('Zusammenfassung mit 50 Einträgen', await page.$$eval('#karte-zusammenfassung-liste li', l => l.length), 50);
  check('Keine Fehler', errors, []);
  await page.close();

  await browser.close();
  console.log(failures === 0 ? '\n>>> ALLE TESTS BESTANDEN' : `\n>>> ${failures} FEHLGESCHLAGEN`);
})();
