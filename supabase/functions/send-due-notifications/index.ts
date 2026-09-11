import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PLANT_CARE_VERB: Record<string, string> = {
  giessen: "gießen",
  duengen: "düngen",
  umtopfen: "umtopfen",
};

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: expectedSecret, error: secretError } = await supabase.rpc(
    "get_app_secret",
    { secret_name: "cron_secret" },
  );
  if (secretError || !expectedSecret) {
    console.error("Konnte cron_secret nicht laden:", secretError);
    return new Response("Server-Konfigurationsfehler", { status: 500 });
  }
  const providedSecret = req.headers.get("x-cron-secret");
  if (providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [{ data: vapidPublic }, { data: vapidPrivate }, { data: vapidSubject }] =
    await Promise.all([
      supabase.rpc("get_app_secret", { secret_name: "vapid_public_key" }),
      supabase.rpc("get_app_secret", { secret_name: "vapid_private_key" }),
      supabase.rpc("get_app_secret", { secret_name: "vapid_subject" }),
    ]);

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: chores, error: choresError }, { data: careTasks, error: careError }] =
    await Promise.all([
      supabase
        .from("chores")
        .select("id, title, due_date, assigned_to")
        .eq("status", "offen")
        .not("assigned_to", "is", null)
        .lte("due_date", today),
      supabase
        .from("plant_care_tasks")
        .select("id, type, due_date, assigned_to, plants(name)")
        .eq("status", "offen")
        .not("assigned_to", "is", null)
        .lte("due_date", today),
    ]);

  if (choresError || careError) {
    console.error("Fehler beim Laden fälliger Erinnerungen:", choresError, careError);
    return new Response(
      JSON.stringify({ error: choresError?.message || careError?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const choresByUser: Record<string, { title: string }[]> = {};
  for (const chore of chores ?? []) {
    const key = chore.assigned_to as string;
    if (!choresByUser[key]) choresByUser[key] = [];
    choresByUser[key].push({ title: chore.title });
  }

  const plantsByUser: Record<string, { text: string }[]> = {};
  for (const task of careTasks ?? []) {
    const key = task.assigned_to as string;
    const plantName = (task.plants as unknown as { name: string } | null)?.name ?? "Pflanze";
    const verb = PLANT_CARE_VERB[task.type as string] ?? task.type;
    if (!plantsByUser[key]) plantsByUser[key] = [];
    plantsByUser[key].push({ text: `${plantName} ${verb}` });
  }

  const userIds = new Set([...Object.keys(choresByUser), ...Object.keys(plantsByUser)]);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const userId of userIds) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("notify_chores, notify_plants")
      .eq("id", userId)
      .maybeSingle();

    const choreItems = profile?.notify_chores === false ? [] : (choresByUser[userId] ?? []);
    const plantItems = profile?.notify_plants === false ? [] : (plantsByUser[userId] ?? []);
    const total = choreItems.length + plantItems.length;

    if (total === 0) {
      skipped++;
      continue;
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!subs || subs.length === 0) continue;

    const title = total === 1 ? "1 Erinnerung fällig" : `${total} Erinnerungen fällig`;
    const bodyParts = [
      ...choreItems.map((c) => c.title),
      ...plantItems.map((p) => p.text),
    ];
    const body = bodyParts.slice(0, 5).join(", ");

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: "./" }),
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ sent, failed, skipped, users: userIds.size }),
    { headers: { "Content-Type": "application/json" } },
  );
});
