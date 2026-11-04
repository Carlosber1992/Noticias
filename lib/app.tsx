import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { CITIES, nz, Pt } from './util';

export type Here = Pt & { label: string };
type Ctx = {
  ready: boolean; uid: string | null; username: string | null; guest: boolean; here: Here | null;
  setGuest: (v: boolean) => void; enter: (u: string, p: string) => Promise<string>; signOut: () => Promise<void>;
  need: (fn: () => void) => void; runPending: () => void; clearPending: () => void; setHere: (h: Here | null) => void; useGps: () => Promise<string>;
  toast: string; say: (t: string) => void; dmUnread: number; reqCount: number; refreshBadges: () => void;
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);
const mail = (u: string) => `${u.toLowerCase()}@usuarios.plaza.invalid`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [guest, setG] = useState(false);
  const [here, setH] = useState<Here | null>(null);
  const [toast, setToast] = useState('');
  const [dmUnread, setDm] = useState(0);
  const [reqCount, setReq] = useState(0);
  const pending = useRef<null | (() => void)>(null);
  const tm = useRef<any>(null);

  const say = useCallback((t: string) => { setToast(t); clearTimeout(tm.current); tm.current = setTimeout(() => setToast(''), 3400); }, []);
  const load = useCallback(async (id: string | null) => {
    setUid(id);
    if (!id) { setUsername(null); return; }
    const { data } = await supabase.from('plaza_profiles').select('username').eq('id', id).maybeSingle();
    setUsername(data?.username ?? null);
  }, []);
  useEffect(() => {
    (async () => {
      const [{ data }, g, h] = await Promise.all([supabase.auth.getSession(), AsyncStorage.getItem('plaza.guest'), AsyncStorage.getItem('plaza.here')]);
      await load(data.session?.user.id ?? null);
      setG(g === '1');
      if (h) try { setH(JSON.parse(h)); } catch {}
      setReady(true);
    })();
    const { data: s } = supabase.auth.onAuthStateChange((_e, sess) => { setTimeout(() => load(sess?.user.id ?? null), 0); });
    return () => s.subscription.unsubscribe();
  }, [load]);

  const refreshBadges = useCallback(async () => {
    if (!uid) { setDm(0); setReq(0); return; }
    const { count } = await supabase.from('plaza_dms').select('id', { count: 'exact', head: true }).eq('recipient_id', uid).is('read_at', null);
    setDm(count ?? 0);
    const { data: own } = await supabase.from('plaza_spaces').select('id').eq('owner_id', uid);
    const ids = (own ?? []).map((x) => x.id);
    if (ids.length) {
      const { count: r } = await supabase.from('plaza_requests').select('user_id', { count: 'exact', head: true }).in('space_id', ids).eq('status', 'pending');
      setReq(r ?? 0);
    } else setReq(0);
  }, [uid]);
  useEffect(() => {
    refreshBadges();
    if (!uid) return;
    const ch = supabase.channel('dm-' + uid + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plaza_dms', filter: `recipient_id=eq.${uid}` }, () => refreshBadges()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, refreshBadges]);

  const setGuest = (v: boolean) => { setG(v); AsyncStorage.setItem('plaza.guest', v ? '1' : '0'); };
  const enter = async (u: string, p: string) => {
    u = u.trim();
    if (!/^[A-Za-z0-9._]{3,20}$/.test(u)) return 'Usa de 3 a 20 letras, números, punto o guion bajo.';
    if (p.length < 8) return 'La contraseña necesita al menos 8 caracteres.';
    const { data: found } = await supabase.from('plaza_profiles').select('username').ilike('username', u.replace(/[_%\\]/g, '\\$&')).maybeSingle();
    if (!found) {
      const { data, error } = await supabase.functions.invoke('plaza-register', { body: { username: u, password: p } });
      if (error || data?.error) {
        let m = data?.error;
        try { m = m ?? (await (error as any).context.json()).error; } catch {}
        return m ?? 'No pudimos crear la cuenta. Revisa tu conexión.';
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email: mail(found?.username ?? u), password: p });
    if (error) return found ? `Contraseña incorrecta para @${found.username}. Si no es tu cuenta, elige otro usuario.` : 'No pudimos iniciar sesión. Inténtalo de nuevo.';
    setGuest(false);
    return '';
  };
  const signOut = async () => { await supabase.auth.signOut(); setGuest(false); };
  const need = (fn: () => void) => {
    if (uid) return fn();
    pending.current = fn;
    router.push('/entrar');
  };
  const runPending = () => { const f = pending.current; pending.current = null; if (f) setTimeout(f, 50); };
  const clearPending = () => { pending.current = null; };
  const setHere = (h: Here | null) => { setH(h); AsyncStorage.setItem('plaza.here', h ? JSON.stringify(h) : ''); };
  const useGps = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return 'No diste permiso de ubicación. Elige tu ciudad en la lista.';
      const { coords: c } = await Location.getCurrentPositionAsync({});
      const near = [...CITIES].sort((a, b) => Math.hypot(a.lat - c.latitude, a.lng - c.longitude) - Math.hypot(b.lat - c.latitude, b.lng - c.longitude))[0];
      setHere({ lat: c.latitude, lng: c.longitude, label: `Cerca de ${near.label}` });
      return '';
    } catch { return 'No pudimos obtener tu ubicación. Elige tu ciudad en la lista.'; }
  };
  const v = useMemo(() => ({ ready, uid, username, guest, here, setGuest, enter, signOut, need, runPending, clearPending, setHere, useGps, toast, say, dmUnread, reqCount, refreshBadges }), [ready, uid, username, guest, here, toast, dmUnread, reqCount, refreshBadges]);
  return <C.Provider value={v as Ctx}>{children}</C.Provider>;
}
export { nz };
