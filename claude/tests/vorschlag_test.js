const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const STUB = `
window.__calls = [];
window.__fakeData = {
  households: [{ id:'h1', name:'Test', join_code:'ABC123' }],
  household_members: [{ household_id:'h1' }],
  stores: [{ id:'s1', name:'Aldi', address:null, household_id:'h1', department_order:[], image_path:null },
           { id:'s2', name:'Rewe', address:null, household_id:'h1', department_order:[], image_path:null }],
  departments: [{ id:'d1', name:'Kühlregal', household_id:'h1' }, { id:'d2', name:'Süßwaren', household_id:'h1' }],
  profiles: [{ id:'u1', display_name:'Jan', notify_chores:true, notify_plants:true, avatar_path:null }],
  rooms: [], plants: [], plant_care_tasks: [], chores: [], push_subscriptions: [],
  // Absteigend nach created_at, so wie loadItems() sie liefert.
  shopping_items: [
    { id:'i1', name:'Mozzarella', menge:2, einheit:'packung', store_id:'s2', department_id:'d1',
      status:'gekauft', created_by:'u1', household_id:'h1', priority:'dringend' },
    { id:'i2', name:'Mozartkugeln', menge:1, einheit:'packung', store_id:'s1', department_id:'d2',
      status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i3', name:'Müsli', menge:500, einheit:'gramm', store_id:'s1', department_id:null,
      status:'offen', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i4', name:'Hafermilch', menge:1, einheit:'liter', store_id:'s1', department_id:'d1',
      status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i5', name:'Milch', menge:2, einheit:'liter', store_id:'s2', department_id:'d1',
      status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' },
    // Ältere Fassung desselben Artikels: darf NICHT zusätzlich erscheinen und
    // ihre Werte dürfen nicht gewinnen.
    { id:'i6', name:'mozzarella', menge:99, einheit:'gramm', store_id:'s1', department_id:'d2',
      status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' }
  ]
};
class FakeQuery {
  constructor(t){ this.t=t; this._single=false; this._op='select'; }
  select(){ this._op='select'; return this; } order(){ return this; } limit(){ return this; } in(){ return this; } eq(){ return this; }
  not(){ return this; } lte(){ return this; } gte() { return this; } is() { return this; } gt() { return this; }
  insert(p){ this._op='write'; window.__calls.push(p); return this; }
  update(){ this._op='write'; return this; } delete(){ this._op='write'; return this; }
  upsert(){ this._op='write'; return this; }
  maybeSingle(){ this._single=true; return this; } single(){ this._single=true; return this; }
  then(res){ let r;
    if (this._op==='write') r={error:null,data:null};
    else { const l=window.__fakeData[this.t]||[]; r=this._single?{data:l[0]||null,error:null}:{data:l,error:null}; }
    res(r); return Promise.resolve(r); }
}
window.supabase = { createClient: () => ({
  auth: { onAuthStateChange: cb => setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0),
          getUser: async()=>({data:{user:{id:'u1',email:'j@x.de'}}}), signOut: async()=>{} },
  from: t => new FakeQuery(t),
  rpc: n => Promise.resolve(n==='get_household_members'
    ? { data:[{user_id:'u1',email:'j@x.de',display_name:'Jan',avatar_path:null}], error:null }
    : { data:null, error:null }),
  channel: function(){ const c={ on:()=>c, subscribe:()=>c }; return c; },
  removeAllChannels: () => {},
  storage: { from: () => ({ upload: async()=>({data:{},error:null}),
    getPublicUrl: p=>({data:{publicUrl:'x/'+p}}), remove: async()=>({data:null,error:null}) }) }
}) };
`;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  return ok;
}
const titel = page => page.$$eval('#item-name-vorschlaege li button',
  e => e.map(x => x.childNodes[0].textContent.trim()));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  let failures = 0;
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript', body:STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1000);
  // Die App startet auf dem Startbildschirm -- über die Kachel in die Liste.
  await page.click('#kachel-liste');
  await page.waitForTimeout(200);

  await page.click('#toggle-add-link');
  await page.waitForTimeout(200);

  console.log('=== Der Fall aus der Anfrage ===');
  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(200);
  if (!check('"moz" schlägt beides vor', await titel(page), ['Mozzarella', 'Mozartkugeln'])) failures++;

  console.log('\n=== Abgrenzungen ===');
  await page.fill('#item-name', 'm');
  await page.waitForTimeout(200);
  if (!check('Ein Zeichen zeigt noch nichts', await page.isVisible('#item-name-vorschlaege'), false)) failures++;

  await page.fill('#item-name', 'MOZ');
  await page.waitForTimeout(200);
  if (!check('Großschreibung ist egal', await titel(page), ['Mozzarella', 'Mozartkugeln'])) failures++;

  await page.fill('#item-name', 'muesli');
  await page.waitForTimeout(200);
  if (!check('"muesli" findet "Müsli" (Umlaute normalisiert)', await titel(page), ['Müsli'])) failures++;

  await page.fill('#item-name', 'milch');
  await page.waitForTimeout(200);
  if (!check('Treffer am Wortanfang stehen vor Treffern in der Mitte',
    await titel(page), ['Milch', 'Hafermilch'])) failures++;

  // Bewusst SO: der exakte Treffer wird angeboten, denn der Sinn des Tippens
  // auf den Vorschlag ist, Menge, Laden und Abteilung mitzunehmen.
  await page.fill('#item-name', 'Mozzarella');
  await page.waitForTimeout(200);
  if (!check('Exakt Getipptes wird trotzdem angeboten (wegen der Werte)',
    await titel(page), ['Mozzarella'])) failures++;

  await page.fill('#item-name', 'xyz');
  await page.waitForTimeout(200);
  if (!check('Kein Treffer, keine Liste', await page.isVisible('#item-name-vorschlaege'), false)) failures++;

  console.log('\n=== Hinweis auf bereits offene Artikel ===');
  await page.fill('#item-name', 'müs');
  await page.waitForTimeout(200);
  if (!check('"steht schon auf der Liste" bei offenem Artikel',
    await page.$eval('#item-name-vorschlaege li button small', e => e.textContent.trim()),
    'Aldi · steht schon auf der Liste')) failures++;

  console.log('\n=== Übernahme der letzten Werte ===');
  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(200);
  await page.click('.karte-pille[data-wert="dringend"]');
  await page.click('#item-name-vorschlaege li:nth-child(1) button');
  await page.waitForTimeout(250);
  const felder = await page.evaluate(() => ({
    name: document.getElementById('item-name').value,
    menge: document.getElementById('item-menge').value,
    einheit: document.getElementById('item-einheit').value,
    store: document.getElementById('item-store').value,
    department: document.getElementById('item-department').value,
    prio: document.getElementById('item-priority').value
  }));
  if (!check('Name übernommen', felder.name, 'Mozzarella')) failures++;
  if (!check('Menge, Einheit, Laden und Abteilung vom letzten Mal',
    [felder.menge, felder.einheit, felder.store, felder.department], ['2', 'packung', 's2', 'd1'])) failures++;
  if (!check('Ältere Fassung desselben Artikels gewinnt nicht (99 Gramm, Aldi)',
    felder.menge !== '99' && felder.store !== 's1', true)) failures++;
  if (!check('Priorität bleibt unangetastet', felder.prio, 'dringend')) failures++;
  if (!check('Liste schließt nach der Auswahl', await page.isVisible('#item-name-vorschlaege'), false)) failures++;

  console.log('\n=== Tastatur ===');
  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  if (!check('Pfeiltasten und Enter wählen den zweiten Vorschlag',
    await page.inputValue('#item-name'), 'Mozartkugeln')) failures++;

  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (!check('Escape schließt die Liste', await page.isVisible('#item-name-vorschlaege'), false)) failures++;

  console.log('\n=== Hinzufügen danach ===');
  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(200);
  await page.click('#item-name-vorschlaege li:nth-child(1) button');
  await page.waitForTimeout(200);
  await page.click('#artikel-speichern');
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__calls);
  if (!check('Angelegt wird mit den übernommenen Werten',
    calls.length ? [calls[calls.length-1].name, calls[calls.length-1].menge,
                    calls[calls.length-1].einheit, calls[calls.length-1].store_id,
                    calls[calls.length-1].department_id] : null,
    ['Mozzarella', 2, 'packung', 's2', 'd1'])) failures++;
  if (!check('Vorschlagsliste ist danach zu', await page.isVisible('#item-name-vorschlaege'), false)) failures++;

  const ueber = await page.evaluate(() => ({ s: document.body.scrollWidth, c: document.body.clientWidth }));
  if (!check('Kein horizontaler Überlauf', ueber.s <= ueber.c, true)) failures++;

  // "Speichern" schließt die Karte (artikel.js) -- für das Bild wieder öffnen
  if (!check('Speichern führt zurück zur Einkaufsliste', await page.isVisible('#tab-liste'), true)) failures++;
  await page.click('#toggle-add-link');
  await page.waitForTimeout(200);
  await page.fill('#item-name', 'moz');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/vorschlag_mobil.png' });

  console.log('\nJS-Fehler:', errors.length ? errors : 'keine');
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
