// Aufgaben: anlegen, zuweisen, abhaken, Wiederholungen.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    function toggleChoreAddForm() {
      const formEl = document.getElementById('chore-add-form');
      const istOffen = formEl.style.display !== 'none';
      formEl.style.display = istOffen ? 'none' : 'block';
      document.getElementById('toggle-chore-add-link').textContent = istOffen ? "+ Aufgabe hinzufügen" : "– Formular schließen";
    }

    let allChores = [];
    let editingChoreId = null;
    let choreViewFilter = localStorage.getItem('nest_chore_filter') || 'alle';

    function setChoreView(view) {
      choreViewFilter = view;
      localStorage.setItem('nest_chore_filter', view);
      document.getElementById('chore-filter-alle').classList.toggle('active', view === 'alle');
      document.getElementById('chore-filter-meine').classList.toggle('active', view === 'meine');
      renderChores();
    }

    async function loadChores() {
      const { data, error } = await client
        .from('chores')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Fehler beim Laden der Aufgaben:", error);
        return;
      }

      allChores = data;
      renderChores();
    }

    function renderChores() {
      const eigeneId = currentSession ? currentSession.user.id : null;
      const sichtbar = choreViewFilter === 'meine'
        ? allChores.filter(c => c.assigned_to === eigeneId)
        : allChores;

      // Immer die nächste anstehende zuerst; erledigte wandern (zuletzt
      // erledigt zuerst) ans Ende der Liste statt komplett zu verschwinden.
      //
      // Das Datum schlägt dabei bewusst die Priorität: eine "dringende"
      // Aufgabe in drei Wochen soll nicht über dem Müll stehen, der morgen
      // rausmuss. Die Priorität entscheidet bei gleichem Termin -- und bei
      // Aufgaben ganz ohne Termin, wo es sonst keine Ordnung gäbe.
      // Aufgaben und fällige Pflanzenpflege landen in derselben Liste. Sie
      // werden dafür auf die gemeinsamen Sortierfelder heruntergebrochen --
      // die Darstellung bleibt getrennt, weil beide unterschiedlich viel
      // können (Pflege hat keine Priorität und wird hier nicht bearbeitet).
      const eintraege = sichtbar.map(chore => ({
        due_date: chore.due_date,
        priority: chore.priority,
        status: chore.status,
        completed_at: chore.completed_at,
        html: renderChore(chore)
      })).concat(faelligePflegeEintraege());

      const offen = eintraege.filter(e => e.status === 'offen').sort((a, b) => {
        if (a.due_date && b.due_date && a.due_date !== b.due_date) {
          return a.due_date.localeCompare(b.due_date);
        }
        if (!a.due_date && b.due_date) return 1;
        if (a.due_date && !b.due_date) return -1;
        return prioritaetRang(b.priority) - prioritaetRang(a.priority);
      });
      // Erledigtes älter als die Frist wird ausgeblendet (betrifft praktisch
      // nur einmalige Aufgaben -- wiederkehrende stehen nachts wieder auf offen).
      const alleErledigt = eintraege.filter(e => e.status === 'erledigt');
      const erledigt = alleErledigt.filter(e => !istAelterAlsFrist(e.completed_at)).sort((a, b) =>
        (b.completed_at || '').localeCompare(a.completed_at || '')
      );
      const ausgeblendet = alleErledigt.length - erledigt.length;

      const combined = offen.concat(erledigt);

      document.getElementById('chore-list').innerHTML = (combined.length
        ? combined.map(e => e.html).join('')
        : '<p class="store-address">Keine Aufgaben.</p>')
        + (ausgeblendet ? `<p class="store-address" id="chores-ausgeblendet">Ältere erledigte Aufgaben (${ausgeblendet}) ausgeblendet.</p>` : '');
    }

    function renderChore(chore) {
      if (chore.id === editingChoreId) {
        return `
          <li class="editing">
            <input type="text" id="edit-chore-title-${chore.id}" value="${escapeHtml(chore.title)}">
            <input type="date" id="edit-chore-due-${chore.id}" value="${chore.due_date || ''}">
            <select id="edit-chore-priority-${chore.id}">${prioritaetOptions(chore.priority)}</select>
            <select id="edit-chore-assigned-${chore.id}">${memberOptions(chore.assigned_to)}</select>
            <select id="edit-chore-room-${chore.id}">${roomOptions(chore.room_id)}</select>
            <div class="recurrence-fields">
              <input type="number" id="edit-chore-recurrence-value-${chore.id}" placeholder="Wiederholt sich alle …" min="1"
                     value="${chore.recurrence_interval_value || ''}">
              <select id="edit-chore-recurrence-unit-${chore.id}">
                ${recurrenceUnitOptions(chore.recurrence_interval_unit || 'woche')}
              </select>
            </div>
            <div class="edit-actions">
              <button onclick="saveEditChore('${chore.id}')">Speichern</button>
              <button onclick="cancelEditChore()">Abbrechen</button>
            </div>
          </li>
        `;
      }

      const editable = chore.status === 'offen';
      const nameClass = editable ? 'item-name clickable' : 'item-name';
      const nameClick = editable ? ` onclick="startEditChore('${chore.id}')"` : '';
      const assignedName = chore.assigned_to ? (membersById[chore.assigned_to] || 'Unbekannt') : null;
      const creatorName = chore.created_by ? (membersById[chore.created_by] || null) : null;
      const roomName = chore.room_id ? (roomsById[chore.room_id] || null) : null;
      const recurrenceLabel = formatRecurrence(chore.recurrence_interval_value, chore.recurrence_interval_unit);

      const urgency = chore.status === 'offen' ? getDueUrgency(chore.due_date) : null;
      const urgencyClass = urgency === 'overdue' ? 'chore-overdue' : (urgency === 'today' ? 'chore-due-today' : '');
      const urgencyLabel = urgency === 'overdue' ? ' (überfällig)' : (urgency === 'today' ? ' (heute fällig)' : '');

      const metaParts = [];
      if (assignedName) metaParts.push(`Zugewiesen: ${escapeHtml(assignedName)}`);
      if (roomName) metaParts.push(escapeHtml(roomName));
      if (creatorName) metaParts.push(`Erstellt von ${escapeHtml(creatorName)}`);
      if (recurrenceLabel) metaParts.push(recurrenceLabel);

      const completedName = chore.completed_by ? (membersById[chore.completed_by] || 'Unbekannt') : null;
      const completedDate = chore.completed_at ? formatTimestampDate(chore.completed_at) : null;
      const titel = escapeHtml(chore.title);
      // Markierung nur bei offenen Aufgaben -- an einer erledigten sagt sie
      // nichts mehr aus.
      const chip = chore.status === 'offen' ? prioritaetChip(chore.priority) : '';
      const titleLine = chore.status === 'erledigt'
        ? `${titel} – erledigt${completedDate ? ' am ' + completedDate : ''}${completedName ? ' von ' + escapeHtml(completedName) : ''}`
        : `${chip}${titel}${chore.due_date ? ` – fällig ${formatDueDate(chore.due_date)}${urgencyLabel}` : ''}`;
      const verschoben = chore.status === 'offen' && chore.verschoben_von
        ? `<br><small class="verschoben-hinweis">⏭ verschoben, eigentlich ${tagKurz(chore.verschoben_von)}</small>` : '';
      // Verschieben nur bei offenen Aufgaben mit Termin -- ohne Termin gibt es
      // nichts zu verschieben.
      const verschiebeKnopf = chore.status === 'offen' && chore.due_date
        ? `<button type="button" class="verschiebe-knopf" onclick="oeffneVerschieben('${chore.id}')" aria-label="${titel} verschieben" title="Verschieben">⏭</button>` : '';

      return `
        <li class="${urgencyClass}" style="${chore.status === 'erledigt' ? 'text-decoration: line-through; color: gray;' : ''}">
          <input type="checkbox" ${chore.status === 'erledigt' ? 'checked' : ''}
                 onchange="toggleChoreStatus('${chore.id}', this.checked)">
          <span class="${nameClass}"${nameClick}>
            ${titleLine}${verschoben}
            ${metaParts.length ? `<br><small class="store-address">${metaParts.join(' · ')}</small>` : ''}
          </span>
          ${verschiebeKnopf}
          <button type="button" class="loesch-knopf" onclick="deleteChore('${chore.id}')" aria-label="${titel} löschen" title="Löschen">🗑</button>
        </li>
      `;
    }

    function startEditChore(id) {
      editingChoreId = id;
      renderChores();
    }

    function cancelEditChore() {
      editingChoreId = null;
      renderChores();
    }

    async function saveEditChore(id) {
      const title = document.getElementById('edit-chore-title-' + id).value.trim();
      const dueDate = document.getElementById('edit-chore-due-' + id).value;
      const assignedTo = document.getElementById('edit-chore-assigned-' + id).value;
      const roomId = document.getElementById('edit-chore-room-' + id).value;
      const priority = document.getElementById('edit-chore-priority-' + id).value;
      const recurrenceValueRaw = document.getElementById('edit-chore-recurrence-value-' + id).value;
      const recurrenceUnitEl = document.getElementById('edit-chore-recurrence-unit-' + id);
      const recurrenceValue = recurrenceValueRaw ? parseInt(recurrenceValueRaw) : null;
      const recurrenceUnit = recurrenceValue ? recurrenceUnitEl.value : null;

      if (!title) return;

      // Wer das Datum von Hand ändert, legt den Rhythmus neu fest -- eine
      // offene Verschiebung ist damit erledigt.
      const vorher = allChores.find(c => c.id === id);
      const datumGeaendert = !vorher || (vorher.due_date || '') !== (dueDate || '');
      const { error } = await client
        .from('chores')
        .update({
          ...(datumGeaendert && vorher && vorher.verschoben_von ? { verschoben_von: null } : {}),
          title: title,
          due_date: dueDate || null,
          assigned_to: assignedTo || null,
          room_id: roomId || null,
          priority: priority,
          recurrence_interval_value: recurrenceValue,
          recurrence_interval_unit: recurrenceUnit
        })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingChoreId = null;
      loadChores();
    }

    // --- Verschieben -----------------------------------------------------
    //
    // Einmalig auf einen anderen Tag, ohne den Rhythmus zu ändern: due_date
    // bekommt den neuen Termin (Liste, Kachel und Push richten sich danach),
    // der ursprüngliche steht in verschoben_von. Der nächtliche Reset rechnet
    // von dort aus weiter (reset_due_recurring_chores). Wird zweimal
    // verschoben, bleibt der erste ursprüngliche Termin stehen. Einmalige
    // Aufgaben bekommen einfach ein neues Datum.
    let verschiebenId = null;

    const TAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    function tagKurz(datum) {
      const d = new Date(datum + 'T00:00:00');
      return `${TAGE_KURZ[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
    }

    function plusTage(datum, n) {
      const d = new Date(datum + 'T00:00:00');
      d.setDate(d.getDate() + n);
      return datumStr(d);
    }

    function plusIntervall(datum, wert, einheit) {
      const d = new Date(datum + 'T00:00:00');
      if (einheit === 'tag') d.setDate(d.getDate() + wert);
      else if (einheit === 'woche') d.setDate(d.getDate() + 7 * wert);
      else if (einheit === 'monat') d.setMonth(d.getMonth() + wert);
      else if (einheit === 'jahr') d.setFullYear(d.getFullYear() + wert);
      return datumStr(d);
    }

    // Wann es nach dem verschobenen Termin weitergeht: der erste Termin im
    // alten Rhythmus nach dem neuen Datum -- so rechnet auch der Reset.
    function naechsterImRhythmus(chore, neu) {
      const wert = chore.recurrence_interval_value, einheit = chore.recurrence_interval_unit;
      if (!wert || !einheit) return null;
      let d = plusIntervall(chore.verschoben_von || chore.due_date, wert, einheit);
      for (let i = 0; i < 1000 && d <= neu; i++) d = plusIntervall(d, wert, einheit);
      return d;
    }

    function verschiebenVorschlaege(chore) {
      const heute = datumStr(new Date());
      const ab = chore.due_date > heute ? chore.due_date : heute;
      const kandidaten = [plusTage(ab, 1), plusTage(ab, 2), plusTage(ab, 3)];
      // Der nächste Montag: der häufigste Fall nach einem Wochenende weg.
      const d = new Date(ab + 'T00:00:00');
      kandidaten.push(plusTage(ab, ((8 - d.getDay()) % 7) || 7));
      return [...new Set(kandidaten)].sort();
    }

    function oeffneVerschieben(id) {
      const chore = allChores.find(c => c.id === id);
      if (!chore || !chore.due_date) return;
      verschiebenId = id;
      const heute = datumStr(new Date());
      const morgen = plusTage(heute, 1);
      const vorschlaege = verschiebenVorschlaege(chore);
      const recurrence = formatRecurrence(chore.recurrence_interval_value, chore.recurrence_interval_unit);
      const faellig = chore.due_date === heute ? 'fällig heute' : `fällig ${tagKurz(chore.due_date)}`;
      document.getElementById('verschieben-unterzeile').textContent =
        [chore.title, faellig, recurrence].filter(Boolean).join(' · ');
      document.getElementById('verschieben-chips').innerHTML = vorschlaege.map((t, i) =>
        `<button type="button" class="karte-pille${i === 0 ? ' aktiv' : ''}" data-datum="${t}" onclick="waehleVerschieben(this)">${t === morgen ? 'Morgen' : tagKurz(t)}</button>`
      ).join('') + `<button type="button" class="karte-pille verschieben-mehr" onclick="zeigeVerschiebenDatum()">Datum …</button>`;
      const feld = document.getElementById('verschieben-datum');
      feld.style.display = 'none';
      feld.min = plusTage(heute, 0);
      feld.value = '';
      document.getElementById('verschieben-aufheben').style.display = chore.verschoben_von ? 'block' : 'none';
      document.getElementById('verschieben-aufheben').textContent = chore.verschoben_von
        ? `Verschiebung aufheben (zurück auf ${tagKurz(chore.verschoben_von)})` : '';
      document.getElementById('verschieben-status').textContent = '';
      setzeVerschiebenZiel(vorschlaege[0]);
      history.pushState({ nest: 'aufgaben', verschieben: true }, '');
      document.getElementById('verschieben-karte').style.display = 'block';
      document.body.classList.add('karte-offen');
    }

    function verschiebenOffen() { return verschiebenId !== null; }

    // Schließt die Karte ohne Verlaufsschritt -- aufgerufen aus zeigeAnsicht,
    // wenn die Zurück-Taste den Eintrag der Karte schon verlassen hat.
    function verschiebenAusblenden() {
      verschiebenId = null;
      document.getElementById('verschieben-karte').style.display = 'none';
      document.body.classList.remove('karte-offen');
    }

    function schliesseVerschieben() {
      if (history.state && history.state.verschieben) history.back();
      else verschiebenAusblenden();
    }

    function setzeVerschiebenZiel(datum) {
      const chore = allChores.find(c => c.id === verschiebenId);
      if (!chore) return;
      document.getElementById('verschieben-karte').dataset.ziel = datum;
      document.getElementById('verschieben-los').textContent = `Auf ${tagKurz(datum)} verschieben`;
      const danach = naechsterImRhythmus(chore, datum);
      document.getElementById('verschieben-info').innerHTML = danach
        ? `Nur dieses Mal. Danach geht es im alten Rhythmus weiter: <b>${tagKurz(danach)}</b>`
        : 'Einmalige Aufgabe: Sie bekommt einfach den neuen Termin.';
    }

    function waehleVerschieben(knopf) {
      document.querySelectorAll('#verschieben-chips .karte-pille').forEach(b => b.classList.toggle('aktiv', b === knopf));
      document.getElementById('verschieben-datum').style.display = 'none';
      setzeVerschiebenZiel(knopf.dataset.datum);
    }

    function zeigeVerschiebenDatum() {
      const feld = document.getElementById('verschieben-datum');
      feld.style.display = 'block';
      feld.focus();
      if (typeof feld.showPicker === 'function') { try { feld.showPicker(); } catch (e) { /* nicht überall erlaubt */ } }
    }

    function waehleVerschiebenDatum(feld) {
      if (!feld.value) return;
      const mehr = document.querySelector('#verschieben-chips .verschieben-mehr');
      document.querySelectorAll('#verschieben-chips .karte-pille').forEach(b => b.classList.toggle('aktiv', b === mehr));
      mehr.textContent = tagKurz(feld.value);
      setzeVerschiebenZiel(feld.value);
    }

    async function verschiebeAufgabe() {
      const chore = allChores.find(c => c.id === verschiebenId);
      const ziel = document.getElementById('verschieben-karte').dataset.ziel;
      const statusEl = document.getElementById('verschieben-status');
      if (!chore || !ziel) return;
      if (ziel < datumStr(new Date())) { statusEl.textContent = 'Das Datum liegt in der Vergangenheit.'; return; }
      const wiederkehrend = !!chore.recurrence_interval_value;
      const aenderung = { due_date: ziel };
      if (wiederkehrend) {
        // Zurück auf den ursprünglichen Tag heißt: nicht mehr verschoben.
        const ursprung = chore.verschoben_von || chore.due_date;
        aenderung.verschoben_von = ziel === ursprung ? null : ursprung;
      }
      const { error } = await client.from('chores').update(aenderung).eq('id', chore.id);
      if (error) {
        console.error("Fehler beim Verschieben:", error);
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }
      schliesseVerschieben();
      loadChores();
    }

    async function verschiebungAufheben() {
      const chore = allChores.find(c => c.id === verschiebenId);
      if (!chore || !chore.verschoben_von) return;
      const { error } = await client.from('chores')
        .update({ due_date: chore.verschoben_von, verschoben_von: null }).eq('id', chore.id);
      if (error) {
        document.getElementById('verschieben-status').textContent = "Fehler: " + error.message;
        return;
      }
      schliesseVerschieben();
      loadChores();
    }

    async function toggleChoreStatus(id, isChecked) {
      const neuerStatus = isChecked ? 'erledigt' : 'offen';
      const { error } = await client.from('chores').update({ status: neuerStatus }).eq('id', id);
      if (error) {
        console.error("Fehler beim Ändern:", error);
        return;
      }
      loadChores();
    }

    async function deleteChore(id) {
      const chore = allChores.find(c => c.id === id);
      const title = chore ? chore.title : "diese Aufgabe";
      if (!confirm(`"${title}" wirklich löschen?`)) {
        return;
      }
      const { error } = await client.from('chores').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      loadChores();
    }

    async function addChore() {
      const titleEl = document.getElementById('chore-title');
      const dueEl = document.getElementById('chore-due-date');
      const assignedEl = document.getElementById('chore-assigned-to');
      const roomEl = document.getElementById('chore-room');
      const priorityEl = document.getElementById('chore-priority');
      const recurrenceValueEl = document.getElementById('chore-recurrence-value');
      const recurrenceUnitEl = document.getElementById('chore-recurrence-unit');
      const statusEl = document.getElementById('chore-add-status');
      const title = titleEl.value.trim();

      if (!title) {
        statusEl.textContent = "Bitte einen Titel eingeben.";
        return;
      }

      const { data: { user } } = await client.auth.getUser();
      const recurrenceValue = recurrenceValueEl.value ? parseInt(recurrenceValueEl.value) : null;
      const recurrenceUnit = recurrenceValue ? recurrenceUnitEl.value : null;

      const { error } = await client.from('chores').insert({
        household_id: currentHouseholdId,
        title: title,
        due_date: dueEl.value || null,
        assigned_to: assignedEl.value || null,
        room_id: roomEl.value || null,
        priority: priorityEl.value,
        recurrence_interval_value: recurrenceValue,
        recurrence_interval_unit: recurrenceUnit,
        created_by: user.id
      });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + title + "\" hinzugefügt!";
        titleEl.value = "";
        dueEl.value = "";
        roomEl.value = "";
        priorityEl.value = "normal";
        recurrenceValueEl.value = "";
        recurrenceUnitEl.value = "woche";
        loadChores();
      }
    }

    // ---- Bilder: einmal gebaut, später auch für Profilbild und Laden-Logo ----
