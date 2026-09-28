const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const STUB = `
window.__calls = [];
function tag(n) {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function zeit(n) { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(12,0,0,0); return d.toISOString(); }
window.__verzoegerung = window.__verzoegerung || 0;
const giessen = (id, pid) => ({ id, plant_id: pid, household_id:'h1', type:'giessen', status:'offen', due_date: tag(-6),
  assigned_to:'u1', recurrence_interval_value:3, recurrence_interval_unit:'tag', completed_at:null, completed_by:null });
window.__fakeData = {
  households: [{ id:'h1', name:'Test', join_code:'ABC123' }],
  household_members: [{ household_id:'h1' }],
  stores: [{ id:'s1', name:'Aldi', address:null, household_id:'h1', department_order:[], image_path:null },
           { id:'s2', name:'Rewe', address:null, household_id:'h1', department_order:[], image_path:null }],
  departments: [], rooms: [], push_subscriptions: [],
  profiles: [{ id:'u1', display_name:'Jan', notify_chores:true, notify_plants:true, avatar_path:null }],
  shopping_items: [
    { id:'i1', name:'Äpfel', menge:6, einheit:'stueck', store_id:'s1', department_id:null, status:'offen', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i2', name:'Mozzarella', menge:2, einheit:'packung', store_id:'s2', department_id:null, status:'offen', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i3', name:'Brot', menge:1, einheit:'stueck', store_id:null, department_id:null, status:'offen', created_by:'u1', household_id:'h1', priority:'normal' },
    { id:'i4', name:'Milch', menge:1, einheit:'liter', store_id:'s1', department_id:null, status:'gekauft', created_by:'u1', household_id:'h1', priority:'normal' }
  ],
  chores: [
    { id:'c1', title:'Bad putzen', due_date: tag(3), assigned_to:'u1', status:'offen', created_by:'u1', household_id:'h1', room_id:null,
      recurrence_interval_value:null, recurrence_interval_unit:null, completed_at:null, completed_by:null, priority:'normal' },
    { id:'c2', title:'Müll rausbringen', due_date: tag(0), assigned_to:'u1', status:'offen', created_by:'u1', household_id:'h1', room_id:null,
      recurrence_interval_value:1, recurrence_interval_unit:'woche', completed_at:null, completed_by:null, priority:'normal' },
    { id:'c3', title:'Fenster', due_date: tag(-3), assigned_to:'u1', status:'erledigt', created_by:'u1', household_id:'h1', room_id:null,
      recurrence_interval_value:null, recurrence_interval_unit:null, completed_at: zeit(-1), completed_by:'u1', priority:'normal' }
  ],
  plants: [
    { id:'p1', name:'Pfennigkraut', household_id:'h1', room_id:null, species:null, notes:null, image_path:null, created_by:'u1' },
    { id:'p2', name:'Chrysantheme', household_id:'h1', room_id:null, species:null, notes:null, image_path:null, created_by:'u1' },
    { id:'p3', name:'Purpurglöckchen', household_id:'h1', room_id:null, species:null, notes:null, image_path:null, created_by:'u1' },
    { id:'p4', name:'Hedera', household_id:'h1', room_id:null, species:null, notes:null, image_path:null, created_by:'u1' },
    { id:'p5', name:'Trifolium', household_id:'h1', room_id:null, species:null, notes:null, image_path:null, created_by:'u1' }
  ],
  plant_care_tasks: [
    giessen('t1','p1'), giessen('t2','p2'), giessen('t3','p3'), giessen('t4','p4'), giessen('t5','p5'),
    { id:'t6', plant_id:'p1', household_id:'h1', type:'duengen', status:'offen', due_date: tag(0), assigned_to:'u1',
      recurrence_interval_value:1, recurrence_interval_unit:'monat', completed_at:null, completed_by:null }
  ],
  meal_plan: [
    { id:'m1', household_id:'h1', datum: tag(0), mahlzeit:'abend',  text:'Linsensuppe', fuer:null, rest_von:null, created_by:'u1' },
    // Mittag nur für die andere Person -- darf auf Jans Kachel nicht auftauchen
    { id:'m2', household_id:'h1', datum: tag(0), mahlzeit:'mittag', text:'Salat im Büro', fuer:'u2', rest_von:null, created_by:'u1' }
  ]
};
class FakeQuery {
  constructor(t){ this.t=t; this._single=false; this._op='select'; }
  select(){ this._op='select'; return this; } order(){ return this; } limit(){ return this; } in(){ return this; } eq(a,b){ this._eq=[a,b]; return this; }
  not(){ return this; } lte(){ return this; } gte(){ return this; } is() { return this; } gt(){ return this; }
  insert(p){ this._op='write'; const l = window.__fakeData[this.t]; (Array.isArray(p)?p:[p]).forEach((x,i)=>l.unshift(Object.assign({id:'neu'+Date.now()+i, status:'offen'}, x))); return this; }
  update(){ this._op='write'; return this; } delete(){ this._op='write'; return this; }
  upsert(){ this._op='write'; return this; }
  maybeSingle(){ this._single=true; return this; } single(){ this._single=true; return this; }
  then(res){
    const fertig = () => { let r;
      if (this._op==='write') r={error:null,data:null};
      else { const l=window.__fakeData[this.t]||[]; r=this._single?{data:l[0]||null,error:null}:{data:l.slice(),error:null}; }
      res(r); };
    if (window.__verzoegerung && this._op==='select') setTimeout(fertig, window.__verzoegerung); else fertig();
  }
}
window.supabase = { createClient: () => ({
  auth: { onAuthStateChange: cb => { window.__authCb = cb; setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0); },
          getUser: async()=>({data:{user:{id:'u1',email:'j@x.de'}}}), signOut: async()=>{} },
  from: t => new FakeQuery(t),
  rpc: n => Promise.resolve(n==='get_household_members'
    ? { data:[{user_id:'u1',email:'j@x.de',display_name:'Jan',avatar_path:null}], error:null } : { data:null, error:null }),
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
const sichtbar = p => p.evaluate(() => ['start-view','bereich-kopf','tab-liste','tab-aufgaben','tab-pflanzen','tab-essen','tab-einstellungen']
  .filter(id => getComputedStyle(document.getElementById(id)).display !== 'none'));
const kachel = (p, id) => p.evaluate(id => ({
  zahl: getComputedStyle(document.getElementById('kachel-zahl-'+id)).display === 'none' ? null : document.getElementById('kachel-zahl-'+id).textContent,
  rot: document.getElementById('kachel-zahl-'+id).classList.contains('warnung'),
  info: [...document.getElementById('kachel-info-'+id).children].map(z => z.textContent).join('\n')
}), id);

async function neueSeite(browser, opts = {}) {
  const page = await browser.newPage({ viewport: { width: opts.breite || 375, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('SEITENFEHLER: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/ServiceWorker|ERR_/.test(m.text())) errors.push('KONSOLE: '+m.text()); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status:200, contentType:'application/javascript',
      body: (opts.verzoegerung ? `window.__verzoegerung=${opts.verzoegerung};` : '') + STUB }));
  await page.goto('file://' + path.resolve((opts.dir || '/tmp/nest-test') + '/index.html'));
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ------------------------------------------------------------------
  console.log('=== Beim Öffnen ===');
  const { page, errors } = await neueSeite(browser);
  await page.waitForTimeout(1200);
  check('App öffnet auf dem Startbildschirm', await sichtbar(page), ['start-view']);
  check('Titel "Nest" ist in der App ausgeblendet', await page.isVisible('body > h1'), false);
  check('Datum steht oben', (await page.textContent('#start-datum')).length > 5, true);

  const lage = await page.evaluate(() => ['liste','aufgaben','essen','pflanzen'].map(id => {
    const r = document.getElementById('kachel-'+id).getBoundingClientRect(); return [id, Math.round(r.left), Math.round(r.top)]; }));
  const [li, au, es, pf] = lage;
  check('Einkaufen oben links, Aufgaben oben rechts',
    li[2] === au[2] && li[1] < au[1], true);
  check('Essensplan unten links, Pflanzen unten rechts',
    es[2] === pf[2] && es[1] < pf[1] && es[2] > li[2] && es[1] === li[1], true);

  console.log('\n=== Inhalte der Kacheln ===');
  check('Einkaufen', await kachel(page,'liste'), { zahl:'3', rot:false, info:'3 offen · Aldi, Rewe' });
  // Seit Block 2 zählt die Kachel nur, was ansteht: "Bad putzen" (einmalig,
  // in 3 Tagen) liegt ausserhalb des Vorlaufs von 1 Tag.
  check('Aufgaben', await kachel(page,'aufgaben'), { zahl:'1', rot:false, info:'Nächste: Müll rausbringen (heute)' });
  check('Essensplan: nur Gemeinsames und Eigenes, nicht der Salat der anderen', await kachel(page,'essen'),
    { zahl:null, rot:false, info: 'Abend: Linsensuppe' });
  check('Pflanzen gebündelt, rot wegen überfällig', await kachel(page,'pflanzen'),
    { zahl:'6', rot:true, info:'5× gießen\n1× düngen' });

  // Die übrigen Formen der Pflanzen-Kachel, ohne neue Seite: Daten tauschen,
  // neu zeichnen, danach den Originalzustand zurück.
  const varianten = await page.evaluate(() => {
    const original = allCareTasks;
    const heute = datumStr(new Date());
    const gestern = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return datumStr(d); })();
    const t = (id, pid, type, due) => ({ id, plant_id: pid, type, status: 'offen', due_date: due });
    const lesen = () => [...document.getElementById('kachel-info-pflanzen').children].map(z => z.textContent).join('\n');
    const ergebnis = {};
    allCareTasks = [t('a','p1','giessen',gestern), t('b','p2','giessen',gestern)];
    renderStart(); ergebnis.eineArt = lesen();
    allCareTasks = [t('a','p1','giessen',heute)];
    renderStart(); ergebnis.eineAufgabe = lesen();
    allCareTasks = [];
    renderStart(); ergebnis.nichts = lesen();
    allCareTasks = original; renderStart();
    return ergebnis;
  });
  check('Eine Pflegeart: Zustand in Zeile zwei', varianten.eineArt, '2× gießen\nüberfällig');
  check('Eine einzelne Pflege: Pflanze beim Namen', varianten.eineAufgabe, 'Pfennigkraut gießen\nheute');
  check('Nichts fällig', varianten.nichts, 'Alles versorgt');

  console.log('\n=== In einen Bereich und zurück ===');
  await page.click('#kachel-liste'); await page.waitForTimeout(200);
  check('Kachel öffnet den Bereich', await sichtbar(page), ['bereich-kopf','tab-liste']);
  check('Titel im Bereich', await page.textContent('#bereich-titel'), 'Einkaufen');
  await page.click('#zurueck-btn'); await page.waitForTimeout(250);
  check('‹ führt zum Start', await sichtbar(page), ['start-view']);

  await page.click('#kachel-pflanzen'); await page.waitForTimeout(200);
  await page.goBack(); await page.waitForTimeout(250);
  check('Zurück-Taste des Handys führt vom Bereich zum Start', await sichtbar(page), ['start-view']);

  console.log('\n=== Zahnrad mit Kontext ===');
  const gruppen = () => page.evaluate(() => [...document.querySelectorAll('#tab-einstellungen .settings-group')]
    .map(g => g.dataset.gruppe + (g.open ? ':offen' : '') + (g.classList.contains('settings-group-markiert') ? ':markiert' : '')));
  const erwartet = {
    start:    ['konto:offen', 'haushalt', 'einkaufsliste', 'zimmer'],
    liste:    ['konto', 'haushalt', 'einkaufsliste:offen:markiert', 'zimmer'],
    aufgaben: ['konto', 'haushalt', 'einkaufsliste', 'zimmer:offen:markiert'],
    pflanzen: ['konto', 'haushalt', 'einkaufsliste', 'zimmer:offen:markiert'],
    essen:    ['konto:offen', 'haushalt', 'einkaufsliste', 'zimmer']
  };
  await page.click('#settings-btn-start'); await page.waitForTimeout(200);
  check('Vom Start: "Mein Konto" offen, nichts markiert', await gruppen(), erwartet.start);
  await page.click('.settings-close'); await page.waitForTimeout(250);
  check('Schließen führt zurück zum Start', await sichtbar(page), ['start-view']);

  for (const b of ['liste','aufgaben','pflanzen','essen']) {
    await page.click('#kachel-' + b); await page.waitForTimeout(150);
    await page.click('#settings-btn'); await page.waitForTimeout(200);
    check(`Aus "${b}": passende Gruppe`, await gruppen(), erwartet[b]);
    await page.click('.settings-close'); await page.waitForTimeout(250);
    check(`Aus "${b}": Schließen führt zurück in den Bereich`, await sichtbar(page), ['bereich-kopf','tab-'+b]);
    await page.goBack(); await page.waitForTimeout(250);
    check(`Aus "${b}": danach Zurück-Taste zum Start`, await sichtbar(page), ['start-view']);
  }

  await page.click('#kachel-aufgaben'); await page.waitForTimeout(150);
  await page.click('#settings-btn'); await page.waitForTimeout(200);
  await page.goBack(); await page.waitForTimeout(250);
  check('Zurück-Taste aus den Einstellungen führt in den Bereich', await sichtbar(page), ['bereich-kopf','tab-aufgaben']);

  console.log('\n=== Stündlicher Token-Refresh ===');
  await page.evaluate(() => window.__authCb('TOKEN_REFRESHED', { user: { id:'u1', email:'j@x.de' } }));
  await page.waitForTimeout(500);
  check('Bleibt im Bereich, fliegt nicht zum Start', await sichtbar(page), ['bereich-kopf','tab-aufgaben']);
  await page.click('#zurueck-btn'); await page.waitForTimeout(250);

  console.log('\n=== Kacheln ziehen live nach ===');
  // Über den echten Weg in liste.js: addItem() ruft intern loadItems() auf.
  // Das beweist, dass die Hülle aus start.js auch Aufrufe innerhalb der
  // anderen Dateien erreicht.
  await page.evaluate(() => { showTab('liste'); });
  await page.waitForTimeout(150);
  await page.click('#toggle-add-link'); await page.waitForTimeout(100);
  await page.fill('#item-name', 'Klopapier');
  await page.selectOption('#item-priority', 'dringend');
  await page.click('#add-form > button:not(.link-knopf)');
  await page.waitForTimeout(400);
  await page.click('#zurueck-btn'); await page.waitForTimeout(250);
  check('Neuer dringender Artikel erscheint sofort auf der Kachel', await kachel(page,'liste'),
    { zahl:'4', rot:true, info:'4 offen · 1 dringend' });

  console.log('\n=== Essensplan-Kachel nach dem Blättern ===');
  await page.click('#kachel-essen'); await page.waitForTimeout(200);
  await page.click('.woche-kopf button:nth-child(3)'); await page.waitForTimeout(200);
  await page.click('#zurueck-btn'); await page.waitForTimeout(400);
  check('Nach dem Blättern zeigt die Kachel trotzdem heute',
    (await kachel(page,'essen')).info, 'Abend: Linsensuppe');
  await page.click('#kachel-essen'); await page.waitForTimeout(200);
  check('Essensplan steht wieder auf der laufenden Woche',
    (await page.textContent('#woche-label')).startsWith('Diese Woche'), true);
  await page.click('#zurueck-btn'); await page.waitForTimeout(200);

  console.log('\n=== Gießen nicht mehr in den Aufgaben ===');
  await page.evaluate(() => { showTab('aufgaben'); }); await page.waitForTimeout(200);
  const aufgabenTexte = await page.$$eval('#chore-list li .item-name', e => e.map(x => x.textContent.replace(/\s+/g,' ').trim()));
  check('Keine Gieß-Zeile in der Aufgabenliste', aufgabenTexte.some(t => t.includes('gießen')), false);
  check('Düngen steht weiterhin drin', aufgabenTexte.some(t => t.startsWith('Pfennigkraut düngen')), true);

  check('Keine JS-Fehler im Durchlauf', errors, []);
  await page.close();

  // ------------------------------------------------------------------
  console.log('\n=== Kein falscher Zwischenstand beim Laden ===');
  const langsam = await neueSeite(browser, { verzoegerung: 900 });
  await langsam.page.waitForTimeout(350);
  check('Solange nichts geladen ist, stehen die Kacheln leer statt "Alles eingekauft"',
    await langsam.page.evaluate(() => ['liste','aufgaben','essen','pflanzen'].map(id => document.getElementById('kachel-info-'+id).textContent)),
    ['', '', '', '']);
  await langsam.page.waitForTimeout(4500);
  check('Danach sind sie gefüllt', (await kachel(langsam.page,'liste')).info, '3 offen · Aldi, Rewe');
  await langsam.page.close();

  // ------------------------------------------------------------------
  console.log('\n=== start.js fehlt ===');
  const fs = require('fs');
  fs.rmSync('/tmp/nest-ohne-start', { recursive: true, force: true });
  fs.cpSync('/tmp/nest-test', '/tmp/nest-ohne-start', { recursive: true });
  fs.renameSync('/tmp/nest-ohne-start/js/start.js', '/tmp/nest-ohne-start/js/start');
  const ohne = await neueSeite(browser, { dir: '/tmp/nest-ohne-start' });
  await ohne.page.waitForTimeout(1200);
  check('Startbildschirm erscheint trotzdem', await sichtbar(ohne.page), ['start-view']);
  check('Kacheln nur ohne Zahlen', (await kachel(ohne.page,'liste')).zahl, null);
  await ohne.page.click('#kachel-liste'); await ohne.page.waitForTimeout(200);
  check('Bereiche funktionieren weiter', await ohne.page.$$eval('#item-list-offen li', e => e.length) > 0, true);
  check('Keine Seitenfehler', ohne.errors.filter(e => e.startsWith('SEITENFEHLER')), []);
  await ohne.page.close();

  // ------------------------------------------------------------------
  console.log('\n=== Breiten ===');
  for (const breite of [320, 375, 414]) {
    const s = await neueSeite(browser, { breite });
    await s.page.waitForTimeout(1000);
    const m = await s.page.evaluate(() => ({
      ueber: document.body.scrollWidth > document.body.clientWidth,
      abgeschnitten: [...document.querySelectorAll('.kachel-name')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
      hoehe: Math.round(document.getElementById('kachel-liste').getBoundingClientRect().height)
    }));
    check(`${breite}px: kein Überlauf, Namen vollständig, Kacheln hoch genug`,
      [m.ueber, m.abgeschnitten, m.hoehe >= 170], [false, [], true]);
    if (breite === 375) {
      await s.page.screenshot({ path: '/tmp/start_375.png' });
      await s.page.click('#kachel-liste'); await s.page.waitForTimeout(200);
      await s.page.screenshot({ path: '/tmp/bereich_375.png' });
      await s.page.click('#settings-btn'); await s.page.waitForTimeout(200);
      await s.page.screenshot({ path: '/tmp/einst_375.png' });
    }
    await s.page.close();
  }

  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
