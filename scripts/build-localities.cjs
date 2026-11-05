// Genera public/loc/ a partir de GeoNames (paquete cities.json, CC BY 4.0).
// Uso: node scripts/build-localities.cjs <carpeta de node_modules/cities.json>
const fs = require('fs'), path = require('path');
const d = process.argv[2], out = path.join(__dirname, '..', 'public', 'loc');
const read = (f) => JSON.parse(fs.readFileSync(path.join(d, f)));
const C = { AR: 'Argentina', BO: 'Bolivia', BR: 'Brasil', BZ: 'Belice', CL: 'Chile', CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', DO: 'República Dominicana', EC: 'Ecuador', SV: 'El Salvador', GT: 'Guatemala', GY: 'Guyana', HT: 'Haití', HN: 'Honduras', MX: 'México', NI: 'Nicaragua', PA: 'Panamá', PY: 'Paraguay', PE: 'Perú', PR: 'Puerto Rico', SR: 'Surinam', UY: 'Uruguay', VE: 'Venezuela' };
const admin = Object.fromEntries(read('admin1.json').map((a) => [a.code, a.name]));
const nz = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const seen = new Set(), by = {};
for (const c of read('cities.json')) {
  if (!C[c.country]) continue;
  const a = (admin[`${c.country}.${c.admin1}`] ?? '').replace(/^(Departamento|Provincia|Estado|Departamento del|Departamento de|Provincia de|Provincia del) (de |del )?/i, '');
  const key = `${c.name}|${a}|${c.country}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const k = nz(c.name).slice(0, 2);
  if (k.length === 2) (by[k] ??= []).push(a ? [c.name, a, C[c.country]] : [c.name, C[c.country]]);
}
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const [k, v] of Object.entries(by)) fs.writeFileSync(path.join(out, `${k}.json`), JSON.stringify(v));
console.log(seen.size, 'localidades en', Object.keys(by).length, 'archivos');
