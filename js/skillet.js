// Übergabe aus Skillet (Jans Koch-App): Zutaten eines Rezepts für die Einkaufsliste.
//
// Skillet schreibt nicht selbst in die Datenbank. Es öffnet Nest mit einem
// Link wie ...?einkauf=500%20g%20Mehl%0A2%20Zwiebeln&rezept=Gulasch. Nest
// befüllt damit das Feld "mehrere auf einmal" -- eingetragen wird erst, wenn
// man dort "Auf die Liste" tippt. Mengen, Einheiten, Doppeltes und Laden
// erledigt dann die vorhandene Logik in liste.js.
//
// Der Link wird sofort beim Laden gemerkt und aus der Adresszeile entfernt:
// Muss man sich erst anmelden, geht er so nicht verloren, und ein Neuladen
// befüllt das Feld nicht ein zweites Mal.

    const SKILLET_SPEICHER = 'nest_skillet_einkauf';
    const SKILLET_GUELTIG_STUNDEN = 12;   // ältere Übergaben verfallen still

    (function merkeSkilletEinkauf() {
      const params = new URLSearchParams(window.location.search);
      const zeilen = params.get('einkauf');
      if (!zeilen) return;
      try {
        localStorage.setItem(SKILLET_SPEICHER, JSON.stringify({
          zeilen: zeilen,
          rezept: params.get('rezept') || '',
          zeit: Date.now()
        }));
      } catch (e) { /* Ohne Speicher keine Übergabe -- die App läuft normal weiter */ }
      history.replaceState(history.state, '', window.location.pathname);
    })();

    // Wird von showApp() aufgerufen, sobald Haushalt und Liste bereitstehen.
    function uebernimmSkilletEinkauf() {
      let daten = null;
      try { daten = JSON.parse(localStorage.getItem(SKILLET_SPEICHER)); } catch (e) {}
      try { localStorage.removeItem(SKILLET_SPEICHER); } catch (e) {}
      if (!daten || !daten.zeilen) return;
      if (Date.now() - daten.zeit > SKILLET_GUELTIG_STUNDEN * 3600 * 1000) return;

      showTab('liste');

      // Erst das Formular aufklappen, dann "mehrere auf einmal" -- über die
      // Funktionen aus liste.js, damit die Beschriftungen stimmen.
      if (document.getElementById('add-form').style.display === 'none' && typeof toggleAddForm === 'function') toggleAddForm();
      if (document.getElementById('mehrere-form').style.display === 'none' && typeof toggleMehrereForm === 'function') toggleMehrereForm();

      const feld = document.getElementById('mehrere-text');
      feld.value = daten.zeilen;
      feld.rows = Math.min(12, Math.max(5, daten.zeilen.split('\n').length + 1));

      const anzahl = daten.zeilen.split('\n').filter(z => z.trim()).length;
      document.getElementById('mehrere-status').textContent =
        `Aus Skillet${daten.rezept ? ': ' + daten.rezept : ''} – ${anzahl} ${anzahl === 1 ? 'Zutat' : 'Zutaten'}. Prüfen, dann „Auf die Liste“.`;
      feld.scrollIntoView({ block: 'center' });
    }
