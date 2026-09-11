// Einkaufsliste samt Läden und Abteilungen.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    let editingItemId = null;
    let allItems = [];

    const EINHEIT_LABELS = {
      stueck: "Stück", gramm: "g", kilogramm: "kg",
      liter: "l", milliliter: "ml", packung: "Packung"
    };

    let storesById = {};
    let storesFullById = {};
    let allStores = [];
    let editingStoreId = null;

    async function loadStores() {
      const { data, error } = await client
        .from('stores')
        .select('*')
        .order('name');

      if (error) {
        console.error("Fehler beim Laden der Läden:", error);
        return;
      }

      allStores = data;
      storesById = {};
      storesFullById = {};
      data.forEach(store => {
        storesById[store.id] = store.name;
        storesFullById[store.id] = store;
      });

      renderStoreList();

      const selectEl = document.getElementById('item-store');
      const bisherigeAuswahl = selectEl.value;
      selectEl.innerHTML = '<option value="">– kein Laden –</option>' +
        data.map(store => `<option value="${store.id}">${escapeHtml(store.name)}</option>`).join('');
      selectEl.value = bisherigeAuswahl;

      const orderSelectEl = document.getElementById('order-store-select');
      const bisherigeOrderAuswahl = orderSelectEl.value;
      orderSelectEl.innerHTML = '<option value="">– Laden wählen –</option>' +
        data.map(store => `<option value="${store.id}">${escapeHtml(store.name)}</option>`).join('');
      orderSelectEl.value = bisherigeOrderAuswahl;
      renderDepartmentOrderEditor();

      loadItems();
    }

    let departmentsById = {};
    let allDepartments = [];
    let editingDepartmentId = null;

    async function loadDepartments() {
      const { data, error } = await client
        .from('departments')
        .select('*')
        .order('name');

      if (error) {
        console.error("Fehler beim Laden der Abteilungen:", error);
        return;
      }

      allDepartments = data;
      departmentsById = {};
      data.forEach(dep => { departmentsById[dep.id] = dep.name; });

      renderDepartmentList();

      const selectEl = document.getElementById('item-department');
      const bisherigeAuswahl = selectEl.value;
      selectEl.innerHTML = '<option value="">– keine Abteilung –</option>' +
        data.map(dep => `<option value="${dep.id}">${escapeHtml(dep.name)}</option>`).join('');
      selectEl.value = bisherigeAuswahl;

      loadItems();
    }

    function renderDepartmentList() {
      document.getElementById('department-list').innerHTML = allDepartments.map(renderDepartmentItem).join('');
    }

    function getOrderedDepartmentIds(store) {
      const stored = (store && Array.isArray(store.department_order)) ? store.department_order : [];
      const validStored = stored.filter(id => departmentsById[id]);
      const remaining = allDepartments
        .map(d => d.id)
        .filter(id => !validStored.includes(id))
        .sort((a, b) => departmentsById[a].localeCompare(departmentsById[b]));
      return validStored.concat(remaining);
    }

    function renderDepartmentOrderEditor() {
      const storeId = document.getElementById('order-store-select').value;
      const listEl = document.getElementById('department-order-list');

      if (!storeId) {
        listEl.innerHTML = '';
        return;
      }

      const store = storesFullById[storeId];
      const orderedIds = getOrderedDepartmentIds(store);

      if (orderedIds.length === 0) {
        listEl.innerHTML = '<li>Noch keine Abteilungen angelegt.</li>';
        return;
      }

      listEl.innerHTML = orderedIds.map((id, index) => `
        <li>
          <span class="item-name">${escapeHtml(departmentsById[id])}</span>
          <div class="edit-actions">
            <button ${index === 0 ? 'disabled' : ''} onclick="moveDepartmentOrder('${storeId}', ${index}, -1)">▲</button>
            <button ${index === orderedIds.length - 1 ? 'disabled' : ''} onclick="moveDepartmentOrder('${storeId}', ${index}, 1)">▼</button>
          </div>
        </li>
      `).join('');
    }

    async function moveDepartmentOrder(storeId, index, direction) {
      const store = storesFullById[storeId];
      const orderedIds = getOrderedDepartmentIds(store);
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= orderedIds.length) return;

      [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];

      const { error } = await client
        .from('stores')
        .update({ department_order: orderedIds })
        .eq('id', storeId);

      if (error) {
        console.error("Fehler beim Speichern der Reihenfolge:", error);
        return;
      }

      storesFullById[storeId] = { ...store, department_order: orderedIds };
      renderDepartmentOrderEditor();
      render();
    }

    function renderDepartmentItem(dep) {
      if (dep.id === editingDepartmentId) {
        return `
          <li class="editing">
            <input type="text" id="edit-department-name-${dep.id}" value="${escapeHtml(dep.name)}">
            <div class="edit-actions">
              <button onclick="saveEditDepartment('${dep.id}')">Speichern</button>
              <button onclick="cancelEditDepartment()">Abbrechen</button>
            </div>
          </li>
        `;
      }
      return `
        <li>
          <span class="item-name clickable" onclick="startEditDepartment('${dep.id}')">${escapeHtml(dep.name)}</span>
          <button onclick="deleteDepartment('${dep.id}')">löschen</button>
        </li>
      `;
    }

    function startEditDepartment(id) {
      editingDepartmentId = id;
      renderDepartmentList();
    }

    function cancelEditDepartment() {
      editingDepartmentId = null;
      renderDepartmentList();
    }

    async function saveEditDepartment(id) {
      const nameEl = document.getElementById('edit-department-name-' + id);
      const name = nameEl.value.trim();
      if (!name) return;

      const { error } = await client.from('departments').update({ name: name }).eq('id', id);
      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingDepartmentId = null;
      loadDepartments();
    }

    async function deleteDepartment(id) {
      const dep = departmentsById[id] || "diese Abteilung";
      if (!confirm(`"${dep}" wirklich löschen? Zugeordnete Artikel verlieren dann ihre Abteilungs-Zuordnung.`)) {
        return;
      }
      const { error } = await client.from('departments').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      loadDepartments();
    }

    async function addDepartment() {
      const nameEl = document.getElementById('department-name');
      const name = nameEl.value.trim();
      const statusEl = document.getElementById('department-status');

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      const { error } = await client.from('departments').insert({
        household_id: currentHouseholdId,
        name: name
      });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + name + "\" hinzugefügt!";
        nameEl.value = "";
        loadDepartments();
      }
    }

    function renderStoreList() {
      document.getElementById('store-list').innerHTML = allStores.map(renderStoreItem).join('');
    }

    function renderStoreItem(store) {
      if (store.id === editingStoreId) {
        return `
          <li class="editing">
            <input type="text" id="edit-store-name-${store.id}" value="${escapeHtml(store.name)}" placeholder="Name">
            <input type="text" id="edit-store-address-${store.id}" value="${escapeHtml(store.address || '')}" placeholder="Adresse (optional)">
            ${store.image_path ? `
              <img class="bild-vorschau" src="${bildUrl(store.image_path)}" alt="">
              <p><label><input type="checkbox" id="edit-store-image-remove-${store.id}"> Logo entfernen</label></p>
            ` : ''}
            <label class="feld-label" for="edit-store-image-${store.id}">${store.image_path ? 'Logo ersetzen' : 'Logo hinzufügen'}</label>
            <input type="file" id="edit-store-image-${store.id}" accept="image/*">
            <div class="edit-actions">
              <button onclick="saveEditStore('${store.id}')">Speichern</button>
              <button onclick="cancelEditStore()">Abbrechen</button>
            </div>
          </li>
        `;
      }
      const logo = bildUrl(store.image_path);
      return `
        <li>
          ${logo ? `<img class="laden-logo" src="${logo}" alt="" loading="lazy">` : ''}
          <span class="item-name clickable" onclick="startEditStore('${store.id}')">
            ${escapeHtml(store.name)}
            ${store.address ? `<br><small class="store-address">${escapeHtml(store.address)}</small>` : ''}
          </span>
          <button onclick="deleteStore('${store.id}')">löschen</button>
        </li>
      `;
    }

    function startEditStore(id) {
      editingStoreId = id;
      renderStoreList();
    }

    function cancelEditStore() {
      editingStoreId = null;
      renderStoreList();
    }

    async function saveEditStore(id) {
      const nameEl = document.getElementById('edit-store-name-' + id);
      const addressEl = document.getElementById('edit-store-address-' + id);
      const name = nameEl.value.trim();
      const address = addressEl.value.trim();
      if (!name) return;

      const store = storesFullById[id];
      const bildEl = document.getElementById('edit-store-image-' + id);
      const entfernenEl = document.getElementById('edit-store-image-remove-' + id);

      let imagePath = store ? store.image_path : null;
      let altesBild = null;

      if (bildEl && bildEl.files && bildEl.files[0]) {
        try {
          imagePath = await ladeBildHoch(bildEl.files[0], ladenBildOrdner());
          altesBild = store ? store.image_path : null;
        } catch (err) {
          alert("Logo konnte nicht hochgeladen werden: " + err.message);
          return;
        }
      } else if (entfernenEl && entfernenEl.checked) {
        altesBild = imagePath;
        imagePath = null;
      }

      const { error } = await client
        .from('stores')
        .update({ name: name, address: address || null, image_path: imagePath })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Speichern:", error);
        if (altesBild !== null && imagePath !== (store ? store.image_path : null)) {
          await loescheBild(imagePath);
        }
        return;
      }

      await loescheBild(altesBild);
      editingStoreId = null;
      loadStores();
    }

    async function deleteStore(id) {
      const laden = storesById[id] || "diesen Laden";
      if (!confirm(`"${laden}" wirklich löschen? Zugeordnete Artikel verlieren dann ihre Laden-Zuordnung.`)) {
        return;
      }
      const store = storesFullById[id];
      const { error } = await client.from('stores').delete().eq('id', id);
      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      await loescheBild(store ? store.image_path : null);
      loadStores();
    }

    async function addStore() {
      const nameEl = document.getElementById('store-name');
      const addressEl = document.getElementById('store-address');
      const bildEl = document.getElementById('store-image');
      const name = nameEl.value.trim();
      const address = addressEl.value.trim();
      const statusEl = document.getElementById('store-status');

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      let imagePath = null;
      if (bildEl && bildEl.files && bildEl.files[0]) {
        statusEl.textContent = "Logo wird hochgeladen …";
        try {
          imagePath = await ladeBildHoch(bildEl.files[0], ladenBildOrdner());
        } catch (err) {
          statusEl.textContent = "Logo konnte nicht hochgeladen werden: " + err.message;
          return;
        }
      }

      const { error } = await client.from('stores').insert({
        household_id: currentHouseholdId,
        name: name,
        address: address || null,
        image_path: imagePath
      });

      if (error) {
        await loescheBild(imagePath);
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + name + "\" hinzugefügt!";
        nameEl.value = "";
        addressEl.value = "";
        if (bildEl) {
          bildEl.value = "";
          zeigeBildVorschau(bildEl, 'store-image-preview');
        }
        loadStores();
      }
    }

    async function addItem() {
      const name = document.getElementById('item-name').value.trim();
      const menge = document.getElementById('item-menge').value;
      const einheit = document.getElementById('item-einheit').value;
      const storeId = document.getElementById('item-store').value;
      const departmentId = document.getElementById('item-department').value;
      const priority = document.getElementById('item-priority').value;
      const statusEl = document.getElementById('add-status');

      if (!name) {
        statusEl.textContent = "Bitte einen Namen eingeben.";
        return;
      }

      const { data: { user } } = await client.auth.getUser();

      const { error } = await client.from('shopping_items').insert({
        household_id: currentHouseholdId,
        name: name,
        menge: menge ? parseFloat(menge) : null,
        einheit: einheit,
        store_id: storeId || null,
        department_id: departmentId || null,
        priority: priority,
        created_by: user.id
      });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
      } else {
        statusEl.textContent = "\"" + name + "\" hinzugefügt!";
        document.getElementById('item-name').value = "";
        document.getElementById('item-menge').value = "";
        document.getElementById('item-priority').value = "normal";
        versteckeVorschlaege();
        loadItems();
      }
    }

    // --- Vorschläge beim Tippen ------------------------------------------
    //
    // Quelle ist alles, was jemals auf der Liste stand -- nicht nur das
    // Häufigste. Wer "moz" tippt, sucht Mozzarella, auch wenn es erst einmal
    // gekauft wurde. allItems liegt ohnehin schon geladen vor, es braucht
    // also keine zusätzliche Abfrage.
    //
    // Die Reihenfolge: erst was mit dem Getippten beginnt, dann was es
    // irgendwo enthält, innerhalb dessen das zuletzt Gekaufte zuerst.
    const VORSCHLAEGE_MAX = 6;
    const VORSCHLAG_AB_ZEICHEN = 2;
    let aktiverVorschlag = -1;

    function vorschlaegeFuer(eingabe) {
      const suche = eingabe.trim();
      if (suche.length < VORSCHLAG_AB_ZEICHEN) return [];

      // allItems ist nach created_at absteigend sortiert -- der erste Treffer
      // je Name ist damit automatisch der jüngste. Genau der soll gewinnen:
      // Menge und Laden vom letzten Einkauf sind die brauchbaren Werte.
      //
      // Auch ein exakter Treffer wird angeboten. Naheliegend wäre, ihn
      // wegzulassen -- der Name steht ja schon da. Aber der Sinn des Tippens
      // auf den Vorschlag ist gerade, Menge, Laden und Abteilung vom letzten
      // Mal mitzunehmen, und die fehlen beim reinen Tippen.
      const gesehen = new Set();
      const treffer = [];
      allItems.forEach(item => {
        const name = (item.name || '').trim();
        if (!name) return;
        const schluessel = normKurz(name);
        if (gesehen.has(schluessel)) return;
        const stelle = trefferStelle(name, suche);
        if (stelle < 0) return;
        gesehen.add(schluessel);
        treffer.push({ item: item, amAnfang: stelle === 0 });
      });

      treffer.sort((a, b) => (a.amAnfang === b.amAnfang) ? 0 : (a.amAnfang ? -1 : 1));
      return treffer.slice(0, VORSCHLAEGE_MAX).map(t => t.item);
    }

    function zeigeVorschlaege() {
      const eingabe = document.getElementById('item-name').value;
      const liste = document.getElementById('item-name-vorschlaege');
      const treffer = vorschlaegeFuer(eingabe);
      aktiverVorschlag = -1;

      if (!treffer.length) {
        liste.style.display = 'none';
        liste.innerHTML = '';
        return;
      }

      liste.innerHTML = treffer.map((item, i) => {
        // Hinweis, wenn der Artikel gerade offen auf der Liste steht --
        // sonst landet er versehentlich ein zweites Mal darauf.
        const schonOffen = allItems.some(a =>
          a.status === 'offen' && normKurz(a.name) === normKurz(item.name));
        const zusatz = [];
        if (item.store_id && storesById[item.store_id]) zusatz.push(escapeHtml(storesById[item.store_id]));
        if (schonOffen) zusatz.push('steht schon auf der Liste');
        return `
          <li data-index="${i}">
            <button type="button" onmousedown="event.preventDefault()" onclick="waehleVorschlag('${item.id}')">
              ${escapeHtml(item.name)}
              ${zusatz.length ? `<small class="store-address">${zusatz.join(' · ')}</small>` : ''}
            </button>
          </li>
        `;
      }).join('');
      liste.style.display = 'block';
    }

    function versteckeVorschlaege() {
      const liste = document.getElementById('item-name-vorschlaege');
      liste.style.display = 'none';
      liste.innerHTML = '';
      aktiverVorschlag = -1;
    }

    // Der Klick auf einen Vorschlag löst zuerst blur aus. Ohne die kurze
    // Verzögerung wäre die Liste weg, bevor der Klick ankommt.
    function versteckeVorschlaegeVerzoegert() {
      setTimeout(versteckeVorschlaege, 150);
    }

    function vorschlagTaste(event) {
      const liste = document.getElementById('item-name-vorschlaege');
      if (liste.style.display === 'none') return;
      const eintraege = liste.querySelectorAll('li');
      if (!eintraege.length) return;

      if (event.key === 'Escape') { versteckeVorschlaege(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const richtung = event.key === 'ArrowDown' ? 1 : -1;
        aktiverVorschlag = (aktiverVorschlag + richtung + eintraege.length) % eintraege.length;
        eintraege.forEach((el, i) => el.classList.toggle('aktiv', i === aktiverVorschlag));
        return;
      }
      if (event.key === 'Enter' && aktiverVorschlag >= 0) {
        event.preventDefault();
        eintraege[aktiverVorschlag].querySelector('button').click();
      }
    }

    // Übernimmt Name, Menge, Einheit, Laden und Abteilung vom letzten Mal.
    // Die Priorität bewusst NICHT: die hängt am Einkauf, nicht am Artikel --
    // Klopapier ist mal dringend und mal nicht.
    function waehleVorschlag(id) {
      const item = allItems.find(i => i.id === id);
      if (!item) return;

      document.getElementById('item-name').value = item.name;
      document.getElementById('item-menge').value = item.menge ?? '';
      if (item.einheit) document.getElementById('item-einheit').value = item.einheit;
      document.getElementById('item-store').value = item.store_id || '';
      document.getElementById('item-department').value = item.department_id || '';

      versteckeVorschlaege();
      document.getElementById('add-status').textContent = '';
    }

    function toggleAddForm() {
      const formEl = document.getElementById('add-form');
      const istOffen = formEl.style.display !== 'none';
      formEl.style.display = istOffen ? 'none' : 'block';
      document.getElementById('toggle-add-link').textContent = istOffen ? "+ Artikel hinzufügen" : "– Formular schließen";
    }

    let showGekauft = false;

    function toggleGekauft() {
      showGekauft = !showGekauft;
      document.getElementById('item-list-gekauft').style.display = showGekauft ? 'block' : 'none';
      updateToggleLabel();
    }

    function updateToggleLabel() {
      const count = document.getElementById('item-list-gekauft').children.length;
      const link = document.getElementById('toggle-gekauft-link');
      link.textContent = (showGekauft ? "Gekauft ausblenden (" : "Gekauft anzeigen (") + count + ")";
    }

    function einheitOptions(selected) {
      return Object.entries(EINHEIT_LABELS).map(([val, label]) =>
        `<option value="${val}" ${val === selected ? 'selected' : ''}>${label}</option>`
      ).join('');
    }

    function storeOptions(selectedId) {
      const leer = `<option value="">– kein Laden –</option>`;
      const optionen = Object.entries(storesById).map(([id, name]) =>
        `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(name)}</option>`
      ).join('');
      return leer + optionen;
    }

    function departmentOptions(selectedId) {
      const leer = `<option value="">– keine Abteilung –</option>`;
      const optionen = Object.entries(departmentsById).map(([id, name]) =>
        `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(name)}</option>`
      ).join('');
      return leer + optionen;
    }

    function startEdit(id) {
      editingItemId = id;
      render();
    }

    function cancelEdit() {
      editingItemId = null;
      render();
    }

    async function saveEdit(id) {
      const name = document.getElementById('edit-name-' + id).value.trim();
      const menge = document.getElementById('edit-menge-' + id).value;
      const einheit = document.getElementById('edit-einheit-' + id).value;
      const storeId = document.getElementById('edit-store-' + id).value;
      const departmentId = document.getElementById('edit-department-' + id).value;
      const priority = document.getElementById('edit-priority-' + id).value;

      if (!name) return;

      const { error } = await client
        .from('shopping_items')
        .update({
          name: name,
          menge: menge ? parseFloat(menge) : null,
          einheit: einheit,
          store_id: storeId || null,
          department_id: departmentId || null,
          priority: priority
        })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Speichern:", error);
        return;
      }
      editingItemId = null;
      loadItems();
    }

    function renderItem(item) {
      if (item.id === editingItemId) {
        return `
          <li class="editing">
            <input type="text" id="edit-name-${item.id}" value="${escapeHtml(item.name)}">
            <input type="number" id="edit-menge-${item.id}" value="${item.menge ?? ''}" step="0.1" placeholder="Menge">
            <select id="edit-einheit-${item.id}">${einheitOptions(item.einheit)}</select>
            <select id="edit-store-${item.id}">${storeOptions(item.store_id)}</select>
            <select id="edit-department-${item.id}">${departmentOptions(item.department_id)}</select>
            <select id="edit-priority-${item.id}">${prioritaetOptions(item.priority)}</select>
            <div class="edit-actions">
              <button onclick="saveEdit('${item.id}')">Speichern</button>
              <button onclick="cancelEdit()">Abbrechen</button>
            </div>
          </li>
        `;
      }

      const editable = item.status === 'offen';
      const nameClass = editable ? 'item-name clickable' : 'item-name';
      const nameClick = editable ? ` onclick="startEdit('${item.id}')"` : '';
      const creatorName = item.created_by ? (membersById[item.created_by] || null) : null;

      // Bewusst nur hervorheben, nicht umsortieren: die Liste folgt der
      // Abteilungsreihenfolge, also dem Laufweg durch den Laden. Den will man
      // nicht für "Klopapier zuerst" zerreissen -- gebraucht wird
      // Sichtbarkeit, nicht Reihenfolge.
      const chip = item.status === 'offen' ? prioritaetChip(item.priority) : '';
      const prioKlasse = (item.status === 'offen' && item.priority && item.priority !== 'normal')
        ? ` prio-zeile-${item.priority}` : '';

      return `
        <li class="${prioKlasse.trim()}" style="${item.status === 'gekauft' ? 'text-decoration: line-through; color: gray;' : ''}">
          <input type="checkbox" ${item.status === 'gekauft' ? 'checked' : ''}
                 onchange="toggleStatus('${item.id}', this.checked)">
          <span class="${nameClass}"${nameClick}>
            ${chip}${escapeHtml(item.name)}
            ${item.menge ? ` – ${item.menge} ${EINHEIT_LABELS[item.einheit] || item.einheit}` : ''}
            ${creatorName ? `<br><small class="store-address">hinzugefügt von ${escapeHtml(creatorName)}</small>` : ''}
          </span>
          <button onclick="deleteItem('${item.id}')">löschen</button>
        </li>
      `;
    }

    function renderGroupedByDepartment(items, storeId) {
      const ohneAbteilung = "Ohne Abteilung";
      const gruppen = {};
      items.forEach(item => {
        const depName = item.department_id ? (departmentsById[item.department_id] || "Unbekannte Abteilung") : ohneAbteilung;
        if (!gruppen[depName]) gruppen[depName] = [];
        gruppen[depName].push(item);
      });

      const store = storeId ? storesFullById[storeId] : null;
      const orderedIds = getOrderedDepartmentIds(store);
      const orderedNamen = orderedIds.map(id => departmentsById[id]).filter(name => gruppen[name]);

      const bekannteNamen = new Set(orderedNamen);
      const uebrigeNamen = Object.keys(gruppen)
        .filter(name => name !== ohneAbteilung && !bekannteNamen.has(name))
        .sort((a, b) => a.localeCompare(b));

      const depNamen = [...orderedNamen, ...uebrigeNamen];
      if (gruppen[ohneAbteilung]) depNamen.push(ohneAbteilung);

      return depNamen.map(depName => `
        <h4>${escapeHtml(depName)}</h4>
        <ul>${gruppen[depName].map(renderItem).join('')}</ul>
      `).join('');
    }

    function renderGroupedByStore(items) {
      const ohneLaden = "Ohne Laden";
      const gruppen = {};
      items.forEach(item => {
        const key = item.store_id || 'none';
        if (!gruppen[key]) {
          gruppen[key] = {
            name: item.store_id ? (storesById[item.store_id] || "Unbekannter Laden") : ohneLaden,
            items: []
          };
        }
        gruppen[key].items.push(item);
      });

      const keys = Object.keys(gruppen).sort((a, b) => {
        if (a === 'none') return 1;
        if (b === 'none') return -1;
        return gruppen[a].name.localeCompare(gruppen[b].name);
      });

      return keys.map(key => {
        const store = key === 'none' ? null : storesFullById[key];
        const logo = store ? bildUrl(store.image_path) : null;
        return `
        <h3 class="laden-kopf">
          ${logo ? `<img class="laden-logo" src="${logo}" alt="" loading="lazy">` : ''}
          ${escapeHtml(gruppen[key].name)}
        </h3>
        ${renderGroupedByDepartment(gruppen[key].items, key === 'none' ? null : key)}
      `;
      }).join('');
    }

    async function loadItems() {
      const { data, error } = await client
        .from('shopping_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Fehler beim Laden:", error);
        return;
      }

      allItems = data;
      render();
    }

    function render() {
      const offen = allItems.filter(item => item.status === 'offen');
      const gekauft = allItems.filter(item => item.status === 'gekauft');

      document.getElementById('item-list-offen').innerHTML = renderGroupedByStore(offen);
      document.getElementById('item-list-gekauft').innerHTML = gekauft.map(renderItem).join('');

      updateToggleLabel();
    }

    async function toggleStatus(id, isChecked) {
      const neuerStatus = isChecked ? 'gekauft' : 'offen';
      const { error } = await client
        .from('shopping_items')
        .update({ status: neuerStatus })
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Ändern:", error);
        return;
      }
      loadItems();
    }

    async function deleteItem(id) {
      const item = allItems.find(i => i.id === id);
      const name = item ? item.name : "diesen Artikel";
      if (!confirm(`"${name}" wirklich löschen?`)) {
        return;
      }
      const { error } = await client
        .from('shopping_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error("Fehler beim Löschen:", error);
        return;
      }
      loadItems();
    }
