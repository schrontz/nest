const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const STUB_SUPABASE_JS = `
// Termine relativ zum heutigen Tag. Feste Datumsangaben haben diese Attrappe
// ueber Nacht kippen lassen: aus "in zwei Tagen faellig" wurde ueberfaellig,
// ohne dass sich eine Zeile Code geaendert hatte.
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
  households: [{ id: 'h1', name: 'Testhaushalt', join_code: 'ABC123' }],
  household_members: [{ household_id: 'h1' }],
  stores: [{ id: 's1', name: 'Aldi', address: null, household_id: 'h1', department_order: [], image_path: 'households/h1/stores/logo.jpg' }],
  departments: [{ id: 'd1', name: 'Kühlregal', household_id: 'h1' }],
  chores: [
    { id: 'c1', title: 'Müll rausbringen', due_date: tag(-7), assigned_to: 'u1', status: 'offen', created_by: 'u1', household_id: 'h1', room_id: 'r1', recurrence_interval_value: 1, recurrence_interval_unit: 'woche', completed_at: null, completed_by: null, priority: 'normal' },
    { id: 'c2', title: 'Fenster putzen', due_date: tag(2), assigned_to: 'u2', status: 'offen', created_by: 'u1', household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null, completed_at: null, completed_by: null, priority: 'normal' },
    { id: 'c3', title: 'Pakete abholen', due_date: tag(-20), assigned_to: 'u1', status: 'erledigt', created_by: 'u1', household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null, completed_at: zeit(-5), completed_by: 'u2', priority: 'dringend' },
    { id: 'c4', title: 'Rechnung zahlen', due_date: tag(2), assigned_to: 'u1', status: 'offen', created_by: 'u1', household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null, completed_at: null, completed_by: null, priority: 'dringend' },
    { id: 'c5', title: 'Keller aufräumen', due_date: null, assigned_to: 'u1', status: 'offen', created_by: 'u1', household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null, completed_at: null, completed_by: null, priority: 'wichtig' },
    { id: 'c6', title: 'Fotos sortieren', due_date: null, assigned_to: 'u1', status: 'offen', created_by: 'u1', household_id: 'h1', room_id: null, recurrence_interval_value: null, recurrence_interval_unit: null, completed_at: null, completed_by: null, priority: 'normal' }
  ],
  profiles: [{ id: 'u1', display_name: 'Jan', notify_chores: true, notify_plants: true, avatar_path: 'profiles/u1/xyz.jpg' }],
  push_subscriptions: [],
  rooms: [{ id: 'r1', name: 'Wohnzimmer', household_id: 'h1' }],
  plants: [{ id: 'p1', name: 'Basilikum', species: 'Ocimum basilicum', room_id: 'r1', household_id: 'h1', created_by: 'u1', notes: 'Alle 3 Tage giessen.\\nNicht in die pralle Sonne.', image_path: 'households/h1/plants/abc.jpg' }],
  plant_care_tasks: [
    { id: 't1', plant_id: 'p1', household_id: 'h1', type: 'giessen', status: 'offen', due_date: tag(-7), assigned_to: 'u1', recurrence_interval_value: 1, recurrence_interval_unit: 'woche', completed_at: null, completed_by: null, priority: 'normal' },
    { id: 't2', plant_id: 'p1', household_id: 'h1', type: 'duengen', status: 'erledigt', due_date: tag(-7), assigned_to: 'u1', recurrence_interval_value: 1, recurrence_interval_unit: 'monat', completed_at: zeit(-4), completed_by: 'u2' }
  ],
  shopping_items: [
    { id: 'i1', name: 'Äpfel', menge: 2, einheit: 'stueck', store_id: 's1', department_id: 'd1', status: 'offen', created_by: 'u1', household_id: 'h1', priority: 'normal' },
    { id: 'i2', name: 'Klopapier', menge: 1, einheit: 'packung', store_id: 's1', department_id: 'd1', status: 'offen', created_by: 'u1', household_id: 'h1', priority: 'dringend' }
  ]
};

class FakeQuery {
  constructor(table) { this.table = table; this._single = false; this._op = 'select'; }
  select() { this._op = 'select'; return this; }
  order() { return this; } limit() { return this; } in() { return this; } is() { return this; }
  eq() { return this; }
  not() { return this; }
  lte() { return this; } gte() { return this; } is() { return this; } gt() { return this; }
  insert() { this._op = 'write'; return this; }
  update() { this._op = 'write'; return this; }
  delete() { this._op = 'write'; return this; }
  upsert() { this._op = 'write'; return this; }
  maybeSingle() { this._single = true; return this; }
  single() { this._single = true; return this; }
  then(resolve) {
    let result;
    if (this._op === 'write') {
      result = { error: null, data: null };
    } else {
      const list = window.__fakeData[this.table] || [];
      result = this._single ? { data: list[0] || null, error: null } : { data: list, error: null };
    }
    resolve(result);
    return Promise.resolve(result);
  }
}

window.supabase = {
  createClient: function () {
    return {
      auth: {
        onAuthStateChange: function (cb) {
          setTimeout(function () { cb('SIGNED_IN', { user: { id: 'u1', email: 'jan@example.com' } }); }, 0);
        },
        getUser: async function () { return { data: { user: { id: 'u1', email: 'jan@example.com' } } }; },
        signOut: async function () {},
      },
      from: function (table) { return new FakeQuery(table); },
      rpc: function (name) {
        if (name === 'get_household_members') {
          return Promise.resolve({ data: [
            { user_id: 'u1', email: 'jan@example.com', display_name: 'Jan', avatar_path: 'profiles/u1/xyz.jpg' },
            { user_id: 'u2', email: 'partner@example.com', display_name: null, avatar_path: null }
          ], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      channel: function () {
        const chan = { on: function () { return chan; }, subscribe: function () { return chan; } };
        return chan;
      },
      storage: {
        from: function (bucket) {
          return {
            upload: async function (pfad, blob, opts) {
              window.__uploads = window.__uploads || [];
              window.__uploads.push({ bucket, pfad, groesse: blob.size, typ: blob.type, opts });
              return { data: { path: pfad }, error: null };
            },
            getPublicUrl: function (pfad) {
              return { data: { publicUrl: 'https://beispiel.test/storage/' + bucket + '/' + pfad } };
            },
            remove: async function (pfade) {
              window.__geloescht = (window.__geloescht || []).concat(pfade);
              return { data: null, error: null };
            }
          };
        }
      }
    };
  }
};
`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGE ERROR: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text());
  });

  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', (route) => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_SUPABASE_JS });
  });

  const filePath = 'file://' + path.resolve('/tmp/nest-test/index.html');
  await page.goto(filePath);
  await page.waitForTimeout(1500);

  // Switch to Pflanzen tab
  // Check chore list: order (offen by due_date asc, erledigt at the end) and
  // the "erledigt am/von" label + room label.
  await page.evaluate(() => showTab('aufgaben'));
  await page.waitForTimeout(300);
  const choreTitles = await page.$$eval('#chore-list li', els => els.map(el => el.querySelector('.item-name').textContent.trim()));
  console.log('Chore order:', JSON.stringify(choreTitles));
  const choreListHtml = await page.$eval('#chore-list', el => el.innerHTML);
  console.log('Contains "erledigt am":', choreListHtml.includes('erledigt am'));
  console.log('Contains room label "Wohnzimmer":', choreListHtml.includes('Wohnzimmer'));
  console.log('Old toggle-chore-done-link gone:', await page.$('#toggle-chore-done-link') === null);

  await page.evaluate(() => showTab('pflanzen'));
  await page.waitForTimeout(300);

  const plantListHtml = await page.$eval('#plant-list', el => el.innerHTML);
  const careTaskCount = await page.$$eval('.care-task', els => els.length);
  const addBtnCount = await page.$$eval('.care-task-add-btn', els => els.length);
  const plantCardCount = await page.$$eval('li.plant-card', els => els.length);

  console.log('Plant cards:', plantCardCount);
  console.log('Care task rows:', careTaskCount);
  console.log('Care task add buttons:', addBtnCount);
  console.log('Plant list HTML snippet:', plantListHtml.slice(0, 300));

  // Open settings and check rooms list + notify-plants checkbox
  await page.click('#settings-btn');
  await page.waitForTimeout(300);
  const roomListHtml = await page.$eval('#room-list', el => el.innerHTML);
  const notifyPlantsExists = await page.$('#notify-plants-checkbox') !== null;
  console.log('Room list HTML:', roomListHtml);
  console.log('notify-plants checkbox exists:', notifyPlantsExists);

  const href = await page.$eval('li.plant-card p a', el => el.getAttribute('href'));
  console.log('Search link href:', href);

  // Back to Pflanzen tab to interact
  await page.evaluate(() => showTab('pflanzen'));
  await page.waitForTimeout(200);

  await page.click('button.care-task-add-btn');
  await page.waitForTimeout(200);
  const editingFormCount = await page.$$eval('.care-task.editing', els => els.length);
  console.log('Inline add-task forms open after click:', editingFormCount);

  await page.click('li.plant-card .item-name.clickable');
  await page.waitForTimeout(200);
  const plantEditFormCount = await page.$$eval('li.plant-card.editing', els => els.length);
  console.log('Plant edit form open:', plantEditFormCount);

  console.log('--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();
