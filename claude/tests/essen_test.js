const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

// Kleine In-Memory-Datenbank: Filter (eq, is, gte, lte) werden wirklich
// angewendet, Schreibvorgänge verändern die Daten. Sonst wäre z.B. "morgen
// Mittag ist schon belegt" in jedem Test wahr.
const STUB = `
window.__log = []; window.__n = 0;
window.__db = {
  households: [{ id:'h1', name:'Test', join_code:'ABC123' }],
  household_members: [{ household_id:'h1', user_id:'u1' }],
  profiles: [{ id:'u1', display_name:'Jan', notify_chores:true, notify_plants:true, avatar_path:null }],
  stores: [{ id:'s1', name:'Aldi', address:null, household_id:'h1', department_order:[], image_path:null }],
  departments: [{ id:'d1', name:'Kühlregal', household_id:'h1' }],
  rooms: [], plants: [], plant_care_tasks: [], chores: [], push_subscriptions: [],
  shopping_items: [
    { id:'i1', name:'Zwiebeln', menge:3, einheit:'stueck', store_id:'s1', department_id:'d1', status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i2', name:'Olivenöl', menge:1, einheit:'liter', store_id:'s1', department_id:null, status:'offen', created_by:'u1', household_id:'h1', priority:'normal' }
  ],
  // Woche 21.–27.09.2026, heute ist Freitag, der 25.
  meal_plan: [
    { id:'m1', household_id:'h1', datum:'2026-09-21', mahlzeit:'abend',  text:'Flammkuchen',          fuer:'u1', rest_von:null },
    { id:'m2', household_id:'h1', datum:'2026-09-21', mahlzeit:'abend',  text:'Yoga, isst unterwegs', fuer:'u2', rest_von:null },
    { id:'m3', household_id:'h1', datum:'2026-09-23', mahlzeit:'abend',  text:'Chili sin Carne',      fuer:null, rest_von:null },
    { id:'m4', household_id:'h1', datum:'2026-09-24', mahlzeit:'mittag', text:'Chili sin Carne',      fuer:null, rest_von:'2026-09-23' },
    { id:'m5', household_id:'h1', datum:'2026-09-25', mahlzeit:'mittag', text:'Chili sin Carne',      fuer:'u1', rest_von:'2026-09-23' },
    { id:'m6', household_id:'h1', datum:'2026-09-25', mahlzeit:'mittag', text:'Salat im Büro',        fuer:'u2', rest_von:null },
    { id:'m7', household_id:'h1', datum:'2026-09-25', mahlzeit:'abend',  text:'Pasta Hackfleisch',    fuer:null, rest_von:null },
    { id:'m8', household_id:'h1', datum:'2026-09-27', mahlzeit:'abend',  text:'Ofengemüse',           fuer:null, rest_von:null }
  ]
};
class Q {
  constructor(t){ this.t=t; this.f=[]; this.op='select'; this.einzeln=false; }
  select(){ return this; } order(){ return this; } limit(){ return this; } not(){ return this; } gt(){ return this; }
  eq(c,v){ this.f.push(r => r[c] === v); return this; }
  is(c,v){ this.f.push(r => (r[c] === undefined ? null : r[c]) === v); return this; }
  in(c,v){ this.f.push(r => v.includes(r[c])); return this; }
  gte(c,v){ this.f.push(r => r[c] >= v); return this; }
  lte(c,v){ this.f.push(r => r[c] <= v); return this; }
  insert(p){ this.op='insert'; this.p=p; return this; }
  update(p){ this.op='update'; this.p=p; return this; }
  delete(){ this.op='delete'; return this; }
  upsert(p){ this.op='insert'; this.p=p; return this; }
  maybeSingle(){ this.einzeln=true; return this; } single(){ this.einzeln=true; return this; }
  then(res){
    const db = window.__db; const l = db[this.t] || (db[this.t] = []);
    const passt = r => this.f.every(fn => fn(r));
    let r = { data:null, error:null };
    if (this.op === 'select') {
      const d = l.filter(passt).map(x => Object.assign({}, x));
      r = { data: this.einzeln ? (d[0] || null) : d, error: null };
    } else if (this.op === 'insert') {
      (Array.isArray(this.p) ? this.p : [this.p]).forEach(x => l.push(Object.assign(
        { id: 'n' + (++window.__n) }, this.t === 'shopping_items' ? { status:'offen' } : {}, x)));
      window.__log.push({ t:this.t, op:'insert', p:this.p });
    } else if (this.op === 'update') {
      const betroffen = l.filter(passt);
      betroffen.forEach(x => Object.assign(x, this.p));
      window.__log.push({ t:this.t, op:'update', p:this.p, ids: betroffen.map(x => x.id) });
    } else if (this.op === 'delete') {
      const weg = l.filter(passt).map(x => x.id);
      db[this.t] = l.filter(x => !passt(x));
      window.__log.push({ t:this.t, op:'delete', ids: weg });
    }
    res(r);
  }
}
window.supabase = { createClient: () => ({
  auth: { onAuthStateChange: cb => setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0),
          getUser: async()=>({data:{user:{id:'u1',email:'j@x.de'}}}), signOut: async()=>{} },
  from: t => new Q(t),
  rpc: n => Promise.resolve(n==='get_household_members'
    ? { data:[{user_id:'u1',email:'j@x.de',display_name:'Jan',avatar_path:null},
              {user_id:'u2',email:'p@x.de',display_name:'Partnerin',avatar_path:null}], error:null }
    : { data:null, error:null }),
  channel: function(){ const c={ on:()=>c, subscribe:()=>c }; return c; },
  removeAllChannels: () => {},
  storage: { from: () => ({ upload: async()=>({data:{},error:null}),
    getPublicUrl: p=>({data:{publicUrl:'x/'+p}}), remove: async()=>({data:null,error:null}) }) }
}) };
`;

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
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

  // Nach Datum auswählen, nicht nach Position: über der Woche kann ein
  // Hinweis stehen, der sonst alle Tage um eins verschiebt.
  const datumVon = i => '2026-09-' + String(21 + i).padStart(2, '0');
  const tag = i => `#meal-plan-list li.essen-tag[data-datum="${datumVon(i)}"]`;
  const platz = (i, m) => `${tag(i)} .essen-platz[data-mahlzeit="${m}"]`;
  const texte = sel => page.$$eval(sel + ' .essen-eintrag', e => e.map(x => x.innerText.replace(/\s+/g,' ').trim()));
  const log = () => page.evaluate(() => window.__log.filter(x => x.t === 'meal_plan'));
  const db = () => page.evaluate(() => window.__db.meal_plan.map(x => ({ d:x.datum, m:x.mahlzeit, t:x.text, f:x.fuer, r:x.rest_von })));

  // ------------------------------------------------------------------
  console.log('=== Startbildschirm: jeder sieht das Seine ===');
  check('Kachel zeigt eigenen Mittag und gemeinsamen Abend, nicht den Salat der anderen',
    await page.$$eval('#kachel-info-essen span', e => e.map(x => x.textContent)),
    ['Mittag: Chili sin Carne', 'Abend: Pasta Hackfleisch']);
  check('Zwei Zeilen werden zeilenweise gesetzt', await page.$eval('#kachel-info-essen', e => e.classList.contains('zeilenweise')), true);

  await page.click('#kachel-essen');
  await page.waitForTimeout(250);

  // ------------------------------------------------------------------
  console.log('\n=== Wochenansicht ===');
  check('Sieben Tage', await page.$$eval('#meal-plan-list li.essen-tag', e => e.length), 7);
  check('Jeder Tag hat Mittag und Abend',
    await page.$$eval('#meal-plan-list li.essen-tag', tage => tage.every(t =>
      [...t.querySelectorAll('.essen-zeit')].map(z => z.textContent).join('|') === 'Mittag|Abend')), true);
  check('Freitag ist heute', await page.$eval(tag(4), e => e.classList.contains('essen-heute')), true);
  check('Montagabend getrennt: eigene Person zuerst, mit Namen',
    await texte(platz(0, 'abend')), ['Jan Flammkuchen', 'Partnerin Yoga, isst unterwegs']);
  check('Eigene Person ist anders eingefärbt',
    await page.$$eval(platz(0,'abend') + ' .essen-person', e => e.map(x => x.classList.contains('essen-person-ich'))), [true, false]);
  check('Donnerstag: Rest mit Kochtag', await texte(platz(3, 'mittag')), ['Chili sin Carne Rest von Mittwoch']);
  check('Freitagmittag: eigener Rest vor fremdem Eintrag',
    await texte(platz(4, 'mittag')), ['Jan Chili sin Carne Rest von Mittwoch', 'Partnerin Salat im Büro']);
  check('Leerer Platz zeigt einen Strich zum Antippen', await page.$$eval(platz(1,'mittag') + ' .essen-leer', e => e.length), 1);

  // ------------------------------------------------------------------
  console.log('\n=== Neuer Eintrag ===');
  await page.click(platz(1, 'mittag') + ' .essen-leer');
  await page.waitForTimeout(150);
  check('Leerer Platz: "Beide" vorgewählt',
    await page.$eval('#meal-fuer-neu button.an', e => e.textContent.trim()), 'Beide');
  check('Auswahl: Beide, dann ich, dann die andere Person',
    await page.$$eval('#meal-fuer-neu button', e => e.map(x => x.textContent.trim())), ['Beide', 'Jan', 'Partnerin']);
  await page.fill('#meal-text-neu', 'Ofenkartoffeln');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let l = await log();
  check('Angelegt mit Mahlzeit, ohne Person',
    [l[l.length-1].op, l[l.length-1].p.datum, l[l.length-1].p.mahlzeit, l[l.length-1].p.fuer, l[l.length-1].p.text],
    ['insert', '2026-09-22', 'mittag', null, 'Ofenkartoffeln']);
  check('Steht danach in der Woche', await texte(platz(1, 'mittag')), ['Ofenkartoffeln']);

  await page.click(platz(2, 'abend') + ' .essen-plus');
  await page.waitForTimeout(150);
  check('"+" neben gemeinsamem Eintrag wählt die eigene Person vor',
    await page.$eval('#meal-fuer-neu button.an', e => e.textContent.trim()), 'Jan');
  await page.click('#meal-fuer-neu button:nth-child(1)');   // auf "Beide" zurück
  await page.fill('#meal-text-neu', 'Doppelt');
  await page.click(platz(2,'abend') + ' .essen-knoepfe button:nth-child(1)');
  await page.waitForTimeout(250);
  check('Zweiter gemeinsamer Eintrag im selben Platz: verständliche Meldung statt Fehler',
    await page.textContent('#meal-status-neu'), 'Für Beide steht hier schon „Chili sin Carne".');
  check('…und nichts geschrieben', (await log()).length, 1);
  await page.click(platz(2,'abend') + ' .essen-knoepfe button:nth-child(2)');   // Abbrechen
  await page.waitForTimeout(150);

  // ------------------------------------------------------------------
  console.log('\n=== Bearbeiten ===');
  await page.click(platz(6, 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  await page.click('#meal-fuer-m8 button:nth-child(3)');   // Partnerin
  await page.click(platz(6,'abend') + ' .essen-knoepfe button:nth-child(1)');
  await page.waitForTimeout(250);
  l = await log();
  check('Zuweisung geändert', [l[l.length-1].op, l[l.length-1].p.fuer, l[l.length-1].ids], ['update', 'u2', ['m8']]);

  await page.click(platz(1, 'mittag') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  const neueId = await page.$eval(platz(1,'mittag') + ' input[type=text]', e => e.id.replace('meal-text-', ''));
  await page.fill('#meal-text-' + neueId, '');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  l = await log();
  check('Leerer Text entfernt den Eintrag', l[l.length-1].op, 'delete');
  check('Platz ist wieder leer', await page.$$eval(platz(1,'mittag') + ' .essen-leer', e => e.length), 1);

  // ------------------------------------------------------------------
  console.log('\n=== → morgen Mittag ===');
  // Freitagabend (dein Beispiel): Samstag Mittag ist frei
  await page.click(platz(4, 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  await page.click(platz(4,'abend') + ' .rest-knopf');
  await page.waitForTimeout(350);
  check('Samstag Mittag: Rest von Freitag', await texte(platz(5, 'mittag')), ['Pasta Hackfleisch Rest von Freitag']);
  check('Rückmeldung über der Woche', await page.textContent('#meal-plan-list li.essen-hinweis'),
    '„Pasta Hackfleisch" steht jetzt auch Samstag Mittag.');

  // In Kette: vom Rest aus weiter -- Kochtag bleibt Freitag
  await page.click(platz(5, 'mittag') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  check('Rest hat keinen Zutaten-Knopf',
    await page.$$eval(platz(5,'mittag') + ' .essen-knoepfe button', e => e.map(x => x.textContent.trim()).includes('Zutaten')), false);
  await page.click(platz(5,'mittag') + ' .rest-knopf');
  await page.waitForTimeout(350);
  check('Sonntag Mittag: immer noch "Rest von Freitag"', await texte(platz(6, 'mittag')), ['Pasta Hackfleisch Rest von Freitag']);

  // Belegt: Mittwochabend Chili -> Donnerstag Mittag hat schon Chili (gemeinsam)
  dialogAntwort = false;
  await page.click(platz(2, 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  const vorher = (await log()).length;
  await page.click(platz(2,'abend') + ' .rest-knopf');
  await page.waitForTimeout(350);
  check('Belegt: es wird gefragt', dialoge[dialoge.length-1], 'Donnerstag Mittag steht für Beide schon „Chili sin Carne". Ersetzen?');
  check('Abgelehnt: nichts geschrieben', (await log()).length, vorher);
  dialogAntwort = true;
  await page.click(platz(2,'abend') + ' .rest-knopf');
  await page.waitForTimeout(350);
  l = await log();
  check('Bestätigt: der vorhandene Eintrag wird ersetzt, kein zweiter angelegt',
    [l[l.length-1].op, l[l.length-1].ids], ['update', ['m4']]);

  // Sonntag -> Montag der nächsten Woche (nicht geladen)
  await page.click(platz(6, 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  await page.click(platz(6,'abend') + ' .rest-knopf');
  await page.waitForTimeout(350);
  const montag = (await db()).filter(x => x.d === '2026-09-28');
  check('Sonntag → Montag der nächsten Woche angelegt, Zuweisung übernommen',
    montag, [{ d:'2026-09-28', m:'mittag', t:'Ofengemüse', f:'u2', r:'2026-09-27' }]);
  check('…und weil man es nicht sieht, eine Rückmeldung',
    await page.textContent('#meal-plan-list li.essen-hinweis'), '„Ofengemüse" steht jetzt auch Montag Mittag.');
  await page.click('.woche-kopf button:nth-child(3)');   // nächste Woche
  await page.waitForTimeout(300);
  check('In der nächsten Woche: "Rest von Sonntag"', await texte(platz(7, 'mittag')), ['Partnerin Ofengemüse Rest von Sonntag']);
  check('Hinweis verschwindet beim Blättern', await page.$$eval('#meal-plan-list li.essen-hinweis', e => e.length), 0);
  await page.click('#woche-heute');
  await page.waitForTimeout(300);

  // ------------------------------------------------------------------
  console.log('\n=== Zutaten ===');
  await page.click(platz(4, 'abend') + ' .essen-eintrag');
  await page.waitForTimeout(150);
  await page.click(platz(4,'abend') + ' .essen-knoepfe button:has-text("Zutaten")');
  await page.waitForTimeout(150);
  const zId = await page.$eval(platz(4,'abend') + ' textarea', e => e.id);
  await page.fill('#' + zId, '500 g Hackfleisch\n2 Zwiebeln\nOlivenöl');
  await page.click(platz(4,'abend') + ' .essen-knoepfe button:nth-child(1)');
  await page.waitForTimeout(350);
  // Seit Okt. 2026: "Auf die Liste" öffnet die Karten (artikel.js)
  check('Karten öffnen sich mit Gericht und Zähler',
    [await page.textContent('#bereich-titel'), await page.textContent('#karte-unterzeile')],
    ['Aus dem Essensplan', 'Pasta Hackfleisch · Zutat 1 von 3']);
  await page.click('#karte-rest');
  await page.waitForTimeout(400);
  check('Zusammenfassung: Olivenöl stand schon drauf',
    await page.$$eval('#karte-zusammenfassung-liste li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim())),
    ['Hackfleisch – 500 g neu', 'Zwiebeln – 2 Stück neu', 'Olivenöl stand schon drauf']);
  const neu = await page.evaluate(() => window.__db.shopping_items.filter(i => i.id.startsWith('n')).map(i => [i.name, i.menge, i.einheit, i.store_id]));
  check('Menge, Einheit und Laden vom letzten Mal', neu, [['Hackfleisch', 500, 'gramm', null], ['Zwiebeln', 2, 'stueck', 's1']]);
  await page.click('#karte-zusammenfassung button');
  await page.waitForTimeout(300);
  check('"Fertig" führt zurück in den Essensplan, Zutatenfeld geleert',
    [await page.isVisible('#tab-essen'), await page.inputValue('#' + zId)], [true, '']);

  // ------------------------------------------------------------------
  console.log('\n=== Mehrere Artikel direkt in der Liste (Bestand) ===');
  const zerlegt = await page.evaluate(() => ['2 Zwiebeln','500 g Mehl','1,5 l Milch','Olivenöl extra vergine','250g Nudeln','3']
    .map(z => { const r = zerlegeZeile(z); return [r.name, r.menge, r.einheit]; }));
  check('Zerlegung unverändert', zerlegt,
    [['Zwiebeln',2,null],['Mehl',500,'gramm'],['Milch',1.5,'liter'],['Olivenöl extra vergine',null,null],['Nudeln',250,'gramm'],['3',null,null]]);

  // ------------------------------------------------------------------
  console.log('\n=== Zurück auf den Start ===');
  await page.click('#zurueck-btn');
  await page.waitForTimeout(300);
  check('Kachel nach allen Änderungen', await page.$$eval('#kachel-info-essen span', e => e.map(x => x.textContent)),
    ['Mittag: Chili sin Carne', 'Abend: Pasta Hackfleisch']);

  await page.click('#kachel-essen'); await page.waitForTimeout(250);
  check('Beim Zurückkommen ist kein Formular mehr offen', await page.$$eval('#meal-plan-list .essen-formular', e => e.length), 0);
  await page.click('#zurueck-btn'); await page.waitForTimeout(250);

  const ueber = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
  check('Kein horizontaler Überlauf', ueber, false);
  check('Keine JS-Fehler', errors, []);

  await page.click('#kachel-essen'); await page.waitForTimeout(250);
  await page.click(platz(4, 'abend') + ' .essen-eintrag'); await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/essen_neu_375.png', fullPage: true });

  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
