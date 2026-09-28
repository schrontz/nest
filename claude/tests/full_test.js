const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const STUB = fs.readFileSync('/tmp/render_test.js', 'utf8').match(/const STUB_SUPABASE_JS = `([\s\S]*?)`;\n/)[1];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}` + (ok ? '' : `\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  return ok;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let failures = 0;

  for (const vp of [{ name: 'Mobil 375px', width: 375, height: 700 }, { name: 'Desktop 900px', width: 900, height: 900 }]) {
    console.log(`\n=== ${vp.name} ===`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
    // Die Bild-URLs der Attrappe zeigen auf eine erfundene Domain -- dass der
    // Browser die nicht laden kann, ist kein Fehler der App.
    const ignorieren = ['ServiceWorker', 'ERR_TUNNEL_CONNECTION_FAILED', 'beispiel.test'];
    page.on('console', (m) => {
      if (m.type() === 'error' && !ignorieren.some(i => m.text().includes(i))) errors.push('CONSOLE: ' + m.text());
    });
    await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));

    await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
    await page.waitForTimeout(1200);

    // --- Tab: Liste ---
    await page.evaluate(() => showTab('liste'));
    await page.waitForTimeout(200);
    const listeHtml = await page.$eval('#item-list-offen', el => el.innerHTML);
    if (!check('Einkaufsliste zeigt Artikel', listeHtml.includes('Äpfel'), true)) failures++;
    if (!check('Einkaufsliste gruppiert nach Laden', listeHtml.includes('Aldi'), true)) failures++;
    if (!check('Laden-Logo neben der Überschrift',
      await page.$$eval('#item-list-offen .laden-kopf img.laden-logo', e => e.length), 1)) failures++;
    if (!check('Genau ein Artikel ist als dringend hervorgehoben',
      await page.$$eval('#item-list-offen li.prio-zeile-dringend .item-name',
        e => e.map(x => x.textContent.replace(/\s+/g,' ').trim().replace(/^Dringend/, '').split(' hinzugefügt')[0].trim())),
      ['Klopapier – 1 Packung'])) failures++;
    if (!check('Einkaufsliste NICHT nach Priorität umsortiert (Laufweg bleibt)',
      await page.$$eval('#item-list-offen li .item-name',
        e => e.map(x => x.textContent.replace(/\s+/g,' ').trim().replace(/^(Dringend|Wichtig)/,'').split(' – ')[0].trim())),
      ['Äpfel', 'Klopapier'])) failures++;

    // --- Tab: Aufgaben ---
    await page.evaluate(() => showTab('aufgaben'));
    await page.waitForTimeout(200);
    const choreTexts = await page.$$eval('#chore-list li', els => els.map(e => e.querySelector('.item-name').textContent.replace(/\s+/g, ' ').trim()));
    // Datum schlägt Priorität; bei gleichem Termin und bei Aufgaben ohne
    // Termin entscheidet die Priorität; Aufgaben ohne Termin stehen hinten.
    // Die überfällige Gieß-Erinnerung der Attrappe steht bewusst NICHT hier:
    // Gießen ist Routine und gehört auf die Pflanzen-Kachel, in die
    // Aufgabenliste kommen nur Düngen und Umtopfen.
    if (!check('Aufgaben-Reihenfolge (Datum vor Priorität, ohne Termin hinten, erledigt zuletzt)',
      choreTexts.map(t => t.replace(/^(Dringend|Wichtig)/, '').split(' – ')[0].split(' Zugewiesen')[0].trim()),
      ['Müll rausbringen', 'Rechnung zahlen', 'Fenster putzen',
       'Keller aufräumen', 'Fotos sortieren', 'Pakete abholen'])) failures++;
    if (!check('Gießen steht nicht in der Aufgabenliste',
      await page.$$eval('#chore-list li.pflege-eintrag .item-name',
        e => e.map(x => x.textContent).filter(t => t.includes('gießen'))), [])) failures++;
    if (!check('Erledigte Pflege von vorgestern bleibt aus der Aufgabenliste draußen',
      choreTexts.filter(t => t.includes('Düngen') || t.includes('düngen')).length, 0)) failures++;
    if (!check('Dringende Aufgabe trägt Markierung',
      await page.$$eval('#chore-list .prio-dringend', e => e.map(x => x.textContent)), ['Dringend'])) failures++;
    if (!check('Erledigte Aufgabe zeigt KEINE Markierung',
      choreTexts[choreTexts.length - 1].includes('Dringend'), false)) failures++;
    if (!check('Erledigte Aufgabe mit "erledigt am … von …"',
      /erledigt am \d{2}\.\d{2}\.\d{4} von/.test(choreTexts[choreTexts.length - 1]), true)) failures++;
    if (!check('Zimmer wird bei Aufgabe angezeigt', choreTexts[0].includes('Wohnzimmer'), true)) failures++;
    // Nur die überfällige Aufgabe -- das überfällige Gießen steht jetzt auf
    // der Kachel, nicht mehr hier.
    if (!check('Überfällig-Markierung gesetzt', await page.$$eval('#chore-list li.chore-overdue', e => e.length), 1)) failures++;

    // Aufgabe bearbeiten
    await page.click('#chore-list li:not(.pflege-eintrag) .item-name.clickable');
    await page.waitForTimeout(200);
    if (!check('Zimmer-Auswahl im Bearbeiten-Formular', await page.$eval('#chore-list select[id^=edit-chore-room-]', e => e.value), 'r1')) failures++;
    await page.click('#chore-list .edit-actions button:nth-child(2)'); // Abbrechen
    await page.waitForTimeout(200);

    // --- Tab: Pflanzen ---
    await page.evaluate(() => showTab('pflanzen'));
    await page.waitForTimeout(200);
    // Seit Block 3: Übersicht als Kacheln, die Karte steckt in der Detailansicht.
    await page.click('#plant-list li.p-kachel');
    await page.waitForTimeout(200);
    if (!check('Pflanzen-Karte vorhanden', await page.$$eval('li.plant-card', e => e.length), 1)) failures++;
    if (!check('Zwei Pflege-Aufgaben vorhanden', await page.$$eval('.care-task', e => e.length), 2)) failures++;
    if (!check('Ein weiterer Pflege-Typ hinzufügbar', await page.$$eval('.care-task-add-btn', e => e.length), 1)) failures++;
    const careTexts = await page.$$eval('.care-task .item-name', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    if (!check('Erledigte Pflege zeigt "erledigt am … von …"', /^Düngen – erledigt am \d{2}\.\d{2}\.\d{4} von /.test(careTexts[1]), true)) failures++;
    if (!check('Offene Pflege zeigt weiterhin Fälligkeit', /^Gießen – fällig \d{2}\.\d{2}\.\d{4}/.test(careTexts[0]), true)) failures++;
    if (!check('Pflege-Suchlink korrekt', await page.$eval('li.plant-card p a', e => e.getAttribute('href')),
      'https://www.google.com/search?q=Ocimum%20basilicum%20pflege')) failures++;

    // --- Einstellungen aus JEDEM Tab heraus öffnen: kein Panel darf offen bleiben ---
    for (const tab of ['liste', 'aufgaben', 'pflanzen']) {
      await page.evaluate(t => showTab(t), tab);
      await page.waitForTimeout(150);
      await page.click('#settings-btn');
      await page.waitForTimeout(150);
      const nochOffen = await page.evaluate(() =>
        ['liste', 'aufgaben', 'pflanzen'].filter(id =>
          getComputedStyle(document.getElementById('tab-' + id)).display !== 'none'));
      if (!check(`Aus Tab "${tab}": kein Bereich bleibt offen`, nochOffen, [])) failures++;
      if (!check(`Aus Tab "${tab}": Einstellungen sichtbar`, await page.isVisible('#tab-einstellungen'), true)) failures++;
      // zurück und prüfen, dass der Tab wieder erscheint
      await page.click('.settings-close');
      await page.waitForTimeout(150);
      if (!check(`Aus Tab "${tab}": Schließen führt zurück`, await page.isVisible('#tab-' + tab), true)) failures++;
    }

    // --- Einstellungen ---
    // Vom Startbildschirm aus: dann ist "Mein Konto" die aufgeklappte Gruppe.
    // Aus den Bereichen heraus öffnet das Zahnrad je eine andere -- das
    // prüft start_test.js.
    await page.evaluate(() => zurueckZumStart());
    await page.waitForTimeout(200);
    await page.click('#settings-btn-start');
    await page.waitForTimeout(200);
    const gruppen = await page.$$eval('.settings-group > summary', els => els.map(e => e.textContent.trim()));
    if (!check('Einstellungs-Gruppen', gruppen, ['Mein Konto', 'Haushalt', 'Einkaufsliste', 'Zimmer'])) failures++;
    if (!check('Erste Gruppe offen, Rest zu', await page.$$eval('.settings-group', els => els.map(e => e.open)), [true, false, false, false])) failures++;

    // Gruppe aufklappen und Inhalte prüfen
    await page.click('.settings-group:nth-of-type(3) > summary'); // Einkaufsliste
    await page.waitForTimeout(250);
    if (!check('Läden-Liste sichtbar nach Aufklappen', await page.isVisible('#store-list'), true)) failures++;
    if (!check('Abteilungs-Reihenfolge-Select sichtbar', await page.isVisible('#order-store-select'), true)) failures++;

    await page.click('.settings-group:nth-of-type(2) > summary'); // Haushalt
    await page.waitForTimeout(250);
    if (!check('Mitgliederliste gefüllt', await page.$$eval('#household-member-list li', e => e.length), 2)) failures++;
    if (!check('Beitritts-Code angezeigt', await page.$eval('#household-join-code', e => e.textContent), 'ABC123')) failures++;

    if (!check('Mitglied mit Bild zeigt Avatar',
      await page.$$eval('#household-member-list img.avatar', e => e.length), 1)) failures++;
    if (!check('Mitglied ohne Bild zeigt Initiale',
      await page.$$eval('#household-member-list .avatar-platzhalter', e => e.map(x => x.textContent.trim())), ['p'.toUpperCase()])) failures++;

    await page.click('.settings-group:nth-of-type(4) > summary'); // Zimmer
    await page.waitForTimeout(250);
    if (!check('Zimmer-Liste gefüllt', await page.$$eval('#room-list li', e => e.length), 1)) failures++;

    // Benachrichtigungs-Checkboxen (Gruppe 1 ist offen)
    if (!check('Aufgaben-Benachrichtigung angehakt', await page.isChecked('#notify-chores-checkbox'), true)) failures++;
    if (!check('Pflanzen-Benachrichtigung angehakt', await page.isChecked('#notify-plants-checkbox'), true)) failures++;

    // Eigenes Profilbild im Konto-Bereich (Gruppe 1 ist offen)
    if (!check('Eigenes Profilbild wird angezeigt', await page.isVisible('#avatar-aktuell'), true)) failures++;
    if (!check('"Bild entfernen" vorhanden', await page.$('#avatar-remove') !== null, true)) failures++;
    if (!check('Datei-Auswahl fürs Profilbild vorhanden', await page.$('#avatar-input') !== null, true)) failures++;

    // Der native "Datei auswählen"-Knopf muss die App-Farbe tragen
    const knopfFarbe = await page.evaluate(() => {
      const el = document.getElementById('avatar-input');
      return getComputedStyle(el, '::file-selector-button').backgroundColor;
    });
    if (!check('Datei-Button trägt die App-Farbe (nicht Browser-Grau)',
      knopfFarbe, 'rgb(69, 124, 140)')) failures++;

    if (!check('Prioritäts-Auswahl im Aufgaben-Formular', await page.$('#chore-priority') !== null, true)) failures++;
    if (!check('Prioritäts-Auswahl im Artikel-Formular', await page.$('#item-priority') !== null, true)) failures++;

    // --- Layout: kein horizontaler Überlauf ---
    const overflow = await page.evaluate(() => ({ s: document.body.scrollWidth, c: document.body.clientWidth }));
    if (!check('Kein horizontaler Überlauf', overflow.s <= overflow.c, true)) failures++;

    if (vp.width === 375) {
      await page.screenshot({ path: '/tmp/settings_mobile.png', fullPage: true });
    }

    console.log(errors.length ? 'JS-FEHLER:\n' + errors.join('\n') : 'Keine JS-Fehler');
    if (errors.length) failures++;
    await page.close();
  }

  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
