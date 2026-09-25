// Startbildschirm: vier Kacheln mit dem, was gerade ansteht.
//
// Liest nur Daten, die die Bereiche ohnehin geladen haben -- keine eigene
// Abfrage an die Datenbank. Fehlt eine Bereichsdatei, bleibt deren Kachel
// einfach ohne Zahl: alle Zugriffe auf fremde Variablen laufen über typeof,
// und das wirft auch dann nicht, wenn die Variable gar nicht existiert.
//
// Muss nach den Bereichsdateien und vor app.js geladen werden.

    // Welche Ladefunktionen schon einmal fertig waren. Direkt nach dem Öffnen
    // sind die Listen noch leer -- ohne diese Prüfung stünde dann eine halbe
    // Sekunde lang "Alles eingekauft" auf der Kachel. Leer ist ehrlicher
    // als falsch.
    const startGeladen = new Set();

    function setzeKachel(bereich, zahl, info, warnung) {
      const zahlEl = document.getElementById('kachel-zahl-' + bereich);
      const infoEl = document.getElementById('kachel-info-' + bereich);
      if (zahlEl) {
        zahlEl.style.display = zahl ? 'grid' : 'none';
        zahlEl.textContent = zahl ? String(zahl) : '';
        zahlEl.classList.toggle('warnung', !!warnung);
      }
      if (infoEl) {
        // Eine Zeile darf umbrechen (z.B. "Nächste: Müll rausbringen"). Bei
        // mehreren Zeilen bekommt jede ihre eigene und endet notfalls mit
        // "…" -- sonst frisst eine lange erste Zeile die zweite.
        const zeilen = String(info || '').split('\n').filter(z => z !== '');
        infoEl.classList.toggle('zeilenweise', zeilen.length > 1);
        infoEl.innerHTML = '';
        zeilen.forEach(z => {
          const span = document.createElement('span');
          span.textContent = z;
          infoEl.appendChild(span);
        });
      }
    }

    function kachelEinkaufen() {
      if (typeof allItems === 'undefined' || !startGeladen.has('loadItems')) return;
      const offen = allItems.filter(i => i.status === 'offen');
      if (!offen.length) { setzeKachel('liste', 0, 'Alles eingekauft'); return; }

      const dringend = offen.filter(i => i.priority === 'dringend').length;
      let info = `${offen.length} offen`;
      if (dringend) {
        info += ` · ${dringend} dringend`;
      } else if (typeof storesById !== 'undefined') {
        const laeden = [...new Set(offen.map(i => i.store_id).filter(Boolean))]
          .map(id => storesById[id]).filter(Boolean);
        if (laeden.length) info += ' · ' + laeden.slice(0, 2).join(', ') + (laeden.length > 2 ? ' …' : '');
      }
      // Rot nur bei "dringend" -- ein voller Einkaufszettel ist kein Alarm.
      setzeKachel('liste', offen.length, info, dringend > 0);
    }

    function kachelAufgaben() {
      if (typeof allChores === 'undefined' || !startGeladen.has('loadChores')) return;
      const offen = allChores.filter(c => c.status === 'offen');
      if (!offen.length) { setzeKachel('aufgaben', 0, 'Nichts offen'); return; }

      const heute = datumStr(new Date());
      const ueberfaellig = offen.some(c => c.due_date && c.due_date < heute);

      // Dieselbe Reihenfolge wie in der Liste: Termin vor Priorität, ohne
      // Termin hinten.
      const rang = typeof prioritaetRang === 'function' ? prioritaetRang : () => 0;
      const naechste = offen.slice().sort((a, b) => {
        if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
        if (!a.due_date && b.due_date) return 1;
        if (a.due_date && !b.due_date) return -1;
        return rang(b.priority) - rang(a.priority);
      })[0];

      let info = 'Nächste: ' + naechste.title;
      if (naechste.due_date === heute) info += ' (heute)';
      else if (naechste.due_date && naechste.due_date < heute) info += ' (überfällig)';
      setzeKachel('aufgaben', offen.length, info, ueberfaellig);
    }

    function kachelEssen() {
      if (typeof mealPlan === 'undefined' || typeof wochenVersatz === 'undefined' || !startGeladen.has('loadMealPlan')) return;
      // Beim Blättern hält mealPlan eine andere Woche. beimStartZeigen()
      // setzt den Plan zurück; bis der neu geladen ist, lieber nichts
      // anzeigen als etwas Falsches.
      if (wochenVersatz !== 0) { setzeKachel('essen', 0, ''); return; }

      const heute = datumStr(new Date());
      const ich = (typeof currentSession !== 'undefined' && currentSession) ? currentSession.user.id : null;

      // Jeder sieht das Seine: gemeinsame Einträge und die eigenen, nicht die
      // der anderen Person. Gibt es in einem Platz beides, zählt der eigene
      // -- der ist genauer.
      const fuerMich = mahlzeit => {
        const hier = mealPlan.filter(e => e.datum === heute && e.mahlzeit === mahlzeit
          && (!e.fuer || e.fuer === ich));
        return hier.find(e => e.fuer === ich) || hier[0] || null;
      };

      const zeilen = [['mittag', 'Mittag'], ['abend', 'Abend']]
        .map(([m, label]) => { const e = fuerMich(m); return e ? `${label}: ${e.text}` : null; })
        .filter(Boolean);
      setzeKachel('essen', 0, zeilen.length ? zeilen.join('\n') : 'Heute noch nichts geplant');
    }

    function kachelPflanzen() {
      if (typeof allCareTasks === 'undefined' || !startGeladen.has('loadCareTasks')) return;
      const heute = datumStr(new Date());
      const pflanze = t => (typeof plantsById !== 'undefined' && plantsById[t.plant_id]) ? plantsById[t.plant_id].name : 'Pflanze';
      const verb = t => (typeof CARE_TYPE_VERBEN !== 'undefined' && CARE_TYPE_VERBEN[t.type]) || t.type;

      const faellig = allCareTasks.filter(t => t.status === 'offen' && t.due_date && t.due_date <= heute);

      if (!faellig.length) {
        const naechste = allCareTasks
          .filter(t => t.status === 'offen' && t.due_date)
          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        const info = naechste
          ? `Als Nächstes: ${pflanze(naechste)} ${verb(naechste)}, ${formatDueDate(naechste.due_date).slice(0, 6)}`
          : 'Alles versorgt';
        setzeKachel('pflanzen', 0, info);
        return;
      }

      const ueberfaellig = faellig.some(t => t.due_date < heute);
      const status = ueberfaellig ? 'überfällig' : 'heute';

      // Gebündelt nach Pflegeart: "5× gießen" statt fünf gleichlautender
      // Zeilen, die man irgendwann übersieht.
      const jeArt = {};
      faellig.forEach(t => { jeArt[t.type] = (jeArt[t.type] || 0) + 1; });
      const reihenfolge = typeof CARE_TYPES !== 'undefined' ? CARE_TYPES : Object.keys(jeArt);
      const arten = reihenfolge.filter(a => jeArt[a]).map(a => `${jeArt[a]}× ${verb({ type: a })}`);

      // Die Kachel hat zwei Zeilen. Bei einer Pflegeart passt der Zustand
      // dahinter; bei mehreren bekommt jede Art ihre Zeile, und dass etwas
      // überfällig ist, sagt dann allein die rote Plakette. Sonst schneidet
      // die Kachel mitten im Wort ab -- im Test bei 375 px so passiert.
      let zeilen;
      if (faellig.length === 1) zeilen = [`${pflanze(faellig[0])} ${verb(faellig[0])}`, status];
      else if (arten.length === 1) zeilen = [arten[0], status];
      else zeilen = [arten[0], arten.slice(1).join(' · ')];
      setzeKachel('pflanzen', faellig.length, zeilen.join('\n'), ueberfaellig);
    }

    function renderStart() {
      const datumEl = document.getElementById('start-datum');
      if (datumEl) {
        datumEl.textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      }
      // Jede Kachel einzeln abgesichert: ein Fehler in einer lässt die
      // anderen stehen.
      [kachelEinkaufen, kachelAufgaben, kachelEssen, kachelPflanzen].forEach(kachel => {
        try { kachel(); } catch (e) { console.error(`Nest: ${kachel.name}() fehlgeschlagen:`, e); }
      });
    }

    // Beim Zurückkehren zum Start: Hat jemand im Essensplan geblättert, zurück
    // auf die laufende Woche -- sonst weiss die Kachel nicht, was heute gibt.
    function beimStartZeigen() {
      // Offene Formulare im Essensplan schliessen: wer zum Start geht, ist
      // dort fertig. Sonst steht beim nächsten Besuch noch das halb
      // ausgefüllte Zutaten-Formular da wie liegengebliebene Arbeit.
      if (typeof schliesseMealFormulare === 'function') {
        schliesseMealFormulare();
        if (typeof mealHinweis !== 'undefined') mealHinweis = '';
        if (typeof renderMealPlan === 'function') renderMealPlan();
      }
      if (typeof wochenVersatz !== 'undefined' && wochenVersatz !== 0 && typeof loadMealPlan === 'function') {
        wochenVersatz = 0;
        loadMealPlan();
      }
      renderStart();
    }

    // Nach jedem Nachladen die Kacheln auffrischen -- auch wenn die andere
    // Person etwas einträgt, während man selbst auf dem Startbildschirm steht.
    //
    // Statt in jede der vier Bereichsdateien eine Zeile einzubauen, werden die
    // Ladefunktionen hier einmal umhüllt. Funktionsdeklarationen auf oberster
    // Ebene liegen auf window, und ein Aufruf wie loadItems() in liste.js löst
    // zur Laufzeit über genau diese Eigenschaft auf -- er trifft also die
    // Hülle. (Im Test nachgeprüft, nicht nur angenommen.)
    ['loadItems', 'loadChores', 'loadCareTasks', 'loadMealPlan'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function') return;
      window[name] = async function (...args) {
        const ergebnis = await original.apply(this, args);
        startGeladen.add(name);
        try { renderStart(); } catch (e) { console.error('Nest: renderStart() fehlgeschlagen:', e); }
        return ergebnis;
      };
    });
