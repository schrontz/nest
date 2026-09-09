// Rahmen und Start: Tabs, showApp, Realtime-Anmeldungen und der
// Auth-Zustandswechsel, der alles auslöst. Muss als letzte Datei geladen
// werden -- vorher stehen die Funktionen der anderen Dateien noch nicht bereit.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const TAB_IDS = ['liste', 'aufgaben', 'pflanzen'];

    let lastActiveTab = 'liste';

    function hideAllTabs() {
      TAB_IDS.forEach(id => {
        document.getElementById('tab-' + id).style.display = 'none';
      });
    }

    function showTab(tab) {
      // Gegen einen veralteten Wert aus dem localStorage, der sonst zu einer
      // leeren Ansicht führen würde.
      if (!TAB_IDS.includes(tab)) tab = TAB_IDS[0];

      lastActiveTab = tab;
      localStorage.setItem('nest_active_tab', tab);

      TAB_IDS.forEach(id => {
        document.getElementById('tab-' + id).style.display = (id === tab) ? 'block' : 'none';
        document.getElementById('tab-btn-' + id).classList.toggle('active', id === tab);
      });
      document.getElementById('tab-einstellungen').style.display = 'none';
    }

    function showSettings() {
      hideAllTabs();
      document.getElementById('tab-einstellungen').style.display = 'block';
      checkPushStatus();
      loadNotificationSettings();
    }

    function closeSettings() {
      showTab(lastActiveTab);
    }

    async function showApp(session) {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('onboarding-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'block';
      showTab(localStorage.getItem('nest_active_tab') || 'liste');
      // Mitglieder und Zimmer zuerst laden, damit Namen (statt nur E-Mails)
      // und Zimmer-Bezeichnungen schon beim ersten Rendern von Einkaufsliste,
      // Aufgaben und Pflanzen verfügbar sind.
      await loadHouseholdMembers();
      await loadRooms();
      loadStores();
      loadDepartments();
      loadHousehold();
      loadChores();
      loadPlants();
      subscribeToAllChanges();
      setChoreView(choreViewFilter);
    }

    // showApp() läuft bei jedem Auth-Event erneut (auch beim stündlichen
    // Token-Refresh). Ohne diese Sperre würde dabei jedes Mal ein weiterer
    // Satz Realtime-Kanäle angelegt – nach ein paar Stunden offener App also
    // vielfach dieselben Änderungs-Events und entsprechend viele überflüssige
    // Reloads. Beim Haushaltswechsel werden die alten Kanäle verworfen.
    let subscribedHouseholdId = null;

    function subscribeToAllChanges() {
      if (subscribedHouseholdId === currentHouseholdId) return;
      if (subscribedHouseholdId !== null) client.removeAllChannels();
      subscribedHouseholdId = currentHouseholdId;

      subscribeToChanges();
      subscribeToChoreChanges();
      subscribeToPlantChanges();
      subscribeToCareTaskChanges();
    }

    function showOnboarding() {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'none';
      document.getElementById('onboarding-view').style.display = 'block';
    }

    function subscribeToChanges() {
      client
        .channel('shopping_items_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${currentHouseholdId}` },
          () => { loadItems(); }
        )
        .subscribe();
    }

    function subscribeToChoreChanges() {
      client
        .channel('chores_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'chores', filter: `household_id=eq.${currentHouseholdId}` },
          () => { loadChores(); }
        )
        .subscribe();
    }

    function subscribeToPlantChanges() {
      client
        .channel('plants_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'plants', filter: `household_id=eq.${currentHouseholdId}` },
          () => { loadPlants(); }
        )
        .subscribe();
    }

    function subscribeToCareTaskChanges() {
      client
        .channel('plant_care_tasks_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'plant_care_tasks', filter: `household_id=eq.${currentHouseholdId}` },
          () => { loadCareTasks(); }
        )
        .subscribe();
    }

    client.auth.onAuthStateChange(async (event, session) => {
      currentSession = session;

      if (event === 'PASSWORD_RECOVERY') {
        passwordRecoveryActive = true;
        showRecovery();
        return;
      }

      // Solange ein neues Passwort aussteht, nicht in die App springen.
      if (passwordRecoveryActive && session) {
        showRecovery();
        return;
      }

      if (session) {
        currentHouseholdId = await loadHouseholdId(session.user.id);
        if (currentHouseholdId) {
          showApp(session);
        } else {
          showOnboarding();
        }
      } else {
        showLogin();
      }
    });
