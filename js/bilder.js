// Bilder: verkleinern, hochladen, Adresse bilden, aufräumen. Von Pflanzen,
// Läden und Profilbild gemeinsam genutzt -- deshalb eine eigene Datei.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const BILD_MAX_KANTE = 1200;
    const BILD_QUALITAET = 0.82;

    const BILD_FEHLER_FORMAT =
      'Dieses Bildformat kann der Browser nicht öffnen. Auf dem iPhone hilft meist: '
      + 'Einstellungen → Kamera → Formate → "Maximale Kompatibilität".';
    const BILD_FEHLER_SPEICHER =
      'Dem Browser ist beim Umwandeln der Speicher ausgegangen. Lade die Seite einmal neu '
      + 'und versuch es erneut.';
    // Die Vorschau hat das Foto schon angezeigt -- am Format liegt es dann
    // nicht. Beobachtet auf Android: großes Kamerafoto, erster Versuch
    // scheitert, nach Neuladen klappt dasselbe Bild. Das ist Speicher.
    const BILD_FEHLER_SPEICHER_VORSCHAU =
      'Das Foto ist in Ordnung, aber beim Verkleinern ging dem Browser der Speicher aus. '
      + 'Lade die Seite einmal neu und versuch es erneut.';

    // Maße der gewählten Datei, sobald die Vorschau sie angezeigt hat. Damit
    // kann das Foto schon beim Decodieren verkleinert werden, und im
    // Fehlerfall ist klar, dass das Format lesbar war.
    const bildMasse = new WeakMap();

    // Zwei Wege, an die Bildpunkte zu kommen. createImageBitmap decodiert
    // direkt aus der Datei. Der alte Weg ging über FileReader.readAsDataURL:
    // ein 4-MB-Foto wird dabei erst zu gut 5 MB base64-Text, der neben dem
    // decodierten Bild und der Leinwand im Speicher liegt. Auf einem iPhone
    // reicht das, damit das zweite Foto in Folge nicht mehr durchgeht.
    async function ladeBildQuelle(datei, grenze) {
      const masse = bildMasse.get(datei);
      const technisch = [];

      if (typeof createImageBitmap === 'function') {
        // Erst mit Verkleinern beim Decodieren: ein 50-Megapixel-Foto belegt
        // entpackt rund 200 MB, verkleinert nur wenige. Nur die lange Kante
        // wird vorgegeben, die andere folgt dem Seitenverhältnis. Stimmt die
        // Ausrichtung nicht (EXIF-Drehung), wird das Ergebnis etwas größer
        // als nötig -- die Leinwand danach begrenzt es ohnehin.
        if (masse && grenze && Math.max(masse.breite, masse.hoehe) > grenze) {
          const optionen = masse.breite >= masse.hoehe
            ? { resizeWidth: grenze, resizeQuality: 'high' }
            : { resizeHeight: grenze, resizeQuality: 'high' };
          try {
            const bitmap = await createImageBitmap(datei, optionen);
            return { quelle: bitmap, freigeben: () => { if (bitmap.close) bitmap.close(); } };
          } catch (err) {
            technisch.push(err && err.name || 'Fehler');
          }
        }
        try {
          const bitmap = await createImageBitmap(datei);
          return { quelle: bitmap, freigeben: () => { if (bitmap.close) bitmap.close(); } };
        } catch (err) {
          // Manche Browser lesen ein Format nicht als Bitmap, sehr wohl aber
          // als <img>. Deshalb kein Abbruch, sondern der zweite Weg.
          technisch.push(err && err.name || 'Fehler');
        }
      }

      const url = URL.createObjectURL(datei);
      try {
        const bild = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => {
            technisch.push('img');
            // Hat die Vorschau das Foto angezeigt, ist das Format lesbar --
            // dann nicht zur iPhone-Einstellung schicken, sondern ehrlich
            // sagen, dass der Speicher knapp war.
            const text = masse ? BILD_FEHLER_SPEICHER_VORSCHAU : BILD_FEHLER_FORMAT;
            reject(new Error(text + ' (Technisch: ' + technisch.join(', ') + ')'));
          };
          el.src = url;
        });
        return { quelle: bild, freigeben: () => { bild.src = ''; } };
      } finally {
        // Das Bild ist an dieser Stelle bereits decodiert -- die Adresse wird
        // nicht mehr gebraucht und würde sonst die Datei bis zum Neuladen
        // der Seite im Speicher halten.
        URL.revokeObjectURL(url);
      }
    }

    // Handyfotos kommen mit 3-5 MB an. Ungefiltert hochgeladen wäre nicht der
    // Speicherplatz das Problem, sondern der Traffic bei jedem Anschauen --
    // das Freikontingent liegt bei 10 GB im Monat. Verkleinert landen wir bei
    // rund 200 KB pro Bild, also etwa einem Zwanzigstel.
    async function verkleinereBild(datei, maxKante) {
      const grenze = maxKante || BILD_MAX_KANTE;
      const { quelle, freigeben } = await ladeBildQuelle(datei, grenze);

      const faktor = Math.min(1, grenze / Math.max(quelle.width, quelle.height));
      const breite = Math.max(1, Math.round(quelle.width * faktor));
      const hoehe = Math.max(1, Math.round(quelle.height * faktor));

      const canvas = document.createElement('canvas');
      canvas.width = breite;
      canvas.height = hoehe;
      const ctx = canvas.getContext('2d');
      // Weisser Grund zuerst: sonst werden transparente Flächen (etwa in
      // einem Logo-PNG) beim Umwandeln nach JPEG schwarz.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, breite, hoehe);
      ctx.drawImage(quelle, 0, 0, breite, hoehe);
      freigeben();

      return new Promise((resolve, reject) => {
        canvas.toBlob(
          blob => {
            // Safari gibt den Speicher einer Leinwand erst frei, wenn sie auf
            // 0x0 geschrumpft wurde -- das Wegwerfen der Variablen genügt
            // dort nicht. Ohne das summiert sich jedes verarbeitete Foto auf.
            canvas.width = 0;
            canvas.height = 0;
            blob ? resolve(blob) : reject(new Error(BILD_FEHLER_SPEICHER));
          },
          'image/jpeg',
          BILD_QUALITAET
        );
      });
    }

    function zufallsDateiname() {
      // crypto.randomUUID gibt es nur in sicherem Kontext (https).
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'b' + Date.now() + Math.random().toString(16).slice(2);
    }

    async function ladeBildHoch(datei, ordner, maxKante) {
      let blob;
      try {
        blob = await verkleinereBild(datei, maxKante);
      } catch (err) {
        // Ein zweiter Versuch nach kurzer Pause: Speicher, den der erste
        // Versuch belegt hat, ist dann oft wieder frei. Bei einem wirklich
        // unlesbaren Format scheitert er genauso und meldet denselben Grund.
        await new Promise(r => setTimeout(r, 800));
        blob = await verkleinereBild(datei, maxKante);
      }
      const pfad = ordner + '/' + zufallsDateiname() + '.jpg';

      const { error } = await client.storage.from('bilder').upload(pfad, blob, {
        contentType: 'image/jpeg',
        // Ein Jahr Cache: Bilder ändern sich nie, ein neues Bild bekommt einen
        // neuen Dateinamen. Genau das hält den Traffic klein.
        cacheControl: '31536000'
      });

      if (error) throw new Error(error.message);
      return pfad;
    }

    function bildUrl(pfad) {
      if (!pfad) return null;
      return client.storage.from('bilder').getPublicUrl(pfad).data.publicUrl;
    }

    async function loescheBild(pfad) {
      if (!pfad) return;
      // Nur bestmöglich: bleibt eine verwaiste Datei liegen, ist das
      // ärgerlich, darf aber den eigentlichen Vorgang nicht scheitern lassen.
      const { error } = await client.storage.from('bilder').remove([pfad]);
      if (error) console.warn('Bild konnte nicht entfernt werden:', error.message);
    }

    // Profilbilder werden nur klein angezeigt -- entsprechend kleiner ablegen.
    const AVATAR_MAX_KANTE = 400;

    function pflanzenBildOrdner() {
      return 'households/' + currentHouseholdId + '/plants';
    }

    function ladenBildOrdner() {
      return 'households/' + currentHouseholdId + '/stores';
    }

    function profilBildOrdner(userId) {
      // Der Dateiname ist zufällig (siehe ladeBildHoch), der Ordner allein
      // verrät also keine ratbare Bildadresse.
      return 'profiles/' + userId;
    }

    // Jede Vorschau-Adresse hält die gewählte Datei im Speicher, bis sie
    // ausdrücklich freigegeben wird. Ohne das sammelt sich beim Anlegen
    // mehrerer Pflanzen hintereinander jedes Foto an.
    const vorschauUrls = {};

    function zeigeBildVorschau(inputEl, vorschauId) {
      const vorschau = document.getElementById(vorschauId);
      if (!vorschau) return;

      if (vorschauUrls[vorschauId]) {
        URL.revokeObjectURL(vorschauUrls[vorschauId]);
        delete vorschauUrls[vorschauId];
      }

      const datei = inputEl.files && inputEl.files[0];
      if (!datei) {
        vorschau.style.display = 'none';
        vorschau.removeAttribute('src');
        return;
      }

      const url = URL.createObjectURL(datei);
      vorschauUrls[vorschauId] = url;
      vorschau.onload = () => {
        if (vorschau.naturalWidth) {
          bildMasse.set(datei, { breite: vorschau.naturalWidth, hoehe: vorschau.naturalHeight });
        }
      };
      vorschau.src = url;
      vorschau.style.display = 'block';
    }
