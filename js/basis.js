// Grundlage: Supabase-Client, gemeinsame Helfer (escapeHtml, Datum,
// Wiederholungs-Beschriftungen). Muss als erste Datei geladen werden, weil
// hier der Client entsteht, den alle anderen benutzen.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const SUPABASE_URL = "https://qanbxxbbngctucjbzfeb.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_mQWyeC7aCRJn29MuHTGG1Q_9ArG0_1J";
    const client = supabase.createClient("https://qanbxxbbngctucjbzfeb.supabase.co", "sb_publishable_mQWyeC7aCRJn29MuHTGG1Q_9ArG0_1J");

    // Öffentlicher VAPID-Schlüssel für Web Push (unbedenklich im Client, das
    // Gegenstück/Geheimnis liegt nur serverseitig in Supabase Vault).
    let currentHouseholdId = null;
    function escapeHtml(str) {
      return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const RECURRENCE_UNIT_LABELS = {
      tag: 'Tag(e)', woche: 'Woche(n)', monat: 'Monat(e)', jahr: 'Jahr(e)'
    };
    const RECURRENCE_UNIT_LABELS_PLURAL = {
      tag: 'Tage', woche: 'Wochen', monat: 'Monate', jahr: 'Jahre'
    };
    const RECURRENCE_UNIT_LABELS_SINGULAR = {
      tag: 'Täglich', woche: 'Wöchentlich', monat: 'Monatlich', jahr: 'Jährlich'
    };

    function recurrenceUnitOptions(selected) {
      return Object.entries(RECURRENCE_UNIT_LABELS).map(([val, label]) =>
        `<option value="${val}" ${val === selected ? 'selected' : ''}>${label}</option>`
      ).join('');
    }

    function formatRecurrence(value, unit) {
      if (!value || !unit) return null;
      if (value === 1) return RECURRENCE_UNIT_LABELS_SINGULAR[unit] || null;
      return `Alle ${value} ${RECURRENCE_UNIT_LABELS_PLURAL[unit] || unit}`;
    }

    // Die Wiederholungs-Arithmetik lebt bewusst nur noch serverseitig
    // (next_due_after_today + der naechtliche Cron-Job). Vorher rechnete der
    // Client dasselbe parallel nach und lief dabei auseinander -- Zeitzonen-
    // Umrechnung und Ueberfaelligkeit waren in beiden Varianten unterschiedlich
    // falsch. Eine Implementierung, eine Wahrheit.
    function formatDueDate(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Für Zeitstempel aus der Datenbank (UTC): in lokale Zeit umrechnen, sonst
    // zeigt eine spätabends erledigte Aufgabe den Vortag an.
    function formatTimestampDate(ts) {
      const d = new Date(ts);
      if (isNaN(d)) return null;
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function getDueUrgency(dueDateStr) {
      if (!dueDateStr) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDateStr + 'T00:00:00');
      if (due < today) return 'overdue';
      if (due.getTime() === today.getTime()) return 'today';
      return null;
    }

    // Vorlauf für fällige Pflanzenpflege in der Aufgabenliste: ein Viertel
    // des Intervalls, gedeckelt auf 7 Tage, mindestens 1 Tag.
    //
    // Eine feste Zahl geht nicht: bei "alle 3 Tage gießen" stünde mit drei
    // Tagen Vorlauf dauerhaft etwas in der Liste, beim Düngen alle vier Wochen
    // käme die Erinnerung dagegen zu spät. Der Deckel verhindert, dass
    // Umtopfen alle zwei Jahre ein halbes Jahr vorher auftaucht.
    const TAGE_JE_EINHEIT = { tag: 1, woche: 7, monat: 30, jahr: 365 };

    function pflegeVorlaufTage(value, unit) {
      const jeEinheit = TAGE_JE_EINHEIT[unit];
      if (!value || !jeEinheit) return 1;
      return Math.min(7, Math.max(1, Math.round((value * jeEinheit) / 4)));
    }

    function istInnerhalbVorlauf(dueDateStr, value, unit) {
      if (!dueDateStr) return false;
      const grenze = new Date();
      grenze.setHours(0, 0, 0, 0);
      grenze.setDate(grenze.getDate() + pflegeVorlaufTage(value, unit));
      return new Date(dueDateStr + 'T00:00:00') <= grenze;
    }

    // Für die Quittung nach dem Abhaken: heute Erledigtes bleibt bis
    // Mitternacht sichtbar, danach fällt es aus der Aufgabenliste heraus.
    function istHeute(ts) {
      if (!ts) return false;
      const d = new Date(ts);
      const heute = new Date();
      return d.getFullYear() === heute.getFullYear()
        && d.getMonth() === heute.getMonth()
        && d.getDate() === heute.getDate();
    }

    // Priorität: von Aufgaben und Einkaufsartikeln gemeinsam genutzt.
    // Bewusst dreistufig -- je feiner die Skala, desto seltener wird sie
    // gepflegt. Nicht zu verwechseln mit Aufwand: "Bad putzen" ist aufwendig,
    // aber selten dringend; "Klopapier" ist trivial, aber sehr dringend.
    const PRIORITAET_LABELS = { normal: 'Normal', wichtig: 'Wichtig', dringend: 'Dringend' };
    const PRIORITAET_RANG = { dringend: 2, wichtig: 1, normal: 0 };

    function prioritaetOptions(selected) {
      return Object.entries(PRIORITAET_LABELS).map(([val, label]) =>
        `<option value="${val}" ${val === (selected || 'normal') ? 'selected' : ''}>${label}</option>`
      ).join('');
    }

    function prioritaetRang(wert) {
      return PRIORITAET_RANG[wert] || 0;
    }

    // Kleine Markierung neben dem Namen. "normal" bekommt bewusst keine --
    // wenn alles markiert ist, sticht nichts mehr hervor.
    function prioritaetChip(wert) {
      if (!wert || wert === 'normal') return '';
      return `<span class="prio-chip prio-${wert}">${PRIORITAET_LABELS[wert]}</span>`;
    }
