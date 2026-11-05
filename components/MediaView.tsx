import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Media, signed } from '../lib/media';
import { useT } from '../lib/theme';
import { T } from './ui';

function Vid({ url }: { url: string }) {
  const p = useVideoPlayer(url);
  return <VideoView player={p} nativeControls contentFit="contain" style={{ width: '100%', maxWidth: 480, aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#000' }} />;
}
function Aud({ url, name }: { url: string; name: string }) {
  const t = useT(); const p = useAudioPlayer(url); const s = useAudioPlayerStatus(p);
  return <Pressable accessibilityLabel={s.playing ? 'Pausar audio' : 'Reproducir audio'} onPress={() => (s.playing ? p.pause() : (s.didJustFinish && p.seekTo(0), p.play()))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface2, borderRadius: 10, padding: 10 }}><Ionicons name={s.playing ? 'pause' : 'play'} size={18} color={t.ink} /><T numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T></Pressable>;
}
function One({ m }: { m: Media }) {
  const t = useT(); const [url, setUrl] = useState<string | null>(null); const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => { let on = true; signed(m.path).then((u) => { if (!on) return; setUrl(u); if (u && m.k === 'photo') Image.getSize(u, (w, h) => { if (on && w && h) setRatio(Math.max(w / h, 0.6)); }, () => {}); }); return () => { on = false; }; }, [m.path, m.k]);
  if (!url) return <View style={{ height: 40, borderRadius: 10, backgroundColor: t.surface2 }} />;
  if (m.k === 'photo') return <Image accessibilityLabel={m.name} source={{ uri: url }} testID="photo" style={{ width: '100%', maxWidth: 480, aspectRatio: ratio, borderRadius: 10, backgroundColor: t.surface2 }} resizeMode="contain" />;
  return m.k === 'video' ? <Vid url={url} /> : <Aud url={url} name={m.name} />;
}
export const MediaView = ({ media }: { media?: Media[] }) => (media?.length ? <View style={{ gap: 6 }}>{media.map((m) => <One key={m.path} m={m} />)}</View> : null);
// Solo muestra el nombre del lugar: nunca abre mapas ni expone el punto.
export function LocLink({ lat, lng, place }: { lat?: number | null; lng?: number | null; place?: string | null }) {
  const t = useT();
  if (lat == null || lng == null) return null;
  return <View testID="place" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="location-outline" size={15} color={t.muted} /><T kind="muted" style={{ fontSize: 13, flexShrink: 1 }}>{place || 'Ubicación aproximada'}</T></View>;
}
