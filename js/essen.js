// Essensplan: je Tag Mittag und Abend, von beiden bearbeitbar.
//
// Ein Eintrag gehört allen ("für" leer) oder einer Person -- dieselbe
// Zuweisung wie bei den Aufgaben. So kann ein Platz einen gemeinsamen Eintrag
// haben oder zwei persönliche, wenn ihr getrennt esst.
//
// Vorkochen läuft über "→ morgen Mittag": eine Kopie mit dem Hinweis "Rest
// von …", keine Verknüpfung. Mehrmals hintereinander angetippt, verteilt es
// Vorgekochtes über mehrere Tage.
//
// Bewusst schlank: keine Portionen, kein Vorrat, kein Frühstück. Je weniger
// Pflege der Plan braucht, desto eher wird er benutzt.

    let mealPlan = [];
    let wochenVersatz = 0;
    let editingMealId = null;       // Eintrag, der gerade bearbeitet wird
    let neuerMealPlatz = null;      // { datum, mahlzeit, fuer } für einen neuen Eintrag
    let zutatenFuerMealId = null;   // Eintrag, dessen Zutaten gerade eingetragen werden
    let mealHinweis = '';           // kurze Rückmeldung über der Woche

    const MAHLZEITEN = ['mittag', 'abend'];
    const MAHLZEIT_LABEL = { mittag: 'Mittag', abend: 'Abend' };

    async function loadMealPlan() {
      const tage = tageDerWoche(wochenVersatz);
      const { data, error } = await client
        .from('meal_plan')
        .select('*')
        .gte('datum', tage[0].datum)
        .lte('datum', tage[6].datum);

      if (error) {
        console.error("Fehler beim Laden des Essensplans:", error);
        return;
      }

      mealPlan = data;
      mealPoolAlt = true;
      renderMealPlan();
    }

    function wocheWechseln(delta) {
      wochenVersatz += delta;
      schliesseMealFormulare();
      mealHinweis = '';
      loadMealPlan();
    }

    function wocheHeute() {
      wochenVersatz = 0;
      schliesseMealFormulare();
      mealHinweis = '';
      loadMealPlan();
    }

    function schliesseMealFormulare() {
      editingMealId = null;
      neuerMealPlatz = null;
      zutatenFuerMealId = null;
    }

    // --- Anzeige -----------------------------------------------------------

    function eigeneUserId() {
      return currentSession ? currentSession.user.id : null;
    }

    function personName(userId) {
      if (!userId) return 'Beide';
      return (typeof membersById !== 'undefined' && membersById[userId]) || 'Unbekannt';
    }

    // Reihenfolge im Platz: Gemeinsames zuerst, dann die eigene Person, dann
    // die anderen -- so steht, was einen selbst betrifft, immer oben.
    function sortiereImPlatz(a, b) {
      const rang = e => (!e.fuer ? 0 : (e.fuer === eigeneUserId() ? 1 : 2));
      return rang(a) - rang(b);
    }

    function restHinweis(eintrag) {
      if (!eintrag.rest_von) return '';
      const koch = new Date(eintrag.rest_von + 'T00:00:00');
      const heute = new Date(eintrag.datum + 'T00:00:00');
      const tage = Math.round((heute - koch) / 86400000);
      // Innerhalb einer Woche ist der Wochentag verständlicher als ein Datum.
      const wann = (tage >= 1 && tage <= 6)
        ? WOCHENTAGE[(koch.getDay() + 6) % 7]
        : formatDueDate(eintrag.rest_von).slice(0, 6);
      return `Rest von ${wann}`;
    }

    function renderMealPlan() {
      const tage = tageDerWoche(wochenVersatz);
      const heute = datumStr(new Date());

      // Bleibt der Monat gleich, reicht "21.–27.09." -- die lange Form
      // "21.09. – 27.09." bricht auf dem Handy in zwei Zeilen um.
      const von = tage[0].kurz;
      const bis = tage[6].kurz;
      const zeitraum = von.slice(3) === bis.slice(3) ? `${von.slice(0, 3)}–${bis}` : `${von} – ${bis}`;
      document.getElementById('woche-label').textContent =
        wochenVersatz === 0 ? `Diese Woche · ${zeitraum}` : zeitraum;
      document.getElementById('woche-heute').style.display = wochenVersatz === 0 ? 'none' : 'inline-block';

      const hinweis = mealHinweis
        ? `<li class="essen-hinweis">${escapeHtml(mealHinweis)}</li>` : '';

      document.getElementById('meal-plan-list').innerHTML =
        hinweis + tage.map(tag => renderMealTag(tag, heute)).join('');
    }

    function renderMealTag(tag, heute) {
      const istHeute = tag.datum === heute;
      const plaetze = MAHLZEITEN.map(mahlzeit => {
        const hier = mealPlan
          .filter(e => e.datum === tag.datum && e.mahlzeit === mahlzeit)
          .sort(sortiereImPlatz);
        const neuHier = neuerMealPlatz
          && neuerMealPlatz.datum === tag.datum && neuerMealPlatz.mahlzeit === mahlzeit;

        const inhalt = hier.map(renderMealEintrag).join('')
          + (neuHier ? renderMealFormular(null) : '');

        // "+" für einen weiteren Eintrag, z.B. wenn ihr an dem Abend getrennt
        // esst. Bei leerem Platz genügt das Antippen des Strichs.
        const plus = (hier.length && !neuHier)
          ? `<button type="button" class="essen-plus" onclick="startNeuerMeal('${tag.datum}', '${mahlzeit}')" aria-label="Weiterer Eintrag">+</button>`
          : '';

        return `
          <div class="essen-platz" data-mahlzeit="${mahlzeit}">
            <span class="essen-zeit">${MAHLZEIT_LABEL[mahlzeit]}</span>
            <div class="essen-eintraege">
              ${inhalt || `<button type="button" class="essen-leer" onclick="startNeuerMeal('${tag.datum}', '${mahlzeit}')" aria-label="${MAHLZEIT_LABEL[mahlzeit]} eintragen">–</button>`}
            </div>
            ${plus}
          </div>
        `;
      }).join('');

      return `
        <li class="essen-tag${istHeute ? ' essen-heute' : ''}" data-datum="${tag.datum}">
          <div class="essen-tag-kopf">${tag.name}, ${tag.kurz}${istHeute ? ' <small>· heute</small>' : ''}</div>
          ${plaetze}
        </li>
      `;
    }

    function renderMealEintrag(eintrag) {
      if (eintrag.id === editingMealId) return renderMealFormular(eintrag);
      if (eintrag.id === zutatenFuerMealId) return renderZutatenFormular(eintrag);

      const person = eintrag.fuer
        ? `<span class="essen-person${eintrag.fuer === eigeneUserId() ? ' essen-person-ich' : ''}">${escapeHtml(personName(eintrag.fuer))}</span>`
        : '';
      const rest = eintrag.rest_von ? `<small class="essen-rest">${restHinweis(eintrag)}</small>` : '';

      return `
        <button type="button" class="essen-eintrag${eintrag.rest_von ? ' ist-rest' : ''}" onclick="startEditMeal('${eintrag.id}')">
          ${person}<span class="essen-wort"><span>${escapeHtml(eintrag.text)}</span>${rest}</span>
        </button>
      `;
    }

    function fuerAuswahl(gewaehlt) {
      const optionen = [{ id: '', name: 'Beide' }].concat(
        (typeof householdMembers !== 'undefined' ? householdMembers : [])
          .slice()
          // Die eigene Person zuerst -- das ist die häufigste Wahl nach "Beide".
          .sort((a, b) => (a.user_id === eigeneUserId() ? -1 : b.user_id === eigeneUserId() ? 1 : 0))
          .map(m => ({ id: m.user_id, name: personName(m.user_id) }))
      );
      return optionen.map(o => `
        <button type="button" class="${(gewaehlt || '') === o.id ? 'an' : ''}" data-fuer="${o.id}"
                onclick="waehleFuer(this)">${escapeHtml(o.name)}</button>
      `).join('');
    }

    function waehleFuer(knopf) {
      knopf.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('an', b === knopf));
    }

    function renderMealFormular(eintrag) {
      const id = eintrag ? eintrag.id : 'neu';
      const fuer = eintrag ? eintrag.fuer : (neuerMealPlatz ? neuerMealPlatz.fuer : null);
      const knoepfe = eintrag
        ? `<button type="button" onclick="saveMeal('${id}')">Speichern</button>
           <button type="button" class="rest-knopf" onclick="restMorgenMittag('${id}')">→ morgen Mittag</button>
           ${eintrag.rest_von ? '' : `<button type="button" class="neben-knopf" onclick="startZutatenMeal('${id}')">Zutaten</button>`}
           <button type="button" class="neben-knopf" onclick="deleteMeal('${id}')">Entfernen</button>
           <button type="button" class="neben-knopf" onclick="cancelEditMeal()">Abbrechen</button>`
        : `<button type="button" onclick="saveMeal('neu')">Speichern</button>
           <button type="button" class="neben-knopf" onclick="cancelEditMeal()">Abbrechen</button>`;

      return `
        <div class="essen-formular">
          <div class="vorschlag-feld">
            <input type="text" id="meal-text-${id}" value="${eintrag ? escapeHtml(eintrag.text) : ''}"
                   placeholder="z.B. Pasta Hackfleisch" autocomplete="off"
                   oninput="zeigeEssenVorschlaege('${id}')" onblur="versteckeEssenVorschlaegeVerzoegert('${id}')"
                   onkeydown="essenVorschlagTaste(event, '${id}')">
            <ul id="meal-vorschlaege-${id}" class="vorschlaege" style="display:none;"></ul>
          </div>
          <div class="essen-fuer" id="meal-fuer-${id}">${fuerAuswahl(fuer)}</div>
          <div class="essen-knoepfe">${knoepfe}</div>
          <p id="meal-status-${id}" class="store-address"></p>
        </div>
      `;
    }

    function renderZutatenFormular(eintrag) {
      return `
        <div class="essen-formular">
          <label class="feld-label" for="zutaten-${eintrag.id}">Zutaten für ${escapeHtml(eintrag.text)}</label>
          <textarea id="zutaten-${eintrag.id}" rows="5" placeholder="Eine Zutat je Zeile:&#10;2 Zwiebeln&#10;500 g Mehl&#10;Olivenöl"></textarea>
          <p id="zutaten-status-${eintrag.id}" class="store-address"></p>
          <div class="essen-knoepfe">
            <button type="button" onclick="mehrereHinzufuegen('zutaten-${eintrag.id}', 'zutaten-status-${eintrag.id}')">Auf die Liste</button>
            <button type="button" class="neben-knopf" onclick="cancelEditMeal()">Fertig</button>
          </div>
        </div>
      `;
    }

    // --- Bedienung ---------------------------------------------------------

    function fokus(id) {
      const feld = document.getElementById(id);
      if (feld) feld.focus();
    }

    // --- Vorschläge beim Tippen (Pool Stufe 1) -----------------------------
    //
    // Quelle ist alles, was jemals im Plan stand. Der Plan selbst lädt nur
    // die angezeigte Woche, deshalb eine eigene, schlanke Abfrage nur über
    // Text und Datum. Sie läuft erst, wenn ein Formular aufgeht, und nach
    // jedem Neuladen des Plans wird sie als veraltet markiert -- so kommen
    // auch Einträge vom anderen Gerät mit, ohne dass jede Wochen-Navigation
    // eine zweite Abfrage auslöst.
    //
    // Ein Tipp füllt nur den Namen ein. Gespeichert wird weiter über
    // "Speichern", damit man vorher noch wählen kann, für wen es ist.
    const ESSEN_VORSCHLAEGE_MAX = 6;
    const ESSEN_VORSCHLAG_AB_ZEICHEN = 2;   // eigene Konstante: liste.js kann fehlen
    let mealPool = [];              // [{ text, datum }], neueste zuerst
    let mealPoolAlt = true;
    let mealPoolLaedt = null;
    let aktiverEssenVorschlag = -1;

    async function ladeMealPool() {
      if (!mealPoolAlt) return;
      if (mealPoolLaedt) return mealPoolLaedt;
      mealPoolLaedt = (async () => {
        const { data, error } = await client
          .from('meal_plan')
          .select('text, datum')
          .order('datum', { ascending: false })
          .limit(2000);
        mealPoolLaedt = null;
        if (error) {
          console.error("Fehler beim Laden der Essens-Vorschläge:", error);
          return;
        }
        mealPool = (data || []).slice().sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
        mealPoolAlt = false;
      })();
      return mealPoolLaedt;
    }

    // Je Gericht ein Vorschlag. Als Datum zählt das letzte bereits
    // vergangene ("zuletzt"); steht es nur in der Zukunft, das nächste
    // geplante ("geplant").
    function essenVorschlaegeFuer(eingabe) {
      const suche = eingabe.trim();
      if (suche.length < ESSEN_VORSCHLAG_AB_ZEICHEN) return [];
      const heute = datumStr(new Date());
      const gerichte = new Map();
      mealPool.forEach(e => {
        const text = (e.text || '').trim();
        if (!text) return;
        const schluessel = normKurz(text);
        let g = gerichte.get(schluessel);
        if (!g) {
          const stelle = trefferStelle(text, suche);
          if (stelle < 0) return;
          g = { text: text, amAnfang: stelle === 0, zuletzt: null, geplant: null, reihenfolge: gerichte.size };
          gerichte.set(schluessel, g);
        }
        if (e.datum <= heute) { if (!g.zuletzt || e.datum > g.zuletzt) g.zuletzt = e.datum; }
        else if (!g.geplant || e.datum < g.geplant) g.geplant = e.datum;
      });
      // Genau das Getippte muss nicht noch einmal angeboten werden. Bewusst
      // der rohe Vergleich: wer "musli" tippt, soll "Müsli" angeboten bekommen.
      const treffer = [...gerichte.values()].filter(g => g.text !== suche);
      // Innerhalb von Anfang/Mitte: zuletzt Gegessenes zuerst, nur Geplantes
      // (noch nie gegessen) dahinter.
      treffer.sort((a, b) => {
        if (a.amAnfang !== b.amAnfang) return a.amAnfang ? -1 : 1;
        if (!!a.zuletzt !== !!b.zuletzt) return a.zuletzt ? -1 : 1;
        const da = a.zuletzt || a.geplant, db = b.zuletzt || b.geplant;
        if (da !== db) return a.zuletzt ? (da < db ? 1 : -1) : (da < db ? -1 : 1);
        return a.reihenfolge - b.reihenfolge;
      });
      return treffer.slice(0, ESSEN_VORSCHLAEGE_MAX);
    }

    function kurzDatum(datum) {
      const [, m, t] = datum.split('-');
      return `${t}.${m}.`;
    }

    async function zeigeEssenVorschlaege(id) {
      await ladeMealPool();
      const feld = document.getElementById('meal-text-' + id);
      const liste = document.getElementById('meal-vorschlaege-' + id);
      if (!feld || !liste || document.activeElement !== feld) return;
      const treffer = essenVorschlaegeFuer(feld.value);
      aktiverEssenVorschlag = -1;
      if (!treffer.length) { versteckeEssenVorschlaege(id); return; }
      liste.innerHTML = treffer.map((g, i) => {
        const wann = g.zuletzt ? 'zuletzt ' + kurzDatum(g.zuletzt) : 'geplant ' + kurzDatum(g.geplant);
        return `
          <li data-index="${i}">
            <button type="button" data-text="${escapeHtml(g.text)}"
                    onmousedown="event.preventDefault()" onclick="waehleEssenVorschlag('${id}', this.dataset.text)">
              ${escapeHtml(g.text)}
              <small class="store-address">${wann}</small>
            </button>
          </li>`;
      }).join('');
      liste.style.display = 'block';
    }

    function versteckeEssenVorschlaege(id) {
      const liste = document.getElementById('meal-vorschlaege-' + id);
      if (liste) { liste.style.display = 'none'; liste.innerHTML = ''; }
      aktiverEssenVorschlag = -1;
    }

    // Der Tipp auf einen Vorschlag löst zuerst blur aus; ohne Verzögerung
    // wäre die Liste weg, bevor der Klick ankommt.
    function versteckeEssenVorschlaegeVerzoegert(id) {
      setTimeout(() => versteckeEssenVorschlaege(id), 150);
    }

    function essenVorschlagTaste(event, id) {
      const liste = document.getElementById('meal-vorschlaege-' + id);
      const offen = liste && liste.style.display !== 'none';
      const eintraege = offen ? liste.querySelectorAll('li') : [];
      if (offen && event.key === 'Escape') { versteckeEssenVorschlaege(id); return; }
      if (offen && eintraege.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const richtung = event.key === 'ArrowDown' ? 1 : -1;
        aktiverEssenVorschlag = (aktiverEssenVorschlag + richtung + eintraege.length) % eintraege.length;
        eintraege.forEach((el, i) => el.classList.toggle('aktiv', i === aktiverEssenVorschlag));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (offen && aktiverEssenVorschlag >= 0) eintraege[aktiverEssenVorschlag].querySelector('button').click();
        else saveMeal(id);
      }
    }

    function waehleEssenVorschlag(id, text) {
      const feld = document.getElementById('meal-text-' + id);
      if (!feld) return;
      feld.value = text;
      versteckeEssenVorschlaege(id);
      feld.focus();
    }

    function startEditMeal(id) {
      schliesseMealFormulare();
      editingMealId = id;
      renderMealPlan();
      fokus('meal-text-' + id);
    }

    function startNeuerMeal(datum, mahlzeit) {
      schliesseMealFormulare();
      // Steht im Platz schon ein gemeinsamer Eintrag, ist ein weiterer fast
      // immer ein persönlicher -- dann gleich die eigene Person vorwählen.
      const schonGemeinsam = mealPlan.some(e => e.datum === datum && e.mahlzeit === mahlzeit && !e.fuer);
      neuerMealPlatz = { datum, mahlzeit, fuer: schonGemeinsam ? eigeneUserId() : null };
      renderMealPlan();
      fokus('meal-text-neu');
    }

    function startZutatenMeal(id) {
      schliesseMealFormulare();
      zutatenFuerMealId = id;
      renderMealPlan();
      fokus('zutaten-' + id);
    }

    function cancelEditMeal() {
      schliesseMealFormulare();
      renderMealPlan();
    }

    function gewaehlteFuer(id) {
      const an = document.querySelector(`#meal-fuer-${id} button.an`);
      return an && an.dataset.fuer ? an.dataset.fuer : null;
    }

    // Die Datenbank erlaubt je Platz nur einen Eintrag pro Person (und einen
    // gemeinsamen). Vorher prüfen, damit statt eines rohen Fehlers ein
    // verständlicher Satz erscheint.
    function belegterPlatz(datum, mahlzeit, fuer, ausserId) {
      return mealPlan.find(e => e.datum === datum && e.mahlzeit === mahlzeit
        && (e.fuer || null) === (fuer || null) && e.id !== ausserId);
    }

    async function saveMeal(id) {
      const text = document.getElementById('meal-text-' + id).value.trim();
      const fuer = gewaehlteFuer(id);
      const statusEl = document.getElementById('meal-status-' + id);

      // Leerer Text heisst "nichts geplant" und entfernt den Eintrag -- so
      // braucht es keinen eigenen Löschweg für den Alltag.
      if (!text) {
        if (id !== 'neu') await deleteMeal(id);
        else cancelEditMeal();
        return;
      }

      const eintrag = id === 'neu' ? null : mealPlan.find(e => e.id === id);
      const datum = eintrag ? eintrag.datum : neuerMealPlatz.datum;
      const mahlzeit = eintrag ? eintrag.mahlzeit : neuerMealPlatz.mahlzeit;

      const kollision = belegterPlatz(datum, mahlzeit, fuer, eintrag ? eintrag.id : null);
      if (kollision) {
        statusEl.textContent = `Für ${personName(fuer)} steht hier schon „${kollision.text}".`;
        return;
      }

      let error;
      if (eintrag) {
        ({ error } = await client.from('meal_plan').update({ text: text, fuer: fuer }).eq('id', id));
      } else {
        const { data: { user } } = await client.auth.getUser();
        ({ error } = await client.from('meal_plan').insert({
          household_id: currentHouseholdId,
          datum: datum,
          mahlzeit: mahlzeit,
          text: text,
          fuer: fuer,
          created_by: user.id
        }));
      }

      if (error) {
        console.error("Fehler beim Speichern:", error);
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }
      schliesseMealFormulare();
      mealHinweis = '';
      loadMealPlan();
    }

    async function deleteMeal(id) {
      const { error } = await client.from('meal_plan').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      schliesseMealFormulare();
      loadMealPlan();
    }

    function tagDanach(datum) {
      const d = new Date(datum + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return datumStr(d);
    }

    // Legt den Rest für den nächsten Mittag an: gleicher Text, gleiche
    // Zuweisung, Hinweis auf den Kochtag. War der Eintrag selbst schon ein
    // Rest, bleibt der ursprüngliche Kochtag stehen -- "Rest von Sonntag"
    // auch noch am Dienstag.
    async function restMorgenMittag(id) {
      const quelle = mealPlan.find(e => e.id === id);
      if (!quelle) return;
      const statusEl = document.getElementById('meal-status-' + id);
      const ziel = tagDanach(quelle.datum);
      const kochtag = quelle.rest_von || quelle.datum;

      // Das Ziel kann in der nächsten Woche liegen (Sonntag → Montag) und ist
      // dann nicht geladen. Deshalb hier eigens nachfragen.
      let abfrage = client.from('meal_plan').select('id, text')
        .eq('household_id', currentHouseholdId).eq('datum', ziel).eq('mahlzeit', 'mittag');
      abfrage = quelle.fuer ? abfrage.eq('fuer', quelle.fuer) : abfrage.is('fuer', null);
      const { data: belegt, error: fehlerAbfrage } = await abfrage;
      if (fehlerAbfrage) {
        statusEl.textContent = "Fehler: " + fehlerAbfrage.message;
        return;
      }

      const zielTag = WOCHENTAGE[(new Date(ziel + 'T00:00:00').getDay() + 6) % 7];
      let error;
      if (belegt && belegt.length) {
        // Nie still überschreiben -- dort kann etwas bewusst Geplantes stehen.
        if (!confirm(`${zielTag} Mittag steht für ${personName(quelle.fuer)} schon „${belegt[0].text}". Ersetzen?`)) return;
        ({ error } = await client.from('meal_plan')
          .update({ text: quelle.text, rest_von: kochtag }).eq('id', belegt[0].id));
      } else {
        const { data: { user } } = await client.auth.getUser();
        ({ error } = await client.from('meal_plan').insert({
          household_id: currentHouseholdId,
          datum: ziel,
          mahlzeit: 'mittag',
          text: quelle.text,
          fuer: quelle.fuer || null,
          rest_von: kochtag,
          created_by: user.id
        }));
      }

      if (error) {
        console.error("Fehler beim Anlegen des Rests:", error);
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }

      // Liegt das Ziel in der nächsten Woche, sieht man es nicht -- deshalb
      // eine kurze Bestätigung über der Woche.
      mealHinweis = `„${quelle.text}" steht jetzt auch ${zielTag} Mittag.`;
      schliesseMealFormulare();
      loadMealPlan();
    }
