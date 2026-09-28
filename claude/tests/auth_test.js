const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

// Stub, bei dem die Auth-Events von aussen ausgelöst werden können.
const STUB = `
window.__aufrufe = [];
window.__session = null;
let authCallback = null;
window.__feuereAuthEvent = function (event, session) {
  window.__session = session;
  if (authCallback) authCallback(event, session);
};

window.__fakeData = {
  households: [{ id: 'h1', name: 'Testhaushalt', join_code: 'ABC123' }],
  household_members: [{ household_id: 'h1' }],
  stores: [], departments: [], chores: [], rooms: [], plants: [],
  plant_care_tasks: [], shopping_items: [],
  profiles: [{ id: 'u1', display_name: 'Jan', notify_chores: true, notify_plants: true }]
};

class FakeQuery {
  constructor(t) { this.t = t; this._single = false; this._op = 'select'; }
  select() { return this; } order() { return this; } limit() { return this; } in() { return this; } is() { return this; } eq() { return this; }
  not() { return this; } lte() { return this; } gte() { return this; } is() { return this; } gt() { return this; }
  insert() { this._op = 'write'; return this; } update() { this._op = 'write'; return this; }
  delete() { this._op = 'write'; return this; } upsert() { this._op = 'write'; return this; }
  maybeSingle() { this._single = true; return this; } single() { this._single = true; return this; }
  then(res) {
    const list = window.__fakeData[this.t] || [];
    const r = this._op === 'write' ? { error: null, data: null }
      : (this._single ? { data: list[0] || null, error: null } : { data: list, error: null });
    res(r); return Promise.resolve(r);
  }
}

window.supabase = {
  createClient: function () {
    return {
      auth: {
        onAuthStateChange: function (cb) { authCallback = cb; },
        getUser: async () => ({ data: { user: { id: 'u1', email: 'jan@example.com' } } }),
        getSession: async () => ({ data: { session: window.__session } }),
        signOut: async () => {},
        signInWithPassword: async (a) => { window.__aufrufe.push(['signIn', a]); return { error: null }; },
        signUp: async (a) => { window.__aufrufe.push(['signUp', a]); return { error: null }; },
        resetPasswordForEmail: async (email, opts) => {
          window.__aufrufe.push(['reset', email, opts]);
          return { data: {}, error: null };
        },
        updateUser: async (attrs) => {
          window.__aufrufe.push(['updateUser', attrs]);
          if (window.__updateUserFehler) return { error: { message: window.__updateUserFehler } };
          return { data: {}, error: null };
        }
      },
      from: (t) => new FakeQuery(t),
      rpc: (name) => Promise.resolve(name === 'get_household_members'
        ? { data: [{ user_id: 'u1', email: 'jan@example.com', display_name: 'Jan' }], error: null }
        : { data: null, error: null }),
      channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
      removeAllChannels: () => {}
    };
  }
};
`;

let fehler = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}` + (ok ? '' : `\n        erwartet: ${JSON.stringify(expected)}\n        bekommen: ${JSON.stringify(actual)}`));
  if (!ok) fehler++;
}

const SESSION = { user: { id: 'u1', email: 'jan@example.com' } };

async function neueSeite(browser, url) {
  const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
  const jsFehler = [];
  page.on('pageerror', (e) => jsFehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ServiceWorker')) jsFehler.push(m.text()); });
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  await page.goto(url);
  await page.waitForTimeout(400);
  page.__jsFehler = jsFehler;
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const datei = 'file://' + path.resolve('/tmp/nest-test/index.html');

  // ============ A: Reset anfordern ============
  console.log('\n=== A: Link anfordern (normaler Login-Start) ===');
  let page = await neueSeite(browser, datei);
  await page.evaluate(() => window.__feuereAuthEvent('INITIAL_SESSION', null));
  await page.waitForTimeout(200);

  check('Login sichtbar, Recovery versteckt',
    [await page.isVisible('#login-view'), await page.isVisible('#recovery-view')], [true, false]);

  await page.click('#auth-reset-link');
  await page.waitForTimeout(150);
  check('Reset-Modus: Passwortfeld ausgeblendet', await page.isVisible('#password'), false);
  check('Reset-Modus: Button-Text', await page.textContent('#auth-submit-btn'), 'Link zum Zurücksetzen senden');
  check('Reset-Modus: Registrieren-Link ausgeblendet', await page.isVisible('#auth-mode-toggle'), false);
  check('Reset-Modus: Link heisst jetzt "Zurück zum Login"', await page.textContent('#auth-reset-link'), 'Zurück zum Login');

  // Ohne E-Mail absenden
  await page.click('#auth-submit-btn');
  await page.waitForTimeout(150);
  check('Ohne E-Mail: Hinweis', await page.textContent('#login-status'), 'Bitte zuerst deine E-Mail-Adresse eintragen.');
  check('Ohne E-Mail: kein Aufruf abgesetzt', await page.evaluate(() => window.__aufrufe.length), 0);

  // Mit E-Mail absenden
  await page.fill('#email', '  jan@example.com  ');
  await page.click('#auth-submit-btn');
  await page.waitForTimeout(250);
  const aufruf = await page.evaluate(() => window.__aufrufe[0]);
  check('resetPasswordForEmail aufgerufen, E-Mail getrimmt', [aufruf[0], aufruf[1]], ['reset', 'jan@example.com']);
  check('redirectTo zeigt auf die App selbst',
    aufruf[2].redirectTo.endsWith('/nest-test/index.html'), true);
  const meldung = await page.textContent('#login-status');
  check('Neutrale Rückmeldung (verrät nicht, ob das Konto existiert)',
    meldung.startsWith('Falls es zu dieser Adresse ein Konto gibt'), true);

  // Zurück zum Login
  await page.click('#auth-reset-link');
  await page.waitForTimeout(150);
  check('Zurück im Login-Modus',
    [await page.isVisible('#password'), await page.textContent('#auth-submit-btn')], [true, 'Login']);
  check('Keine JS-Fehler (A)', page.__jsFehler, []);
  await page.close();

  // ============ B: Recovery-Link geöffnet ============
  console.log('\n=== B: Aus der E-Mail kommend (PASSWORD_RECOVERY) ===');
  page = await neueSeite(browser, datei);
  await page.evaluate((s) => window.__feuereAuthEvent('PASSWORD_RECOVERY', s), SESSION);
  await page.waitForTimeout(250);

  check('Recovery-Ansicht sichtbar', await page.isVisible('#recovery-view'), true);
  check('App bleibt zu (springt nicht durch)', await page.isVisible('#app-view'), false);
  check('Login bleibt zu', await page.isVisible('#login-view'), false);
  check('E-Mail-Adresse angezeigt', await page.textContent('#recovery-email'), 'jan@example.com');

  // Nachgelagertes SIGNED_IN darf nicht in die App durchspringen
  await page.evaluate((s) => window.__feuereAuthEvent('SIGNED_IN', s), SESSION);
  await page.waitForTimeout(250);
  check('Auch nach SIGNED_IN noch im Passwort-Formular',
    [await page.isVisible('#recovery-view'), await page.isVisible('#app-view')], [true, false]);

  // Validierung
  await page.fill('#new-password', 'kurz');
  await page.fill('#new-password-repeat', 'kurz');
  await page.click('#recovery-view button');
  await page.waitForTimeout(150);
  check('Zu kurzes Passwort abgelehnt', await page.textContent('#recovery-status'),
    'Das Passwort muss mindestens 8 Zeichen lang sein.');

  await page.fill('#new-password', 'langgenug1');
  await page.fill('#new-password-repeat', 'langgenug2');
  await page.click('#recovery-view button');
  await page.waitForTimeout(150);
  check('Abweichende Wiederholung abgelehnt', await page.textContent('#recovery-status'),
    'Die beiden Passwörter stimmen nicht überein.');
  check('Bis hier kein updateUser abgesetzt',
    await page.evaluate(() => window.__aufrufe.filter(a => a[0] === 'updateUser').length), 0);

  // Fehler vom Server
  await page.evaluate(() => { window.__updateUserFehler = 'New password should be different from the old password.'; });
  await page.fill('#new-password', 'langgenug1');
  await page.fill('#new-password-repeat', 'langgenug1');
  await page.click('#recovery-view button');
  await page.waitForTimeout(250);
  check('Serverfehler wird angezeigt', await page.textContent('#recovery-status'),
    'Fehler: New password should be different from the old password.');
  check('Bleibt im Formular', await page.isVisible('#recovery-view'), true);

  // Erfolgsfall
  await page.evaluate(() => { window.__updateUserFehler = null; });
  await page.fill('#new-password', 'einNeuesPasswort');
  await page.fill('#new-password-repeat', 'einNeuesPasswort');
  await page.click('#recovery-view button');
  await page.waitForTimeout(600);

  const upd = await page.evaluate(() => window.__aufrufe.filter(a => a[0] === 'updateUser').pop());
  check('updateUser mit neuem Passwort', upd[1], { password: 'einNeuesPasswort' });
  check('App geht auf', await page.isVisible('#app-view'), true);
  check('Recovery-Ansicht zu', await page.isVisible('#recovery-view'), false);
  check('Passwortfelder geleert',
    await page.evaluate(() => [document.getElementById('new-password').value,
                               document.getElementById('new-password-repeat').value]), ['', '']);
  check('Kein Token mehr in der Adresszeile',
    await page.evaluate(() => window.location.hash + window.location.search), '');
  check('Keine JS-Fehler (B)', page.__jsFehler, []);
  await page.close();

  // ============ C: Recovery erkannt am URL-Fragment (Fallback) ============
  console.log('\n=== C: Fallback über das URL-Fragment ===');
  page = await neueSeite(browser, datei + '#access_token=xyz&type=recovery');
  await page.evaluate((s) => window.__feuereAuthEvent('SIGNED_IN', s), SESSION);
  await page.waitForTimeout(250);
  check('Auch ohne PASSWORD_RECOVERY-Event im Formular',
    [await page.isVisible('#recovery-view'), await page.isVisible('#app-view')], [true, false]);
  check('Keine JS-Fehler (C)', page.__jsFehler, []);
  await page.close();

  // ============ D: Normaler Login unbeeinflusst ============
  console.log('\n=== D: Normaler Login weiterhin unbeeinflusst ===');
  page = await neueSeite(browser, datei);
  await page.evaluate((s) => window.__feuereAuthEvent('SIGNED_IN', s), SESSION);
  await page.waitForTimeout(500);
  check('App geht normal auf', await page.isVisible('#app-view'), true);
  check('Recovery-Ansicht bleibt zu', await page.isVisible('#recovery-view'), false);
  await page.evaluate(() => window.__feuereAuthEvent('SIGNED_OUT', null));
  await page.waitForTimeout(250);
  check('Nach Logout zurück zum Login',
    [await page.isVisible('#login-view'), await page.isVisible('#app-view')], [true, false]);
  check('Keine JS-Fehler (D)', page.__jsFehler, []);
  await page.close();

  console.log(`\n>>> ${fehler === 0 ? 'ALLE TESTS BESTANDEN' : fehler + ' FEHLGESCHLAGEN'}`);
  await browser.close();
  process.exit(fehler === 0 ? 0 : 1);
})();
