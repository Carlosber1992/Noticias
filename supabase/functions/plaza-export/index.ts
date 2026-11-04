// Crea el expediente de un usuario o de una IP: un HTML que se abre sin internet, con las imágenes
// dentro y la huella SHA-256 de cada archivo. Solo responde a plaza_panel, que conoce la clave.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_EMBED = 35 * 1024 * 1024, LINK_DAYS = 7;
const KIND: Record<string, string> = { noticia: "Noticia", comentario: "Comentario", pregunta: "Pregunta", respuesta: "Respuesta", mensaje: "Mensaje", grupo: "Grupo", canal: "Canal", foro: "Foro", ingreso: "Ingreso", espacio: "Espacio creado", privado: "Mensaje privado" };

const e = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const when = (d?: string) => (d ? new Date(d).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "medium", timeZone: "America/Bogota" }) : "—");
const hex = async (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const table = (head: string[], rows: unknown[][]) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="m">Sin registros.</p>`;

let used = 0, filesOk = 0, filesMissing = 0; // se reinician en cada solicitud
async function media(list: any[]) {
  let out = "";
  for (const m of list ?? []) {
    const { data, error } = await admin.storage.from("plaza-media").download(m.path);
    if (error || !data) { filesMissing++; out += `<p class="m">Archivo no disponible: ${e(m.name ?? m.path)}</p>`; continue; }
    const buf = new Uint8Array(await data.arrayBuffer());
    const sum = await hex(buf); filesOk++;
    const cap = `<figcaption>${e(m.name ?? m.path)} · ${(buf.length / 1048576).toFixed(2)} MB<br><code>SHA-256 ${sum}</code></figcaption>`;
    if (m.k === "photo" && used + buf.length <= MAX_EMBED) {
      used += buf.length;
      out += `<figure><img src="data:${e(data.type || "image/jpeg")};base64,${encodeBase64(buf)}" alt="${e(m.name ?? "Imagen")}">${cap}</figure>`;
    } else {
      const { data: s } = await admin.storage.from("plaza-media").createSignedUrl(m.path, LINK_DAYS * 86400, { download: m.name ?? true });
      out += `<figure>${s ? `<p><a href="${e(s.signedUrl)}">Descargar ${m.k === "video" ? "video" : m.k === "audio" ? "audio" : "archivo"}</a> (enlace válido ${LINK_DAYS} días)</p>` : ""}${cap}</figure>`;
    }
  }
  return out;
}
async function items(list: any[]) {
  let out = "";
  for (const i of list ?? []) {
    out += `<article><h3>${e(KIND[i.kind] ?? i.kind)}${i.title ? `: ${e(i.title)}` : ""}</h3><p class="m">${e(when(i.created_at))}${i.username ? ` · @${e(i.username)}` : ""}${i.ip ? ` · IP ${e(i.ip)}` : ""}${i.municipio ? ` · ${e(i.municipio)}` : ""}${i.space_name ? ` · ${e(i.space_name)}` : ""}${i.is_private ? " · Privado" : ""}${i.is_breaking ? " · Última hora" : ""} · ID ${e(i.id)}</p>${i.body ? `<p class="b">${e(i.body)}</p>` : ""}${await media(i.media)}</article>`;
  }
  return out || `<p class="m">Sin publicaciones.</p>`;
}
async function dms(list: any[] | null) {
  if (!list) return "";
  let out = "";
  for (const d of list) out += `<article><p class="m">${e(when(d.created_at))} · @${e(d.sender)} a @${e(d.recipient)} · ID ${e(d.id)}</p>${d.body ? `<p class="b">${e(d.body)}</p>` : ""}${await media(d.media)}</article>`;
  return `<h2>Mensajes privados</h2>${out || `<p class="m">Sin mensajes.</p>`}`;
}
const page = (title: string, sub: string, body: string, generated: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>
body{font:15px/1.5 Georgia,serif;color:#10302C;max-width:860px;margin:0 auto;padding:28px 18px}h1{font:800 28px/1.15 Arial,sans-serif;margin:0}h2{font:700 19px Arial,sans-serif;margin:30px 0 8px;border-bottom:2px solid #0A6B5E;padding-bottom:4px}h3{font:700 15px Arial,sans-serif;margin:0}.m{color:#566D68;font:13px Arial,sans-serif;margin:3px 0}.b{white-space:pre-wrap;overflow-wrap:anywhere}article{border-bottom:1px solid #D3DED8;padding:12px 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font:13px Arial,sans-serif}th,td{border:1px solid #D3DED8;padding:5px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#E3EBE6}figure{margin:10px 0}img{max-width:100%;max-height:520px}figcaption{font:12px Arial,sans-serif;color:#566D68}code{font-size:11px;overflow-wrap:anywhere}
</style></head><body><h1>${e(title)}</h1><p class="m">${e(sub)}</p><p class="m">Generado el ${e(when(generated))}, hora de Colombia. Plaza, panel de administración.</p>${body}</body></html>`;

async function userDoc(d: any) {
  const p = d.profile;
  const body = `<h2>Cuenta</h2>${table(["Dato", "Valor"], [["Usuario", "@" + p.username], ["ID", p.id], ["Registro", when(p.created_at)], ["Último inicio de sesión", when(p.last_sign_in_at)], ["Correo vinculado", p.email ?? "Sin vincular"], ["Celular vinculado", p.phone ?? "Sin vincular"], ["Suspensión", p.sanction ? `${p.sanction.until ? "Hasta " + when(p.sanction.until) : "Sin fecha"}. ${p.sanction.reason ?? ""}` : "No"]])}
<h2>Actividad por IP (${d.events.length})</h2>${table(["Fecha", "Acción", "IP", "Dispositivo"], d.events.map((v: any) => [when(v.created_at), KIND[v.kind] ?? v.kind, v.ip, v.user_agent ?? ""]))}
<h2>Publicaciones y comentarios (${d.items.length})</h2>${await items(d.items)}
<h2>Sigue o pertenece a</h2>${table(["Espacio", "Tipo", "Desde"], d.follows.map((f: any) => [f.name, f.type, when(f.created_at)]))}
<h2>Votos en noticias</h2>${table(["Noticia", "Voto"], d.votes.map((v: any) => [v.title, v.value > 0 ? "A favor" : "En contra"]))}
<h2>Me gusta en mensajes y preguntas</h2><p>${e(d.likes)} registrados.</p>
${d.removed.length ? `<h2>Contenido eliminado por administración</h2>${table(["Fecha", "Acción", "Título", "Texto", "Motivo"], d.removed.map((r: any) => [when(r.created_at), r.action, r.detail?.titulo ?? "", r.detail?.texto ?? "", r.detail?.motivo ?? ""]))}` : ""}
${d.dms ? await dms(d.dms) : `<p class="m">Este expediente no incluye el contenido de mensajes privados.</p>`}`;
  return { html: page(`Expediente de @${p.username}`, `Todo lo registrado de esta cuenta. Solo se guarda IP desde el 4 de noviembre de 2026.`, body, d.generated_at), name: `plaza-usuario-${p.username}` };
}
async function ipDoc(d: any) {
  const body = `<h2>Cuentas que usaron esta IP (${d.users.length})</h2>${table(["Usuario", "ID", "Registro", "Correo", "Celular", "Eventos", "Primera vez", "Última vez"], d.users.map((u: any) => ["@" + u.username, u.id, when(u.created_at), u.email ?? "—", u.phone ?? "—", u.events, when(u.first_seen), when(u.last_seen)]))}
<h2>Historial completo (${d.events.length})</h2>${table(["Fecha", "Usuario", "Acción", "ID del contenido", "Dispositivo"], d.events.map((v: any) => [when(v.created_at), "@" + v.username, KIND[v.kind] ?? v.kind, v.ref_id ?? "", v.user_agent ?? ""]))}
<h2>Publicaciones hechas desde esta IP (${d.items.length})</h2>${await items(d.items)}
${d.dms ? await dms(d.dms) : `<p class="m">Este expediente no incluye el contenido de mensajes privados.</p>`}`;
  return { html: page(`Historial de la IP ${d.ip}`, "Todo lo registrado desde esta dirección. Solo se guarda IP desde el 4 de noviembre de 2026.", body, d.generated_at), name: `plaza-ip-${String(d.ip).replace(/[^0-9a-fA-F]/g, "-")}` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Solicitud no válida" }, 400); }
  const { data: hook } = await admin.from("plaza_panel_secret").select("value").eq("id", 1).single();
  if (!hook || b.secret !== hook.value) return json({ error: "No autorizado" }, 401);
  try {
    used = 0; filesOk = 0; filesMissing = 0;
    const d = b.dossier;
    const { html, name } = d.type === "ip" ? await ipDoc(d) : await userDoc(d);
    const bytes = new TextEncoder().encode(html);
    const sha256 = await hex(bytes);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `${name}-${stamp}.html`;
    const up = await admin.storage.from("plaza-exports").upload(file, bytes, { contentType: "text/html;charset=utf-8" });
    if (up.error) throw up.error;
    const { data: s, error } = await admin.storage.from("plaza-exports").createSignedUrl(file, 3600, { download: file });
    if (error || !s) throw error;
    await admin.from("plaza_audit").insert({ actor_name: "Administrador", action: "Descargó expediente", target: file, detail: { sha256, mensajes_privados: !!d.dms, archivos: filesOk, archivos_no_disponibles: filesMissing } });
    return json({ url: s.signedUrl, file, sha256, size: bytes.length, files: filesOk, missing: filesMissing });
  } catch (x: any) {
    return json({ error: x?.message ?? "No se pudo crear el expediente" }, 500);
  }
});
