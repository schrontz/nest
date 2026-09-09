// Bilder: verkleinern, hochladen, Adresse bilden, aufräumen. Von Pflanzen,
// Läden und Profilbild gemeinsam genutzt -- deshalb eine eigene Datei.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const BILD_MAX_KANTE = 1200;
    const BILD_QUALITAET = 0.82;

    // Handyfotos kommen mit 3-5 MB an. Ungefiltert hochgeladen wäre nicht der
    // Speicherplatz das Problem, sondern der Traffic bei jedem Anschauen --
    // das Freikontingent liegt bei 10 GB im Monat. Verkleinert landen wir bei
    // rund 200 KB pro Bild, also etwa einem Zwanzigstel.
    function verkleinereBild(datei, maxKante) {
      const grenze = maxKante || BILD_MAX_KANTE;
      return new Promise((resolve, reject) => {
        const leser = new FileReader();
        leser.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
        leser.onload = () => {
          const bild = new Image();
          bild.onerror = () => reject(new Error('Dieses Bildformat wird vom Browser nicht unterstützt.'));
          bild.onload = () => {
            const faktor = Math.min(1, grenze / Math.max(bild.width, bild.height));
            const breite = Math.max(1, Math.round(bild.width * faktor));
            const hoehe = Math.max(1, Math.round(bild.height * faktor));

            const canvas = document.createElement('canvas');
            canvas.width = breite;
            canvas.height = hoehe;
            const ctx = canvas.getContext('2d');
            // Weisser Grund zuerst: sonst werden transparente Flächen (etwa in
            // einem Logo-PNG) beim Umwandeln nach JPEG schwarz.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, breite, hoehe);
            ctx.drawImage(bild, 0, 0, breite, hoehe);

            canvas.toBlob(
              blob => blob ? resolve(blob) : reject(new Error('Bild konnte nicht umgewandelt werden.')),
              'image/jpeg',
              BILD_QUALITAET
            );
          };
          bild.src = leser.result;
        };
        leser.readAsDataURL(datei);
      });
    }

    function zufallsDateiname() {
      // crypto.randomUUID gibt es nur in sicherem Kontext (https).
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'b' + Date.now() + Math.random().toString(16).slice(2);
    }

    async function ladeBildHoch(datei, ordner, maxKante) {
      const blob = await verkleinereBild(datei, maxKante);
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

    function zeigeBildVorschau(inputEl, vorschauId) {
      const vorschau = document.getElementById(vorschauId);
      if (!vorschau) return;
      const datei = inputEl.files && inputEl.files[0];
      if (!datei) {
        vorschau.style.display = 'none';
        vorschau.removeAttribute('src');
        return;
      }
      vorschau.src = URL.createObjectURL(datei);
      vorschau.style.display = 'block';
    }
