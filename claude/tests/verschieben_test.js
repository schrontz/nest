// Aufgaben: einmalig verschieben, Rhythmus bleibt; Löschen als Symbol.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, 'essen_test.js'), 'utf8');
let STUB = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);
const ch = (id, title, due, v, u, extra = {}) => Object.assign({ id, title, due_date: due, assigned_to: 'u1', status: 'offen', created_by: 'u1',
  household_id: 'h1', room_id: null, recurrence_interval_value: v, recurrence_interval_unit: u, completed_at: null, completed_by: null,
  priority: 'normal', verschoben_von: null }, extra);
// Heute ist Sonntag, 11.10.2026.
STUB = STUB.replace("rooms: [], plants: [], plant_care_tasks: [], chores: [],", `rooms: [], plants: [], plant_care_tasks: [], chores: ${JSON.stringify([
  ch('c1', 'Müll rausbringen', '2026-10-11', 1, 'woche'),
  ch('c2', 'Bad putzen', '2026-10-09', 2, 'woche'),
  ch('c3', 'Paket abholen', '2026-10-11', null, null),
  ch('c4', 'Keller', null, null, null),
  ch('c5', 'Fenster', '2026-10-13', 1, 'monat', { verschoben_von: '2026-10-12' }),
  ch('c7', 'Abzugshaubenfettfilterreinigungsmittelnachfüllpackung kaufen', '2027-01-09', 3, 'monat'),
  ch('c6', 'Erledigtes', '2026-10-10', 1, 'woche', { status: 'erledigt', completed_at: '2026-10-10T09:00:00Z' })
])},`);

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.clock.install({ time: new Date('2026-10-11T10:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  let dialogAntwort = true; const dialoge = [];
  page.on('dialog', d => { dialoge.push(d.message()); dialogAntwort ? d.accept() : d.dismiss(); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r => r.fulfill({ status:200, contentType:'application/javascript', body:STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1000);
  await page.click('#kachel-aufgaben'); await page.waitForTimeout(250);

  const zeile = t => page.evaluateHandle(t => [...document.querySelectorAll('#chore-list li')].find(li => li.innerText.includes(t)), t);
  const knopf = async (t, k) => (await zeile(t)).asElement().$(k);
  const db = id => page.evaluate(i => { const c = window.__db.chores.find(x => x.id === i); return c ? [c.due_date, c.verschoben_von || null] : null; }, id);
  const karteOffen = () => page.isVisible('#verschieben-karte');
  const chips = () => page.$$eval('#verschieben-chips .karte-pille', b => b.map(x => x.textContent + (x.classList.contains('aktiv') ? '*' : '')));

  console.log('=== Zeilen ===');
  check('⏭ nur bei offenen Aufgaben mit Termin', await page.$$eval('#chore-list li', l => l.map(li => [li.innerText.split(/\s[–-]\s|\n/)[0].trim(), !!li.querySelector('.verschiebe-knopf')])),
    [['Bad putzen', true], ['Müll rausbringen', true], ['Paket abholen', true], ['Fenster', true], ['Abzugshaubenfettfilterreinigungsmittelnachfüllpackung kaufen', true], ['Keller', false], ['Erledigtes', false]]);
  check('Löschen ist ein Mülleimer mit Beschriftung', await page.$eval('#chore-list li .loesch-knopf', b => [b.textContent.trim(), b.getAttribute('aria-label')]), ['🗑 Löschen', 'Bad putzen löschen']);
  check('Verschobenes zeigt den ursprünglichen Termin', await (await zeile('Fenster')).asElement().$eval('.verschoben-hinweis', e => e.textContent), '⏭ verschoben, eigentlich Mo 12.10.');
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  check('Fund vom 11.10.: Knöpfe bleiben auch bei sehr langen Wörtern in der Karte',
    await page.$$eval('#chore-list li', l => l.every(li => { const r = li.getBoundingClientRect();
      return [...li.querySelectorAll('button')].every(b => { const k = b.getBoundingClientRect(); return k.right <= r.right + 0.5 && k.left >= r.left - 0.5; }); })), true);
  check('Verschieben und Löschen stehen auf 320 px nebeneinander', await page.$$eval('#chore-list .aufgabe-aktionen', a => a.every(x => { const b = [...x.querySelectorAll('button')].map(k => Math.round(k.getBoundingClientRect().top)); return b.every(t => t === b[0]); })), true);
  check('Erledigte Aufgabe: nur Löschen', await (await zeile('Erledigtes')).asElement().$$eval('.aufgabe-aktionen button', b => b.map(x => x.textContent.trim())), ['🗑 Löschen']);

  console.log('\n=== Wöchentlich, heute fällig ===');
  await (await knopf('Müll', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  check('Karte offen', await karteOffen(), true);
  check('Unterzeile', await page.textContent('#verschieben-unterzeile'), 'Müll rausbringen · fällig heute · Wöchentlich');
  check('Vorschläge: Morgen (= Montag, nur einmal), +2, +3', await chips(), ['Morgen*', 'Di 13.10.', 'Mi 14.10.', 'Datum …']);
  check('Rhythmus-Hinweis', await page.textContent('#verschieben-info'), 'Nur dieses Mal. Danach geht es im alten Rhythmus weiter: So 18.10.');
  check('Kein "Aufheben" ohne Verschiebung', await page.isVisible('#verschieben-aufheben'), false);
  await page.click('#verschieben-chips .karte-pille:nth-child(3)');
  check('Knopf nennt das Ziel', await page.textContent('#verschieben-los'), 'Auf Mi 14.10. verschieben');
  await page.click('#verschieben-los'); await page.waitForTimeout(300);
  check('Gespeichert: neues Datum, Ursprung gemerkt', await db('c1'), ['2026-10-14', '2026-10-11']);
  check('Karte zu', await karteOffen(), false);
  check('Hinweis in der Liste', await (await zeile('Müll')).asElement().$eval('.verschoben-hinweis', e => e.textContent), '⏭ verschoben, eigentlich So 11.10.');

  console.log('\n=== Zweimal verschieben, dann zurück ===');
  await (await knopf('Müll', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  check('Vorschläge ab dem verschobenen Termin, plus nächster Montag', await chips(), ['Do 15.10.*', 'Fr 16.10.', 'Sa 17.10.', 'Mo 19.10.', 'Datum …']);
  check('"Aufheben" sichtbar', await page.textContent('#verschieben-aufheben'), 'Verschiebung aufheben (zurück auf So 11.10.)');
  await page.click('#verschieben-chips .karte-pille:nth-child(4)');
  check('Über den nächsten Termin hinaus: Rhythmus springt weiter', await page.textContent('#verschieben-info'), 'Nur dieses Mal. Danach geht es im alten Rhythmus weiter: So 25.10.');
  await page.click('#verschieben-chips .karte-pille:nth-child(1)');
  await page.click('#verschieben-los'); await page.waitForTimeout(300);
  check('Ursprung bleibt der erste Termin', await db('c1'), ['2026-10-15', '2026-10-11']);
  await (await knopf('Müll', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  await page.click('#verschieben-aufheben'); await page.waitForTimeout(300);
  check('Aufheben: zurück auf den Ursprung', await db('c1'), ['2026-10-11', null]);

  console.log('\n=== Überfällig ===');
  await (await knopf('Bad', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  check('Vorschläge ab heute, nicht ab dem alten Datum', await chips(), ['Morgen*', 'Di 13.10.', 'Mi 14.10.', 'Datum …']);
  check('Zweiwöchentlich ab Fr 09.10.', await page.textContent('#verschieben-info'), 'Nur dieses Mal. Danach geht es im alten Rhythmus weiter: Fr 23.10.');

  console.log('\n=== Zurück-Taste schließt nur die Karte ===');
  await page.evaluate(() => scrollTo(0, 120));
  await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  check('Karte zu, Aufgaben noch offen', [await karteOffen(), await page.isVisible('#tab-aufgaben'), await page.evaluate(() => document.body.classList.contains('karte-offen'))], [false, true, false]);
  check('Nichts gespeichert', await db('c2'), ['2026-10-09', null]);

  console.log('\n=== Einmalige Aufgabe, freies Datum ===');
  await (await knopf('Paket', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  check('Hinweis für einmalige Aufgaben', await page.textContent('#verschieben-info'), 'Einmalige Aufgabe: Sie bekommt einfach den neuen Termin.');
  await page.click('#verschieben-chips .verschieben-mehr');
  await page.fill('#verschieben-datum', '2026-10-20');
  await page.$eval('#verschieben-datum', e => e.dispatchEvent(new Event('change')));
  check('"Datum …" zeigt das gewählte Datum', await chips(), ['Morgen', 'Di 13.10.', 'Mi 14.10.', 'Di 20.10.*']);
  await page.click('#verschieben-los'); await page.waitForTimeout(300);
  check('Nur das Datum geändert, kein Ursprung', await db('c3'), ['2026-10-20', null]);
  await (await knopf('Paket', '.verschiebe-knopf')).click(); await page.waitForTimeout(150);
  await page.click('#verschieben-chips .verschieben-mehr');
  await page.fill('#verschieben-datum', '2026-10-01');
  await page.$eval('#verschieben-datum', e => e.dispatchEvent(new Event('change')));
  await page.click('#verschieben-los'); await page.waitForTimeout(200);
  check('Vergangenheit abgelehnt', [await page.textContent('#verschieben-status'), await db('c3')], ['Das Datum liegt in der Vergangenheit.', ['2026-10-20', null]]);
  await page.click('#verschieben-karte .karte-zu'); await page.waitForTimeout(200);

  console.log('\n=== Bearbeiten: Datum von Hand ändern hebt die Verschiebung auf ===');
  await (await zeile('Fenster')).asElement().$eval('.item-name', e => e.click()); await page.waitForTimeout(150);
  await page.fill('input[id^=edit-chore-due-]', '2026-10-20');
  await page.click('#chore-list li.editing .edit-actions button'); await page.waitForTimeout(300);
  check('Neuer Rhythmus, Ursprung gelöscht', await db('c5'), ['2026-10-20', null]);

  console.log('\n=== Löschen ===');
  dialogAntwort = false;
  await (await knopf('Keller', '.loesch-knopf')).click(); await page.waitForTimeout(150);
  check('Rückfrage wie bisher', dialoge[dialoge.length - 1], '"Keller" wirklich löschen?');
  check('Abgelehnt: noch da', !!(await db('c4')), true);

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
