# Nest: Übergabe

Stand: 28.09.2026. Nur was eine neue Session braucht. Was als Nächstes dran ist, steht im Backlog, nicht hier.

- **Repo:** `schrontz/nest`, Branch `main`, live unter https://schrontz.github.io/nest/ (GitHub Pages, ca. 1 Minute nach dem Push)
- **Supabase:** Projekt `qanbxxbbngctucjbzfeb` („Nest“, eu-west-1, kostenloser Tarif)
- **Backlog:** https://claude.ai/artifact/NkFXgW9vTvPbyD7qvVDH4G. Die Seite ist 47 kB groß: nicht ganz lesen, sondern per `Artifact read` holen und per Skript nur die Titel aus `INITIAL_ITEMS` ziehen. Der Stand steckt in `INITIAL_ITEMS` selbst (`done`, `group`), aktualisieren = Datei ändern und mit `url` neu veröffentlichen.

## Zugriff

Jan fügt zu Beginn einen fine-grained Token ein (nur dieses Repo, nur Contents, 7 Tage). Hinterlegen ohne ihn auszugeben:

```bash
umask 077; printf 'https://x-access-token:%s@github.com\n' 'TOKEN' > ~/.git-credentials
git config --global credential.helper store
GIT_TERMINAL_PROMPT=0 git push --dry-run origin HEAD:refs/heads/zugriffstest
```

Ohne Token: Dateien mit Zielpfad ausliefern, Jan lädt über die Weboberfläche hoch. Am Ende der Session an das Widerrufen erinnern.

## Arbeitsweise

1. Idee klären, **Mockup zeigen** (Screenshot per Playwright auf 320 px, lange Wörter wie „Paradiesvogelblume“ einplanen), erst nach Jans Okay bauen.
2. **Migration abwärtskompatibel**: neue Spalten nullable oder mit Default, neue Tabellen sind unkritisch, alte Constraints erst später entfernen. `supabase/schema.sql` mitpflegen, lokal gegen PostgreSQL 16 prüfen, live per Fingerprint vergleichen (vor und nach der Migration).
3. Prüfen: `node --check`, alle Suiten aus `claude/tests/` (siehe README dort), neue Funktionen bekommen eine eigene Suite.
4. Lokal committen, Dateien und Commit nennen, **erst nach Jans Okay auf `main` pushen**. Reihenfolge: Migration live, dann Client.
5. Nach dem Push: `git fetch origin main && git diff --stat HEAD origin/main` muss leer sein.
6. Ehrlich sagen, was nur im Browser und nicht auf dem Handy geprüft ist.
7. Session-Ende: Backlog aktualisieren, diese Datei fortschreiben, Jan Feedback geben (auch zum Prompting).

## Zusammenarbeit mit Jan

- Deutsch, kurz, direkt, ehrlich. Optionen mit klarer Empfehlung, er entscheidet gern selbst.
- Er lernt mit: Git- und Technikbegriffe kurz erklären, wenn sie auftauchen (z. B. Commit, Branch vs. Ordner).
- Er ist manchmal zu optimistisch und testet wenig. „Funktioniert!“ selbst absichern.
- In Umsetzungs-Sessions neue Ideen nur ins Backlog, nicht einschieben. Freundlich hinweisen, wenn er abschweift.
- Seine Freundin nutzt nur Nest, nicht Skillet. Was beide nutzen, gehört nach Nest.

## Technik: das Wichtigste

- Kein Build-Schritt. `index.html`, `style.css`, `sw.js` (nur Push). Klassische Skripte in `js/`, Reihenfolge: basis, bilder, auth, haushalt, liste, artikel, aufgaben, pflanzen, essen, start, push, skillet, app. Top-Level-`let`/`const` sind skriptübergreifend global: keine Namen doppelt vergeben.
- `versuche(name, …)` in `app.js`: eine fehlende Datei lässt nur ihren Teil ausfallen. Keine Abhängigkeiten zwischen Bereichsdateien (eigene Konstanten statt fremder).
- `basis.js` hat `AUSBLENDEN_NACH_TAGEN` (7): Gekauftes und erledigte Aufgaben werden danach nur ausgeblendet, nie gelöscht, weil die Vorschläge beim Tippen von der Historie leben. `shopping_items.gekauft_am` setzt ein Trigger.
- Aufgaben-Kachel zählt nur Überfälliges, Heutiges und was im Vorlauf liegt (`istInnerhalbVorlauf`); ohne Termin zählt nicht.
- **Pflanzen:** Übersicht als Kacheln je Zimmer (`renderPlantList`), Detail über `detailPlantId`/`oeffnePflanze`, `zeigeAnsicht('pflanzen')` setzt auf die Übersicht zurück. Die alte Karte (`li.plant-card`) lebt nur noch in der Detailansicht.
- `start.js` umhüllt `loadItems`, `loadChores`, `loadCareTasks`, `loadMealPlan`, `loadFreezer` und zeichnet danach die Kacheln und den Hinweis über den Kacheln.
- Realtime nur für Änderungen vom anderen Gerät. INSERT/UPDATE mit Haushaltsfilter, DELETE ungefiltert (RLS liefert nur den Primärschlüssel).
- `li button` in `style.css` macht jeden Listen-Knopf grau: im Essensplan mit `#meal-plan-list …` überschreiben.
- Datenbank: RLS über den Haushalt, pg_cron (Push 07:00 UTC), Edge Function `send-due-notifications` nur mit `verify_jwt: false` deployen.
- **Essensplan:** `meal_plan` (datum, mahlzeit mittag/abend, fuer = Person oder null, rest_von), eindeutig über `UNIQUE NULLS NOT DISTINCT (household_id, datum, mahlzeit, fuer)`. Der Plan lädt nur die angezeigte Woche.
- **Froster:** `freezer_items` (name, eingefroren_am, aufgebraucht_am, meal_plan_id → meal_plan `on delete set null`, unique). Eingeplant = verknüpft; Tag vorbei = gegessen (nur im Client berechnet, `aufgebraucht_am` bleibt leer); Termin gelöscht = wieder im Froster. Jede Portion ist ein eigener Eintrag; die Liste bündelt nicht eingeplante Portionen gleichen Namens vom selben Tag (`frosterZeilen`), `einfrieren()` legt N Zeilen an. `planeEin()` in `essen.js` ist der gemeinsame Weg für Reste und Froster, vergibt die UUID selbst und löst beim Ersetzen die Froster-Verknüpfung.
- **Artikel anlegen = schwebende Karte** (`artikel.js`, Ansicht `artikel` mit eigenem Verlaufs-Eintrag; schwebt über dem Bereich, aus dem sie kommt — `karteBasis()` —, Hintergrund unscharf, Seite darunter gesperrt; ✕ und Zurück-Taste schließen, Tipp auf den Hintergrund bewusst nicht): einzeln über „+ Artikel hinzufügen“ (Speichern / Speichern & nächster) oder als Stapel aus Skillet und dem Essensplan („Auf die Liste“), je Zutat eine vorausgefüllte Karte („wie zuletzt“), „Diesen Laden für alle weiteren“ überschreibt das „wie zuletzt“ der folgenden Karten, „Restliche so übernehmen“, Zusammenfassung. **Doppeltes**: offener Artikel mit gleicher Einheit → Menge erhöhen; ohne Menge → nichts tun; andere Einheit → zusätzlich eintragen. „Mehrere auf einmal“ gibt es nicht mehr; `zerlegeZeile` in `liste.js` bleibt für die Stapel. Wichtigkeit als Knöpfe, Wert in verstecktem `#item-priority`.
- **Übergabe aus Skillet** (`skillet.js`): Link `?einkauf=<Zeilen>&rezept=<Titel>` wird beim Laden in `localStorage` (`nest_skillet_einkauf`, 12 h gültig) gemerkt und aus der Adresszeile entfernt; `showApp()` ruft danach `uebernimmSkilletEinkauf()` auf, das erst Läden, Abteilungen und Liste lädt (laufen in `showApp` parallel an) und dann die Karten öffnet. Skillet hat keinen Zugriff auf Nests Datenbank.
- **Einheiten** (`mengeneinheit`): stueck, gramm, kilogramm, liter, milliliter, packung und seit Okt. 2026 dose, bund, glas, flasche, becher. Neue Werte an drei Stellen pflegen: `EINHEIT_LABELS` und `EINHEIT_WOERTER` in `liste.js`, Auswahl `#item-einheit` in `index.html`; Skillets `einkauf.js` schickt sie mit. Kocheinheiten (EL, TL, Prise) bewusst nicht.
- `basis.js`: `datumStr` (nie `toISOString`, UTC-Falle), `tageDerWoche`, `normKurz`/`normLang`/`trefferStelle` (Umlaute), `pflegeVorlaufTage`.

## Aktueller Stand

- `main` = `bc51dba` (30.09.: „Zurück in den Froster“ für eingeplante Portionen), davor `274d883` (29.09.: Froster-Portionen und „+ Etwas einfrieren“, auf dem Handy bestätigt).
- Davor `058a744`. Am 28.09. live gegangen: Foto-Fix, Pool Stufe 1, Froster und Reste-Ziel (Block 1), Aufgaben-Kachel mit Vorlauf und Ausblenden nach 7 Tagen (Block 2), Pflanzen-Kacheln nach Zimmer mit Detailansicht (aus Block 3). Migrationen: `freezer_items`, `shopping_items.gekauft_am` samt Trigger.
- Alles nur im Browser getestet. Auf dem Handy offen: Foto-Fix, Vorschläge über der Tastatur, Froster samt Banner bei beiden, Datumsauswahl hinter „…“, Block 2, Pflanzen (echte Fotos, Silbentrennung).
- Ältester offener Punkt: Push auf dem iPhone der Freundin.
- Als Nächstes laut Backlog: Winter-Rhythmus der Pflege (Rest von Block 3, muss bis März stehen), danach Block 4 (Design). Zum Start fragen, was beim Handy-Test aufgefallen ist.

## Lehren

- Nichts als gelöst melden, was nur vermutet ist. Bei Bugs zuerst in die Server-Logs schauen.
- Kosten- und Tarif-Aussagen vorher prüfen.
- Fehlschläge in den Suiten gegen den alten Code gegenprüfen, bevor man sie dem eigenen Code zuschreibt (so wurde das ERR_NAME-Rauschen erkannt).
- Zahlen, mit denen ich argumentiere, live nachsehen statt schätzen: „etwa ein Dutzend“ Gekaufte waren in Wahrheit 70.
- Aktionen auch nacheinander auf demselben Objekt testen, nicht nur einzeln: „einplanen, dann in den Froster“ ergab am 30.09. eine Portion zu viel.
- Mockup-Varianten wirklich auf 320 px ausprobieren: Der Froster-Hinweis in der Kachel sah im Kopf gut aus und war abgeschnitten.
