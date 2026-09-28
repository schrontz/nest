const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const STUB = fs.readFileSync('/tmp/render_test.js', 'utf8').match(/const STUB_SUPABASE_JS = `([\s\S]*?)`;\n/)[1];

let fehler = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}` + (ok ? '' : `\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) fehler++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  const jsFehler = [];
  page.on('pageerror', e => jsFehler.push(e.message));
  const ignorieren = ['ServiceWorker', 'ERR_TUNNEL_CONNECTION_FAILED', 'beispiel.test'];
  page.on('console', m => {
    if (m.type() === 'error' && !ignorieren.some(i => m.text().includes(i))) jsFehler.push(m.text());
  });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1200);

  console.log('=== Verkleinern (echte Browser-Ausführung) ===');
  const ergebnis = await page.evaluate(async () => {
    // Ein grosses "Foto" erzeugen: 4000x3000, wie eine Handykamera
    const c = document.createElement('canvas');
    c.width = 4000; c.height = 3000;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 4000, 3000);
    grad.addColorStop(0, '#2f6b7d'); grad.addColorStop(1, '#abdeba');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `hsl(${i % 360},70%,50%)`;
      ctx.fillRect(Math.random() * 4000, Math.random() * 3000, 60, 60);
    }
    const originalBlob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const datei = new File([originalBlob], 'foto.jpg', { type: 'image/jpeg' });

    const klein = await verkleinereBild(datei);

    // Masse des Ergebnisses nachmessen
    const url = URL.createObjectURL(klein);
    const masse = await new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.width, h: im.height });
      im.src = url;
    });

    return { originalKB: Math.round(originalBlob.size / 1024), kleinKB: Math.round(klein.size / 1024),
             typ: klein.type, breite: masse.w, hoehe: masse.h };
  });

  console.log(`     Original: ${ergebnis.originalKB} KB (4000x3000)`);
  console.log(`     Danach:   ${ergebnis.kleinKB} KB (${ergebnis.breite}x${ergebnis.hoehe}, ${ergebnis.typ})`);
  check('Lange Kante auf 1200 begrenzt', ergebnis.breite, 1200);
  check('Seitenverhältnis erhalten', ergebnis.hoehe, 900);
  check('Als JPEG ausgegeben', ergebnis.typ, 'image/jpeg');
  check('Deutlich unter 400 KB', ergebnis.kleinKB < 400, true);

  console.log('\n=== Transparentes PNG (Logo-Fall) ===');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000000';           // schwarze Schrift auf transparentem Grund
    ctx.fillRect(100, 100, 100, 100);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const klein = await verkleinereBild(new File([blob], 'logo.png', { type: 'image/png' }));
    // Eckpixel prüfen: muss weiss sein, nicht schwarz
    const url = URL.createObjectURL(klein);
    const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = url; });
    const c2 = document.createElement('canvas');
    c2.width = im.width; c2.height = im.height;
    c2.getContext('2d').drawImage(im, 0, 0);
    const p = c2.getContext('2d').getImageData(2, 2, 1, 1).data;
    return { ecke: [p[0], p[1], p[2]] };
  });
  check('Transparenter Grund wird weiss, nicht schwarz', png.ecke.every(v => v > 240), true);

  console.log('\n=== Darstellung ===');
  await page.evaluate(() => showTab('pflanzen'));
  await page.waitForTimeout(300);
  check('Foto auf der Kachel', await page.$$eval('#plant-list li.p-kachel img', e => e.length), 1);
  // Seit Block 3: Übersicht als Kacheln, die Karte steckt in der Detailansicht.
  await page.click('#plant-list li.p-kachel');
  await page.waitForTimeout(250);
  check('Foto auf der Pflanzenkarte', await page.$$eval('img.plant-bild', e => e.length), 1);
  check('Bild-URL aus dem Pfad gebildet',
    (await page.$eval('img.plant-bild', e => e.getAttribute('src'))).endsWith('/bilder/households/h1/plants/abc.jpg'), true);
  check('Lazy Loading gesetzt', await page.$eval('img.plant-bild', e => e.getAttribute('loading')), 'lazy');
  check('Notiz wird angezeigt',
    (await page.$eval('.plant-notiz', e => e.textContent)).includes('Nicht in die pralle Sonne'), true);

  await page.click('li.plant-card .item-name.clickable');
  await page.waitForTimeout(250);
  check('Bearbeiten: Notizfeld gefüllt',
    (await page.$eval('textarea[id^=edit-plant-notes-]', e => e.value)).startsWith('Alle 3 Tage'), true);
  check('Bearbeiten: aktuelles Bild sichtbar',
    await page.$$eval('li.plant-card.editing .bild-vorschau', e => e.length), 1);
  check('Vorschaufeld im Anlege-Formular bleibt versteckt',
    await page.isVisible('#plant-image-preview'), false);
  check('Bearbeiten: "Foto entfernen" vorhanden',
    await page.$('input[id^=edit-plant-image-remove-]') !== null, true);
  check('Bearbeiten: Datei-Auswahl vorhanden',
    await page.$('input[type=file][id^=edit-plant-image-]') !== null, true);

  console.log('\nJS-Fehler: ' + (jsFehler.length ? jsFehler.join('\n') : 'keine'));
  if (jsFehler.length) fehler++;
  console.log(`\n>>> ${fehler === 0 ? 'ALLE TESTS BESTANDEN' : fehler + ' FEHLGESCHLAGEN'}`);
  await browser.close();
  process.exit(fehler === 0 ? 0 : 1);
})();
