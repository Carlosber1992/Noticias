import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useApp } from '../lib/app';
import { Att, Media, pickAudio, pickVisual, uploadAll } from '../lib/media';
import { F, useT } from '../lib/theme';
import { errText } from '../lib/util';
import { Btn, MAX, Row, T } from './ui';

export type Out = { body: string; media: Media[]; lat?: number; lng?: number; place?: string };
export function Composer({ placeholder, folder, onSend, allowLoc }: { placeholder: string; folder: () => string; onSend: (o: Out) => Promise<any>; allowLoc?: boolean }) {
  const t = useT(); const { need, say, here } = useApp();
  const [body, setBody] = useState(''); const [atts, setAtts] = useState<Att[]>([]); const [loc, setLoc] = useState(false); const [menu, setMenu] = useState(false); const [busy, setBusy] = useState(false);
  const add = async (f: () => Promise<Att | null>) => { setMenu(false); try { const a = await f(); if (a) setAtts((x) => [...x, a]); } catch (e) { say(errText(e)); } };
  const send = () => {
    const txt = body.trim();
    if ((!txt && !atts.length && !loc) || busy) return;
    need(async () => {
      setBusy(true);
      try {
        const media = await uploadAll(atts, folder());
        await onSend({ body: txt, media, ...(loc && here ? { lat: here.lat, lng: here.lng, place: here.label } : {}) });
        setBody(''); setAtts([]); setLoc(false);
      } catch (e) { say(errText(e)); }
      setBusy(false);
    });
  };
  return (
    <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, padding: 8 }}>
      <View style={{ width: '100%', maxWidth: MAX, alignSelf: 'center', gap: 6 }}>
        {menu ? <Row>
          <Btn small testID="att-photo" icon="image-outline" label="Foto" onPress={() => add(() => pickVisual('photo'))} />
          <Btn small testID="att-video" icon="videocam-outline" label="Video" onPress={() => add(() => pickVisual('video'))} />
          <Btn small testID="att-audio" icon="musical-notes-outline" label="Audio" onPress={() => add(pickAudio)} />
          {allowLoc ? <Btn small testID="att-loc" icon="location-outline" label="Ubicación" onPress={() => { setMenu(false); if (here) setLoc(true); else say('Primero elige tu ubicación en Cerca.'); }} /> : null}
        </Row> : null}
        {atts.length || loc ? <Row>
          {atts.map((a, i) => <Pressable key={i} onPress={() => setAtts((x) => x.filter((_, j) => j !== i))} style={{ backgroundColor: t.surface2, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><T style={{ fontSize: 13 }}>{a.name} ✕</T></Pressable>)}
          {loc ? <Pressable onPress={() => setLoc(false)} style={{ backgroundColor: t.surface2, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}><T style={{ fontSize: 13 }}>{here?.label} ✕</T></Pressable> : null}
        </Row> : null}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <Pressable testID="att" accessibilityLabel="Adjuntar" onPress={() => setMenu(!menu)} style={{ padding: 10 }}><Ionicons name="attach" size={22} color={t.muted} /></Pressable>
          <TextInput testID="composer" value={body} onChangeText={setBody} placeholder={placeholder} accessibilityLabel={placeholder} placeholderTextColor={t.muted} multiline
            style={{ flex: 1, minHeight: 42, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: t.bg, color: t.ink, fontFamily: F.body, fontSize: 15 }} />
          <Pressable testID="send" accessibilityLabel="Enviar" onPress={send} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}><Ionicons name="send" size={18} color={t.brandInk} /></Pressable>
        </View>
      </View>
    </View>
  );
}
