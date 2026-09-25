// Wochenplan fürs Essen. Ein freier Text je Tag, von beiden bearbeitbar.
//
// Bewusst ohne Rezept-Bestand und ohne Zutaten-Zerlegung: je weniger Pflege
// der Plan braucht, desto grösser die Chance, dass er in vier Wochen noch
// benutzt wird. Der Nutzen liegt nicht im Planen selbst, sondern darin, dass
// "was essen wir heute" ohne Rückfrage beantwortet ist.

    let mealPlan = {};
    let wochenVersatz = 0;
    let editingMealDatum = null;
    let zutatenFuerDatum = null;

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

      mealPlan = {};
      data.forEach(zeile => { mealPlan[zeile.datum] = zeile; });
      renderMealPlan();
    }

    function wocheWechseln(delta) {
      wochenVersatz += delta;
      editingMealDatum = null;
      zutatenFuerDatum = null;
      loadMealPlan();
    }

    function wocheHeute() {
      wochenVersatz = 0;
      editingMealDatum = null;
      zutatenFuerDatum = null;
      loadMealPlan();
    }

    function renderMealPlan() {
      const tage = tageDerWoche(wochenVersatz);
      const heute = datumStr(new Date());

      const von = tage[0].kurz;
      const bis = tage[6].kurz;
      document.getElementById('woche-label').textContent =
        wochenVersatz === 0 ? `Diese Woche · ${von} – ${bis}` : `${von} – ${bis}`;
      document.getElementById('woche-heute').style.display = wochenVersatz === 0 ? 'none' : 'inline-block';

      document.getElementById('meal-plan-list').innerHTML =
        tage.map(tag => renderMealTag(tag, heute)).join('');
    }

    function renderMealTag(tag, heute) {
      const eintrag = mealPlan[tag.datum];
      const text = eintrag ? eintrag.text : '';

      if (tag.datum === editingMealDatum) {
        return `
          <li class="editing meal-tag">
            <label class="feld-label" for="meal-text-${tag.datum}">${tag.name}, ${tag.kurz}</label>
            <textarea id="meal-text-${tag.datum}" rows="2" placeholder="z.B. Linsensuppe">${escapeHtml(text)}</textarea>
            <div class="edit-actions">
              <button onclick="saveMeal('${tag.datum}')">Speichern</button>
              <button onclick="cancelEditMeal()">Abbrechen</button>
            </div>
          </li>
        `;
      }

      if (tag.datum === zutatenFuerDatum) {
        return `
          <li class="editing meal-tag">
            <label class="feld-label" for="zutaten-${tag.datum}">Zutaten für ${tag.name}${text ? ' – ' + escapeHtml(text) : ''}</label>
            <textarea id="zutaten-${tag.datum}" rows="5" placeholder="Eine Zutat je Zeile:&#10;2 Zwiebeln&#10;500 g Mehl&#10;Olivenöl"></textarea>
            <p id="zutaten-status-${tag.datum}" class="store-address"></p>
            <div class="edit-actions">
              <button onclick="mehrereHinzufuegen('zutaten-${tag.datum}', 'zutaten-status-${tag.datum}')">Auf die Liste</button>
              <button onclick="cancelZutaten()">Fertig</button>
            </div>
          </li>
        `;
      }

      const istHeute = tag.datum === heute;
      return `
        <li class="meal-tag${istHeute ? ' meal-heute' : ''}">
          <span class="item-name clickable" onclick="startEditMeal('${tag.datum}')">
            ${tag.name}, ${tag.kurz}${istHeute ? ' · heute' : ''}
            <br>${text
              ? `<strong>${escapeHtml(text)}</strong>`
              : '<small class="store-address">noch nichts geplant</small>'}
          </span>
          <button onclick="startZutaten('${tag.datum}')">Zutaten</button>
        </li>
      `;
    }

    function startEditMeal(datum) {
      editingMealDatum = datum;
      zutatenFuerDatum = null;
      renderMealPlan();
      const feld = document.getElementById('meal-text-' + datum);
      if (feld) feld.focus();
    }

    function cancelEditMeal() {
      editingMealDatum = null;
      renderMealPlan();
    }

    // Leerer Text heisst "nichts geplant" und entfernt den Eintrag -- so
    // braucht es keinen eigenen Löschen-Knopf je Tag.
    async function saveMeal(datum) {
      const text = document.getElementById('meal-text-' + datum).value.trim();

      if (!text) {
        if (mealPlan[datum]) {
          const { error } = await client.from('meal_plan').delete().eq('id', mealPlan[datum].id);
          if (error) { console.error("Fehler beim Löschen:", error); return; }
        }
        editingMealDatum = null;
        loadMealPlan();
        return;
      }

      const { data: { user } } = await client.auth.getUser();
      const { error } = await client
        .from('meal_plan')
        .upsert({
          household_id: currentHouseholdId,
          datum: datum,
          text: text,
          created_by: user.id
        }, { onConflict: 'household_id,datum' });

      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingMealDatum = null;
      loadMealPlan();
    }

    function startZutaten(datum) {
      zutatenFuerDatum = datum;
      editingMealDatum = null;
      renderMealPlan();
      const feld = document.getElementById('zutaten-' + datum);
      if (feld) feld.focus();
    }

    function cancelZutaten() {
      zutatenFuerDatum = null;
      renderMealPlan();
    }
