// Karten-Ansicht "Artikel hinzufügen" -- Teil von Einkaufen, nutzt liste.js
// (allItems, storesById, zerlegeZeile, normKurz, loadItems, EINHEIT_LABELS).
//
// Zwei Arten:
//   einzeln: "+ Artikel hinzufügen" -- Speichern oder Speichern & nächster.
//   stapel:  Zutaten aus Skillet oder dem Essensplan, eine Karte je Zutat,
//            vorausgefüllt mit Laden und Abteilung vom letzten Kauf.
//
// Doppeltes wird nicht mehr still übersprungen: Steht ein Artikel offen auf
// der Liste, sagt die Karte, was "Speichern" tut -- bei gleicher Einheit die
// Menge erhöhen, bei anderer Einheit zusätzlich eintragen, ohne Menge nichts.
//
// Die Karte schwebt über dem Bereich, aus dem sie geöffnet wurde (Hintergrund
// unscharf), und hat einen eigenen Verlaufs-Eintrag: ✕ und die Zurück-Taste
// des Handys schließen sie, ohne die App zu verlassen. Ein Tipp auf den
// Hintergrund schließt bewusst NICHT -- sonst wäre Halbeingetipptes weg.

    let karte = null;   // { modus, basis, herkunft, titel, eintraege, index, ladenFuerAlle, feldId, angelegt }

    const KARTE_TITEL = { einzeln: 'Neuer Artikel', skillet: 'Aus Skillet', essen: 'Aus dem Essensplan' };

    function karteAktiv() { return karte !== null; }

    // Der Bereich unter der Karte (Einkaufen oder Essensplan)
    function karteBasis() { return karte && karte.basis ? karte.basis : 'liste'; }

    function bereichUnterKarte() {
      return (typeof aktuelleAnsicht !== 'undefined' && TAB_IDS.includes(aktuelleAnsicht)) ? aktuelleAnsicht : 'liste';
    }

    // ✕ wirkt wie die Zurück-Taste
    function karteZu() { history.back(); }

    function karteNachOben() {
      document.getElementById('tab-artikel').scrollTop = 0;
    }

    function karteTitel() {
      if (!karte) return KARTE_TITEL.einzeln;
      return karte.modus === 'stapel' ? (KARTE_TITEL[karte.herkunft] || 'Zutaten übernehmen') : KARTE_TITEL.einzeln;
    }

    function zeigeKartenAnsicht() {
      history.pushState({ nest: 'artikel' }, '');
      zeigeAnsicht('artikel');
    }

    function mengeText(menge, einheit) {
      if (menge === null || menge === undefined || menge === '') return '';
      const zahl = Math.round(Number(menge) * 100) / 100;
      return `${String(zahl).replace('.', ',')} ${EINHEIT_LABELS[einheit] || einheit || ''}`.trim();
    }

    // --- Formular lesen und füllen -------------------------------------------

    function leseKarte() {
      const menge = document.getElementById('item-menge').value;
      return {
        name: document.getElementById('item-name').value.trim(),
        menge: menge === '' ? null : parseFloat(menge),
        einheit: document.getElementById('item-einheit').value,
        store_id: document.getElementById('item-store').value || null,
        department_id: document.getElementById('item-department').value || null,
        priority: document.getElementById('item-priority').value || 'normal'
      };
    }

    function fuelleKarte(e) {
      document.getElementById('item-name').value = e.name || '';
      document.getElementById('item-menge').value = (e.menge === null || e.menge === undefined) ? '' : e.menge;
      document.getElementById('item-einheit').value = e.einheit || 'stueck';
      document.getElementById('item-store').value = e.store_id || '';
      document.getElementById('item-department').value = e.department_id || '';
      setzePrioritaet(e.priority || 'normal');
    }

    function setzePrioritaet(wert) {
      document.getElementById('item-priority').value = wert;
      document.querySelectorAll('.karte-pille').forEach(p => p.classList.toggle('aktiv', p.dataset.wert === wert));
    }

    function setzeHinweise(laden, abteilung) {
      document.getElementById('hinweis-laden').textContent = laden || '';
      document.getElementById('hinweis-abteilung').textContent = abteilung || '';
    }

    // Wer Laden oder Abteilung selbst ändert, hat sie nicht mehr "wie zuletzt"
    function karteFeldGeaendert(feld) {
      if (feld === 'laden') {
        document.getElementById('hinweis-laden').textContent = '';
        if (karte && karte.ladenFuerAlle !== null) karte.ladenFuerAlle = document.getElementById('item-store').value;
      }
      if (feld === 'abteilung') document.getElementById('hinweis-abteilung').textContent = '';
    }

    // Aufgerufen von waehleVorschlag() in liste.js
    function karteNachVorschlag() {
      setzeHinweise('wie zuletzt', 'wie zuletzt');
      karteGeaendert();
    }

    // --- Doppeltes -----------------------------------------------------------

    function offenerTreffer(name) {
      const schluessel = normKurz(name);
      const ausListe = allItems.find(i => i.status === 'offen' && normKurz(i.name) === schluessel);
      if (ausListe) return ausListe;
      // Im Stapel gerade Angelegtes zählt mit -- allItems lädt erst am Ende neu
      return karte && karte.angelegt ? karte.angelegt.find(i => normKurz(i.name) === schluessel) : null;
    }

    function doppeltPlan(e) {
      if (!e.name) return { art: 'neu' };
      const offen = offenerTreffer(e.name);
      if (!offen) return { art: 'neu' };
      if (e.menge === null) return { art: 'schon-da', offen };
      if (offen.menge === null || offen.menge === undefined) return { art: 'erhoehen', offen, neueMenge: e.menge, einheit: e.einheit };
      if (offen.einheit === e.einheit) return { art: 'erhoehen', offen, neueMenge: Math.round((Number(offen.menge) + e.menge) * 100) / 100, einheit: e.einheit };
      return { art: 'zusaetzlich', offen };
    }

    function karteGeaendert() {
      const box = document.getElementById('karte-doppelt');
      const e = leseKarte();
      const plan = doppeltPlan(e);
      if (plan.art === 'neu') { box.style.display = 'none'; return; }
      const knopf = karte && karte.modus === 'stapel' ? '„Übernehmen“' : '„Speichern“';
      const vorhanden = `${escapeHtml(plan.offen.name)}${plan.offen.menge ? ' – ' + mengeText(plan.offen.menge, plan.offen.einheit) : ''}`;
      let was = '';
      if (plan.art === 'erhoehen') was = `${knopf} setzt die Menge auf ${mengeText(plan.neueMenge, plan.einheit)}.`;
      if (plan.art === 'schon-da') was = `${knopf} lässt es dabei.`;
      if (plan.art === 'zusaetzlich') was = `Andere Einheit – ${knopf} trägt es zusätzlich ein.`;
      box.innerHTML = `<b>Steht schon auf der Liste: ${vorhanden}</b>${was}`;
      box.style.display = 'block';
    }

    // --- Speichern -----------------------------------------------------------

    // Gibt { ok, status, text } zurück; status: neu | erhoeht | zusaetzlich | schon-da
    async function speichereEintrag(e) {
      const plan = doppeltPlan(e);
      if (plan.art === 'schon-da') return { ok: true, status: 'schon-da', text: 'stand schon drauf' };

      if (plan.art === 'erhoehen') {
        const { error } = await client.from('shopping_items')
          .update({ menge: plan.neueMenge, einheit: plan.einheit }).eq('id', plan.offen.id);
        if (error) return { ok: false, text: 'Fehler: ' + error.message };
        plan.offen.menge = plan.neueMenge;
        plan.offen.einheit = plan.einheit;
        return { ok: true, status: 'erhoeht', text: 'erhöht auf ' + mengeText(plan.neueMenge, plan.einheit) };
      }

      const { data: { user } } = await client.auth.getUser();
      const neu = {
        household_id: currentHouseholdId,
        name: e.name,
        menge: e.menge,
        einheit: e.einheit || 'stueck',
        store_id: e.store_id,
        department_id: e.department_id,
        priority: e.priority || 'normal',
        created_by: user.id
      };
      const { data, error } = await client.from('shopping_items').insert(neu).select();
      if (error) return { ok: false, text: 'Fehler: ' + error.message };
      if (karte && karte.angelegt) karte.angelegt.push({ ...neu, id: data && data[0] ? data[0].id : null, status: 'offen' });
      return { ok: true, status: plan.art === 'zusaetzlich' ? 'zusaetzlich' : 'neu', text: plan.art === 'zusaetzlich' ? 'zusätzlich' : 'neu' };
    }

    // --- Einzeln -------------------------------------------------------------

    function oeffneArtikelKarte() {
      karte = { modus: 'einzeln', basis: bereichUnterKarte(), angelegt: [] };
      document.getElementById('item-name').value = '';
      document.getElementById('item-menge').value = '';
      setzePrioritaet('normal');
      setzeHinweise('', '');
      document.getElementById('add-status').textContent = '';
      document.getElementById('liste-status').textContent = '';
      zeigeKartenModus();
      zeigeKartenAnsicht();
      document.getElementById('item-name').focus();
    }

    // Auch für ältere Aufrufer: das frühere Auf- und Zuklappen öffnet jetzt die Karte
    function toggleAddForm() { oeffneArtikelKarte(); }

    async function speichereEinzeln(weiter) {
      const e = leseKarte();
      const statusEl = document.getElementById('add-status');
      if (!e.name) { statusEl.textContent = 'Bitte einen Namen eingeben.'; return; }

      const erg = await speichereEintrag(e);
      if (!erg.ok) { statusEl.textContent = erg.text; return; }
      const meldung = erg.status === 'neu' ? `„${e.name}“ hinzugefügt.` :
                      erg.status === 'schon-da' ? `„${e.name}“ stand schon auf der Liste.` :
                      `„${e.name}“: ${erg.text}.`;
      versteckeVorschlaege();
      loadItems();

      if (weiter) {
        // Laden und Abteilung bleiben stehen -- oft kommt mehr aus demselben Laden
        document.getElementById('item-name').value = '';
        document.getElementById('item-menge').value = '';
        setzePrioritaet('normal');
        setzeHinweise('', '');
        document.getElementById('karte-doppelt').style.display = 'none';
        statusEl.textContent = meldung;
        document.getElementById('item-name').focus();
      } else {
        document.getElementById('liste-status').textContent = meldung;
        karte = null;
        history.back();
      }
    }

    // --- Stapel --------------------------------------------------------------

    function vorbelegen(z) {
      const frueher = allItems.find(i => normKurz(i.name) === normKurz(z.name));
      return {
        name: z.name,
        menge: z.menge,
        einheit: z.einheit || (frueher && frueher.einheit ? frueher.einheit : 'stueck'),
        store_id: frueher ? frueher.store_id : null,
        department_id: frueher ? frueher.department_id : null,
        priority: 'normal',
        ausVerlauf: !!frueher,
        status: null
      };
    }

    // zeilenText: eine Zutat je Zeile. optionen: { herkunft: 'skillet'|'essen', titel, feldId }
    function starteKartenStapel(zeilenText, optionen = {}) {
      const zeilen = String(zeilenText || '').split('\n').map(zerlegeZeile).filter(Boolean);
      if (!zeilen.length) return false;
      karte = {
        modus: 'stapel',
        basis: bereichUnterKarte(),
        herkunft: optionen.herkunft || 'skillet',
        titel: optionen.titel || '',
        feldId: optionen.feldId || null,
        eintraege: zeilen.map(vorbelegen),
        index: 0,
        ladenFuerAlle: null,
        angelegt: []
      };
      document.getElementById('karte-laden-alle').checked = false;
      zeigeKartenModus();
      zeigeKartenAnsicht();
      zeigeStapelKarte();
      return true;
    }

    function zeigeKartenModus() {
      const stapel = karte && karte.modus === 'stapel';
      document.getElementById('karte-titel').textContent = karteTitel();
      document.getElementById('karte-stapel-kopf').style.display = stapel ? 'block' : 'none';
      document.getElementById('karte-laden-alle-zeile').style.display = stapel ? 'flex' : 'none';
      document.getElementById('karte-rest').style.display = 'none';
      document.getElementById('add-form').style.display = 'block';
      document.getElementById('karte-zusammenfassung').style.display = 'none';
      document.getElementById('karte-doppelt').style.display = 'none';
      document.getElementById('artikel-speichern').textContent = stapel ? 'Übernehmen & weiter' : 'Speichern';
      document.getElementById('artikel-zweit').textContent = stapel ? 'Überspringen' : 'Speichern & nächster';
    }

    function zeigeStapelKarte() {
      const k = karte;
      const e = k.eintraege[k.index];
      const n = k.eintraege.length;

      const vorschlag = { ...e };
      let ladenHinweis = e.ausVerlauf && e.store_id ? 'wie zuletzt' : '';
      if (k.ladenFuerAlle !== null) { vorschlag.store_id = k.ladenFuerAlle || null; ladenHinweis = 'für alle gewählt'; }
      fuelleKarte(vorschlag);
      setzeHinweise(ladenHinweis, e.ausVerlauf && e.department_id ? 'wie zuletzt' : '');

      document.getElementById('karte-unterzeile').textContent =
        `${k.titel ? k.titel + ' · ' : ''}Zutat ${k.index + 1} von ${n}`;
      document.getElementById('karte-punkte').innerHTML = k.eintraege.map((x, i) =>
        `<span class="karte-punkt ${i < k.index ? 'erledigt' : ''} ${i === k.index ? 'jetzt' : ''}"></span>`).join('');

      const rest = n - k.index;
      const restKnopf = document.getElementById('karte-rest');
      restKnopf.style.display = rest > 1 ? 'inline' : 'none';
      restKnopf.textContent = `Restliche ${rest} so übernehmen, wie vorgeschlagen`;
      document.getElementById('add-status').textContent = '';
      karteGeaendert();
      karteNachOben();
    }

    function ladenFuerAlleGeaendert() {
      if (!karte) return;
      karte.ladenFuerAlle = document.getElementById('karte-laden-alle').checked
        ? document.getElementById('item-store').value : null;
    }

    async function stapelUebernehmen() {
      const e = leseKarte();
      if (!e.name) { document.getElementById('add-status').textContent = 'Bitte einen Namen eingeben.'; return; }
      const erg = await speichereEintrag(e);
      if (!erg.ok) { document.getElementById('add-status').textContent = erg.text; return; }
      Object.assign(karte.eintraege[karte.index], e, { status: erg.status, text: erg.text });
      naechsteStapelKarte();
    }

    function stapelUeberspringen() {
      Object.assign(karte.eintraege[karte.index], leseKarte(), { status: 'uebersprungen', text: 'übersprungen' });
      naechsteStapelKarte();
    }

    function naechsteStapelKarte() {
      karte.index++;
      if (karte.index < karte.eintraege.length) zeigeStapelKarte();
      else zeigeZusammenfassung();
    }

    // Die aktuelle Karte mit ihren (evtl. geänderten) Werten, alle weiteren so,
    // wie vorgeschlagen -- einschließlich "Laden für alle".
    async function restSoUebernehmen() {
      const statusEl = document.getElementById('add-status');
      const aktuell = leseKarte();
      for (let i = karte.index; i < karte.eintraege.length; i++) {
        const e = i === karte.index ? aktuell : { ...karte.eintraege[i] };
        if (i !== karte.index && karte.ladenFuerAlle !== null) e.store_id = karte.ladenFuerAlle || null;
        if (!e.name) { karte.eintraege[i].status = 'uebersprungen'; karte.eintraege[i].text = 'übersprungen'; continue; }
        const erg = await speichereEintrag(e);
        if (!erg.ok) { statusEl.textContent = erg.text; karte.index = i; zeigeStapelKarte(); statusEl.textContent = erg.text; return; }
        Object.assign(karte.eintraege[i], e, { status: erg.status, text: erg.text });
      }
      karte.index = karte.eintraege.length;
      zeigeZusammenfassung();
    }

    function zeigeZusammenfassung() {
      const k = karte;
      const aufListe = k.eintraege.filter(e => ['neu', 'erhoeht', 'zusaetzlich'].includes(e.status)).length;
      document.getElementById('add-form').style.display = 'none';
      document.getElementById('karte-punkte').innerHTML = '';
      document.getElementById('karte-unterzeile').textContent = `${k.titel ? k.titel + ' · ' : ''}fertig`;
      document.getElementById('karte-zusammenfassung-titel').textContent =
        aufListe === 1 ? '1 Zutat auf der Liste' : `${aufListe} Zutaten auf der Liste`;
      document.getElementById('karte-zusammenfassung-liste').innerHTML = k.eintraege.map(e => `
        <li class="${e.status === 'uebersprungen' ? 'uebersprungen' : ''}">
          <span>${escapeHtml(e.name)}${e.status !== 'erhoeht' && e.menge ? ' – ' + escapeHtml(mengeText(e.menge, e.einheit)) : ''}</span>
          <span class="karte-status">${escapeHtml(e.text || '')}</span>
        </li>`).join('');
      document.getElementById('karte-zusammenfassung').style.display = 'block';
      karteNachOben();
      loadItems();
    }

    function karteSchliessen() {
      if (karte && karte.feldId) {
        const feld = document.getElementById(karte.feldId);
        if (feld) feld.value = '';
      }
      karte = null;
      history.back();
    }

    // --- Knöpfe --------------------------------------------------------------

    function karteHauptknopf() {
      if (karte && karte.modus === 'stapel') stapelUebernehmen();
      else speichereEinzeln(false);
    }

    function karteZweitknopf() {
      if (karte && karte.modus === 'stapel') stapelUeberspringen();
      else speichereEinzeln(true);
    }
