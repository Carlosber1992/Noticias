import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Media, signed } from '../lib/media';
import { useT } from '../lib/theme';
import { Btn, T } from './ui';

function Vid({ url }: { url: string }) {
  const p = useVideoPlayer(url);
  return <VideoView player={p} nativeControls style={{ width: '100%', maxWidth: 480, aspectRatio: 16 / 9, borderRadius: 10 }} />;
}
function Aud({ url, name }: { url: string; name: string }) {
  const t = useT(); const p = useAudioPlayer(url); const s = useAudioPlayerStatus(p);
  return <Pressable accessibilityLabel={s.playing ? 'Pausar audio' : 'Reproducir audio'} onPress={() => (s.playing ? p.pause() : (s.didJustFinish && p.seekTo(0), p.play()))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface2, borderRadius: 10, padding: 10 }}><Ionicons name={s.playing ? 'pause' : 'play'} size={18} color={t.ink} /><T numberOfLines={1} style={{ flexShrink: 1 }}>{name}</T></Pressable>;
}
function One({ m }: { m: Media }) {
  const t = useT(); const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; signed(m.path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [m.path]);
  if (!url) return <View style={{ height: 40, borderRadius: 10, backgroundColor: t.surface2 }} />;
  if (m.k === 'photo') return <Image accessibilityLabel={m.name} source={{ uri: url }} style={{ width: '100%', maxWidth: 480, aspectRatio: 4 / 3, borderRadius: 10 }} resizeMode="cover" />;
  return m.k === 'video' ? <Vid url={url} /> : <Aud url={url} name={m.name} />;
}
export const MediaView = ({ media }: { media?: Media[] }) => (media?.length ? <View style={{ gap: 6 }}>{media.map((m) => <One key={m.path} m={m} />)}</View> : null);
export function LocLink({ lat, lng, place }: { lat?: number | null; lng?: number | null; place?: string | null }) {
  if (lat == null || lng == null) return null;
  return <Btn small icon="location-outline" label={place || 'Ver ubicación'} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)} style={{ alignSelf: 'flex-start' }} />;
}
