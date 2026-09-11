# Supabase-Teil von Nest

Was hier liegt, ist der Server-Teil der App: das Datenbankschema und die
Edge Function. Beides lebt eigentlich in Supabase; hier steht es, damit man
nachlesen kann, was es gibt, und damit es sich im Notfall wieder aufbauen
lässt.

```
supabase/
  schema.sql                                  vollständiger Stand der Datenbank
  functions/send-due-notifications/index.ts   tägliche Push-Erinnerung
```

## schema.sql

Erzeugt aus der laufenden Instanz, nicht von Hand geschrieben. Enthält in
dieser Reihenfolge: Aufzählungstyp, Tabellen, Indizes, Funktionen, Trigger,
Row Level Security, Ausführungsrechte, Realtime, Storage, Cron-Jobs.

**Warum eine Datei statt einzelner Migrationen.** Die Tabellen `households`,
`household_members`, `shopping_items`, `stores` und `departments` sind vor der
ersten getrackten Migration im SQL-Editor entstanden. Die Migrationen in
Supabase setzen darauf auf und würden auf einer leeren Datenbank sofort
scheitern – sie ändern Tabellen, die es dort noch nicht gibt. Eine Datei mit
dem echten Ist-Stand ist ehrlicher als eine Historie, die sich nicht abspielen
lässt. Die Historie selbst bleibt in Supabase unter
`supabase_migrations.schema_migrations` erhalten.

**Geprüft, nicht behauptet.** Die Datei wurde gegen ein leeres PostgreSQL 16
gefahren (mit Attrappen für `auth`, `storage`, `vault`, `net` und `cron`) und
lief fehlerfrei durch. Danach wurden Spalten, Constraints, Indizes, Policies,
Funktionen, Trigger, Rechte, Realtime-Tabellen, Bucket und Cron-Jobs mit der
echten Instanz verglichen – alle zwölf Kategorien stimmen überein.

## Wieder aufbauen

1. Neues Supabase-Projekt anlegen.
2. `schema.sql` im SQL-Editor ausführen.
3. Im Vault drei Geheimnisse anlegen: `vapid_public_key`, `vapid_private_key`,
   `vapid_subject` (eine `mailto:`-Adresse) und `cron_secret` (beliebige lange
   Zufallszeichenkette).
4. Edge Function deployen – **zwingend mit `verify_jwt: false`**. Sie
   authentifiziert sich über den Header `x-cron-secret`, nicht über ein JWT.
   Mit aktivem JWT-Zwang läuft der Cron-Job stumm ins Leere. Ein erneutes
   Deploy setzt die Einstellung zurück, also danach immer nachsehen.
5. In `js/basis.js` die neue Projekt-URL und den neuen publishable key
   eintragen, in `js/push.js` den neuen öffentlichen VAPID-Schlüssel.
6. Im Dashboard unter Authentication die erlaubten Redirect-URLs setzen
   (für den Passwort-Reset) und Leaked Password Protection einschalten.

## Was hier bewusst nicht steht

* Auth-Einstellungen aus dem Dashboard (Redirect-URLs, E-Mail-Vorlagen)
* die Vault-Geheimnisse – die gehören nicht in ein öffentliches Repo
* die hochgeladenen Bilder im Storage-Bucket

## Hinweise des Datenbank-Linters, die so gewollt sind

* **`join_attempts` hat RLS ohne Policy.** Genau so soll es sein: Die Tabelle
  wird ausschließlich von `join_household_by_code` geschrieben, direkt kommt
  niemand heran.
* **Sieben SECURITY-DEFINER-Funktionen sind für Angemeldete aufrufbar.** Das
  ist der Zweck – jede prüft die Mitgliedschaft selbst als erstes.
* **`pg_net` liegt im Schema `public`.** Verschieben wäre riskant, solange die
  Push-Benachrichtigungen darauf laufen. Stattdessen sind die Rechte am Schema
  `net` entzogen, sodass niemand außer dem Cron-Job HTTP-Aufrufe absetzen kann.
* **Indizes werden als „unbenutzt" gemeldet.** Die Tabellen sind noch klein,
  Postgres wählt Tabellenscans. Ohne Index auf der referenzierenden Spalte
  würde aber jedes Löschen am Elterndatensatz zum vollen Scan.
