// Pflanzen und ihre Pflege-Erinnerungen.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const CARE_TYPE_LABELS = { giessen: 'Gießen', duengen: 'Düngen', umtopfen: 'Umtopfen' };
    // Verbform für die Aufgabenliste ("Basilikum gießen"). Dieselben Wörter
    // benutzt auch die Push-Benachrichtigung.
    const CARE_TYPE_VERBEN = { giessen: 'gießen', duengen: 'düngen', umtopfen: 'umtopfen' };
    const CARE_TYPES = ['giessen', 'duengen', 'umtopfen'];

    let allPlants = [];
    let plantsById = {};
    let editingPlantId = null;

    async function loadPlants() {
      const { data, error } = await client
        .from('plants')
        .select('*')
        .order('name');

      if (error) {
        console.error("Fehler beim Laden der Pflanzen:", error);
        return;
      }

      allPlants = data;
      plantsById = {};
      data.forEach(plant => { plantsById[plant.id] = plant; });

      await loadCareTasks();
    }

    function togglePlantAddForm() {
      const formEl = document.getElementById('plant-add-form');
      const istOffen = formEl.style.display !== 'none';
      formEl.style.display = istOffen ? 'none' : 'block';
      document.getElementById('toggle-plant-add-link').textContent = istOffen ? "+ Pflanze hinzufügen" : "– Formular schließen";
    }

    async function addPlant() {
      const nameEl = document.getElementById('plant-name');
      const speciesEl = document.getElementById('plant-species');
      const roomEl = document.getElementById('plant-room');
      const notesEl = document.getElementById('plant-notes');
      const bildEl = document.getElementById('plant-image');
      const statusEl = document.getElementById('plant-add-status');
      const name = nameEl.value.trim();
      const species = speciesEl.value.trim();
      const notes = notesEl.value.trim();

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      let imagePath = null;
      if (bildEl.files && bildEl.files[0]) {
        statusEl.textContent = "Foto wird verkleinert und hochgeladen …";
        try {
          imagePath = await ladeBildHoch(bildEl.files[0], pflanzenBildOrdner());
        } catch (err) {
          statusEl.textContent = "Foto konnte nicht hochgeladen werden: " + err.message;
          return;
        }
      }

      const { data: { user } } = await client.auth.getUser();

      const { error } = await client.from('plants').insert({
        household_id: currentHouseholdId,
        name: name,
        species: species || null,
        notes: notes || null,
        room_id: roomEl.value || null,
        image_path: imagePath,
        created_by: user.id
      });

      if (error) {
        // Bild wieder wegräumen, sonst liegt es ohne zugehörige Pflanze herum.
        await loescheBild(imagePath);
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + name + "\" hinzugefügt!";
        nameEl.value = "";
        speciesEl.value = "";
        notesEl.value = "";
        roomEl.value = "";
        bildEl.value = "";
        zeigeBildVorschau(bildEl, 'plant-image-preview');
        loadPlants();
      }
    }

    function startEditPlant(id) {
      editingPlantId = id;
      renderPlantList();
    }

    function cancelEditPlant() {
      editingPlantId = null;
      renderPlantList();
    }

    async function saveEditPlant(id) {
      const name = document.getElementById('edit-plant-name-' + id).value.trim();
      const species = document.getElementById('edit-plant-species-' + id).value.trim();
      const notes = document.getElementById('edit-plant-notes-' + id).value.trim();
      const roomId = document.getElementById('edit-plant-room-' + id).value;
      if (!name) return;

      const plant = plantsById[id];
      const bildEl = document.getElementById('edit-plant-image-' + id);
      const entfernenEl = document.getElementById('edit-plant-image-remove-' + id);

      let imagePath = plant ? plant.image_path : null;
      // Das alte Bild erst löschen, wenn das Speichern geklappt hat.
      let altesBild = null;

      if (bildEl && bildEl.files && bildEl.files[0]) {
        try {
          imagePath = await ladeBildHoch(bildEl.files[0], pflanzenBildOrdner());
          altesBild = plant ? plant.image_path : null;
        } catch (err) {
          alert("Foto konnte nicht hochgeladen werden: " + err.message);
          return;
        }
      } else if (entfernenEl && entfernenEl.checked) {
        altesBild = imagePath;
        imagePath = null;
      }

      const { error } = await client
        .from('plants')
        .update({
          name: name,
          species: species || null,
          notes: notes || null,
          room_id: roomId || null,
          image_path: imagePath
        })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Speichern:", error);
        // Das gerade hochgeladene Bild wird sonst nie verwendet.
        if (altesBild !== null && imagePath !== (plant ? plant.image_path : null)) {
          await loescheBild(imagePath);
        }
        return;
      }

      await loescheBild(altesBild);
      editingPlantId = null;
      loadPlants();
    }

    async function deletePlant(id) {
      const plant = plantsById[id];
      const name = plant ? plant.name : "diese Pflanze";
      if (!confirm(`"${name}" wirklich löschen? Zugehörige Pflege-Erinnerungen werden mitgelöscht.`)) {
        return;
      }
      const { error } = await client.from('plants').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      // Die Pflege-Erinnerungen räumt die Datenbank selbst ab, das Bild nicht.
      await loescheBild(plant ? plant.image_path : null);
      loadPlants();
      loadCareTasks();
    }

    function renderPlantList() {
      const listEl = document.getElementById('plant-list');
      if (!listEl) return;
      listEl.innerHTML = allPlants.length
        ? allPlants.map(renderPlant).join('')
        : '<li class="store-address" style="box-shadow:none; background:none;">Noch keine Pflanzen angelegt.</li>';
    }

    function renderPlant(plant) {
      if (plant.id === editingPlantId) {
        return `
          <li class="editing plant-card">
            <input type="text" id="edit-plant-name-${plant.id}" value="${escapeHtml(plant.name)}" placeholder="Name">
            <input type="text" id="edit-plant-species-${plant.id}" value="${escapeHtml(plant.species || '')}" placeholder="Art (optional)">
            <select id="edit-plant-room-${plant.id}">${roomOptions(plant.room_id)}</select>
            <textarea id="edit-plant-notes-${plant.id}" rows="3" placeholder="Pflegehinweise (optional)">${escapeHtml(plant.notes || '')}</textarea>
            ${plant.image_path ? `
              <img class="bild-vorschau" src="${bildUrl(plant.image_path)}" alt="">
              <p><label><input type="checkbox" id="edit-plant-image-remove-${plant.id}"> Foto entfernen</label></p>
            ` : ''}
            <label class="feld-label" for="edit-plant-image-${plant.id}">${plant.image_path ? 'Foto ersetzen' : 'Foto hinzufügen'}</label>
            <input type="file" id="edit-plant-image-${plant.id}" accept="image/*">
            <div class="edit-actions">
              <button onclick="saveEditPlant('${plant.id}')">Speichern</button>
              <button onclick="cancelEditPlant()">Abbrechen</button>
            </div>
          </li>
        `;
      }

      const roomName = plant.room_id ? (roomsById[plant.room_id] || null) : null;
      const searchQuery = encodeURIComponent(((plant.species && plant.species.trim()) ? plant.species : plant.name) + ' pflege');
      const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
      const tasksHtml = CARE_TYPES.map(type => renderCareTaskSlot(plant.id, type)).join('');

      const bild = bildUrl(plant.image_path);

      return `
        <li class="plant-card" id="plant-${plant.id}">
          <div class="plant-kopf">
            ${bild ? `<img class="plant-bild" src="${bild}" alt="" loading="lazy">` : ''}
            <span class="item-name clickable" onclick="startEditPlant('${plant.id}')">
              ${escapeHtml(plant.name)}
              ${plant.species ? `<br><small class="store-address">${escapeHtml(plant.species)}</small>` : ''}
              ${roomName ? `<br><small class="store-address">${escapeHtml(roomName)}</small>` : ''}
            </span>
          </div>
          ${plant.notes ? `<p class="plant-notiz">${escapeHtml(plant.notes)}</p>` : ''}
          <p><a href="${searchUrl}" target="_blank" rel="noopener">Pflege-Infos suchen ↗</a></p>
          <div class="plant-care-tasks">${tasksHtml}</div>
          <button onclick="deletePlant('${plant.id}')">löschen</button>
        </li>
      `;
    }

    let allCareTasks = [];
    let careTasksByPlant = {};
    let editingCareTaskId = null;
    let addingCareTaskFor = null;

    async function loadCareTasks() {
      const { data, error } = await client
        .from('plant_care_tasks')
        .select('*');

      if (error) {
        console.error("Fehler beim Laden der Pflege-Aufgaben:", error);
        return;
      }

      allCareTasks = data;
      careTasksByPlant = {};
      data.forEach(task => {
        if (!careTasksByPlant[task.plant_id]) careTasksByPlant[task.plant_id] = {};
        careTasksByPlant[task.plant_id][task.type] = task;
      });

      renderPlantList();
      // Die Aufgabenliste zeigt die fälligen Pflege-Einträge mit an und muss
      // deshalb ebenfalls nachziehen -- auch beim ersten Laden, wo sie unter
      // Umständen schon fertig gerendert war, bevor die Pflege da ist.
      renderChores();
    }

    function startAddCareTask(plantId, type) {
      addingCareTaskFor = { plantId, type };
      renderPlantList();
    }

    function cancelAddCareTask() {
      addingCareTaskFor = null;
      renderPlantList();
    }

    async function addCareTask(plantId, type) {
      const dueEl = document.getElementById(`new-care-due-${plantId}-${type}`);
      const assignedEl = document.getElementById(`new-care-assigned-${plantId}-${type}`);
      const recurrenceValueEl = document.getElementById(`new-care-recurrence-value-${plantId}-${type}`);
      const recurrenceUnitEl = document.getElementById(`new-care-recurrence-unit-${plantId}-${type}`);

      const { data: { user } } = await client.auth.getUser();
      const recurrenceValue = recurrenceValueEl.value ? parseInt(recurrenceValueEl.value) : null;
      const recurrenceUnit = recurrenceValue ? recurrenceUnitEl.value : null;

      const { error } = await client.from('plant_care_tasks').insert({
        plant_id: plantId,
        household_id: currentHouseholdId,
        type: type,
        due_date: dueEl.value || null,
        assigned_to: assignedEl.value || null,
        recurrence_interval_value: recurrenceValue,
        recurrence_interval_unit: recurrenceUnit,
        created_by: user.id
      });

      if (error) {
        alert("Fehler: " + error.message);
        return;
      }
      addingCareTaskFor = null;
      loadCareTasks();
    }

    function startEditCareTask(id) {
      editingCareTaskId = id;
      renderPlantList();
    }

    function cancelEditCareTask() {
      editingCareTaskId = null;
      renderPlantList();
    }

    async function saveEditCareTask(id) {
      const dueDate = document.getElementById('edit-care-due-' + id).value;
      const assignedTo = document.getElementById('edit-care-assigned-' + id).value;
      const recurrenceValueRaw = document.getElementById('edit-care-recurrence-value-' + id).value;
      const recurrenceUnitEl = document.getElementById('edit-care-recurrence-unit-' + id);
      const recurrenceValue = recurrenceValueRaw ? parseInt(recurrenceValueRaw) : null;
      const recurrenceUnit = recurrenceValue ? recurrenceUnitEl.value : null;

      const { error } = await client
        .from('plant_care_tasks')
        .update({
          due_date: dueDate || null,
          assigned_to: assignedTo || null,
          recurrence_interval_value: recurrenceValue,
          recurrence_interval_unit: recurrenceUnit
        })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingCareTaskId = null;
      loadCareTasks();
    }

    async function toggleCareTaskStatus(id, isChecked) {
      const neuerStatus = isChecked ? 'erledigt' : 'offen';
      const { error } = await client.from('plant_care_tasks').update({ status: neuerStatus }).eq('id', id);
      if (error) {
        console.error("Fehler beim Ändern:", error);
        return;
      }
      loadCareTasks();
    }

    async function deleteCareTask(id) {
      if (!confirm("Diese Pflege-Erinnerung wirklich entfernen?")) {
        return;
      }
      const { error } = await client.from('plant_care_tasks').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      loadCareTasks();
    }

    // --- Fällige Pflege in der Aufgabenliste -------------------------------
    //
    // Bewusst nur die Anzeige zusammengeführt, nicht die Daten: Pflege bleibt
    // in ihrer eigenen Tabelle und wird weiterhin im Pflanzen-Bereich
    // bearbeitet. Hier stehen nur die Einträge, die tatsächlich anstehen --
    // sonst würden zwanzig Pflanzen mit je drei Pflegearten die echten
    // Aufgaben zuschütten.
    function faelligePflegeEintraege() {
      const eigeneId = currentSession ? currentSession.user.id : null;
      const nurMeine = choreViewFilter === 'meine';

      return allCareTasks
        .filter(task => {
          if (nurMeine && task.assigned_to !== eigeneId) return false;
          // Heute Erledigtes bleibt bis Mitternacht stehen: das Abhaken soll
          // eine sichtbare Quittung haben und der Eintrag nicht wortlos
          // verschwinden.
          if (task.status === 'erledigt') return istHeute(task.completed_at);
          return istInnerhalbVorlauf(task.due_date, task.recurrence_interval_value, task.recurrence_interval_unit);
        })
        .map(task => ({
          due_date: task.due_date,
          priority: 'normal',
          status: task.status,
          completed_at: task.completed_at,
          html: renderPflegeEintrag(task)
        }));
    }

    function renderPflegeEintrag(task) {
      const plant = plantsById[task.plant_id];
      const titel = escapeHtml((plant ? plant.name : 'Pflanze') + ' ' + (CARE_TYPE_VERBEN[task.type] || task.type));
      const assignedName = task.assigned_to ? (membersById[task.assigned_to] || 'Unbekannt') : null;
      const roomName = (plant && plant.room_id) ? (roomsById[plant.room_id] || null) : null;
      const recurrenceLabel = formatRecurrence(task.recurrence_interval_value, task.recurrence_interval_unit);

      const urgency = task.status === 'offen' ? getDueUrgency(task.due_date) : null;
      const urgencyClass = urgency === 'overdue' ? 'chore-overdue' : (urgency === 'today' ? 'chore-due-today' : '');
      const urgencyLabel = urgency === 'overdue' ? ' (überfällig)' : (urgency === 'today' ? ' (heute fällig)' : '');

      const metaParts = ['Pflanzenpflege'];
      if (assignedName) metaParts.push(`Zugewiesen: ${escapeHtml(assignedName)}`);
      if (roomName) metaParts.push(escapeHtml(roomName));
      if (recurrenceLabel) metaParts.push(recurrenceLabel);

      const completedName = task.completed_by ? (membersById[task.completed_by] || 'Unbekannt') : null;
      const completedDate = task.completed_at ? formatTimestampDate(task.completed_at) : null;

      const titleLine = task.status === 'erledigt'
        ? `${titel} – erledigt${completedDate ? ' am ' + completedDate : ''}${completedName ? ' von ' + escapeHtml(completedName) : ''}`
        : `${titel}${task.due_date ? ` – fällig ${formatDueDate(task.due_date)}${urgencyLabel}` : ''}`;

      // Kein Bearbeiten- und kein Löschen-Knopf: beides bleibt im
      // Pflanzen-Bereich. Ein Klick springt stattdessen dorthin, statt
      // dasselbe Formular ein zweites Mal zu bauen.
      return `
        <li class="pflege-eintrag ${urgencyClass}" style="${task.status === 'erledigt' ? 'text-decoration: line-through; color: gray;' : ''}">
          <input type="checkbox" ${task.status === 'erledigt' ? 'checked' : ''}
                 onchange="toggleCareTaskStatus('${task.id}', this.checked)">
          <span class="item-name clickable" onclick="springeZuPflanze('${task.plant_id}')">
            ${titleLine}
            <br><small class="store-address">${metaParts.join(' · ')}</small>
          </span>
        </li>
      `;
    }

    function springeZuPflanze(plantId) {
      showTab('pflanzen');
      const el = document.getElementById('plant-' + plantId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderCareTaskEditForm(task) {
      const label = CARE_TYPE_LABELS[task.type];
      return `
        <div class="care-task editing">
          <strong>${label}</strong>
          <input type="date" id="edit-care-due-${task.id}" value="${task.due_date || ''}">
          <select id="edit-care-assigned-${task.id}">${memberOptions(task.assigned_to)}</select>
          <div class="recurrence-fields">
            <input type="number" id="edit-care-recurrence-value-${task.id}" placeholder="Wiederholt sich alle …" min="1"
                   value="${task.recurrence_interval_value || ''}">
            <select id="edit-care-recurrence-unit-${task.id}">
              ${recurrenceUnitOptions(task.recurrence_interval_unit || 'woche')}
            </select>
          </div>
          <div class="edit-actions">
            <button onclick="saveEditCareTask('${task.id}')">Speichern</button>
            <button onclick="cancelEditCareTask()">Abbrechen</button>
          </div>
        </div>
      `;
    }

    function renderCareTaskSlot(plantId, type) {
      const task = (careTasksByPlant[plantId] || {})[type];
      const label = CARE_TYPE_LABELS[type];

      if (!task) {
        if (addingCareTaskFor && addingCareTaskFor.plantId === plantId && addingCareTaskFor.type === type) {
          return `
            <div class="care-task editing">
              <strong>${label}</strong>
              <input type="date" id="new-care-due-${plantId}-${type}">
              <select id="new-care-assigned-${plantId}-${type}">${memberOptions(null)}</select>
              <div class="recurrence-fields">
                <input type="number" id="new-care-recurrence-value-${plantId}-${type}" placeholder="Wiederholt sich alle …" min="1">
                <select id="new-care-recurrence-unit-${plantId}-${type}">${recurrenceUnitOptions('woche')}</select>
              </div>
              <div class="edit-actions">
                <button onclick="addCareTask('${plantId}', '${type}')">Hinzufügen</button>
                <button onclick="cancelAddCareTask()">Abbrechen</button>
              </div>
            </div>
          `;
        }
        return `<button class="care-task-add-btn" onclick="startAddCareTask('${plantId}', '${type}')">+ ${label}</button>`;
      }

      if (task.id === editingCareTaskId) {
        return renderCareTaskEditForm(task);
      }

      const assignedName = task.assigned_to ? (membersById[task.assigned_to] || 'Unbekannt') : null;
      const recurrenceLabel = formatRecurrence(task.recurrence_interval_value, task.recurrence_interval_unit);
      const urgency = task.status === 'offen' ? getDueUrgency(task.due_date) : null;
      const urgencyClass = urgency === 'overdue' ? 'chore-overdue' : (urgency === 'today' ? 'chore-due-today' : '');
      const urgencyLabel = urgency === 'overdue' ? ' (überfällig)' : (urgency === 'today' ? ' (heute fällig)' : '');

      const metaParts = [];
      if (assignedName) metaParts.push(`Zugewiesen: ${escapeHtml(assignedName)}`);
      if (recurrenceLabel) metaParts.push(recurrenceLabel);

      // Wie bei den Aufgaben: erledigte Pflege zeigt Zeitpunkt und Person
      // statt des Faelligkeitsdatums.
      const completedName = task.completed_by ? (membersById[task.completed_by] || 'Unbekannt') : null;
      const completedDate = task.completed_at ? formatTimestampDate(task.completed_at) : null;
      const statusLine = task.status === 'erledigt'
        ? ` – erledigt${completedDate ? ' am ' + completedDate : ''}${completedName ? ' von ' + escapeHtml(completedName) : ''}`
        : (task.due_date ? ` – fällig ${formatDueDate(task.due_date)}${urgencyLabel}` : '');

      return `
        <div class="care-task ${urgencyClass}" style="${task.status === 'erledigt' ? 'text-decoration: line-through; color: gray;' : ''}">
          <input type="checkbox" ${task.status === 'erledigt' ? 'checked' : ''}
                 onchange="toggleCareTaskStatus('${task.id}', this.checked)">
          <span class="item-name clickable" onclick="startEditCareTask('${task.id}')">
            ${label}${statusLine}
            ${metaParts.length ? `<br><small class="store-address">${metaParts.join(' · ')}</small>` : ''}
          </span>
          <button onclick="deleteCareTask('${task.id}')">entfernen</button>
        </div>
      `;
    }
