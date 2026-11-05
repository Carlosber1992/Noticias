import React, { useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { WEB_URL } from '../lib/config';
import { useT } from '../lib/theme';
import { nz } from '../lib/util';
import { Field, T } from './ui';

const key = (t: string) => nz(t).replace(/[^a-z0-9]/g, '').slice(0, 2);
const cache = new Map<string, string[][]>();
async function chunk(k: string) {
  if (cache.has(k)) return cache.get(k)!;
  try {
    const r = await fetch(`${Platform.OS === 'web' ? '' : WEB_URL}/loc/${k}.json`);
    const d: string[][] = r.ok && (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : [];
    cache.set(k, d); return d;
  } catch { return []; }
}
export async function searchLocalities(q: string) {
  const w = nz(q).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (key(q).length < 2 || !w.length) return [];
  const rows = await chunk(key(q));
  const full = w.join(' '), rank = (n: string) => (n === full ? 0 : n.startsWith(full) ? 1 : 2);
  return rows.map((r) => ({ name: nz(r[0]), label: r.join(', '), hay: nz(r.join(' ')) })).filter((r) => r.name.startsWith(w[0]) && w.every((x) => r.hay.includes(x)))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length || a.label.localeCompare(b.label, 'es')).slice(0, 30).map((r) => r.label);
}
// Escribe un municipio y elige de la lista: municipio, departamento y país.
export function LocalityField({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID?: string }) {
  const t = useT(); const [opts, setOpts] = useState<string[]>([]); const [none, setNone] = useState(false); const last = useRef('');
  const type = async (v: string) => {
    onChange(v); last.current = v;
    const r = await searchLocalities(v);
    if (last.current !== v) return;
    setOpts(r); setNone(key(v).length === 2 && !r.length);
  };
  const pick = (v: string) => { last.current = v; onChange(v); setOpts([]); setNone(false); };
  return (
    <View style={{ gap: 6 }}>
      <Field testID={testID} label={label} value={value} onChangeText={type} maxLength={120} autoCorrect={false} placeholder="Escribe el municipio" />
      {opts.length ? <View style={{ backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.line, maxHeight: 260, overflow: 'scroll' as any }}>
        {opts.map((o) => <Pressable key={o} testID="loc-opt" accessibilityRole="button" onPress={() => pick(o)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}><T>{o}</T></Pressable>)}
      </View> : null}
      {none ? <T kind="muted" style={{ fontSize: 13 }}>No está en la lista. Puedes dejarlo escrito así.</T> : null}
    </View>
  );
}
