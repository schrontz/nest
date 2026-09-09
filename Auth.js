// Anmeldung: Login, Registrieren, Passwort zurücksetzen und neu setzen.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    let authMode = 'login';
    let currentSession = null;

    // Drei Modi im selben Formular: 'login', 'register', 'reset'. Im
    // Reset-Modus wird nur die E-Mail-Adresse gebraucht, das Passwortfeld
    // blendet sich aus.
    function applyAuthMode() {
      const istReset = authMode === 'reset';

      document.getElementById('password').style.display = istReset ? 'none' : '';
      document.getElementById('auth-mode-toggle').parentElement.style.display = istReset ? 'none' : '';

      document.getElementById('auth-submit-btn').textContent = istReset
        ? 'Link zum Zurücksetzen senden'
        : (authMode === 'login' ? 'Login' : 'Registrieren');
      document.getElementById('auth-mode-toggle').textContent = authMode === 'login'
        ? 'Noch keinen Account? Registrieren'
        : 'Schon registriert? Login';
      document.getElementById('auth-reset-link').textContent = istReset
        ? 'Zurück zum Login'
        : 'Passwort vergessen?';
      document.getElementById('login-status').textContent = '';
    }

    function toggleAuthMode() {
      authMode = authMode === 'login' ? 'register' : 'login';
      applyAuthMode();
    }

    function toggleResetMode() {
      authMode = authMode === 'reset' ? 'login' : 'reset';
      applyAuthMode();
    }

    async function submitAuth() {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const statusEl = document.getElementById('login-status');

      if (authMode === 'reset') {
        if (!email) {
          statusEl.textContent = "Bitte zuerst deine E-Mail-Adresse eintragen.";
          return;
        }
        statusEl.textContent = "Wird gesendet …";

        // redirectTo dynamisch statt fest verdrahtet: so führt der Link
        // immer dorthin zurück, wo die App gerade läuft.
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });

        // Bewusst dieselbe Rückmeldung, egal ob es das Konto gibt – sonst
        // liesse sich über das Formular herausfinden, wer hier registriert ist.
        statusEl.textContent = error
          ? "Fehler: " + error.message
          : "Falls es zu dieser Adresse ein Konto gibt, ist eine E-Mail unterwegs. Schau auch im Spam-Ordner.";
        return;
      }

      if (authMode === 'login') {
        const { error } = await client.auth.signInWithPassword({ email, password });
        statusEl.textContent = error ? "Fehler: " + error.message : "";
      } else {
        const { error } = await client.auth.signUp({ email, password });
        statusEl.textContent = error ? "Fehler: " + error.message : "Konto erstellt!";
      }
    }

    async function logout() {
      await client.auth.signOut();
    }

    async function loadHouseholdId(userId) {
      const { data, error } = await client
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.error("Konnte household_id nicht laden:", error);
        return null;
      }
      return data ? data.household_id : null;
    }

    function showLogin() {
      document.getElementById('login-view').style.display = 'block';
      document.getElementById('onboarding-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'none';
    }

    // Der Link aus der Passwort-Mail erzeugt bereits eine gültige Session.
    // Ohne diese Sperre würde die App also einfach aufgehen, statt nach einem
    // neuen Passwort zu fragen.
    let passwordRecoveryActive = (window.location.hash + window.location.search).includes('type=recovery');

    function showRecovery() {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('onboarding-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'none';
      document.getElementById('recovery-view').style.display = 'block';

      const email = (currentSession && currentSession.user) ? currentSession.user.email : null;
      document.getElementById('recovery-email').textContent = email || 'dein Konto';
    }

    async function saveNewPassword() {
      const pw = document.getElementById('new-password').value;
      const pwWdh = document.getElementById('new-password-repeat').value;
      const statusEl = document.getElementById('recovery-status');

      if (pw.length < 8) {
        statusEl.textContent = "Das Passwort muss mindestens 8 Zeichen lang sein.";
        return;
      }
      if (pw !== pwWdh) {
        statusEl.textContent = "Die beiden Passwörter stimmen nicht überein.";
        return;
      }

      statusEl.textContent = "Wird gespeichert …";
      const { error } = await client.auth.updateUser({ password: pw });

      if (error) {
        statusEl.textContent = "Fehler: " + error.message;
        return;
      }

      passwordRecoveryActive = false;
      document.getElementById('new-password').value = '';
      document.getElementById('new-password-repeat').value = '';
      statusEl.textContent = "";

      // Token aus der Adresszeile entfernen, sonst landet ein Neuladen
      // wieder im Passwort-Formular.
      history.replaceState(null, '', window.location.pathname);

      const { data: { session } } = await client.auth.getSession();
      currentSession = session;
      if (!session) {
        showLogin();
        return;
      }
      currentHouseholdId = await loadHouseholdId(session.user.id);
      if (currentHouseholdId) {
        showApp(session);
      } else {
        showOnboarding();
      }
    }
