// Benachrichtigungen: Service Worker, An-/Abmeldung je Gerät, Schalter.
//
// Die Einrückung stammt aus der Zeit, als alles in index.html stand, und ist
// bewusst unverändert: so ist nachweisbar, dass beim Aufteilen keine Zeile
// angefasst wurde.

    const VAPID_PUBLIC_KEY = "BAlJnWxiTZJ7CmB0gohnscGIrF193bC26NdYLAE-5r9rk_fDftuIN8oRU8gtFl1a2MW4wFBFJ0Zxla7aONIoPg0";

    let swRegistrationPromise = null;
    if ('serviceWorker' in navigator) {
      swRegistrationPromise = navigator.serviceWorker.register('sw.js').catch(err => {
        console.error('Service-Worker-Registrierung fehlgeschlagen:', err);
        return null;
      });
    }

    // Statt navigator.serviceWorker.ready (kann unbegrenzt hängen, wenn die
    // Registrierung mal fehlschlägt) direkt auf das Registrierungs-Promise warten.
    async function getServiceWorkerRegistration() {
      if (!swRegistrationPromise) return null;
      return await swRegistrationPromise;
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    function updatePushUI(enabled) {
      const enableBtn = document.getElementById('push-enable-btn');
      const disableBtn = document.getElementById('push-disable-btn');
      if (enabled === null) {
        enableBtn.style.display = 'none';
        disableBtn.style.display = 'none';
        return;
      }
      enableBtn.style.display = enabled ? 'none' : 'inline-block';
      disableBtn.style.display = enabled ? 'inline-block' : 'none';
    }

    async function checkPushStatus() {
      const statusEl = document.getElementById('push-status');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        statusEl.textContent = "Wird auf diesem Gerät/Browser nicht unterstützt.";
        updatePushUI(null);
        return;
      }
      const registration = await getServiceWorkerRegistration();
      if (!registration) {
        statusEl.textContent = "Service Worker konnte nicht registriert werden.";
        updatePushUI(null);
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      statusEl.textContent = subscription ? "Aktiviert auf diesem Gerät." : "Noch nicht aktiviert auf diesem Gerät.";
      updatePushUI(!!subscription);
    }

    async function enablePushNotifications() {
      const statusEl = document.getElementById('push-status');

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        statusEl.textContent = "Push wird auf diesem Gerät/Browser nicht unterstützt.";
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        statusEl.textContent = "Berechtigung wurde nicht erteilt.";
        return;
      }

      try {
        const registration = await getServiceWorkerRegistration();
        if (!registration) {
          statusEl.textContent = "Service Worker konnte nicht registriert werden.";
          return;
        }
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        const { data: { user } } = await client.auth.getUser();
        const subJson = subscription.toJSON();

        const { error } = await client.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth
        }, { onConflict: 'endpoint' });

        if (error) {
          statusEl.textContent = "Fehler: " + error.message;
          return;
        }
        statusEl.textContent = "Aktiviert auf diesem Gerät.";
        updatePushUI(true);
      } catch (err) {
        statusEl.textContent = "Fehler beim Aktivieren: " + err.message;
      }
    }

    async function disablePushNotifications() {
      const statusEl = document.getElementById('push-status');
      try {
        const registration = await getServiceWorkerRegistration();
        if (!registration) {
          statusEl.textContent = "Service Worker konnte nicht registriert werden.";
          return;
        }
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await client.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
          await subscription.unsubscribe();
        }
        statusEl.textContent = "Noch nicht aktiviert auf diesem Gerät.";
        updatePushUI(false);
      } catch (err) {
        statusEl.textContent = "Fehler beim Deaktivieren: " + err.message;
      }
    }

    async function loadNotificationSettings() {
      const { data: { user } } = await client.auth.getUser();
      const { data, error } = await client
        .from('profiles')
        .select('notify_chores, notify_plants')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error("Fehler beim Laden der Benachrichtigungs-Einstellungen:", error);
        return;
      }
      document.getElementById('notify-chores-checkbox').checked = data ? data.notify_chores !== false : true;
      document.getElementById('notify-plants-checkbox').checked = data ? data.notify_plants !== false : true;
    }

    async function saveNotifyChores(checked) {
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client
        .from('profiles')
        .upsert({ id: user.id, notify_chores: checked, updated_at: new Date().toISOString() });

      if (error) console.error("Fehler beim Speichern:", error);
    }

    async function saveNotifyPlants(checked) {
      const { data: { user } } = await client.auth.getUser();
      const { error } = await client
        .from('profiles')
        .upsert({ id: user.id, notify_plants: checked, updated_at: new Date().toISOString() });

      if (error) console.error("Fehler beim Speichern:", error);
    }
