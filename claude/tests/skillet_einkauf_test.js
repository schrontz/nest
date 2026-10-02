// Übergabe aus Skillet: Link mit ?einkauf=...&rezept=... befüllt "mehrere auf einmal".
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const STUB = eval(fs.readFileSync('/tmp/start_test.js', 'utf8').match(/const STUB = (`[\s\S]*?`);/)[1]);

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
  if (opts.speicher) await page.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, opts.speicher);
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript', body: STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html') + (opts.query || ''));
  await page.waitForTimeout(1200);
  return { page, errors };
}
const sichtbar = (p, id) => p.evaluate(id => getComputedStyle(document.getElementById(id)).display !== 'none', id);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const zeilen = '400 g Rindergulasch\n2 Zwiebeln\nPaprikapulver edelsüß\nBrot';

  console.log('=== Link aus Skillet ===');
  let { page, errors } = await neueSeite(browser, { breite: 320,
    query: '?einkauf=' + encodeURIComponent(zeilen) + '&rezept=' + encodeURIComponent('Gulasch nach Omas Art') });
  check('Einkaufen ist offen', await sichtbar(page, 'tab-liste'), true);
  check('Formular ist aufgeklappt', await sichtbar(page, 'add-form'), true);
  check('"mehrere auf einmal" ist aufgeklappt', await sichtbar(page, 'mehrere-form'), true);
  check('Beschriftung des Umschalters passt', await page.textContent('#toggle-mehrere-link'), 'einzeln hinzufügen');
  check('Feld enthält die Zeilen aus Skillet', await page.inputValue('#mehrere-text'), zeilen);
  check('Hinweis nennt Rezept und Anzahl', await page.textContent('#mehrere-status'),
    'Aus Skillet: Gulasch nach Omas Art – 4 Zutaten. Prüfen, dann „Auf die Liste“.');
  check('Adresszeile ist wieder sauber', await page.evaluate(() => location.search), '');
  check('Übergabe ist aus dem Speicher entfernt', await page.evaluate(() => localStorage.getItem('nest_skillet_einkauf')), null);
  check('Nichts wurde automatisch eingetragen', await page.evaluate(() => window.__fakeData.shopping_items.length), 4);
  check('Feld ragt nicht seitlich heraus', await page.evaluate(() => document.documentElement.scrollWidth <= 320), true);
  await page.screenshot({ path: '/tmp/skillet_einkauf_320.png' });

  console.log('\n=== "Auf die Liste" ===');
  await page.click('#mehrere-form button');
  await page.waitForTimeout(400);
  const neu = await page.evaluate(() => window.__fakeData.shopping_items.slice(0, 3).map(i => [i.name, i.menge, i.einheit]).reverse());
  check('Drei neue Artikel mit Menge und Einheit', neu, [['Rindergulasch', 400, 'gramm'], ['Zwiebeln', 2, 'stueck'], ['Paprikapulver edelsüß', null, 'stueck']]);
  check('Brot stand schon offen und wird übersprungen', await page.evaluate(() => window.__fakeData.shopping_items.filter(i => i.name === 'Brot').length), 1);
  check('Status meldet das Übersprungene', (await page.textContent('#mehrere-status')).includes('3 Artikel hinzugefügt, 1 stand schon auf der Liste'), true);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Neue Einheiten (Dose, Bund, Glas, Flasche, Becher) ===');
  ({ page, errors } = await neueSeite(browser, { query: '?einkauf=' + encodeURIComponent('1 Bund Petersilie\n2 Dosen gehackte Tomaten\n1 Glas Kapern\n2 Flaschen Wasser\n1 Becher Sahne') }));
  await page.click('#mehrere-form button');
  await page.waitForTimeout(400);
  check('Einheiten werden erkannt', await page.evaluate(() => window.__fakeData.shopping_items.slice(0, 5).map(i => [i.name, i.menge, i.einheit]).reverse()),
    [['Petersilie', 1, 'bund'], ['gehackte Tomaten', 2, 'dose'], ['Kapern', 1, 'glas'], ['Wasser', 2, 'flasche'], ['Sahne', 1, 'becher']]);
  check('Auswahlfeld kennt die neuen Einheiten', await page.evaluate(() => [...document.querySelectorAll('#item-einheit option')].map(o => o.value).slice(-5)),
    ['dose', 'bund', 'glas', 'flasche', 'becher']);
  check('Liste zeigt "Petersilie – 1 Bund"', (await page.textContent('#item-list-offen')).replace(/\s+/g, ' ').includes('Petersilie – 1 Bund'), true);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Neuladen ohne Link ===');
  ({ page, errors } = await neueSeite(browser));
  check('Start wie immer', await sichtbar(page, 'start-view'), true);
  check('Kein befülltes Feld', await page.inputValue('#mehrere-text'), '');
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Alte Übergabe verfällt ===');
  ({ page, errors } = await neueSeite(browser, { speicher: { nest_skillet_einkauf: JSON.stringify({ zeilen: 'Mehl', rezept: 'Alt', zeit: Date.now() - 13 * 3600 * 1000 }) } }));
  check('Nach 13 Stunden: Start statt Einkaufsliste', await sichtbar(page, 'start-view'), true);
  check('Feld bleibt leer', await page.inputValue('#mehrere-text'), '');
  check('Alte Übergabe ist trotzdem weggeräumt', await page.evaluate(() => localStorage.getItem('nest_skillet_einkauf')), null);
  check('Keine Fehler', errors, []);
  await page.close();

  console.log('\n=== Link, bevor man angemeldet ist ===');
  // Die Attrappe meldet sofort an. Hier wird das Anmelden zurückgehalten und
  // erst nach dem Laden ausgelöst -- die Übergabe muss das überstehen.
  ({ page, errors } = await neueSeite(browser, { query: '?einkauf=' + encodeURIComponent('3 Eier') }));
  await page.close();
  const p2 = await browser.newPage({ viewport: { width: 375, height: 760 } });
  const fehler2 = [];
  p2.on('pageerror', e => fehler2.push(e.message));
  await p2.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: STUB.replace("setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0)", "setTimeout(()=>cb('SIGNED_OUT',null),0)") }));
  await p2.goto('file://' + path.resolve('/tmp/nest-test/index.html') + '?einkauf=' + encodeURIComponent('3 Eier'));
  await p2.waitForTimeout(800);
  check('Ohne Anmeldung: Link ist gemerkt', await p2.evaluate(() => JSON.parse(localStorage.getItem('nest_skillet_einkauf')).zeilen), '3 Eier');
  await p2.evaluate(() => window.__authCb('SIGNED_IN', { user: { id: 'u1', email: 'j@x.de' } }));
  await p2.waitForTimeout(800);
  check('Nach der Anmeldung: Feld ist befüllt', await p2.inputValue('#mehrere-text'), '3 Eier');
  check('Keine Fehler', fehler2, []);

  await browser.close();
  console.log(failures === 0 ? '\nALLE TESTS BESTANDEN' : `\n${failures} FEHLGESCHLAGEN`);
})();
