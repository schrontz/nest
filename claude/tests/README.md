# Nest: Test-Suiten

Nicht Teil der App. Die Suiten erwarten ihre Dateien in `/tmp` und einen Klon in `/tmp/nest-test`.

```bash
cp -r /tmp/nest /tmp/nest-test          # Klon zum Testen (nach Änderungen neu kopieren)
cp /tmp/nest/claude/tests/* /tmp/
cd /tmp && for t in *_test.js; do echo "$t: $(node $t 2>&1 | grep -v agent-proxy | tail -1)"; done
```

- Playwright liegt global unter `/home/claude/.npm-global/lib/node_modules/playwright`, Chromium unter `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Ändert sich die Umgebung, Pfad in allen Suiten per `sed` anpassen.
- Erwartung: Jede Suite endet mit „ALLE TESTS BESTANDEN“ bzw. „Alles grün“.
- **Bekanntes Rauschen:** `full_test` (2) und `bild_test` (1) zählen `ERR_NAME_NOT_RESOLVED` als JS-Fehler, weil die Sandbox Schriften/CDN nicht lädt. Echte Fehler stehen als Zeilen mit `FAIL` da: `node x_test.js | grep -c '^FAIL'` muss 0 sein.
- Die Supabase-Attrappen stecken in den Suiten selbst (`STUB` in `essen_test.js` wird von `essen_pool_test.js` und `froster_test.js` mitbenutzt, `render_test.js` von `full_test`, `bild_test`, `bild_fix_test`). Neue Abfrage-Methoden im Client (zuletzt `limit`, `in`) müssen dort ergänzt werden.
- `block2_test.js` prüft Aufgaben-Kachel (Vorlauf) und das Ausblenden von Gekauftem/Erledigtem.
- Relative Daten oder `page.clock.install()` verwenden, Selektoren über `data-`-Attribute.

## Lokales PostgreSQL 16

```bash
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16   # bei 404 vorher apt-get update
id claude || useradd -m claude
mkdir -p /tmp/pgtest && chown claude /tmp/pgtest
su claude -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pgtest/data"
su claude -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest/data -o '-k /tmp/pgtest -p 55432' -l /tmp/pgtest/log start"
su claude -c "psql -h /tmp/pgtest -p 55432 -d postgres -v ON_ERROR_STOP=1 -f /tmp/stubs.sql -f /tmp/nest-test/supabase/schema.sql"
su claude -c "psql -h /tmp/pgtest -p 55432 -d postgres -At -f /tmp/fp3.sql"
```

`stubs.sql` bildet nach, was Supabase mitbringt: Rollen (anon, authenticated, service_role), `auth.users`, `auth.uid()`, pg_cron und Ähnliches. `fp3.sql` erzeugt einen Fingerprint über zwölf Kategorien. Dieselbe Abfrage live per Supabase-MCP (`execute_sql`) ausführen und vergleichen.

Migration prüfen: alten Stand von `schema.sql` in eine Datenbank, Migration darauf, neuen Stand in eine zweite. Beide Fingerprints müssen gleich sein, danach live.
