import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { LocPicker } from '../components/LocPicker';
import { Btn, Chip, Field, Row, Screen, T } from '../components/ui';
import { Here, useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { errText } from '../lib/util';

export default function Crear() {
  const t = useT(); const p = useLocalSearchParams<{ type: string }>(); const { uid, need, here, say } = useApp();
  const [type, setType] = useState<string>(p.type ?? 'grupo'); const [priv, setPriv] = useState(false); const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [loc, setLoc] = useState<Here | null>(here);
  const go = () => {
    if (name.trim().length < 3) return setErr('Ponle un nombre de al menos 3 caracteres.');
    if (type === 'foro' && q.trim().length < 5) return setErr('Escribe tu primera pregunta para abrir el foro.');
    need(async () => {
      const { data, error } = await supabase.rpc('plaza_create_space', { p_type: type, p_name: name.trim(), p_description: desc.trim(), p_private: priv, p_lat: type === 'foro' ? null : loc?.lat ?? null, p_lng: type === 'foro' ? null : loc?.lng ?? null, p_place: type === 'foro' ? null : loc?.label ?? null, p_question: type === 'foro' ? q.trim() : null });
      if (error) return setErr(errText(error));
      say('Listo, ya está creado');
      router.replace(`/espacio/${(data as any).space_id}`);
    });
  };
  if (!uid) return <Redirect href="/entrar" />;
  return (
    <Screen title={type === 'foro' ? 'Crear foro' : 'Crear'} back>
      {type !== 'foro' ? <Row><Chip label="Grupo" on={type === 'grupo'} onPress={() => setType('grupo')} /><Chip testID="c-canal" label="Canal" on={type === 'canal'} onPress={() => setType('canal')} /></Row> : null}
      <Row><Chip label="Público" on={!priv} onPress={() => setPriv(false)} /><Chip testID="c-priv" label="Privado" on={priv} onPress={() => setPriv(true)} /></Row>
      <Field testID="c-name" label="Nombre" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Descripción (opcional)" value={desc} onChangeText={setDesc} maxLength={200} />
      {type !== 'foro' ? <LocPicker label="Ubicación (opcional)" value={loc} onChange={setLoc} /> : null}
      {type === 'foro' ? <Field testID="c-q" label="Tu primera pregunta" value={q} onChangeText={setQ} maxLength={140} /> : null}
      <T kind="muted">{priv ? 'Cualquiera lo encuentra, pero solo verá el contenido quien tú autorices.' : type === 'canal' ? 'Cualquiera puede seguirlo. Solo tú publicas.' : 'Cualquiera puede encontrarlo y participar.'}{type !== 'foro' && !loc ? ' Sin ubicación no aparecerá en el radar.' : ''}</T>
      {err ? <T style={{ color: t.news }}>{err}</T> : null}
      <Btn testID="c-go" kind="pri" label="Crear" onPress={go} />
    </Screen>
  );
}
