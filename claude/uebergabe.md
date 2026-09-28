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

- Kein Build-Schritt. `index.html`, `style.css`, `sw.js` (nur Push). Klassische Skripte in `js/`, Reihenfolge: basis, bilder, auth, haushalt, liste, aufgaben, pflanzen, essen, start, push, app. Top-Level-`let`/`const` sind skriptübergreifend global: keine Namen doppelt vergeben.
- `versuche(name, …)` in `app.js`: eine fehlende Datei lässt nur ihren Teil ausfallen. Keine Abhängigkeiten zwischen Bereichsdateien (eigene Konstanten statt fremder).
- `start.js` umhüllt `loadItems`, `loadChores`, `loadCareTasks`, `loadMealPlan`, `loadFreezer` und zeichnet danach die Kacheln und den Hinweis über den Kacheln.
- Realtime nur für Änderungen vom anderen Gerät. INSERT/UPDATE mit Haushaltsfilter, DELETE ungefiltert (RLS liefert nur den Primärschlüssel).
- `li button` in `style.css` macht jeden Listen-Knopf grau: im Essensplan mit `#meal-plan-list …` überschreiben.
- Datenbank: RLS über den Haushalt, pg_cron (Push 07:00 UTC), Edge Function `send-due-notifications` nur mit `verify_jwt: false` deployen.
- **Essensplan:** `meal_plan` (datum, mahlzeit mittag/abend, fuer = Person oder null, rest_von), eindeutig über `UNIQUE NULLS NOT DISTINCT (household_id, datum, mahlzeit, fuer)`. Der Plan lädt nur die angezeigte Woche.
- **Froster:** `freezer_items` (name, eingefroren_am, aufgebraucht_am, meal_plan_id → meal_plan `on delete set null`, unique). Eingeplant = verknüpft; Tag vorbei = gegessen (nur im Client berechnet, `aufgebraucht_am` bleibt leer); Termin gelöscht = wieder im Froster. `planeEin()` in `essen.js` ist der gemeinsame Weg für Reste und Froster, vergibt die UUID selbst und löst beim Ersetzen die Froster-Verknüpfung.
- `basis.js`: `datumStr` (nie `toISOString`, UTC-Falle), `tageDerWoche`, `normKurz`/`normLang`/`trefferStelle` (Umlaute), `pflegeVorlaufTage`.

## Aktueller Stand

- `main` = `5f006af` (Froster und Reste-Ziel), davor `e6f2308` (Pool Stufe 1), `e0a9e65` (Foto-Fix).
- Block 1 (Essen) ist fertig und live, aber nur im Browser getestet. Auf dem Handy offen: Foto-Fix, Vorschläge über der Tastatur, Froster samt Banner bei beiden, Datumsauswahl hinter „…“.
- Ältester offener Punkt: Push auf dem iPhone der Freundin.
- Als Nächstes laut Backlog: Block 2 (Aufgaben-Kachel mit Vorlauf, Gekauftes aufräumen). Zum Start fragen, was beim Handy-Test von Block 1 aufgefallen ist.

## Lehren

- Nichts als gelöst melden, was nur vermutet ist. Bei Bugs zuerst in die Server-Logs schauen.
- Kosten- und Tarif-Aussagen vorher prüfen.
- Fehlschläge in den Suiten gegen den alten Code gegenprüfen, bevor man sie dem eigenen Code zuschreibt (so wurde das ERR_NAME-Rauschen erkannt).
- Mockup-Varianten wirklich auf 320 px ausprobieren: Der Froster-Hinweis in der Kachel sah im Kopf gut aus und war abgeschnitten.
