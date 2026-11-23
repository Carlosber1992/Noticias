// Respaldo de cuentas de Yasupo: verificar el correo o el celular con un código y
// recuperar la contraseña con el usuario + el correo o celular guardado.
// Envío: correo con Resend (RESEND_API_KEY, RESEND_FROM) y SMS con Twilio
// (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM). Si falta un proveedor, se
// responde con un aviso claro y no se guarda ningún código.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const env = (k: string) => Deno.env.get(k) ?? "";
const canEmail = () => !!env("RESEND_API_KEY");
const canSms = () => !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM"));
const GENERIC = "Si los datos coinciden con una cuenta, te enviamos un código. Revisa tu correo o tus mensajes.";

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
const normPhone = (p: string) => {
  let d = String(p ?? "").replace(/[\s().-]/g, "");
  if (/^3\d{9}$/.test(d)) d = "+57" + d; // celular colombiano sin indicativo
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : "";
};
const mask = (ch: "email" | "phone", v: string) =>
  ch === "email" ? v.replace(/^(.).*?(@.*)$/, "$1•••$2") : v.slice(0, 3) + "•••" + v.slice(-3);

function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") || "").split(",")[0] || "").trim().slice(0, 64) || null;
}
async function logIp(req: Request, user: string, kind: string) {
  const ip = clientIp(req);
  if (!ip) return;
  await admin.from("plaza_ip_log").insert({ user_id: user, ip, kind, user_agent: (req.headers.get("user-agent") || "").slice(0, 300) });
}

async function deliver(ch: "email" | "phone", to: string, code: string, why: string) {
  const text = `Tu código de Yasupo es ${code}. ${why} Vence en 15 minutos. Si no lo pediste, ignora este mensaje.`;
  if (ch === "email") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("RESEND_FROM") || "Yasupo <no-responder@yasupo.com>",
        to: [to], subject: `Tu código de Yasupo: ${code}`, text,
        html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5"><p>Tu código de Yasupo es:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p>${why} Vence en 15 minutos.</p><p style="color:#6b7280">Si no lo pediste, ignora este correo.</p></div>`,
      }),
    });
    if (!r.ok) throw new Error("email " + r.status + " " + (await r.text()).slice(0, 200));
  } else {
    const sid = env("TWILIO_ACCOUNT_SID");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${env("TWILIO_AUTH_TOKEN")}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: env("TWILIO_FROM"), Body: text }),
    });
    if (!r.ok) throw new Error("sms " + r.status + " " + (await r.text()).slice(0, 200));
  }
}

/** Crea y envía un código (máximo 5 por hora por cuenta). */
async function issue(user: string, purpose: string, ch: "email" | "phone", to: string, why: string) {
  if (ch === "email" ? !canEmail() : !canSms())
    return fail(ch === "email" ? "El envío de códigos por correo todavía no está activado en Yasupo." : "El envío de códigos por SMS todavía no está activado en Yasupo.", 503);
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await admin.from("plaza_recovery_codes").select("id", { count: "exact", head: true }).eq("user_id", user).gte("created_at", since);
  if ((count ?? 0) >= 5) return fail("Pediste demasiados códigos. Espera una hora e inténtalo de nuevo.", 429);
  const code = newCode();
  await admin.from("plaza_recovery_codes").delete().eq("user_id", user).eq("purpose", purpose);
  await admin.from("plaza_recovery_codes").insert({
    user_id: user, purpose, channel: ch, code_hash: await sha(user + ":" + code), expires_at: new Date(Date.now() + 15 * 60e3).toISOString(),
  });
  try { await deliver(ch, to, code, why); }
  catch (e) {
    console.error(e);
    await admin.from("plaza_recovery_codes").delete().eq("user_id", user).eq("purpose", purpose);
    return fail("No pudimos enviar el código. Inténtalo de nuevo en unos minutos.", 502);
  }
  return null;
}

/** Comprueba un código; tras 5 intentos fallidos el código deja de servir. */
async function check(user: string, purpose: string, code: string) {
  const { data: row } = await admin.from("plaza_recovery_codes").select("*").eq("user_id", user).eq("purpose", purpose)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date() || row.attempts >= 5) return null;
  if (row.code_hash !== await sha(user + ":" + String(code).trim())) {
    await admin.from("plaza_recovery_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return null;
  }
  await admin.from("plaza_recovery_codes").delete().eq("id", row.id);
  return row as { channel: "email" | "phone" };
}

async function findUser(username: string) {
  if (!/^[A-Za-z0-9._]{3,20}$/.test(username)) return null;
  const { data } = await admin.from("plaza_profiles").select("id").ilike("username", username.replace(/[_%\\]/g, "\\$&")).maybeSingle();
  return data?.id as string | undefined ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método no permitido", 405);
  let b: Record<string, string> = {};
  try { b = await req.json(); } catch { return fail("Solicitud no válida"); }
  const action = String(b.action ?? "");

  // ---- Sin sesión: recuperar la contraseña ----
  if (action === "recover") {
    if (!canEmail() && !canSms()) return fail("La recuperación por correo o SMS todavía no está activada en Yasupo.", 503);
    const user = await findUser(String(b.username ?? "").trim());
    const contact = String(b.contact ?? "").trim();
    if (!user || !contact) return json({ ok: true, message: GENERIC });
    const { data: rec } = await admin.from("plaza_recovery").select("email,phone").eq("user_id", user).maybeSingle();
    const asPhone = normPhone(contact);
    const ch: "email" | "phone" | null = rec?.email && contact.toLowerCase() === rec.email ? "email" : rec?.phone && asPhone && asPhone === rec.phone ? "phone" : null;
    if (!ch) return json({ ok: true, message: GENERIC });
    const err = await issue(user, "reset", ch, ch === "email" ? rec!.email : rec!.phone, "Úsalo para crear una contraseña nueva.");
    if (err) return err;
    await logIp(req, user, "recuperacion_pedida");
    return json({ ok: true, message: GENERIC });
  }
  if (action === "reset") {
    const user = await findUser(String(b.username ?? "").trim());
    const password = String(b.password ?? "");
    if (password.length < 8 || password.length > 72) return fail("La contraseña necesita al menos 8 caracteres.");
    const ok = user && await check(user, "reset", String(b.code ?? ""));
    if (!ok) return fail("El código no es válido o ya venció. Pide uno nuevo.");
    const { error } = await admin.auth.admin.updateUserById(user!, { password });
    if (error) return fail("No pudimos cambiar la contraseña. Inténtalo de nuevo.", 500);
    // Recuperar con el correo o el celular también demuestra que son de la persona.
    await admin.from("plaza_recovery").update(ok.channel === "email" ? { email_verified_at: new Date().toISOString() } : { phone_verified_at: new Date().toISOString() }).eq("user_id", user!);
    await logIp(req, user!, "recuperacion");
    return json({ ok: true });
  }

  // ---- Con sesión: verificar el correo o el celular guardado ----
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user?.id;
  if (!user) return fail("Necesitas entrar a tu cuenta.", 401);
  const ch = b.channel === "phone" ? "phone" : b.channel === "email" ? "email" : null;
  if (!ch) return fail("Canal no válido");
  const { data: rec } = await admin.from("plaza_recovery").select("email,phone").eq("user_id", user).maybeSingle();
  const to = ch === "email" ? rec?.email : rec?.phone;
  if (!to) return fail(ch === "email" ? "Primero guarda tu correo." : "Primero guarda tu celular.");
  const purpose = ch === "email" ? "verify_email" : "verify_phone";

  if (action === "verify-send") {
    const err = await issue(user, purpose, ch, to, "Úsalo para confirmar tu " + (ch === "email" ? "correo" : "celular") + " en Yasupo.");
    if (err) return err;
    return json({ ok: true, sentTo: mask(ch, to) });
  }
  if (action === "verify") {
    if (!await check(user, purpose, String(b.code ?? ""))) return fail("El código no es válido o ya venció. Pide uno nuevo.");
    await admin.from("plaza_recovery").update(ch === "email" ? { email_verified_at: new Date().toISOString() } : { phone_verified_at: new Date().toISOString() }).eq("user_id", user);
    await logIp(req, user, ch === "email" ? "correo_verificado" : "celular_verificado");
    return json({ ok: true });
  }
  return fail("Acción no válida");
});
