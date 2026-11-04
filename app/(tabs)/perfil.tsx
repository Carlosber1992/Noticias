import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Av, Btn, Card, Chip, Empty, Field, Row, Screen, SpIcon, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { when } from '../../lib/util';

export default function Perfil() {
  const t = useT(); const { uid, username, signOut, say, refreshBadges } = useApp();
  const [spaces, setSpaces] = useState<any[]>([]); const [reqs, setReqs] = useState<any[]>([]); const [convs, setConvs] = useState<any[]>([]); const [f, setF] = useState('todos'); const [contact, setContact] = useState({ email: '', phone: '' }); const [saved, setSaved] = useState({ email: '', phone: '' }); const [find, setFind] = useState(false); const [fq, setFq] = useState(''); const [users, setUsers] = useState<any[]>([]);
  const load = useCallback(async () => {
    if (!uid) return;
    const m = await supabase.from('plaza_members').select('space:plaza_spaces(*)').eq('user_id', uid);
    const sp = (m.data ?? []).map((x: any) => x.space).filter(Boolean); setSpaces(sp);
    const ownIds = sp.filter((s: any) => s.owner_id === uid).map((s: any) => s.id);
    if (ownIds.length) { const r = await supabase.from('plaza_requests').select('space_id,user_id,user:plaza_profiles(username),space:plaza_spaces(name)').in('space_id', ownIds).eq('status', 'pending'); setReqs(r.data ?? []); } else setReqs([]);
    const d = await supabase.from('plaza_dms').select('*').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at', { ascending: false }).limit(300);
    const by = new Map<string, any>();
    for (const x of d.data ?? []) { const o = x.sender_id === uid ? x.recipient_id : x.sender_id; const c = by.get(o) ?? { id: o, last: x, un: 0 }; if (x.recipient_id === uid && !x.read_at) c.un++; by.set(o, c); }
    const ids = [...by.keys()];
    const names = ids.length ? (await supabase.from('plaza_profiles').select('id,username').in('id', ids)).data ?? [] : [];
    setConvs([...by.values()].map((c) => ({ ...c, name: names.find((n) => n.id === c.id)?.username ?? '?' })));
    const k = await supabase.from('plaza_contacts').select('email,phone').eq('user_id', uid).maybeSingle();
    const v = { email: k.data?.email ?? '', phone: k.data?.phone ?? '' }; setContact(v); setSaved(v);
    refreshBadges();
  }, [uid, refreshBadges]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!uid) return <Screen title="Perfil"><Empty title="Estás leyendo sin cuenta" text="Crea tu cuenta para responder, seguir canales y enviar mensajes."><Btn testID="to-auth" kind="pri" label="Entrar o crear cuenta" onPress={() => router.push('/entrar')} /></Empty></Screen>;
  const answer = async (r: any, ok: boolean) => { await supabase.rpc('plaza_answer_request', { p_space: r.space_id, p_user: r.user_id, p_approve: ok }); say(`${ok ? 'Aprobaste' : 'Rechazaste'} a @${r.user?.username}`); load(); };
  const search = async (v: string) => { setFq(v); if (v.trim().length < 2) return setUsers([]); const { data } = await supabase.from('plaza_profiles').select('id,username').ilike('username', `%${v.replace(/^@/, '').replace(/[%_\\]/g, '\\$&')}%`).neq('id', uid).limit(10); setUsers(data ?? []); };
  const saveContact = async () => {
    if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) return say('Escribe un correo válido, como nombre@correo.com.');
    if (contact.phone && !/^\+?[\d\s-]{7,}$/.test(contact.phone)) return say('Escribe un celular válido, con al menos 7 dígitos.');
    const { error } = await supabase.from('plaza_contacts').upsert({ user_id: uid, email: contact.email || null, phone: contact.phone || null });
    if (error) return say('No pudimos guardar. Inténtalo de nuevo.');
    setSaved(contact); say('Datos guardados');
  };
  const shown = spaces.filter((s) => f === 'todos' || s.type === f);
  return (
    <Screen title="Perfil">
      <Card><Row><Av name={username ?? '?'} size={60} /><View style={{ flex: 1 }}><T testID="me" kind="display" style={{ fontSize: 24 }}>@{username}</T><T kind="muted">{saved.email || saved.phone ? 'Con datos de contacto' : 'Cuenta sin correo ni celular'}</T></View></Row></Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><T kind="bold" style={{ fontSize: 17 }}>Mensajes</T><Btn testID="dm-new" small kind="sun" icon="add" label="Nuevo mensaje" onPress={() => setFind(!find)} /></Row>
        {find ? <><Field testID="dm-q" value={fq} onChangeText={search} autoCapitalize="none" placeholder="Busca por usuario" />{users.map((u) => <Btn key={u.id} testID="dm-user" small label={`@${u.username}`} onPress={() => { setFind(false); router.push(`/chat/${u.id}`); }} />)}</> : null}
        {!convs.length ? <T kind="muted">Aún no tienes mensajes.</T> : convs.map((c) => <Card key={c.id} testID="conv" onPress={() => router.push(`/chat/${c.id}`)} style={{ backgroundColor: t.bg, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}><Av name={c.name} /><View style={{ flex: 1, minWidth: 0 }}><T kind="semi">@{c.name}</T><T kind="muted" numberOfLines={1} style={{ fontSize: 13 }}>{c.last.sender_id === uid ? 'Tú: ' : ''}{c.last.body || 'Archivo'}</T></View><T kind="muted" style={{ fontSize: 12 }}>{when(c.last.created_at)}</T>{c.un ? <View style={{ backgroundColor: t.brand, borderRadius: 99, paddingHorizontal: 7 }}><T kind="bold" style={{ color: t.brandInk, fontSize: 12 }}>{c.un}</T></View> : null}</Card>)}
      </Card>
      {reqs.length ? <Card><T kind="bold" style={{ fontSize: 17 }}>Solicitudes de acceso</T>{reqs.map((r) => <Row key={r.space_id + r.user_id}><View style={{ flex: 1, minWidth: 140 }}><T kind="semi">@{r.user?.username}</T><T kind="muted" style={{ fontSize: 13 }}>Quiere entrar a {r.space?.name}</T></View><Btn testID="approve" small kind="pri" label="Aprobar" onPress={() => answer(r, true)} /><Btn small label="Rechazar" onPress={() => answer(r, false)} /></Row>)}</Card> : null}
      <Card>
        <T kind="bold" style={{ fontSize: 17 }}>Lo que sigues</T>
        <Row>{[['todos', 'Todo'], ['canal', 'Canales'], ['foro', 'Foros'], ['grupo', 'Grupos']].map(([k, l]) => <Chip key={k} label={`${l} ${spaces.filter((s) => k === 'todos' || s.type === k).length}`} on={f === k} onPress={() => setF(k)} />)}</Row>
        {!shown.length ? <T kind="muted">Aún no sigues nada aquí.</T> : shown.map((s) => <Card key={s.id} testID="follow" onPress={() => router.push(`/espacio/${s.id}`)} style={{ backgroundColor: t.bg, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}><SpIcon type={s.type} size={36} /><T kind="semi" numberOfLines={1} style={{ flex: 1 }}>{s.name}</T>{s.owner_id === uid ? <T kind="muted" style={{ fontSize: 12 }}>Tuyo</T> : null}</Card>)}
      </Card>
      <Card>
        <T kind="bold" style={{ fontSize: 17 }}>Vincular contacto (opcional)</T>
        <T kind="muted" style={{ fontSize: 13 }}>Se guarda para una futura recuperación de cuenta. Por ahora no se verifica ni se envían mensajes.</T>
        <Field label="Correo" value={contact.email} onChangeText={(v: string) => setContact({ ...contact, email: v })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Celular" value={contact.phone} onChangeText={(v: string) => setContact({ ...contact, phone: v })} keyboardType="phone-pad" />
        <Btn small label="Guardar" onPress={saveContact} />
      </Card>
      <Btn testID="logout" label="Cerrar sesión" onPress={async () => { await signOut(); router.replace('/entrar'); }} />
    </Screen>
  );
}
