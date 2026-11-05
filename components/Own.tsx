import React, { useState } from 'react';
import { View } from 'react-native';
import { LocPicker } from './LocPicker';
import { Btn, Field, Row, T } from './ui';
import { Here, useApp } from '../lib/app';
import { Media, removeMedia } from '../lib/media';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { errText } from '../lib/util';

// Editar y eliminar lo propio. Eliminar siempre pide confirmar en la misma pantalla.
export function OwnActions({ what, onEdit, onDelete, warn }: { what: string; onEdit?: () => void; onDelete: () => Promise<any>; warn?: string }) {
  const t = useT(); const { say } = useApp(); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false);
  const del = async () => { setBusy(true); try { await onDelete(); say(`Eliminado`); } catch (e) { say(errText(e)); setBusy(false); setAsk(false); } };
  if (ask) return (
    <View style={{ gap: 6 }}>
      <T kind="semi" style={{ color: t.news }}>¿Eliminar {what}? No se puede deshacer.{warn ? ` ${warn}` : ''}</T>
      <Row><Btn testID="own-yes" small kind="pri" label={busy ? 'Eliminando…' : 'Sí, eliminar'} disabled={busy} onPress={del} /><Btn small label="Cancelar" disabled={busy} onPress={() => setAsk(false)} /></Row>
    </View>
  );
  return <Row>{onEdit ? <Btn testID="own-edit" small icon="create-outline" label="Editar" onPress={onEdit} /> : null}<Btn testID="own-del" small icon="trash-outline" label="Eliminar" onPress={() => setAsk(true)} /></Row>;
}
type F = { key: string; label: string; value: string; multiline?: boolean; max?: number; min?: number; msg?: string };
export function EditForm({ fields, loc, onSave, onCancel }: { fields: F[]; loc?: { value: Here | null }; onSave: (v: Record<string, string>, l: Here | null) => Promise<any>; onCancel: () => void }) {
  const t = useT(); const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.value]))); const [l, setL] = useState<Here | null>(loc?.value ?? null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    for (const f of fields) if ((v[f.key] ?? '').trim().length < (f.min ?? 0)) return setErr(f.msg ?? `Completa ${f.label.toLowerCase()}.`);
    setBusy(true); setErr('');
    try { await onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])), l); } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <View style={{ gap: 10 }}>
      {fields.map((f) => <Field key={f.key} testID={`e-${f.key}`} label={f.label} value={v[f.key]} multiline={f.multiline} maxLength={f.max} onChangeText={(x: string) => setV({ ...v, [f.key]: x })} />)}
      {loc ? <LocPicker label="Ubicación (opcional)" value={l} onChange={setL} /> : null}
      {err ? <T style={{ color: t.news }}>{err}</T> : null}
      <Row><Btn testID="e-save" small kind="pri" label={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={save} /><Btn small label="Cancelar" disabled={busy} onPress={onCancel} /></Row>
    </View>
  );
}
export const check = (r: { error: any; data?: any }) => { if (r.error) throw r.error; return r; };
export const locCols = (l: Here | null) => ({ lat: l?.lat ?? null, lng: l?.lng ?? null, place: l?.label ?? null });
export const locOf = (x: any): Here | null => (x.lat != null ? { lat: x.lat, lng: x.lng, label: x.place ?? 'Ubicación' } : null);

// Texto de un comentario, respuesta o mensaje, con sus acciones si es propio.
export function Editable({ table, id, body, media, edited, own, what, onDone, children }: { table: string; id: string; body: string; media?: Media[]; edited?: string | null; own: boolean; what: string; onDone: () => void; children?: React.ReactNode }) {
  const { say } = useApp(); const [ed, setEd] = useState(false);
  if (ed) return <EditForm fields={[{ key: 'body', label: 'Texto', value: body, multiline: true, max: 4000, min: media?.length ? 0 : 1, msg: 'Escribe el texto.' }]} onCancel={() => setEd(false)} onSave={async (v) => { check(await supabase.from(table).update({ body: v.body }).eq('id', id)); setEd(false); say('Cambios guardados'); onDone(); }} />;
  return (<>
    {body ? <T>{body}{edited ? <T kind="muted" style={{ fontSize: 12 }}> (editado)</T> : null}</T> : null}
    {children}
    {own ? <OwnActions what={what} onEdit={() => setEd(true)} onDelete={async () => { check(await supabase.from(table).delete().eq('id', id)); await removeMedia(media); onDone(); }} /> : null}
  </>);
}
