const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

// Termine relativ zu heute, damit der Test nicht irgendwann von selbst kippt.
const STUB = `
function tag(n) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function zeit(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12,0,0,0);
  return d.toISOString();
}

window.__fakeData = {
  households: [{ id:'h1', name:'Test', join_code:'ABC123' }],
  household_members: [{ household_id:'h1' }],
  stores: [], departments: [], shopping_items: [], push_subscriptions: [],
  profiles: [{ id:'u1', display_name:'Jan', notify_chores:true, notify_plants:true, avatar_path:null }],
  rooms: [{ id:'r1', name:'Balkon', household_id:'h1' }],
  plants: [
    { id:'p1', name:'Basilikum', species:null, room_id:'r1', household_id:'h1', created_by:'u1', notes:null, image_path:null },
    { id:'p2', name:'Monstera', species:null, room_id:null, household_id:'h1', created_by:'u1', notes:null, image_path:null },
    { id:'p3', name:'Efeu', species:null, room_id:null, household_id:'h1', created_by:'u1', notes:null, image_path:null }
  ],
  chores: [
    { id:'c1', title:'Mittlere Aufgabe', due_date:tag(3), assigned_to:'u1', status:'offen', created_by:'u1',
      household_id:'h1', room_id:null, recurrence_interval_value:null, recurrence_interval_unit:null,
      completed_at:null, completed_by:null, priority:'normal' }
  ],
  plant_care_tasks: [
    // 1) Gießen alle 3 Tage -> Vorlauf 1 Tag; fällig morgen => SICHTBAR
    { id:'t1', plant_id:'p1', household_id:'h1', type:'giessen', status:'offen', due_date:tag(1), assigned_to:'u1',
      recurrence_interval_value:3, recurrence_interval_unit:'tag', completed_at:null, completed_by:null },
    // 2) Gießen alle 3 Tage; fällig in 2 Tagen => NICHT sichtbar
    { id:'t2', plant_id:'p2', household_id:'h1', type:'giessen', status:'offen', due_date:tag(2), assigned_to:'u1',
      recurrence_interval_value:3, recurrence_interval_unit:'tag', completed_at:null, completed_by:null },
    // 3) Düngen alle 1 Monat -> Vorlauf gedeckelt auf 7; fällig in 7 Tagen => SICHTBAR
    { id:'t3', plant_id:'p1', household_id:'h1', type:'duengen', status:'offen', due_date:tag(7), assigned_to:'u1',
      recurrence_interval_value:1, recurrence_interval_unit:'monat', completed_at:null, completed_by:null },
    // 4) Umtopfen alle 2 Jahre; fällig in 30 Tagen => NICHT sichtbar
    { id:'t4', plant_id:'p1', household_id:'h1', type:'umtopfen', status:'offen', due_date:tag(30), assigned_to:'u1',
      recurrence_interval_value:2, recurrence_interval_unit:'jahr', completed_at:null, completed_by:null },
    // 5) überfällig => SICHTBAR und markiert
    { id:'t5', plant_id:'p2', household_id:'h1', type:'duengen', status:'offen', due_date:tag(-2), assigned_to:'u1',
      recurrence_interval_value:2, recurrence_interval_unit:'woche', completed_at:null, completed_by:null },
    // 6) heute erledigt => SICHTBAR am Ende
    { id:'t6', plant_id:'p2', household_id:'h1', type:'umtopfen', status:'erledigt', due_date:tag(20), assigned_to:'u1',
      recurrence_interval_value:1, recurrence_interval_unit:'jahr', completed_at:zeit(0), completed_by:'u2' },
    // 7) gestern erledigt => NICHT sichtbar
    { id:'t7', plant_id:'p1', household_id:'h1', type:'giessen', status:'erledigt', due_date:tag(5), assigned_to:'u1',
      recurrence_interval_value:1, recurrence_interval_unit:'woche', completed_at:zeit(-1), completed_by:'u2' },
    // 8) fällig morgen, aber jemand anderem zugewiesen => in "Alle" sichtbar,
    //    unter "Meine" ausgeblendet. Eigene Pflanze, weil je Pflanze nur eine
    //    Pflege-Art erlaubt ist (UNIQUE plant_id, type).
    { id:'t8', plant_id:'p3', household_id:'h1', type:'duengen', status:'offen', due_date:tag(1), assigned_to:'u2',
      recurrence_interval_value:3, recurrence_interval_unit:'tag', completed_at:null, completed_by:null }
  ]
};

class FakeQuery {
  constructor(t){ this.t=t; this._single=false; this._op='select'; }
  select(){ this._op='select'; return this; } order(){ return this; } limit(){ return this; } in(){ return this; } eq(){ return this; }
  not(){ return this; } lte(){ return this; } gte() { return this; } is() { return this; } gt() { return this; }
  insert(){ this._op='write'; return this; } update(){ this._op='write'; return this; }
  delete(){ this._op='write'; return this; } upsert(){ this._op='write'; return this; }
  maybeSingle(){ this._single=true; return this; } single(){ this._single=true; return this; }
  then(res){
    let r;
    if (this._op==='write') r={ error:null, data:null };
    else { const l=window.__fakeData[this.t]||[]; r=this._single?{data:l[0]||null,error:null}:{data:l,error:null}; }
    res(r); return Promise.resolve(r);
  }
}
window.supabase = { createClient: () => ({
  auth: {
    onAuthStateChange: cb => setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'j@x.de'}}),0),
    getUser: async () => ({ data:{ user:{ id:'u1', email:'j@x.de' } } }),
    signOut: async () => {}
  },
  from: t => new FakeQuery(t),
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

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok?'OK  ':'FAIL'}  ${label}` + (ok?'':`\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  return ok;
}

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
  await page.waitForTimeout(1200);

  // --- Vorlauf-Rechnung isoliert ---
  console.log('=== Vorlauf in Tagen ===');
  const vorlauf = await page.evaluate(() => ({
    giessen3tage:  pflegeVorlaufTage(3, 'tag'),
    giessen1woche: pflegeVorlaufTage(1, 'woche'),
    duengen4wochen:pflegeVorlaufTage(4, 'woche'),
    duengen1monat: pflegeVorlaufTage(1, 'monat'),
    umtopfen2jahre:pflegeVorlaufTage(2, 'jahr'),
    ohneIntervall: pflegeVorlaufTage(null, null)
  }));
  if (!check('Gießen alle 3 Tage -> 1 Tag Vorlauf', vorlauf.giessen3tage, 1)) failures++;
  if (!check('Gießen wöchentlich -> 2 Tage', vorlauf.giessen1woche, 2)) failures++;
  if (!check('Düngen alle 4 Wochen -> 7 Tage', vorlauf.duengen4wochen, 7)) failures++;
  if (!check('Düngen monatlich -> gedeckelt auf 7', vorlauf.duengen1monat, 7)) failures++;
  if (!check('Umtopfen alle 2 Jahre -> gedeckelt auf 7', vorlauf.umtopfen2jahre, 7)) failures++;
  if (!check('Ohne Intervall -> Mindestvorlauf 1', vorlauf.ohneIntervall, 1)) failures++;

  // --- Aufgabenliste ---
  console.log('\n=== Aufgabenliste ===');
  await page.evaluate(() => showTab('aufgaben'));
  await page.waitForTimeout(300);

  const zeilen = await page.$$eval('#chore-list li', els => els.map(e => ({
    text: e.querySelector('.item-name').textContent.replace(/\s+/g,' ').trim(),
    pflege: e.classList.contains('pflege-eintrag'),
    overdue: e.classList.contains('chore-overdue')
  })));

  const titel = zeilen.map(z => z.text.split(' – ')[0]);
  if (!check('Reihenfolge: überfällige Pflege, dann Aufgabe nach Datum, heute Erledigtes zuletzt',
    titel, ['Monstera düngen', 'Efeu düngen', 'Mittlere Aufgabe', 'Basilikum düngen', 'Monstera umtopfen'])) failures++;
  // Gießen ist Routine und steht auf der Pflanzen-Kachel des Startbildschirms.
  if (!check('Gießen steht nicht in der Aufgabenliste', titel.filter(t => t.endsWith('gießen')), [])) failures++;

  if (!check('Nicht fällige Pflege bleibt draußen (Monstera gießen in 2 Tagen, Umtopfen in 30 Tagen)',
    titel.filter(t => t === 'Monstera gießen' || t === 'Basilikum umtopfen').length, 0)) failures++;
  if (!check('Gestern Erledigtes bleibt draußen',
    zeilen.filter(z => z.text.includes('Basilikum gießen – erledigt')).length, 0)) failures++;
  if (!check('Überfällige Pflege ist markiert',
    zeilen.filter(z => z.overdue).map(z => z.text.split(' – ')[0]), ['Monstera düngen'])) failures++;
  if (!check('Heute Erledigtes zeigt "erledigt am … von …"',
    /Monstera umtopfen – erledigt am \d{2}\.\d{2}\.\d{4} von Partnerin/.test(zeilen[zeilen.length-1].text), true)) failures++;
  if (!check('Zimmer der Pflanze wird mit angezeigt',
    zeilen.find(z => z.text.startsWith('Basilikum düngen')).text.includes('Balkon'), true)) failures++;
  if (!check('Pflege-Zeilen sind als solche erkennbar',
    zeilen.filter(z => z.pflege).length, 4)) failures++;
  if (!check('Pflege-Zeilen tragen den Hinweis "Pflanzenpflege"',
    zeilen.filter(z => z.pflege).every(z => z.text.includes('Pflanzenpflege')), true)) failures++;
  if (!check('Echte Aufgabe ist keine Pflege-Zeile',
    zeilen.find(z => z.text.startsWith('Mittlere Aufgabe')).pflege, false)) failures++;
  if (!check('Kein Löschen-Knopf an Pflege-Zeilen',
    await page.$$eval('#chore-list li.pflege-eintrag button', e => e.length), 0)) failures++;

  // --- Filter "Meine Aufgaben" ---
  console.log('\n=== Filter "Meine Aufgaben" ===');
  await page.click('#chore-filter-meine');
  await page.waitForTimeout(250);
  const meineTitel = await page.$$eval('#chore-list li .item-name',
    e => e.map(x => x.textContent.replace(/\s+/g,' ').trim().split(' – ')[0]));
  if (!check('Fremd zugewiesene Pflege ist ausgeblendet',
    meineTitel.includes('Efeu düngen'), false)) failures++;
  if (!check('Eigene Pflege bleibt sichtbar', meineTitel.includes('Basilikum düngen'), true)) failures++;
  await page.click('#chore-filter-alle');
  await page.waitForTimeout(250);

  // --- Sprung zur Pflanze ---
  console.log('\n=== Klick springt zur Pflanze ===');
  await page.click('#chore-list li.pflege-eintrag .item-name');
  await page.waitForTimeout(400);
  if (!check('Pflanzen-Bereich ist offen', await page.isVisible('#tab-pflanzen'), true)) failures++;
  if (!check('Aufgaben-Bereich ist zu', await page.isVisible('#tab-aufgaben'), false)) failures++;
  if (!check('Pflanzenkarte trägt eine Sprungmarke',
    await page.$$eval('li.plant-card[id^=plant-]', e => e.length), 3)) failures++;

  // --- Abhaken aus der Aufgabenliste heraus ---
  console.log('\n=== Abhaken ===');
  await page.evaluate(() => showTab('aufgaben'));
  await page.waitForTimeout(250);
  const vorher = await page.$$eval('#chore-list li', e => e.length);
  await page.evaluate(() => {
    // Schreibvorgang wirkt in der Attrappe nicht; hier zählt nur, dass das
    // Abhaken ohne Fehler durchläuft und die Liste neu aufgebaut wird.
    document.querySelector('#chore-list li.pflege-eintrag input[type=checkbox]').click();
  });
  await page.waitForTimeout(400);
  if (!check('Liste bleibt nach dem Abhaken intakt',
    await page.$$eval('#chore-list li', e => e.length), vorher)) failures++;

  const ueber = await page.evaluate(() => ({ s: document.body.scrollWidth, c: document.body.clientWidth }));
  if (!check('Kein horizontaler Überlauf', ueber.s <= ueber.c, true)) failures++;

  await page.screenshot({ path: '/tmp/pflege_mobil.png', fullPage: true });
  console.log('\nJS-Fehler:', errors.length ? errors : 'keine');
  if (errors.length) failures++;
  console.log(`\n>>> ${failures === 0 ? 'ALLE TESTS BESTANDEN' : failures + ' FEHLGESCHLAGEN'}`);
  await browser.close();
})();
