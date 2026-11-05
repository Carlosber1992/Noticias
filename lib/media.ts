import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type Att = { k: 'photo' | 'video' | 'audio'; uri: string; name: string; mime: string };
export type Media = { k: Att['k']; path: string; name: string };
const BUCKET = 'plaza-media';

export async function pickVisual(k: 'photo' | 'video'): Promise<Att | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [k === 'photo' ? 'images' : 'videos'], quality: 0.8 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { k, uri: a.uri, name: a.fileName ?? (k === 'photo' ? 'foto.jpg' : 'video.mp4'), mime: a.mimeType ?? (k === 'photo' ? 'image/jpeg' : 'video/mp4') };
}
export async function pickAudio(): Promise<Att | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { k: 'audio', uri: a.uri, name: a.name, mime: a.mimeType ?? 'audio/mpeg' };
}
export async function uploadAll(atts: Att[], folder: string): Promise<Media[]> {
  const out: Media[] = [];
  for (const a of atts) {
    const ext = a.name.includes('.') ? a.name.split('.').pop() : 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const body = await (await fetch(a.uri)).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: a.mime });
    if (error) throw error;
    out.push({ k: a.k, path, name: a.name });
  }
  return out;
}
export const signed = async (path: string) => (await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;
export const removeMedia = async (m?: Media[] | null) => { const p = (m ?? []).map((x) => x.path); if (p.length) await supabase.storage.from(BUCKET).remove(p); };
