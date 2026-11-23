// Crea el expediente de un usuario o de una IP: un HTML que se abre sin internet, con las imágenes
// dentro y la huella SHA-256 de cada archivo. Solo responde a plaza_panel, que conoce la clave.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_EMBED = 35 * 1024 * 1024, LINK_DAYS = 7;
const KIND: Record<string, string> = { publicacion: "Publicación", comentario_feed: "Comentario en publicación", canal_feed: "Canal de Yasupo", edicion: "Edición", registro: "Registro de cuenta", noticia: "Noticia", comentario: "Comentario", pregunta: "Pregunta", respuesta: "Respuesta", mensaje: "Mensaje", grupo: "Grupo", canal: "Canal", foro: "Foro", ingreso: "Ingreso", espacio: "Espacio creado", privado: "Mensaje privado" };

const e = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const when = (d?: string) => (d ? new Date(d).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "medium", timeZone: "America/Bogota" }) : "—");
const hex = async (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const table = (head: string[], rows: unknown[][]) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="m">Sin registros.</p>`;

let used = 0, filesOk = 0, filesMissing = 0; // se reinician en cada solicitud
type File_ = { buf: Uint8Array; type: string; sum: string } | null;
let cache = new Map<string, File_>();
async function fetchFile(m: any): Promise<File_> {
  const key = (m.bucket ?? "plaza-media") + "/" + m.path;
  if (cache.has(key)) return cache.get(key)!;
  const { data, error } = await admin.storage.from(m.bucket ?? "plaza-media").download(m.path);
  let f: File_ = null;
  if (!error && data) { const buf = new Uint8Array(await data.arrayBuffer()); f = { buf, type: data.type || "", sum: await hex(buf) }; }
  cache.set(key, f);
  return f;
}
async function media(list: any[]) {
  let out = "";
  for (const m of list ?? []) {
    const f = await fetchFile(m);
    if (!f) { filesMissing++; out += `<p class="m">Archivo no disponible: ${e(m.name ?? m.path)}</p>`; continue; }
    const buf = f.buf, sum = f.sum, data = { type: f.type }; filesOk++;
    const cap = `<figcaption>${e(m.name ?? m.path)} · ${(buf.length / 1048576).toFixed(2)} MB<br><code>SHA-256 ${sum}</code></figcaption>`;
    if ((m.k === "photo" || m.k === "image") && used + buf.length <= MAX_EMBED) {
      used += buf.length;
      out += `<figure><img src="data:${e(data.type || "image/jpeg")};base64,${encodeBase64(buf)}" alt="${e(m.name ?? "Imagen")}">${cap}</figure>`;
    } else {
      const { data: s } = await admin.storage.from(m.bucket ?? "plaza-media").createSignedUrl(m.path, LINK_DAYS * 86400, { download: m.name ?? true });
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
body{font:15px/1.5 Georgia,serif;color:#10302C;max-width:860px;margin:0 auto;padding:28px 18px}h1{font:800 28px/1.15 Arial,sans-serif;margin:0}h2{font:700 19px Arial,sans-serif;margin:30px 0 8px;border-bottom:2px solid #0A6B5E;padding-bottom:4px}h3{font:700 15px Arial,sans-serif;margin:0}.m{color:#566D68;font:13px Arial,sans-serif;margin:3px 0}.b{white-space:pre-wrap;overflow-wrap:anywhere}article{border-bottom:1px solid #D3DED8;padding:12px 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font:13px Arial,sans-serif}th,td{border:1px solid #D3DED8;padding:5px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#E3EBE6}figure{margin:10px 0}img{max-width:100%;max-height:520px}figcaption{font:12px Arial,sans-serif;color:#566D68}code{font-size:11px;overflow-wrap:anywhere}.pdf{position:sticky;top:0;background:#fff;padding:10px 0;margin-bottom:8px;border-bottom:1px solid #D3DED8}.pdf button{font:700 15px Arial,sans-serif;background:#0A6B5E;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}@media print{.pdf{display:none}}
</style></head><body><div class="pdf"><button onclick="window.print()">Guardar como PDF</button> <span class="m">En el cuadro de impresión elige «Guardar como PDF».</span></div><h1>${e(title)}</h1><p class="m">${e(sub)}</p><p class="m">Generado el ${e(when(generated))}, hora de Colombia. Yasupo, panel de administración.</p>${body}</body></html>`;

async function userDoc(d: any) {
  const p = d.profile;
  const body = `<h2>Cuenta</h2>${table(["Dato", "Valor"], [["Usuario", "@" + p.username], ["ID", p.id], ["Registro", when(p.created_at)], ["Último inicio de sesión", when(p.last_sign_in_at)], ["Correo vinculado", p.email ?? "Sin vincular"], ["Celular vinculado", p.phone ?? "Sin vincular"], ["Nombre en Yasupo", d.feed?.alias ?? "—"], ["Biografía", d.feed?.bio ?? "—"], ["Canal", d.feed_channel?.name ?? "Sin canal"], ["Canales que sigue", (d.feed?.follows ?? []).join(", ") || "—"], ["Me gusta / no me gusta", `${(d.feed?.likes ?? []).length} / ${(d.feed?.dislikes ?? []).length}`], ["Suspensión", p.sanction ? `${p.sanction.until ? "Hasta " + when(p.sanction.until) : "Sin fecha"}. ${p.sanction.reason ?? ""}` : "No"]])}
<h2>Actividad por IP (${d.events.length})</h2>${table(["Fecha", "Acción", "IP", "Dispositivo"], d.events.map((v: any) => [when(v.created_at), KIND[v.kind] ?? v.kind, v.ip, v.user_agent ?? ""]))}
<h2>Publicaciones y comentarios (${d.items.length})</h2>${await items(d.items)}
<h2>Sigue o pertenece a</h2>${table(["Espacio", "Tipo", "Desde"], d.follows.map((f: any) => [f.name, f.type, when(f.created_at)]))}
<h2>Votos en noticias</h2>${table(["Noticia", "Voto"], d.votes.map((v: any) => [v.title, v.value > 0 ? "A favor" : "En contra"]))}
<h2>Me gusta en mensajes y preguntas</h2><p>${e(d.likes)} registrados.</p>
${d.removed.length ? `<h2>Contenido eliminado por administración</h2>${table(["Fecha", "Acción", "Título", "Texto", "Motivo"], d.removed.map((r: any) => [when(r.created_at), r.action, r.detail?.titulo ?? "", r.detail?.texto ?? "", r.detail?.motivo ?? ""]))}` : ""}
${d.dms ? await dms(d.dms) : `<p class="m">Este expediente no incluye el contenido de mensajes privados.</p>`}`;
  return { html: page(`Expediente de @${p.username}`, `Todo lo registrado de esta cuenta. Solo se guarda IP desde el 4 de noviembre de 2026.`, body, d.generated_at), name: `yasupo-usuario-${p.username}` };
}
async function ipDoc(d: any) {
  const body = `<h2>Cuentas que usaron esta IP (${d.users.length})</h2>${table(["Usuario", "ID", "Registro", "Correo", "Celular", "Eventos", "Primera vez", "Última vez"], d.users.map((u: any) => ["@" + u.username, u.id, when(u.created_at), u.email ?? "—", u.phone ?? "—", u.events, when(u.first_seen), when(u.last_seen)]))}
<h2>Historial completo (${d.events.length})</h2>${table(["Fecha", "Usuario", "Acción", "ID del contenido", "Dispositivo"], d.events.map((v: any) => [when(v.created_at), "@" + v.username, KIND[v.kind] ?? v.kind, v.ref_id ?? "", v.user_agent ?? ""]))}
<h2>Publicaciones hechas desde esta IP (${d.items.length})</h2>${await items(d.items)}
${d.dms ? await dms(d.dms) : `<p class="m">Este expediente no incluye el contenido de mensajes privados.</p>`}`;
  return { html: page(`Historial de la IP ${d.ip}`, "Todo lo registrado desde esta dirección. Solo se guarda IP desde el 4 de noviembre de 2026.", body, d.generated_at), name: `yasupo-ip-${String(d.ip).replace(/[^0-9a-fA-F]/g, "-")}` };
}

// ---------- PDF ----------
// Las fuentes estándar del PDF no traen emojis ni algunos símbolos: se reemplazan para no romper el archivo.
const clean = (v: unknown) => String(v ?? "").replace(/\r/g, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D\u00AB\u00BB]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/[\u202F\u2009]/g, " ").replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
class Pdf {
  doc!: PDFDocument; page!: PDFPage; f!: PDFFont; b!: PDFFont; y = 0; W = 595; H = 842; M = 48;
  static async make() { const p = new Pdf(); p.doc = await PDFDocument.create(); p.f = await p.doc.embedFont(StandardFonts.Helvetica); p.b = await p.doc.embedFont(StandardFonts.HelveticaBold); p.add(); return p; }
  add() { this.page = this.doc.addPage([this.W, this.H]); this.y = this.H - this.M; }
  need(h: number) { if (this.y - h < this.M) this.add(); }
  lines(t: string, size: number, font: PDFFont, width: number) {
    const out: string[] = [];
    for (const para of clean(t).split("\n")) {
      let line = "";
      for (const w of para.split(/ +/)) {
        let word = w;
        while (font.widthOfTextAtSize(word, size) > width) { if (line) { out.push(line); line = ""; } let k = word.length; while (k > 1 && font.widthOfTextAtSize(word.slice(0, k), size) > width) k--; out.push(word.slice(0, k)); word = word.slice(k); }
        const t2 = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(t2, size) > width && line) { out.push(line); line = word; } else line = t2;
      }
      out.push(line);
    }
    return out;
  }
  text(t: unknown, o: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10, font = o.bold ? this.b : this.f, x = this.M + (o.indent ?? 0), lh = size * 1.35;
    for (const l of this.lines(String(t ?? ""), size, font, this.W - this.M - x)) { this.need(lh); this.page.drawText(l, { x, y: this.y - size, size, font, color: rgb(...(o.color ?? [0.06, 0.16, 0.17])) }); this.y -= lh; }
    this.y -= o.gap ?? 2;
  }
  h2(t: string) { this.y -= 10; this.need(30); this.text(t, { size: 14, bold: true, color: [0.04, 0.42, 0.37] }); this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 1, color: rgb(0.04, 0.42, 0.37) }); this.y -= 8; }
  rule() { this.need(8); this.page.drawLine({ start: { x: this.M, y: this.y - 3 }, end: { x: this.W - this.M, y: this.y - 3 }, thickness: 0.5, color: rgb(0.83, 0.87, 0.85) }); this.y -= 9; }
  async image(f: NonNullable<File_>) {
    let img;
    try { img = /png/i.test(f.type) ? await this.doc.embedPng(f.buf) : /jpe?g/i.test(f.type) ? await this.doc.embedJpg(f.buf) : null; } catch { img = null; }
    if (!img) return false;
    const maxW = this.W - 2 * this.M, maxH = 340, k = Math.min(1, maxW / img.width, maxH / img.height), w = img.width * k, h = img.height * k;
    this.need(h + 6); this.page.drawImage(img, { x: this.M, y: this.y - h, width: w, height: h }); this.y -= h + 4; return true;
  }
}
async function pdfMedia(p: Pdf, list: any[]) {
  for (const m of list ?? []) {
    const f = await fetchFile(m);
    if (!f) { p.text(`Archivo no disponible: ${m.name ?? m.path}`, { size: 8, color: [0.6, 0.2, 0.2] }); continue; }
    const shown = (m.k === "photo" || m.k === "image") && await p.image(f);
    p.text(`${shown ? "" : (m.k === "video" ? "Video" : m.k === "audio" ? "Audio" : "Archivo") + " (no se puede mostrar en PDF; está en el HTML) · "}${m.name ?? m.path} · ${(f.buf.length / 1048576).toFixed(2)} MB`, { size: 7.5, color: [0.35, 0.43, 0.42] });
    p.text(`SHA-256 ${f.sum}`, { size: 7, color: [0.35, 0.43, 0.42], gap: 6 });
  }
}
async function pdfItems(p: Pdf, list: any[]) {
  if (!list?.length) { p.text("Sin publicaciones.", { color: [0.35, 0.43, 0.42] }); return; }
  for (const i of list) {
    p.need(40);
    p.text(`${KIND[i.kind] ?? i.kind}${i.title ? ": " + i.title : ""}`, { size: 11, bold: true });
    p.text([when(i.created_at), i.username ? "@" + i.username : "", i.ip ? "IP " + i.ip : "", i.municipio ?? "", i.space_name ?? "", i.is_private ? "Privado" : "", "ID " + i.id].filter(Boolean).join(" · "), { size: 8, color: [0.35, 0.43, 0.42] });
    if (i.body) p.text(i.body, { size: 10 });
    await pdfMedia(p, i.media);
    p.rule();
  }
}
const pdfRows = (p: Pdf, rows: string[]) => { if (!rows.length) p.text("Sin registros.", { color: [0.35, 0.43, 0.42] }); for (const r of rows) p.text(r, { size: 9 }); };
async function buildPdf(d: any) {
  const p = await Pdf.make();
  const title = d.type === "ip" ? `Historial de la IP ${d.ip}` : `Expediente de @${d.profile.username}`;
  p.text(title, { size: 20, bold: true, gap: 4 });
  p.text(`Generado el ${when(d.generated_at)}, hora de Colombia. Yasupo, panel de administración. Solo se guarda IP desde el 4 de noviembre de 2026.`, { size: 9, color: [0.35, 0.43, 0.42] });
  if (d.type === "ip") {
    p.h2(`Cuentas que usaron esta IP (${d.users.length})`);
    pdfRows(p, d.users.map((u: any) => `@${u.username} · ${u.events} eventos · correo ${u.email ?? "-"} · celular ${u.phone ?? "-"} · de ${when(u.first_seen)} a ${when(u.last_seen)} · ID ${u.id}`));
    p.h2(`Historial completo (${d.events.length})`);
    pdfRows(p, d.events.map((v: any) => `${when(v.created_at)} · @${v.username} · ${KIND[v.kind] ?? v.kind}${v.ref_id ? " · " + v.ref_id : ""}${v.user_agent ? " · " + v.user_agent : ""}`));
    p.h2(`Publicaciones hechas desde esta IP (${d.items.length})`);
    await pdfItems(p, d.items);
  } else {
    const u = d.profile;
    p.h2("Cuenta");
    pdfRows(p, [`Usuario: @${u.username}`, `ID: ${u.id}`, `Registro: ${when(u.created_at)}`, `Último inicio de sesión: ${when(u.last_sign_in_at)}`, `Correo: ${u.email ?? "Sin vincular"}`, `Celular: ${u.phone ?? "Sin vincular"}`, `Nombre en Yasupo: ${d.feed?.alias ?? "-"}`, `Biografía: ${d.feed?.bio ?? "-"}`, `Canal: ${d.feed_channel?.name ?? "Sin canal"}`, `Canales que sigue: ${(d.feed?.follows ?? []).join(", ") || "-"}`, `Me gusta / no me gusta: ${(d.feed?.likes ?? []).length} / ${(d.feed?.dislikes ?? []).length}`, `Suspensión: ${u.sanction ? (u.sanction.until ? "Hasta " + when(u.sanction.until) : "Sin fecha") + ". " + (u.sanction.reason ?? "") : "No"}`]);
    p.h2(`Actividad por IP (${d.events.length})`);
    pdfRows(p, d.events.map((v: any) => `${when(v.created_at)} · ${KIND[v.kind] ?? v.kind} · IP ${v.ip}${v.user_agent ? " · " + v.user_agent : ""}`));
    p.h2(`Publicaciones y comentarios (${d.items.length})`);
    await pdfItems(p, d.items);
    if (d.removed?.length) { p.h2("Contenido eliminado por administración"); pdfRows(p, d.removed.map((r: any) => `${when(r.created_at)} · ${r.action} · ${r.detail?.titulo ?? ""} · ${r.detail?.texto ?? ""} · Motivo: ${r.detail?.motivo ?? "-"}`)); }
  }
  if (d.dms) {
    p.h2("Mensajes privados");
    if (!d.dms.length) p.text("Sin mensajes.");
    for (const m of d.dms) { p.text(`${when(m.created_at)} · @${m.sender} a @${m.recipient} · ID ${m.id}`, { size: 8, color: [0.35, 0.43, 0.42] }); if (m.body) p.text(m.body); await pdfMedia(p, m.media); p.rule(); }
  } else p.text("Este expediente no incluye el contenido de mensajes privados.", { size: 9, color: [0.35, 0.43, 0.42] });
  const pages = p.doc.getPages();
  pages.forEach((pg, i) => pg.drawText(clean(`${title} · página ${i + 1} de ${pages.length}`), { x: p.M, y: 24, size: 7.5, font: p.f, color: rgb(0.35, 0.43, 0.42) }));
  p.doc.setTitle(clean(title)); p.doc.setCreator("Yasupo, panel de administración");
  return await p.doc.save();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Solicitud no válida" }, 400); }
  const { data: hook } = await admin.from("plaza_panel_secret").select("value").eq("id", 1).single();
  if (!hook || b.secret !== hook.value) return json({ error: "No autorizado" }, 401);
  try {
    used = 0; filesOk = 0; filesMissing = 0; cache = new Map();
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
    const pdfBytes = await buildPdf(d);
    const pfile = file.replace(/\.html$/, ".pdf");
    const upp = await admin.storage.from("plaza-exports").upload(pfile, pdfBytes, { contentType: "application/pdf" });
    if (upp.error) throw upp.error;
    const { data: v } = await admin.storage.from("plaza-exports").createSignedUrl(pfile, 3600, { download: pfile });
    const pdfSha = await hex(pdfBytes);
    await admin.from("plaza_audit").insert({ actor_name: "Administrador", action: "Descargó expediente", target: file, detail: { sha256, sha256_pdf: pdfSha, mensajes_privados: !!d.dms, archivos: filesOk, archivos_no_disponibles: filesMissing } });
    return json({ url: s.signedUrl, pdf_url: v?.signedUrl ?? null, pdf_sha256: pdfSha, pdf_size: pdfBytes.length, file, sha256, size: bytes.length, files: filesOk, missing: filesMissing });
  } catch (x: any) {
    return json({ error: x?.message ?? "No se pudo crear el expediente" }, 500);
  }
});
