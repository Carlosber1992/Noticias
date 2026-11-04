export const nz = (t?: string | null) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const when = (ts: string) => {
  const d = (Date.now() - new Date(ts).getTime()) / 60000;
  if (d < 1) return 'ahora';
  if (d < 60) return `${Math.floor(d)} min`;
  if (d < 1440) return `${Math.floor(d / 60)} h`;
  return `${Math.floor(d / 1440)} d`;
};
export type Pt = { lat: number; lng: number };
export const distKm = (a: Pt, b: Pt) => {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const km = (d: number) => `${d.toLocaleString('es-CO', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;
export const CITIES: (Pt & { label: string })[] = [
  { label: 'Bogotá', lat: 4.711, lng: -74.072 }, { label: 'Medellín', lat: 6.244, lng: -75.581 }, { label: 'Cali', lat: 3.452, lng: -76.532 },
  { label: 'Barranquilla', lat: 10.964, lng: -74.796 }, { label: 'Cartagena', lat: 10.391, lng: -75.479 }, { label: 'Bucaramanga', lat: 7.119, lng: -73.123 },
  { label: 'Pereira', lat: 4.813, lng: -75.696 }, { label: 'Manizales', lat: 5.07, lng: -75.513 }, { label: 'Cúcuta', lat: 7.893, lng: -72.508 },
  { label: 'Ibagué', lat: 4.439, lng: -75.232 }, { label: 'Santa Marta', lat: 11.241, lng: -74.205 }, { label: 'Pasto', lat: 1.214, lng: -77.281 },
  { label: 'Envigado', lat: 6.171, lng: -75.584 }, { label: 'Chía', lat: 4.862, lng: -74.058 }, { label: 'Zipaquirá', lat: 5.022, lng: -74.005 },
];
export const errText = (e: any) => { const m = String(e?.message ?? e ?? ''); return /Necesitas|Solo |Escribe/.test(m) ? m : 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.'; };
