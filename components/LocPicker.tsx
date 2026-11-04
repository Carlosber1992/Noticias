import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Here, useApp } from '../lib/app';
import { useT } from '../lib/theme';
import { CITIES } from '../lib/util';
import { Btn, Chip, Row, T } from './ui';

export function LocPicker({ label, value, onChange }: { label: string; value: Here | null; onChange: (h: Here | null) => void }) {
  const t = useT(); const { getGps, say } = useApp(); const [busy, setBusy] = useState(false);
  const gps = async () => { setBusy(true); const r = await getGps(); setBusy(false); if (typeof r === 'string') say(r); else onChange(r); };
  return (
    <View style={{ gap: 8 }}>
      <T kind="semi" style={{ fontSize: 14 }}>{label}</T>
      {value ? <Row><Ionicons name="location" size={16} color={t.brand} /><T testID="loc-value" kind="semi" style={{ flexShrink: 1 }}>{value.label}</T><Btn small kind="ghost" label="Quitar" onPress={() => onChange(null)} /></Row> : null}
      <Btn testID="loc-gps" small icon="navigate-outline" label={busy ? 'Buscando…' : 'Usar mi ubicación'} disabled={busy} onPress={gps} style={{ alignSelf: 'flex-start' }} />
      <T kind="muted" style={{ fontSize: 13 }}>O elige una ciudad:</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {CITIES.map((c) => <Chip key={c.label} testID={`pick-${c.label}`} label={c.label} on={value?.label === c.label} onPress={() => onChange(c)} />)}
      </ScrollView>
    </View>
  );
}
