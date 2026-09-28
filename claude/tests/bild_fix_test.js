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
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  await page.goto('file://' + path.resolve('/tmp/nest-test/index.html'));
  await page.waitForTimeout(1200);

  // Hilfen im Browser: Foto erzeugen, über die Vorschau "auswählen"
  await page.evaluate(() => {
    window.macheFoto = async (w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#2f6b7d'; ctx.fillRect(0, 0, w, h);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      return new File([b], 'foto.jpg', { type: 'image/jpeg' });
    };
    window.waehleMitVorschau = async (datei) => {
      const input = document.getElementById('plant-image');
      const dt = new DataTransfer(); dt.items.add(datei); input.files = dt.files;
      const img = document.getElementById('plant-image-preview');
      const geladen = new Promise(r => img.addEventListener('load', r, { once: true }));
      zeigeBildVorschau(input, 'plant-image-preview');
      await geladen;
      await new Promise(r => setTimeout(r, 50));
    };
    window.masse = async (blob) => {
      const u = URL.createObjectURL(blob);
      return await new Promise(res => { const im = new Image(); im.onload = () => res([im.width, im.height]); im.src = u; });
    };
  });

  console.log('=== Normalfall mit Vorschau: beim Decodieren verkleinert ===');
  const r1 = await page.evaluate(async () => {
    const quer = await macheFoto(4000, 3000); await waehleMitVorschau(quer);
    const aufrufe = [];
    const orig = window.createImageBitmap;
    window.createImageBitmap = (d, o) => { aufrufe.push(o || null); return orig(d, o); };
    const a = await masse(await verkleinereBild(quer));
    const hoch = await macheFoto(3000, 4000); await waehleMitVorschau(hoch);
    const b = await masse(await verkleinereBild(hoch));
    window.createImageBitmap = orig;
    return { a, b, aufrufe };
  });
  check('Querformat 1200x900 (±1 Rundung)', r1.a[0] === 1200 && Math.abs(r1.a[1] - 900) <= 1, true);
  check('Hochformat 900x1200 (±1 Rundung)', r1.b[1] === 1200 && Math.abs(r1.b[0] - 900) <= 1, true);
  check('Decodiert mit resizeWidth/resizeHeight', r1.aufrufe, [{ resizeWidth: 1200, resizeQuality: 'high' }, { resizeHeight: 1200, resizeQuality: 'high' }]);

  console.log('=== Ohne Vorschau (bisheriger Weg) ===');
  const r2 = await page.evaluate(async () => {
    const f = await macheFoto(2000, 1000);
    const aufrufe = [];
    const orig = window.createImageBitmap;
    window.createImageBitmap = (d, o) => { aufrufe.push(o || null); return orig(d, o); };
    const m = await masse(await verkleinereBild(f));
    window.createImageBitmap = orig;
    return { m, aufrufe };
  });
  check('Verkleinert 1200x600', r2.m, [1200, 600]);
  check('Ein Aufruf ohne Optionen', r2.aufrufe, [null]);

  console.log('=== Kleines Foto: keine Verkleinerung beim Decodieren nötig ===');
  const r3 = await page.evaluate(async () => {
    const f = await macheFoto(800, 600); await waehleMitVorschau(f);
    const aufrufe = [];
    const orig = window.createImageBitmap;
    window.createImageBitmap = (d, o) => { aufrufe.push(o || null); return orig(d, o); };
    const m = await masse(await verkleinereBild(f));
    window.createImageBitmap = orig;
    return { m, aufrufe };
  });
  check('Bleibt 800x600', r3.m, [800, 600]);
  check('Ohne Optionen decodiert', r3.aufrufe, [null]);

  console.log('=== Speicherfehler simuliert (Vorschau war da) ===');
  const r4 = await page.evaluate(async () => {
    const f = await macheFoto(4000, 3000); await waehleMitVorschau(f);
    const origCIB = window.createImageBitmap, origImg = window.Image;
    let cib = 0, img = 0;
    window.createImageBitmap = () => { cib++; const e = new Error('x'); e.name = 'EncodingError'; return Promise.reject(e); };
    window.Image = class { set src(v) { if (v) { img++; setTimeout(() => this.onerror && this.onerror(), 0); } } };
    let meldung = null;
    try { await ladeBildHoch(f, 'test'); } catch (e) { meldung = e.message; }
    window.createImageBitmap = origCIB; window.Image = origImg;
    return { meldung, cib, img };
  });
  check('Ehrliche Meldung statt iPhone-Tipp', r4.meldung && r4.meldung.startsWith('Das Foto ist in Ordnung'), true);
  check('Kein iPhone-Hinweis', r4.meldung && r4.meldung.includes('iPhone'), false);
  check('Technische Details angehängt', r4.meldung && r4.meldung.endsWith('(Technisch: EncodingError, EncodingError, img)'), true);
  check('Zweiter Versuch unternommen (2x2 Bitmap, 2x img)', [r4.cib, r4.img], [4, 2]);

  console.log('=== Unlesbares Format ohne Vorschau ===');
  const r5 = await page.evaluate(async () => {
    const f = new File([new Uint8Array([1, 2, 3])], 'kaputt.heic', { type: 'image/heic' });
    let meldung = null;
    try { await verkleinereBild(f); } catch (e) { meldung = e.message; }
    return meldung;
  });
  check('Format-Meldung bleibt für echten Formatfehler', r5 && r5.startsWith('Dieses Bildformat'), true);

  console.log('=== Erster Versuch scheitert, zweiter klappt ===');
  const r6 = await page.evaluate(async () => {
    const f = await macheFoto(4000, 3000); await waehleMitVorschau(f);
    const origCIB = window.createImageBitmap, origImg = window.Image;
    let aufrufe = 0;
    window.createImageBitmap = (d, o) => { aufrufe++; if (aufrufe <= 2) { const e = new Error('x'); e.name = 'EncodingError'; return Promise.reject(e); } return origCIB(d, o); };
    window.Image = class { set src(v) { if (v) setTimeout(() => this.onerror && this.onerror(), 0); } };
    let pfad = null, meldung = null;
    try { pfad = await ladeBildHoch(f, 'test'); } catch (e) { meldung = e.message; }
    window.createImageBitmap = origCIB; window.Image = origImg;
    return { ok: !!pfad, meldung };
  });
  check('Upload nach zweitem Versuch erfolgreich', r6, { ok: true, meldung: null });

  check('Keine JS-Fehler', jsFehler, []);
  await browser.close();
  console.log(fehler ? `\n${fehler} FEHLER` : '\nAlles grün');
  process.exit(fehler ? 1 : 0);
})();
