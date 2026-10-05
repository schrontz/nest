// Einkaufsliste: "Ich bin gerade bei …" und das Banner nach dem Abhaken.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const src = fs.readFileSync('/tmp/essen_test.js', 'utf8');
const BASIS = eval(src.match(/const STUB = (`[\s\S]*?`);/)[1]);
const it = (id, name, store) => ({ id, name, menge: 1, einheit: 'stueck', store_id: store, department_id: null, status: 'offen',
  created_by: 'u1', household_id: 'h1', priority: 'normal', created_at: '2026-10-02T10:00:00Z' });
const LAEDEN = [{ id:'s2', name:'Rewe' }, { id:'s1', name:'Aldi' }, { id:'s3', name:'Rossmann' }]
  .map(s => ({ ...s, address: null, household_id: 'h1', department_order: [], image_path: null }));
function stub(items) {
  return BASIS.replace("stores: [{ id:'s1', name:'Aldi', address:null, household_id:'h1', department_order:[], image_path:null }],", `stores: ${JSON.stringify(LAEDEN)},`)
    .replace(/shopping_items: \[[\s\S]*?\n  \],/, `shopping_items: ${JSON.stringify(items)},`);
}
const VOLL = [it('a', 'Milch', 's2'), it('b', 'Brot', 's2'), it('c', 'Olivenöl', 's1'), it('d', 'Eier', 's1'), it('e', 'Küchenrolle', 's3'), it('f', 'Batterien', null)];

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  async function seite(items) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.clock.install({ time: new Date('2026-10-03T10:00:00') });
    page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
    page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
    await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r => r.fulfill({ status:200, contentType:'application/javascript', body: stub(items) }));
    await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
    await page.waitForTimeout(900);
    await page.evaluate(() => showTab('liste')); await page.waitForTimeout(250);
    return page;
  }
  const reihenfolge = p => p.$$eval('#item-list-offen h3.laden-kopf, #item-list-offen .woanders', e => e.map(x =>
    x.classList.contains('woanders') ? '--woanders--' : x.textContent.trim()));
  const knopf = p => p.$eval('#laden-modus .laden-knopf', e => e.textContent.trim());
  const banner = p => p.$eval('#laden-modus .laden-banner span', e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  const abhaken = async (p, name) => {
    const box = await p.evaluateHandle(n => [...document.querySelectorAll('#item-list-offen li')].find(li => li.innerText.includes(n)).querySelector('input[type=checkbox]'), name);
    await box.click(); await p.waitForTimeout(300);
  };

  let page = await seite(VOLL);
  console.log('=== Normalzustand ===');
  check('Nur ein dezenter Knopf', [await knopf(page), await page.$$eval('#laden-modus .laden-chips', e => e.length)], ['📍 Ich bin gerade bei …', 0]);
  check('Reihenfolge wie bisher', await reihenfolge(page), ['Aldi', 'Rewe', 'Rossmann', 'Ohne Laden']);

  console.log('\n=== Modus wählen ===');
  await page.click('#laden-modus .laden-knopf'); await page.waitForTimeout(100);
  check('Läden alphabetisch als Chips', await page.$$eval('#laden-modus .laden-chips button', b => b.map(x => x.textContent)), ['Aldi', 'Rewe', 'Rossmann']);
  await page.click('#laden-modus .laden-chips button:nth-child(2)'); await page.waitForTimeout(150);
  check('Knopf zeigt den Modus, Chips zu', [await knopf(page), await page.$$eval('#laden-modus .laden-chips', e => e.length)], ['📍 Bei Rewe ✕', 0]);
  check('Erst Rewe, dann ohne Laden, dann woanders', await reihenfolge(page), ['Rewe', 'Ohne Laden', '--woanders--', 'Aldi', 'Rossmann']);
  await abhaken(page, 'Küchenrolle');
  check('Woanders abhaken geht wie immer', await page.evaluate(() => window.__db.shopping_items.find(i => i.id === 'e').status), 'gekauft');
  check('Im Modus kein Banner', await banner(page), null);
  check('Modus bleibt nach dem Neuzeichnen', await knopf(page), '📍 Bei Rewe ✕');
  await page.click('#laden-modus .laden-knopf'); await page.waitForTimeout(150);
  check('✕ beendet den Modus', [await knopf(page), await reihenfolge(page)], ['📍 Ich bin gerade bei …', ['Aldi', 'Rewe', 'Ohne Laden']]);
  await page.close();

  console.log('\n=== Banner nach dem Abhaken ===');
  page = await seite(VOLL);
  await abhaken(page, 'Milch');
  check('Banner mit Anzahl der woanders geplanten', await banner(page), 'Bei Rewe? 3 Sachen sind woanders geplant.');
  await page.click('#laden-modus .laden-banner .ja'); await page.waitForTimeout(150);
  check('"Zeigen" schaltet in den Modus, Banner weg', [await knopf(page), await banner(page)], ['📍 Bei Rewe ✕', null]);
  await page.click('#laden-modus .laden-knopf'); await page.waitForTimeout(150);
  await abhaken(page, 'Brot');
  check('Pro Laden nur einmal', await banner(page), null);
  await abhaken(page, 'Olivenöl');
  check('Anderer Laden: neues Banner, Einzahl', await banner(page), 'Bei Aldi? 1 Sache ist woanders geplant.');
  await page.click('#laden-modus .laden-banner .zu'); await page.waitForTimeout(100);
  check('✕ schließt das Banner, kein Modus', [await banner(page), await knopf(page)], [null, '📍 Ich bin gerade bei …']);
  await abhaken(page, 'Batterien');
  check('Ohne Laden: kein Banner', await banner(page), null);
  await page.click('#laden-modus .laden-knopf');
  await page.click('#laden-modus .laden-chips button:nth-child(2)'); await page.waitForTimeout(150);
  check('Laden ohne eigene Artikel: Hinweis und woanders', [await page.textContent('.laden-leer'), await reihenfolge(page)],
    ['Für Rewe steht nichts auf der Liste.', ['--woanders--', 'Aldi', 'Rossmann']]);
  check('Kein Überlauf auf 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();

  console.log('\n=== Nichts woanders offen ===');
  page = await seite([it('a', 'Milch', 's2'), it('b', 'Brot', 's2'), it('f', 'Batterien', null)]);
  await abhaken(page, 'Milch');
  check('Kein Banner, wenn woanders nichts offen ist', await banner(page), null);
  await page.close();

  console.log('\nJS-Fehler: ' + (errors.length ? errors.join('\n') : 'keine'));
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
