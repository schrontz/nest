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
      const offen = sichtbar.filter(c => c.status === 'offen').sort((a, b) => {
        if (a.due_date && b.due_date && a.due_date !== b.due_date) {
          return a.due_date.localeCompare(b.due_date);
        }
        if (!a.due_date && b.due_date) return 1;
        if (a.due_date && !b.due_date) return -1;
        return prioritaetRang(b.priority) - prioritaetRang(a.priority);
      });
      const erledigt = sichtbar.filter(c => c.status === 'erledigt').sort((a, b) =>
        (b.completed_at || '').localeCompare(a.completed_at || '')
      );

      const combined = offen.concat(erledigt);

      document.getElementById('chore-list').innerHTML = combined.length
        ? combined.map(renderChore).join('')
        : '<p class="store-address">Keine Aufgaben.</p>';
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

      return `
        <li class="${urgencyClass}" style="${chore.status === 'erledigt' ? 'text-decoration: line-through; color: gray;' : ''}">
          <input type="checkbox" ${chore.status === 'erledigt' ? 'checked' : ''}
                 onchange="toggleChoreStatus('${chore.id}', this.checked)">
          <span class="${nameClass}"${nameClick}>
            ${titleLine}
            ${metaParts.length ? `<br><small class="store-address">${metaParts.join(' · ')}</small>` : ''}
          </span>
          <button onclick="deleteChore('${chore.id}')">löschen</button>
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

      const { error } = await client
        .from('chores')
        .update({
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
    }

    async function toggleChoreStatus(id, isChecked) {
      const neuerStatus = isChecked ? 'erledigt' : 'offen';
      const { error } = await client.from('chores').update({ status: neuerStatus }).eq('id', id);
      if (error) console.error("Fehler beim Ändern:", error);
    }

    async function deleteChore(id) {
      const chore = allChores.find(c => c.id === id);
      const title = chore ? chore.title : "diese Aufgabe";
      if (!confirm(`"${title}" wirklich löschen?`)) {
        return;
      }
      const { error } = await client.from('chores').delete().eq('id', id);
      if (error) console.error("Fehler beim Löschen:", error);
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
      }
    }

    // ---- Bilder: einmal gebaut, später auch für Profilbild und Laden-Logo ----
