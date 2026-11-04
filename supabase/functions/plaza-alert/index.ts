// Empuja cada alerta nueva como notificación a los navegadores suscritos. Las apps abiertas
// ya la reciben en vivo desde la tabla plaza_alerts. La clave privada se crea aquí la primera vez
// y queda solo en la base de datos, en una tabla sin acceso público.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function keys() {
  const { data } = await admin.from("plaza_push_config").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  await admin.from("plaza_push_config").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: saved } = await admin.from("plaza_push_config").select("public_key,private_key").eq("id", 1).single();
  return saved!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Solicitud no válida" }, 400); }

  const k = await keys();
  if (b.action === "vapid") return json({ key: k.public_key });

  // Solo la base de datos conoce esta clave: la envía al crearse una alerta.
  const { data: hook } = await admin.from("plaza_panel_secret").select("value").eq("id", 1).single();
  if (!hook || b.secret !== hook.value) return json({ error: "No autorizado" }, 401);

  const { data: alert } = await admin.from("plaza_alerts").select("*").eq("id", b.id).single();
  if (!alert) return json({ error: "Alerta no encontrada" }, 404);
  let q = admin.from("plaza_push_subs").select("endpoint,p256dh,auth");
  if (alert.audience === "usuarios") q = q.not("user_id", "is", null);
  if (alert.audience === "usuario") q = q.eq("user_id", alert.target_user);
  const { data: subs } = await q.limit(10000);

  webpush.setVapidDetails("https://plaza-noticias.vercel.app", k.public_key, k.private_key);
  const payload = JSON.stringify({ id: alert.id, title: alert.title, body: alert.body, level: alert.level });
  let sent = 0, failed = 0;
  const list = subs ?? [];
  for (let i = 0; i < list.length; i += 50) {
    await Promise.all(list.slice(i, i + 50).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e: any) {
        failed++;
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("plaza_push_subs").delete().eq("endpoint", s.endpoint);
      }
    }));
  }
  return json({ id: alert.id, sent, failed });
});
