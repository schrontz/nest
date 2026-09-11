// Haushalt: anlegen und beitreten, Name, Mitglieder, Zimmer, eigenes Profil.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    let allRooms = [];
    let roomsById = {};
    let editingRoomId = null;

    async function loadRooms() {
      const { data, error } = await client
        .from('rooms')
        .select('*')
        .order('name');

      if (error) {
        console.error("Fehler beim Laden der Zimmer:", error);
        return;
      }

      allRooms = data;
      roomsById = {};
      data.forEach(room => { roomsById[room.id] = room.name; });

      renderRoomList();

      ['plant-room', 'chore-room'].forEach(elId => {
        const selectEl = document.getElementById(elId);
        if (!selectEl) return;
        const bisherigeAuswahl = selectEl.value;
        selectEl.innerHTML = '<option value="">– kein Zimmer –</option>' +
          data.map(room => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('');
        selectEl.value = bisherigeAuswahl;
      });

      renderPlantList();
      // Aufgaben zeigen den Zimmernamen ebenfalls an -- ohne das hier bliebe
      // dort nach einer Umbenennung der alte Name stehen.
      renderChores();
    }

    function renderRoomList() {
      document.getElementById('room-list').innerHTML = allRooms.map(renderRoomItem).join('');
    }

    function renderRoomItem(room) {
      if (room.id === editingRoomId) {
        return `
          <li class="editing">
            <input type="text" id="edit-room-name-${room.id}" value="${escapeHtml(room.name)}">
            <div class="edit-actions">
              <button onclick="saveEditRoom('${room.id}')">Speichern</button>
              <button onclick="cancelEditRoom()">Abbrechen</button>
            </div>
          </li>
        `;
      }
      return `
        <li>
          <span class="item-name clickable" onclick="startEditRoom('${room.id}')">${escapeHtml(room.name)}</span>
          <button onclick="deleteRoom('${room.id}')">löschen</button>
        </li>
      `;
    }

    function startEditRoom(id) {
      editingRoomId = id;
      renderRoomList();
    }

    function cancelEditRoom() {
      editingRoomId = null;
      renderRoomList();
    }

    async function saveEditRoom(id) {
      const nameEl = document.getElementById('edit-room-name-' + id);
      const name = nameEl.value.trim();
      if (!name) return;

      const { error } = await client.from('rooms').update({ name: name }).eq('id', id);
      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingRoomId = null;
      loadRooms();
    }

    async function deleteRoom(id) {
      const room = roomsById[id] || "dieses Zimmer";
      if (!confirm(`"${room}" wirklich löschen? Zugeordnete Pflanzen verlieren dann ihre Zimmer-Zuordnung.`)) {
        return;
      }
      const { error } = await client.from('rooms').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      loadRooms();
    }

    async function addRoom() {
      const nameEl = document.getElementById('room-name');
      const name = nameEl.value.trim();
      const statusEl = document.getElementById('room-status');

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      const { error } = await client.from('rooms').insert({
        household_id: currentHouseholdId,
        name: name
      });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + name + "\" hinzugefügt!";
        nameEl.value = "";
        loadRooms();
      }
    }

    function roomOptions(selectedId) {
      const leer = `<option value="">– kein Zimmer –</option>`;
      const optionen = allRooms.map(room =>
        `<option value="${room.id}" ${room.id === selectedId ? 'selected' : ''}>${escapeHtml(room.name)}</option>`
      ).join('');
      return leer + optionen;
    }

    // Die Tabs stehen bewusst nur an dieser einen Stelle. Vorher zählte jede
    // Funktion sie einzeln auf – beim Hinzufügen der Pflanzen wurde
    // showSettings() dabei übersehen, sodass der Pflanzenbereich unter den
    // Einstellungen sichtbar blieb.
    async function createHousehold() {
      const nameEl = document.getElementById('new-household-name');
      const name = nameEl.value.trim();
      const statusEl = document.getElementById('create-household-status');

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      const { data, error } = await client.rpc('create_household', { household_name: name });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }

      currentHouseholdId = data[0].id;
      showApp(currentSession);
    }

    async function joinHousehold() {
      const codeEl = document.getElementById('join-code-input');
      const code = codeEl.value.trim();
      const statusEl = document.getElementById('join-household-status');

      if (!code) {
        statusEl.textContent = "Bitte einen Code eingeben.";
        return;
      }

      const { data, error } = await client.rpc('join_household_by_code', { code: code });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }

      currentHouseholdId = data;
      showApp(currentSession);
    }

    let currentHousehold = null;

    async function loadHousehold() {
      const { data, error } = await client
        .from('households')
        .select('*')
        .eq('id', currentHouseholdId)
        .single();

      if (error) {
        console.error("Fehler beim Laden des Haushalts:", error);
        return;
      }

      currentHousehold = data;
      renderHousehold();
    }

    function renderHousehold() {
      document.getElementById('household-name-display').textContent = currentHousehold.name;
      document.getElementById('household-join-code').textContent = currentHousehold.join_code;
    }

    function startEditHousehold() {
      document.getElementById('household-name-input').value = currentHousehold.name;
      document.getElementById('household-edit-form').style.display = 'block';
    }

    function cancelEditHousehold() {
      document.getElementById('household-edit-form').style.display = 'none';
    }

    async function regenerateJoinCode() {
      if (!confirm("Neuen Beitritts-Code erzeugen? Der alte Code funktioniert danach nicht mehr.")) {
        return;
      }

      const { error } = await client.rpc('regenerate_join_code', { target_household_id: currentHouseholdId });

      if (error) {
        alert("Fehler: " + error.message);
        return;
      }
      loadHousehold();
    }

    async function saveHouseholdName() {
      const name = document.getElementById('household-name-input').value.trim();
      if (!name) return;

      const { error } = await client.from('households').update({ name: name }).eq('id', currentHouseholdId);
      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      document.getElementById('household-edit-form').style.display = 'none';
      loadHousehold();
    }

    let householdMembers = [];
    let membersById = {};

    async function loadHouseholdMembers() {
      const { data, error } = await client.rpc('get_household_members', { target_household_id: currentHouseholdId });
      if (error) {
        console.error("Fehler beim Laden der Haushaltsmitglieder:", error);
        return;
      }

      householdMembers = data;
      membersById = {};
      data.forEach(m => { membersById[m.user_id] = memberLabel(m); });

      const selectEl = document.getElementById('chore-assigned-to');
      const bisherigeAuswahl = selectEl.value;
      selectEl.innerHTML = memberOptions(null);
      selectEl.value = bisherigeAuswahl;

      updateOwnProfileUI();
      renderHouseholdMemberList();
    }

    function renderHouseholdMemberList() {
      const listEl = document.getElementById('household-member-list');
      if (!listEl) return;
      const selfId = currentSession ? currentSession.user.id : null;

      listEl.innerHTML = householdMembers.map(m => {
        const bild = bildUrl(m.avatar_path);
        return `
        <li>
          ${bild
            ? `<img class="avatar" src="${bild}" alt="" loading="lazy">`
            : `<span class="avatar avatar-platzhalter">${escapeHtml(memberInitiale(m))}</span>`}
          <span class="item-name">${escapeHtml(memberLabel(m))}${m.user_id === selfId ? ' (du)' : ''}</span>
          ${m.user_id !== selfId ? `<button onclick="removeMember('${m.user_id}')">entfernen</button>` : ''}
        </li>
      `;
      }).join('');
    }

    async function removeMember(userId) {
      const member = householdMembers.find(m => m.user_id === userId);
      const name = member ? memberLabel(member) : "dieses Mitglied";
      if (!confirm(`"${name}" wirklich aus dem Haushalt entfernen? Zugewiesene Aufgaben werden freigegeben.`)) {
        return;
      }

      const { error } = await client.rpc('remove_household_member', {
        target_household_id: currentHouseholdId,
        target_user_id: userId
      });

      if (error) {
        alert("Fehler: " + error.message);
        return;
      }
      await loadHouseholdMembers();
      loadChores();
    }

    async function leaveHousehold() {
      if (!confirm("Diesen Haushalt wirklich verlassen? Du verlierst den Zugriff auf die gemeinsame Einkaufsliste und Aufgaben.")) {
        return;
      }

      const { error } = await client.rpc('leave_household', { target_household_id: currentHouseholdId });

      if (error) {
        alert("Fehler: " + error.message);
        return;
      }
      currentHouseholdId = null;
      showOnboarding();
    }

    function memberLabel(m) {
      return (m.display_name && m.display_name.trim()) ? m.display_name : m.email;
    }

    // Fällt ein Profilbild weg, steht statt eines leeren Kreises der
    // Anfangsbuchstabe darin.
    function memberInitiale(m) {
      const label = memberLabel(m) || '?';
      return label.trim().charAt(0).toUpperCase();
    }

    function memberOptions(selectedId) {
      const leer = `<option value="">– niemand zugewiesen –</option>`;
      const optionen = householdMembers.map(m =>
        `<option value="${m.user_id}" ${m.user_id === selectedId ? 'selected' : ''}>${escapeHtml(memberLabel(m))}</option>`
      ).join('');
      return leer + optionen;
    }

    function updateOwnProfileUI() {
      if (!currentSession) return;
      const own = householdMembers.find(m => m.user_id === currentSession.user.id);
      const label = own ? memberLabel(own) : currentSession.user.email;
      document.getElementById('welcome').textContent = "Eingeloggt als " + label;

      const input = document.getElementById('display-name-input');
      if (input && document.activeElement !== input) {
        input.value = (own && own.display_name) ? own.display_name : '';
      }

      // Aktuelles Profilbild samt "entfernen"-Feld nur zeigen, wenn es eins gibt.
      const bereich = document.getElementById('avatar-aktuell');
      const bildEl = document.getElementById('avatar-bild');
      if (!bereich || !bildEl) return;

      const pfad = own ? own.avatar_path : null;
      if (pfad) {
        bildEl.src = bildUrl(pfad);
        bereich.style.display = 'block';
      } else {
        bereich.style.display = 'none';
        bildEl.removeAttribute('src');
      }
    }

    async function saveDisplayName() {
      const input = document.getElementById('display-name-input');
      const statusEl = document.getElementById('display-name-status');
      const bildEl = document.getElementById('avatar-input');
      const entfernenEl = document.getElementById('avatar-remove');
      const name = input.value.trim();

      if (name.length > 60) {
        statusEl.textContent = "Der Name darf höchstens 60 Zeichen lang sein.";
        return;
      }

      const { data: { user } } = await client.auth.getUser();
      const eigenes = householdMembers.find(m => m.user_id === user.id);

      let avatarPath = eigenes ? (eigenes.avatar_path || null) : null;
      let altesBild = null;

      if (bildEl && bildEl.files && bildEl.files[0]) {
        statusEl.textContent = "Bild wird hochgeladen …";
        try {
          avatarPath = await ladeBildHoch(bildEl.files[0], profilBildOrdner(user.id), AVATAR_MAX_KANTE);
          altesBild = eigenes ? (eigenes.avatar_path || null) : null;
        } catch (err) {
          statusEl.textContent = "Bild konnte nicht hochgeladen werden: " + err.message;
          return;
        }
      } else if (entfernenEl && entfernenEl.checked) {
        altesBild = avatarPath;
        avatarPath = null;
      }

      const { error } = await client
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: name || null,
          avatar_path: avatarPath,
          updated_at: new Date().toISOString()
        });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }

      await loescheBild(altesBild);
      if (bildEl) {
        bildEl.value = "";
        zeigeBildVorschau(bildEl, 'avatar-vorschau');
      }
      if (entfernenEl) entfernenEl.checked = false;

      statusEl.textContent = "Gespeichert!";
      await loadHouseholdMembers();
    }
