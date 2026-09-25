// Rahmen und Start: Tabs, showApp, Realtime-Anmeldungen und der
// Auth-Zustandswechsel, der alles auslöst. Muss als letzte Datei geladen
// werden -- vorher stehen die Funktionen der anderen Dateien noch nicht bereit.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand.
//
// Jeder Aufruf in eine andere Datei läuft über versuche(): fehlt eine Datei
// (nicht hochgeladen, falsch benannt, Syntaxfehler) oder wirft eine Funktion,
// fällt nur dieser eine Baustein aus -- der Rest der App inklusive
// Live-Synchronisierung läuft weiter. Die Ursache steht in der Konsole.

    // Ruft eine Funktion aus einer anderen Datei über ihren Namen auf.
    // Funktionsdeklarationen auf oberster Ebene eines klassischen <script>
    // landen auf window -- darüber lässt sich prüfen, ob die Datei geladen
    // wurde, ohne einen ReferenceError zu riskieren. Fängt synchrone Fehler
    // und abgelehnte Promises ab; ein await auf das Ergebnis wirft also nie.
    function versuche(name, ...args) {
      const fn = window[name];
      if (typeof fn !== 'function') {
        console.warn(`Nest: ${name}() fehlt – ist die zugehörige Datei geladen?`);
        return undefined;
      }
      try {
        const ergebnis = fn(...args);
        if (ergebnis && typeof ergebnis.then === 'function') {
          return ergebnis.catch(e => console.error(`Nest: ${name}() fehlgeschlagen:`, e));
        }
        return ergebnis;
      } catch (e) {
        console.error(`Nest: ${name}() fehlgeschlagen:`, e);
        return undefined;
      }
    }

    const TAB_IDS = ['liste', 'aufgaben', 'pflanzen', 'essen'];

    const BEREICH_TITEL = {
      liste: 'Einkaufen', aufgaben: 'Aufgaben', pflanzen: 'Pflanzen', essen: 'Essensplan'
    };

    // Welche Einstellungs-Gruppe das Zahnrad aufklappt, je nachdem, von wo es
    // angetippt wurde. Der Essensplan hat keine eigenen Einstellungen und
    // landet deshalb wie der Start bei "Mein Konto".
    const EINSTELLUNGEN_JE_HERKUNFT = {
      start: 'konto', liste: 'einkaufsliste', aufgaben: 'zimmer', pflanzen: 'zimmer', essen: null
    };

    // Die zuletzt gezeigte Ansicht ausser den Einstellungen: 'start' oder ein
    // Bereich. Von dort kommt man, dorthin führt das Schliessen zurück.
    let aktuelleAnsicht = 'start';

    function zeigeAnsicht(ansicht) {
      const istBereich = TAB_IDS.includes(ansicht);
      document.getElementById('start-view').style.display = ansicht === 'start' ? 'flex' : 'none';
      document.getElementById('bereich-kopf').style.display = istBereich ? 'flex' : 'none';
      TAB_IDS.forEach(id => {
        document.getElementById('tab-' + id).style.display = id === ansicht ? 'block' : 'none';
      });
      document.getElementById('tab-einstellungen').style.display = ansicht === 'einstellungen' ? 'block' : 'none';

      if (istBereich) document.getElementById('bereich-titel').textContent = BEREICH_TITEL[ansicht];
      if (ansicht !== 'einstellungen') aktuelleAnsicht = ansicht;
      if (ansicht === 'start') versuche('beimStartZeigen');
      window.scrollTo(0, 0);
    }

    // --- Verlauf -----------------------------------------------------------
    //
    // Damit die Zurück-Taste des Handys vom Bereich zum Start führt, statt die
    // App zu verlassen, bekommt jeder Schritt einen Eintrag im Verlauf. Die
    // Tiefe bleibt dabei bewusst flach: Start ist die Basis, ein Bereich liegt
    // eine Ebene darüber, die Einstellungen höchstens zwei. Ein Wechsel von
    // Bereich zu Bereich ersetzt den Eintrag, statt einen neuen anzulegen --
    // sonst müsste man sich durch alle besuchten Bereiche zurücktippen.

    function showTab(tab) {
      if (!TAB_IDS.includes(tab)) tab = TAB_IDS[0];
      const zustand = { nest: tab };
      if (TAB_IDS.includes(aktuelleAnsicht) && history.state && TAB_IDS.includes(history.state.nest)) {
        history.replaceState(zustand, '');
      } else {
        history.pushState(zustand, '');
      }
      zeigeAnsicht(tab);
    }

    function zurueckZumStart() {
      if (history.state && history.state.nest && history.state.nest !== 'start') {
        history.back();
      } else {
        history.replaceState({ nest: 'start' }, '');
        zeigeAnsicht('start');
      }
    }

    function oeffneEinstellungen(von) {
      const gruppe = EINSTELLUNGEN_JE_HERKUNFT[von];
      document.querySelectorAll('#tab-einstellungen .settings-group').forEach(el => {
        const passt = el.dataset.gruppe === (gruppe || 'konto');
        el.open = passt;
        // Hervorheben nur, wenn das Zahnrad tatsächlich aus einem Bereich kam
        // -- vom Start aus ist "Mein Konto" schlicht der Anfang.
        el.classList.toggle('settings-group-markiert', passt && !!gruppe && von !== 'start');
      });
      zeigeAnsicht('einstellungen');
      versuche('checkPushStatus');
      versuche('loadNotificationSettings');
    }

    function showSettings() {
      const von = aktuelleAnsicht;
      history.pushState({ nest: 'einstellungen', von: von }, '');
      oeffneEinstellungen(von);
    }

    function closeSettings() {
      if (history.state && history.state.nest === 'einstellungen') {
        history.back();
      } else {
        zeigeAnsicht(aktuelleAnsicht);
      }
    }

    window.addEventListener('popstate', event => {
      // Nur innerhalb der App -- Anmeldung und Passwort-Reset haben ihre
      // eigenen Ansichten und sollen davon unberührt bleiben.
      if (document.getElementById('app-view').style.display !== 'block') return;
      const zustand = event.state;
      if (!zustand || !zustand.nest || zustand.nest === 'start') {
        zeigeAnsicht('start');
      } else if (zustand.nest === 'einstellungen') {
        oeffneEinstellungen(zustand.von || 'start');
      } else {
        zeigeAnsicht(zustand.nest);
      }
    });

    // showApp() läuft bei jedem Auth-Event, auch beim stündlichen
    // Token-Refresh. Der Startbildschirm darf nur beim ersten Mal kommen --
    // sonst flöge man jede Stunde mitten aus dem Einkaufszettel.
    let appGestartet = false;

    async function showApp(session) {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('onboarding-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'block';
      if (!appGestartet) {
        appGestartet = true;
        history.replaceState({ nest: 'start' }, '');
        zeigeAnsicht('start');
      }
      // Mitglieder und Zimmer zuerst laden, damit Namen (statt nur E-Mails)
      // und Zimmer-Bezeichnungen schon beim ersten Rendern von Einkaufsliste,
      // Aufgaben und Pflanzen verfügbar sind.
      await versuche('loadHouseholdMembers');
      await versuche('loadRooms');
      versuche('loadStores');
      versuche('loadDepartments');
      versuche('loadHousehold');
      versuche('loadChores');
      versuche('loadPlants');
      versuche('loadMealPlan');
      subscribeToAllChanges();
      // choreViewFilter ist ein let aus aufgaben.js -- typeof wirft auch dann
      // nicht, wenn die Datei fehlt.
      if (typeof choreViewFilter !== 'undefined') versuche('setChoreView', choreViewFilter);
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

      // Jedes Abo einzeln abgesichert: scheitert eines, stehen die übrigen.
      [subscribeToChanges, subscribeToChoreChanges, subscribeToPlantChanges,
       subscribeToCareTaskChanges, subscribeToMealPlanChanges, subscribeToSettingsChanges]
        .forEach(abo => {
          try { abo(); } catch (e) { console.error(`Nest: ${abo.name}() fehlgeschlagen:`, e); }
        });
    }

    function showOnboarding() {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'none';
      document.getElementById('onboarding-view').style.display = 'block';
    }

    // Realtime ist ausschliesslich fuer Aenderungen des ANDEREN Geraets da.
    // Eigene Aenderungen laedt jede Schreibfunktion selbst nach -- sonst haengt
    // die Anzeige an einer WebSocket-Verbindung, die abbrechen kann.
    //
    // INSERT und UPDATE werden auf den eigenen Haushalt gefiltert. DELETE
    // bewusst nicht: Postgres liefert beim Loeschen nur den Primaerschluessel
    // mit -- bei aktivem RLS auch dann, wenn REPLICA IDENTITY auf FULL steht
    // (so dokumentiert von Supabase). Ein Filter auf household_id kann darauf
    // nie zutreffen, das Ereignis kaeme also nie an. Ungefiltert erreicht uns
    // nur eine fremde UUID ohne jeden Inhalt, und was danach zu sehen ist,
    // entscheidet beim Nachladen wieder RLS.
    //
    // nachladen ist der NAME der Ladefunktion. Fehlt die Datei dazu, wird die
    // Tabelle gar nicht erst abonniert -- sonst liefen Events ins Leere und
    // belasteten nur die Realtime-Verbindung.
    function subscribeTable(kanal, tabelle, ladeFunktion) {
      if (typeof window[ladeFunktion] !== 'function') {
        console.warn(`Nest: kein Live-Abo für ${tabelle}, ${ladeFunktion}() fehlt.`);
        return;
      }
      const nachladen = () => { versuche(ladeFunktion); };
      const filter = `household_id=eq.${currentHouseholdId}`;
      client
        .channel(kanal)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tabelle, filter: filter }, nachladen)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tabelle, filter: filter }, nachladen)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: tabelle }, nachladen)
        .subscribe();
    }

    function subscribeToChanges() {
      subscribeTable('shopping_items_changes', 'shopping_items', 'loadItems');
    }

    function subscribeToChoreChanges() {
      subscribeTable('chores_changes', 'chores', 'loadChores');
    }

    function subscribeToPlantChanges() {
      subscribeTable('plants_changes', 'plants', 'loadPlants');
    }

    function subscribeToCareTaskChanges() {
      subscribeTable('plant_care_tasks_changes', 'plant_care_tasks', 'loadCareTasks');
    }

    function subscribeToMealPlanChanges() {
      subscribeTable('meal_plan_changes', 'meal_plan', 'loadMealPlan');
    }

    // Zimmer, Läden und Abteilungen ändern sich im Alltag fast nie -- beim
    // gemeinsamen Ersteinrichten aber laufend, und dann sitzen beide
    // gleichzeitig in den Einstellungen. Ohne das hier legt einer ein Zimmer
    // an, der andere sieht es nicht und legt es ein zweites Mal an.
    function subscribeToSettingsChanges() {
      subscribeTable('rooms_changes', 'rooms', 'loadRooms');
      subscribeTable('stores_changes', 'stores', 'loadStores');
      subscribeTable('departments_changes', 'departments', 'loadDepartments');
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
        appGestartet = false;
        showLogin();
      }
    });
