import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chip, Empty, Field, Loading, Row, Screen, SpIcon, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { withPins } from '../../lib/pins';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { nz, when } from '../../lib/util';

export default function Foros() {
  const t = useT(); const { uid, need } = useApp();
  const [list, setList] = useState<any[] | null>(null); const [mine, setMine] = useState<string[]>([]); const [q, setQ] = useState(''); const [f, setF] = useState('todos');
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.from('plaza_spaces').select('*').eq('type', 'foro').order('created_at', { ascending: false });
      setList(data ?? []);
      if (uid) { const m = await supabase.from('plaza_members').select('space_id').eq('user_id', uid); setMine((m.data ?? []).map((x) => x.space_id)); }
    })();
  }, [uid]));
  const shown = useMemo(() => withPins((list ?? []).filter((s) => (f === 'todos' || (f === 'mios' ? mine.includes(s.id) : f === 'pub' ? !s.is_private : s.is_private)) && nz(s.name).includes(nz(q)))), [list, mine, q, f]);
  return (
    <Screen title="Foros" right={<Btn testID="new-foro" small kind="sun" icon="add" label="Crear foro" onPress={() => need(() => router.push({ pathname: '/crear', params: { type: 'foro' } }))} />}>
      <Field value={q} onChangeText={setQ} placeholder="Buscar foros" />
      <Row>{[['todos', 'Todos'], ['mios', 'Los míos'], ['pub', 'Públicos'], ['priv', 'Privados']].map(([k, l]) => <Chip key={k} label={l} on={f === k} onPress={() => setF(k)} />)}</Row>
      {!list ? <Loading /> : !shown.length ? <Empty title="No hay foros aquí" text="Crea el primero con el botón de arriba." /> : shown.map((s) => (
        <Card key={s.id} testID="foro-row" onPress={() => router.push(`/espacio/${s.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SpIcon type="foro" /><View style={{ flex: 1, minWidth: 0 }}><Row style={{ flexWrap: 'nowrap' }}><T kind="semi" numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</T>{s.pin_rank != null ? <Ionicons name="pin" size={14} color={t.brand} /> : null}{s.is_private ? <Ionicons name="lock-closed-outline" size={14} color={t.muted} /> : null}</Row><T kind="muted" style={{ fontSize: 13 }}>{s.is_private && !mine.includes(s.id) ? 'Privado: pide autorización' : `Creado hace ${when(s.created_at)}`}</T></View>
        </Card>
      ))}
    </Screen>
  );
}
