import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { supabase } from './supabase';

const fnUrl = `${SUPABASE_URL}/functions/v1/plaza-alert`;
const toKey = (b: string) => Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

export const pushSupported = () => Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushState = (): 'off' | 'on' | 'blocked' | 'none' => (!pushSupported() ? 'none' : Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');

async function save(reg: ServiceWorkerRegistration) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const r = await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ action: 'vapid' }) });
    const { key } = await r.json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  }
  const j = sub.toJSON();
  const { error } = await supabase.rpc('plaza_push_save', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth });
  if (error) throw error;
}
export async function enablePush() {
  if (!pushSupported()) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;
  await save(await navigator.serviceWorker.register('/sw.js'));
  return true;
}
// Mantiene la suscripción al día y la asocia a la cuenta después de entrar.
export async function refreshPush() {
  try { if (pushState() === 'on') await save(await navigator.serviceWorker.register('/sw.js')); } catch {}
}
export function addManifest() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.querySelector('link[rel=manifest]')) return;
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.json'; document.head.appendChild(l);
}
