import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Btn, Card, Chip, Empty, Field, Loading, Row, Screen, SpIcon, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { CITIES, distKm, km, nz } from '../../lib/util';

export default function Cerca() {
  const t = useT(); const { uid, here, setHere, useGps, say, need } = useApp();
  const [list, setList] = useState<any[] | null>(null); const [mine, setMine] = useState<string[]>([]); const [radius, setRadius] = useState(10); const [type, setType] = useState('todos'); const [q, setQ] = useState(''); const [pick, setPick] = useState(false);
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.from('plaza_spaces').select('*').neq('type', 'foro').order('created_at', { ascending: false });
      setList(data ?? []);
      if (uid) { const m = await supabase.from('plaza_members').select('space_id').eq('user_id', uid); setMine((m.data ?? []).map((x) => x.space_id)); }
    })();
  }, [uid]));
  const shown = useMemo(() => (list ?? []).map((s) => ({ ...s, d: here && s.lat != null ? distKm(here, s) : null })).filter((s) => (type === 'todos' || s.type === type) && (radius >= 9999 || (s.d != null && s.d <= radius)) && nz(s.name).includes(nz(q))).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9)), [list, here, radius, type, q]);
  const R = 150;
  return (
    <Screen title="Cerca de ti" sub={here?.label ?? 'Elige tu ubicación'} right={<Row style={{ flexWrap: 'nowrap', gap: 6 }}><Btn testID="loc" small icon="location-outline" label="Cambiar" onPress={() => setPick(!pick)} /><Btn testID="new-space" small kind="sun" icon="add" label="Crear" onPress={() => need(() => router.push({ pathname: '/crear', params: { type: 'grupo' } }))} /></Row>}>
      {pick || !here ? <Card>
        <Btn testID="gps" kind="pri" icon="navigate-outline" label="Usar mi ubicación" onPress={async () => { const e = await useGps(); if (e) say(e); else setPick(false); }} />
        <T kind="muted">O elige tu ciudad:</T>
        <Row>{CITIES.map((c) => <Chip key={c.label} testID={`city-${c.label}`} label={c.label} on={here?.label === c.label} onPress={() => { setHere(c); setPick(false); }} />)}</Row>
      </Card> : null}
      <Field testID="cerca-q" value={q} onChangeText={setQ} placeholder="Buscar grupos y canales" />
      <Row>{[['todos', 'Todos'], ['grupo', 'Grupos'], ['canal', 'Canales']].map(([k, l]) => <Chip key={k} label={l} on={type === k} onPress={() => setType(k)} />)}</Row>
      <Row>{[[1, '1 km'], [3, '3 km'], [10, '10 km'], [50, '50 km'], [9999, 'Todo']].map(([r, l]) => <Chip key={r} label={String(l)} on={radius === r} onPress={() => setRadius(r as number)} />)}<T kind="muted">{shown.length} {shown.length === 1 ? 'espacio' : 'espacios'}</T></Row>
      {here && radius < 9999 ? <View style={{ alignSelf: 'center', width: R * 2, height: R * 2, borderRadius: R, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
        <View style={{ position: 'absolute', left: R / 2, top: R / 2, width: R, height: R, borderRadius: R / 2, borderWidth: 1, borderColor: t.line, borderStyle: 'dashed' }} />
        <View style={{ position: 'absolute', left: R - 7, top: R - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: t.sun, borderWidth: 2, borderColor: t.ink }} />
        {shown.map((s) => { const kmX = (s.lng - here.lng) * 111 * Math.cos((here.lat * Math.PI) / 180), kmY = (s.lat - here.lat) * 111; const f = (R - 14) / radius; return <Pressable key={s.id} accessibilityLabel={s.name} onPress={() => router.push(`/espacio/${s.id}`)} style={{ position: 'absolute', left: R + kmX * f - 9, top: R - kmY * f - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: t[s.type as 'grupo'], borderWidth: 2, borderColor: t.surface }} />; })}
      </View> : null}
      {!list ? <Loading /> : !shown.length ? <Empty title="Nada por aquí" text={here ? 'Prueba con un radio más amplio o crea tu grupo o canal.' : 'Elige tu ubicación para ver lo que hay cerca, o toca Todo.'} /> : shown.map((s) => (
        <Card key={s.id} testID="space-row" onPress={() => router.push(`/espacio/${s.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SpIcon type={s.type} /><View style={{ flex: 1, minWidth: 0 }}><Row style={{ flexWrap: 'nowrap' }}><T kind="semi" numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</T>{s.is_private ? <Ionicons name="lock-closed-outline" size={14} color={t.muted} /> : null}</Row><T kind="muted" numberOfLines={1} style={{ fontSize: 13 }}>{s.is_private && !mine.includes(s.id) ? 'Privado: pide autorización' : `${s.type === 'canal' ? 'Canal' : 'Grupo'}${s.place ? ` · ${s.place}` : ''}`}</T></View>
          {s.d != null ? <T kind="bold" style={{ fontSize: 13 }}>{km(s.d)}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
