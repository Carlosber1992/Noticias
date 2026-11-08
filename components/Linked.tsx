import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, TextProps, View } from 'react-native';
import { useT } from '../lib/theme';
import { T } from './ui';

const RX = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const clean = (u: string) => u.replace(/[.,;:!?)\]}'"»]+$/, '');
export const toUrl = (u: string) => { const x = clean(u.trim()); return /^https?:\/\//i.test(x) ? x : `https://${x}`; };
export const isUrl = (u: string) => /^(https?:\/\/)?[^\s/$.?#]+\.[^\s]{2,}$/i.test(u.trim());
const host = (u: string) => { try { return new URL(toUrl(u)).hostname.replace(/^www\./, ''); } catch { return u; } };
const open = (u: string) => Linking.openURL(toUrl(u)).catch(() => {});

// Texto con enlaces que se pueden tocar. Solo abre http y https.
export function Linked({ children, ...p }: TextProps & { children: string }) {
  const t = useT();
  const parts = String(children ?? '').split(RX);
  return <T {...p}>{parts.map((x, i) => {
    if (i % 2 === 0) return x;
    const u = clean(x), tail = x.slice(u.length);
    return <React.Fragment key={i}><T testID="link" accessibilityRole="link" onPress={() => open(u)} style={{ color: t.brand, textDecorationLine: 'underline' }}>{u}</T>{tail}</React.Fragment>;
  })}</T>;
}
// Tarjeta del enlace principal de una noticia.
export function LinkCard({ url }: { url?: string | null }) {
  const t = useT();
  if (!url) return null;
  return (
    <Pressable testID="link-card" accessibilityRole="link" onPress={() => open(url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.line }}>
      <Ionicons name="link-outline" size={20} color={t.brand} />
      <View style={{ flex: 1, minWidth: 0 }}><T kind="semi" numberOfLines={1}>{host(url)}</T><T kind="muted" numberOfLines={1} style={{ fontSize: 13 }}>{url}</T></View>
      <Ionicons name="open-outline" size={18} color={t.muted} />
    </Pressable>
  );
}
