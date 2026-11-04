import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Vibration, View } from 'react-native';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { Btn, T } from './ui';

type Alert = { id: string; title: string; body: string; level: 'aviso' | 'alarma'; created_at: string };
const KEY = 'plaza.alerts.seen';

function ring(alarm: boolean) {
  if (Platform.OS !== 'web') { Vibration.vibrate(alarm ? [0, 500, 200, 500, 200, 800] : 300); return; }
  try {
    (navigator as any).vibrate?.(alarm ? [500, 200, 500, 200, 800] : 300);
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext; if (!Ctx) return;
    const ac = new Ctx(); const now = ac.currentTime;
    (alarm ? [0, .35, .7, 1.05, 1.4, 1.75] : [0, .2]).forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = alarm ? (i % 2 ? 660 : 880) : 740; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(.0001, now + d); g.gain.exponentialRampToValueAtTime(.3, now + d + .02); g.gain.exponentialRampToValueAtTime(.0001, now + d + .3);
      o.start(now + d); o.stop(now + d + .32);
    });
  } catch {}
}

// Recibe en vivo lo que se envía desde el panel y muestra lo que llegó con la app cerrada.
export function Alerts() {
  const t = useT(); const { uid } = useApp();
  const [queue, setQueue] = useState<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const add = useCallback((a: Alert) => {
    if (seen.current.has(a.id)) return;
    seen.current.add(a.id);
    setQueue((q) => [...q, a]); ring(a.level === 'alarma');
  }, []);
  const load = useCallback(async () => {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) try { JSON.parse(raw).forEach((x: string) => seen.current.add(x)); } catch {}
    const { data } = await supabase.from('plaza_alerts').select('id,title,body,level,created_at').gt('expires_at', new Date().toISOString()).order('created_at').limit(10);
    (data ?? []).forEach((a) => add(a as Alert));
  }, [add]);
  useEffect(() => {
    load();
    const ch = supabase.channel('alerts-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plaza_alerts' }, (p: any) => add(p.new)).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, load, add]);
  const a = queue[0];
  if (!a) return null;
  const close = () => {
    setQueue((q) => q.slice(1));
    AsyncStorage.setItem(KEY, JSON.stringify([...seen.current].slice(-50)));
  };
  const alarm = a.level === 'alarma';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <Pressable accessibilityLabel="Cerrar" onPress={alarm ? undefined : close} style={{ flex: 1, backgroundColor: t.shade, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View testID="alert" accessibilityRole="alert" style={{ width: '100%', maxWidth: 420, backgroundColor: alarm ? t.news : t.surface, borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: alarm ? t.news : t.line }}>
          <Ionicons name={alarm ? 'warning' : 'megaphone-outline'} size={30} color={alarm ? t.surface : t.brand} />
          <T kind="display" style={{ fontSize: 22, color: alarm ? t.surface : t.ink }}>{a.title}</T>
          {a.body ? <T style={{ color: alarm ? t.surface : t.ink }}>{a.body}</T> : null}
          <Btn testID="alert-ok" kind={alarm ? 'sun' : 'pri'} label="Entendido" onPress={close} />
        </View>
      </Pressable>
    </Modal>
  );
}
