import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useT } from '../lib/theme';
import { Btn, Row, T } from './ui';

const KEY = 'yasupo.install.later';
const WAIT = 7 * 24 * 3600 * 1000; // Si dice "Ahora no", vuelve a ofrecerlo en una semana.
type Mode = 'prompt' | 'ios' | 'android' | 'inapp';
const read = () => { try { return Number(localStorage.getItem(KEY) ?? 0); } catch { return 0; } };
const write = (v: number) => { try { localStorage.setItem(KEY, String(v)); } catch {} };
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function InstallPrompt() {
  const t = useT(); const [mode, setMode] = useState<Mode | null>(null); const decided = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || installed() || Date.now() - read() < WAIT) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!ios && !/Android/.test(ua)) return;
    if (/FBAN|FBAV|FB_IAB|Instagram|TikTok|Line\//.test(ua)) { setMode('inapp'); return; }
    const offer = () => setMode('prompt');
    if ((window as any).__yasupoInstall) offer();
    window.addEventListener('yasupo-install', offer);
    const done = () => { decided.current = true; setMode(null); };
    window.addEventListener('appinstalled', done);
    // Safari no tiene aviso propio, y otros navegadores tampoco siempre: se explica cómo hacerlo.
    const later = setTimeout(() => { if (!decided.current) setMode((m) => m ?? (ios ? 'ios' : 'android')); }, ios ? 800 : 3000);
    return () => { clearTimeout(later); window.removeEventListener('yasupo-install', offer); window.removeEventListener('appinstalled', done); };
  }, []);
  if (!mode) return null;
  const close = () => { decided.current = true; write(Date.now()); setMode(null); };
  const install = async () => {
    const e = (window as any).__yasupoInstall; if (!e) return setMode('android');
    decided.current = true;
    await e.prompt();
    const r = await e.userChoice.catch(() => null);
    (window as any).__yasupoInstall = null;
    if (r?.outcome !== 'accepted') write(Date.now());
    setMode(null);
  };
  const text = mode === 'prompt' ? 'Tenla en tu pantalla de inicio y ábrela como una app.' : mode === 'ios' ? 'Toca Compartir en Safari y luego "Agregar a inicio".' : mode === 'inapp' ? 'Abre yasupo.com en Chrome o Safari para instalarla.' : 'Abre el menú del navegador y toca "Instalar app" o "Agregar a la pantalla principal".';
  return (
    <View testID="install" accessibilityRole="alert" style={{ position: 'absolute', left: 12, right: 12, bottom: 72, zIndex: 50, backgroundColor: t.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: t.line, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Image source={require('../assets/icon.png')} accessibilityLabel="Yasupo" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <View style={{ flex: 1, minWidth: 0 }}><T kind="bold">Instala Yasupo en tu celular</T><T kind="muted" style={{ fontSize: 13 }}>{text}</T></View>
      </View>
      <Row style={{ justifyContent: 'flex-end' }}><Btn testID="install-later" small kind="ghost" label={mode === 'prompt' ? 'Ahora no' : 'Entendido'} onPress={close} />{mode === 'prompt' ? <Btn testID="install-go" small kind="pri" label="Instalar" onPress={install} /> : null}</Row>
    </View>
  );
}
