// Crea cuentas de Plaza solo con usuario y contraseña. Supabase necesita un correo
// interno, que nunca se muestra ni recibe mensajes.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let username = "", password = "";
  try {
    const b = await req.json();
    username = String(b.username ?? "").trim();
    password = String(b.password ?? "");
  } catch {
    return json({ error: "Solicitud no válida" }, 400);
  }
  if (!/^[A-Za-z0-9._]{3,20}$/.test(username)) return json({ error: "Usa de 3 a 20 letras, números, punto o guion bajo." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "La contraseña necesita al menos 8 caracteres." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: taken } = await admin.from("plaza_profiles").select("id").ilike("username", username.replace(/[_%\\]/g, "\\$&")).maybeSingle();
  if (taken) return json({ error: "Ese usuario ya existe. Elige otro." }, 409);

  const email = `${username.toLowerCase()}@usuarios.plaza.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: username, app: "plaza" },
  });
  if (error || !data.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return json({ error: dup ? "Ese usuario ya existe. Elige otro." : "No pudimos crear la cuenta. Inténtalo de nuevo." }, dup ? 409 : 500);
  }
  const { error: pe } = await admin.from("plaza_profiles").insert({ id: data.user.id, username });
  if (pe) {
    await admin.auth.admin.deleteUser(data.user.id);
    return json({ error: "No pudimos crear la cuenta. Inténtalo de nuevo." }, 500);
  }
  return json({ ok: true, email });
});
