import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Share as RNShare, StyleSheet, Text, TextInput, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../lib/app';
import { linkFor } from '../lib/share';
import { F, useT } from '../lib/theme';

export const MAX = 760;
export function T({ style, kind = 'body', ...p }: TextProps & { kind?: 'body' | 'semi' | 'bold' | 'display' | 'muted' }) {
  const t = useT();
  const f = kind === 'display' ? F.display : kind === 'bold' ? F.bold : kind === 'semi' ? F.semi : F.body;
  return <Text {...p} style={[{ color: kind === 'muted' ? t.muted : t.ink, fontFamily: f, fontSize: 15, lineHeight: kind === 'display' ? undefined : 21 }, style]} />;
}
export function Btn({ label, onPress, kind = 'soft', icon, small, disabled, testID, style }: { label: string; onPress?: () => void; kind?: 'pri' | 'sun' | 'soft' | 'ghost'; icon?: any; small?: boolean; disabled?: boolean; testID?: string; style?: ViewStyle }) {
  const t = useT();
  const bg = kind === 'pri' ? t.brand : kind === 'sun' ? t.sun : kind === 'ghost' ? 'transparent' : t.surface2;
  const fg = kind === 'pri' ? t.brandInk : kind === 'sun' ? t.sunInk : kind === 'ghost' ? t.brand : t.ink;
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [{ minHeight: small ? 36 : 46, paddingHorizontal: small ? 12 : 16, borderRadius: 12, backgroundColor: bg, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <T kind="semi" style={{ color: fg, fontSize: small ? 14 : 15 }}>{label}</T>
    </Pressable>
  );
}
export function Chip({ label, on, onPress, testID }: { label: string; on?: boolean; onPress?: () => void; testID?: string }) {
  const t = useT();
  return <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: on ? t.ink : t.surface2 }}><T kind="semi" style={{ fontSize: 14, color: on ? t.surface : t.muted }}>{label}</T></Pressable>;
}
export const Row = ({ children, style }: any) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
export function Card({ children, style, onPress, testID }: any) {
  const t = useT();
  const s = [{ backgroundColor: t.surface, borderRadius: 14, padding: 14, gap: 8 }, style];
  return onPress ? <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={s}>{children}</Pressable> : <View testID={testID} style={s}>{children}</View>;
}
export function Field({ label, ...p }: any) {
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T kind="semi" style={{ fontSize: 14 }}>{label}</T> : null}
      <TextInput placeholderTextColor={t.muted} {...p} accessibilityLabel={label ?? p.placeholder}
        style={[{ minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface, color: t.ink, fontFamily: F.body, fontSize: 15 }, p.multiline && { minHeight: 84, textAlignVertical: 'top' }, p.style]} />
    </View>
  );
}
export function Av({ name, size = 36 }: { name: string; size?: number }) {
  const cs = ['#0A6B5E', '#C8451F', '#3B4CB8', '#8A5A00', '#8E2F6B', '#2B6C93'];
  const c = cs[[...name].reduce((a, x) => a + x.charCodeAt(0), 0) % 6];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontFamily: F.bold, fontSize: size * 0.38, textTransform: 'uppercase' }}>{name.slice(0, 2)}</Text></View>;
}
const IC: any = { foro: 'help-circle-outline', grupo: 'people-outline', canal: 'megaphone-outline' };
export function SpIcon({ type, size = 44 }: { type: 'foro' | 'grupo' | 'canal'; size?: number }) {
  const t = useT();
  return <View style={{ width: size, height: size, backgroundColor: t[type], borderRadius: type === 'grupo' ? size / 2 : 13, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={IC[type]} size={size * 0.5} color={t.onIcon} /></View>;
}
export function Screen({ title, sub, back, right, children, foot, scroll = true, testID }: any) {
  const t = useT();
  const { toast } = useApp();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }} testID={testID}>
      <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.line, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {back ? <Pressable testID="back" accessibilityLabel="Volver" onPress={goBack} style={{ padding: 6 }}><Ionicons name="chevron-back" size={22} color={t.ink} /></Pressable> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <T kind="display" numberOfLines={1} style={{ fontSize: 20 }}>{title}</T>
          {sub ? <T kind="muted" numberOfLines={1} style={{ fontSize: 13 }}>{sub}</T> : null}
        </View>
        {right}
      </View>
      {scroll ? <ScrollView contentContainerStyle={{ padding: 16, gap: 12, width: '100%', maxWidth: MAX, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{ flex: 1, width: '100%', maxWidth: MAX, alignSelf: 'center' }}>{children}</View>}
      {foot}
      {toast ? <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: 16, right: 16, alignItems: 'center' }}><View style={{ backgroundColor: t.ink, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}><T kind="semi" testID="toast" style={{ color: t.surface, textAlign: 'center' }}>{toast}</T></View></View> : null}
    </SafeAreaView>
  );
}
export const Loading = () => { const t = useT(); return <View style={{ padding: 32 }}><ActivityIndicator color={t.brand} /></View>; };
export const Empty = ({ title, text, children }: any) => <View style={{ alignItems: 'center', gap: 10, padding: 28 }}><T kind="display" style={{ fontSize: 22, textAlign: 'center' }}>{title}</T>{text ? <T kind="muted" style={{ textAlign: 'center' }}>{text}</T> : null}{children}</View>;
export function ShareBtn({ path, title, note }: { path: string; title: string; note?: string }) {
  const t = useT(); const { say } = useApp();
  const [open, setOpen] = useState(false);
  const url = linkFor(path), u = encodeURIComponent(url), tx = encodeURIComponent(`${title} | Plaza`), both = encodeURIComponent(`${title} | Plaza\n${url}`);
  const go = () => { if (Platform.OS === 'web') setOpen(true); else RNShare.share({ message: `${title}\n${url}` }); };
  const apps: [string, string][] = [['WhatsApp', `https://wa.me/?text=${both}`], ['Telegram', `https://t.me/share/url?url=${u}&text=${tx}`], ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`], ['X', `https://twitter.com/intent/tweet?url=${u}&text=${tx}`]];
  return (<>
    <Pressable testID="share" accessibilityLabel="Compartir" onPress={go} style={{ padding: 8 }}><Ionicons name="share-social-outline" size={20} color={t.muted} /></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.shade, justifyContent: 'center', alignItems: 'center', padding: 16 }]} onPress={() => setOpen(false)}>
        <Pressable style={{ backgroundColor: t.surface, borderRadius: 18, padding: 20, gap: 12, width: '100%', maxWidth: 440 }}>
          <T kind="display" style={{ fontSize: 22 }}>Compartir</T>
          <T kind="semi">{title}</T>
          <T testID="share-url" selectable style={{ fontSize: 13 }}>{url}</T>
          <Btn label="Copiar enlace" icon="copy-outline" kind="pri" onPress={async () => { await Clipboard.setStringAsync(url); say('Enlace copiado'); setOpen(false); }} />
          <Row>{apps.map(([n, h]) => <Btn key={n} small label={n} onPress={() => Linking.openURL(h)} />)}</Row>
          {note ? <T kind="muted" style={{ fontSize: 13 }}>{note}</T> : null}
          <Btn label="Cerrar" kind="ghost" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  </>);
}
