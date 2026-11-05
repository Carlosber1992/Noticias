import { Redirect, router } from 'expo-router';
import React, { useState } from 'react';
import { Image } from 'react-native';
import { LocalityField } from '../components/LocalityField';
import { LocPicker } from '../components/LocPicker';
import { Btn, Field, Row, Screen, T } from '../components/ui';
import { Here, useApp } from '../lib/app';
import { Att, pickAudio, pickVisual, uploadAll } from '../lib/media';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { errText } from '../lib/util';

export default function Publicar() {
  const t = useT(); const { uid, need, here, say } = useApp();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [muni, setMuni] = useState(''); const [hot, setHot] = useState(true); const [loc, setLoc] = useState<Here | null>(here); const [atts, setAtts] = useState<Att[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const add = async (f: () => Promise<Att | null>) => { const a = await f(); if (a) setAtts((x) => [...x, a]); };
  const pub = () => {
    if (title.trim().length < 8) return setErr('Escribe un titular de al menos 8 caracteres.');
    if (muni.trim().length < 2) return setErr('Escribe la localidad de la noticia.');
    need(async () => {
      setBusy(true); setErr('');
      try {
        const { data: s } = await supabase.auth.getSession(); const me = s.session!.user.id;
        const media = await uploadAll(atts, `pub/${me}`);
        const { error } = await supabase.from('plaza_news').insert({ author_id: me, title: title.trim(), body: body.trim(), municipio: muni.trim(), is_breaking: hot, media, ...(loc ? { lat: loc.lat, lng: loc.lng, place: loc.label } : {}) });
        if (error) throw error;
        say('Noticia publicada'); router.back();
      } catch (e) { setErr(errText(e)); }
      setBusy(false);
    });
  };
  if (!uid) return <Redirect href="/entrar" />;
  return (
    <Screen title="Publicar noticia" back>
      <Field testID="n-title" label="Titular" value={title} onChangeText={setTitle} maxLength={120} placeholder="¿Qué está pasando?" />
      <LocalityField testID="n-muni" label="Localidad" value={muni} onChange={setMuni} />
      <Field testID="n-body" label="Detalles (opcional)" value={body} onChangeText={setBody} multiline />
      <Btn testID="n-hot" label={`Última hora: ${hot ? 'activada' : 'desactivada'}`} kind={hot ? 'pri' : 'soft'} onPress={() => setHot(!hot)} />
      <Row>
        <Btn small icon="image-outline" label="Foto" onPress={() => add(() => pickVisual('photo'))} />
        <Btn small icon="videocam-outline" label="Video" onPress={() => add(() => pickVisual('video'))} />
        <Btn small icon="musical-notes-outline" label="Audio" onPress={() => add(pickAudio)} />
      </Row>
      {atts.map((a, i) => (a.k === 'photo' ? <Image key={i} source={{ uri: a.uri }} accessibilityLabel={a.name} resizeMode="contain" style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: t.surface2 }} /> : <T key={i} kind="muted">{a.name}</T>))}
      <LocPicker label="Ubicación (opcional)" value={loc} onChange={setLoc} />
      {err ? <T style={{ color: t.news }}>{err}</T> : null}
      <Btn testID="n-pub" kind="pri" label={busy ? 'Publicando…' : 'Publicar ahora'} disabled={busy} onPress={pub} />
    </Screen>
  );
}
