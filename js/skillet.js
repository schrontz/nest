// Übergabe aus Skillet (Jans Koch-App): Zutaten eines Rezepts für die Einkaufsliste.
//
// Skillet schreibt nicht selbst in die Datenbank. Es öffnet Nest mit einem
// Link wie ...?einkauf=500%20g%20Mehl%0A2%20Zwiebeln&rezept=Gulasch. Nest
// öffnet damit die Karten (artikel.js): eine Karte je Zutat, vorausgefüllt,
// eingetragen wird erst beim Bestätigen.
//
// Der Link wird sofort beim Laden gemerkt und aus der Adresszeile entfernt:
// Muss man sich erst anmelden, geht er so nicht verloren, und ein Neuladen
// öffnet die Karten nicht ein zweites Mal.

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

    // Wird am Ende von showApp() aufgerufen. Läden, Abteilungen und Liste
    // laufen dort parallel an und sind evtl. noch nicht da -- die Karten
    // brauchen sie aber zum Vorausfüllen ("wie zuletzt") und für Doppeltes.
    async function uebernimmSkilletEinkauf() {
      let daten = null;
      try { daten = JSON.parse(localStorage.getItem(SKILLET_SPEICHER)); } catch (e) {}
      try { localStorage.removeItem(SKILLET_SPEICHER); } catch (e) {}
      if (!daten || !daten.zeilen) return;
      if (Date.now() - daten.zeit > SKILLET_GUELTIG_STUNDEN * 3600 * 1000) return;

      await versuche('loadStores');
      await versuche('loadDepartments');
      await versuche('loadItems');
      showTab('liste');
      versuche('starteKartenStapel', daten.zeilen, { herkunft: 'skillet', titel: daten.rezept || '' });
    }
