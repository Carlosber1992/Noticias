import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Composer } from '../../components/Composer';
import { LocLink, MediaView } from '../../components/MediaView';
import { Av, Btn, Card, Empty, Field, Loading, Row, Screen, ShareBtn, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { errText, when } from '../../lib/util';

const TY: any = { foro: 'Foro', grupo: 'Grupo', canal: 'Canal' };
export default function Espacio() {
  const t = useT(); const { id } = useLocalSearchParams<{ id: string }>(); const { uid, need, say, refreshBadges } = useApp();
  const [s, setS] = useState<any>(undefined); const [desc, setDesc] = useState(''); const [member, setMember] = useState(false); const [req, setReq] = useState<string | null>(null); const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<any[]>([]); const [threads, setThreads] = useState<any[]>([]); const [ask, setAsk] = useState(false); const [q, setQ] = useState(''); const [pending, setPending] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data: sp } = await supabase.from('plaza_spaces').select('*, owner:plaza_profiles(username)').eq('id', id).maybeSingle();
    setS(sp ?? null); if (!sp) return;
    let mem = false, rq = null;
    if (uid) {
      mem = !!(await supabase.from('plaza_members').select('user_id').eq('space_id', id).eq('user_id', uid).maybeSingle()).data;
      rq = (await supabase.from('plaza_requests').select('status').eq('space_id', id).eq('user_id', uid).maybeSingle()).data?.status ?? null;
    }
    setMember(mem); setReq(rq);
    if (sp.is_private && !mem) { setItems([]); setThreads([]); setDesc(''); setCount(null); return; }
    const [d, c] = await Promise.all([supabase.from('plaza_space_details').select('description').eq('space_id', id).maybeSingle(), supabase.rpc('plaza_space_count', { p_space: id })]);
    setDesc(d.data?.description ?? ''); setCount(c.data ?? null);
    if (sp.type === 'foro') { const r = await supabase.from('plaza_threads').select('*, author:plaza_profiles(username), answers:plaza_messages(count)').eq('space_id', id).order('created_at', { ascending: false }); setThreads(r.data ?? []); }
    else { const r = await supabase.from('plaza_messages').select('*, author:plaza_profiles(username)').eq('space_id', id).is('thread_id', null).order('created_at', { ascending: sp.type === 'grupo' }).limit(200); setItems(r.data ?? []); }
    if (sp.owner_id === uid && sp.is_private) { const r = await supabase.from('plaza_requests').select('user_id, status, user:plaza_profiles(username)').eq('space_id', id).eq('status', 'pending'); setPending(r.data ?? []); }
  }, [id, uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const ch = supabase.channel('s-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'plaza_messages', filter: `space_id=eq.${id}` }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [id, load]);
  if (s === undefined) return <Screen title="Espacio" back><Loading /></Screen>;
  if (!s) return <Screen title="Espacio" back><Empty title="No encontramos este espacio" /></Screen>;
  const T0 = TY[s.type].toLowerCase(), locked = s.is_private && !member, own = s.owner_id === uid;
  const share = <ShareBtn path={`/espacio/${s.id}`} title={s.name} note={s.is_private ? `Quien reciba el enlace deberá pedir autorización a @${s.owner?.username}.` : undefined} />;
  if (locked) return (
    <Screen title={s.name} sub={`${TY[s.type]} privado`} back right={share}>
      <Empty title={s.name} text={req === 'pending' ? `Tu solicitud está pendiente. Podrás ver este ${T0} cuando @${s.owner?.username} la apruebe.` : req === 'rejected' ? `@${s.owner?.username} rechazó tu solicitud. No puedes ver el contenido de este ${T0}.` : `Este ${T0} es privado. Para ver su contenido y participar necesitas la autorización de @${s.owner?.username}.`}>
        <Ionicons name="lock-closed-outline" size={22} color={t.muted} />
        {req === 'pending' ? <Btn testID="req-cancel" small label="Cancelar solicitud" onPress={async () => { await supabase.from('plaza_requests').delete().eq('space_id', id).eq('user_id', uid!); load(); }} /> : <Btn testID="req" kind="pri" label={req ? 'Solicitar de nuevo' : 'Solicitar acceso'} onPress={() => need(async () => { const { error } = await supabase.rpc('plaza_request_access', { p_space: id }); if (error) say(errText(error)); else say(`Solicitud enviada a @${s.owner?.username}`); load(); })} />}
      </Empty>
    </Screen>
  );
  const join = () => need(async () => { const { data: x } = await supabase.auth.getSession(); await supabase.from('plaza_members').insert({ space_id: id, user_id: x.session!.user.id }); load(); });
  const leave = async () => { await supabase.from('plaza_members').delete().eq('space_id', id).eq('user_id', uid!); say(s.type === 'canal' ? `Dejaste de seguir ${s.name}` : `Saliste de ${s.name}`); if (s.is_private) router.back(); else load(); };
  const right = <Row style={{ flexWrap: 'nowrap', gap: 2 }}>{!own ? <Btn testID="join" small kind={member ? 'soft' : 'pri'} label={member ? (s.type === 'canal' ? 'Siguiendo' : 'Salir') : s.type === 'canal' ? 'Seguir' : 'Unirme'} onPress={member ? leave : join} /> : null}{share}</Row>;
  const send = async (o: any) => { const { data: x } = await supabase.auth.getSession(); const me = x.session!.user.id; if (!member && !s.is_private && s.type !== 'canal') await supabase.from('plaza_members').upsert({ space_id: id, user_id: me }); const { error } = await supabase.from('plaza_messages').insert({ space_id: id, author_id: me, ...o }); if (error) throw error; load(); };
  const foot = s.type === 'foro' ? null : s.type === 'canal' && !own ? <View style={{ backgroundColor: t.surface, padding: 12 }}><T kind="muted" style={{ textAlign: 'center' }}>Solo el dueño del canal publica aquí.</T></View> : <Composer allowLoc placeholder={s.type === 'canal' ? 'Publica en tu canal' : 'Escribe un mensaje'} folder={() => (s.is_private ? `priv/${id}` : `pub/${uid}`)} onSend={send} />;
  return (
    <Screen title={s.name} sub={`${TY[s.type]} ${s.is_private ? 'privado' : 'público'}${count != null ? ` · ${count} ${s.type === 'canal' ? (count === 1 ? 'seguidor' : 'seguidores') : count === 1 ? 'miembro' : 'miembros'}` : ''}`} back right={right} foot={foot}>
      {desc ? <T kind="muted">{desc}</T> : null}
      {pending.length ? <Card><T kind="bold">Solicitudes de acceso</T>{pending.map((r) => <Row key={r.user_id}><T style={{ flex: 1 }}>@{r.user?.username}</T><Btn testID="approve" small kind="pri" label="Aprobar" onPress={async () => { await supabase.rpc('plaza_answer_request', { p_space: id, p_user: r.user_id, p_approve: true }); refreshBadges(); setPending((p) => p.filter((x) => x.user_id !== r.user_id)); }} /><Btn testID="reject" small label="Rechazar" onPress={async () => { await supabase.rpc('plaza_answer_request', { p_space: id, p_user: r.user_id, p_approve: false }); refreshBadges(); setPending((p) => p.filter((x) => x.user_id !== r.user_id)); }} /></Row>)}</Card> : null}
      {s.type === 'foro' ? <>
        {ask ? <Card><Field testID="ask-title" label="Pregunta" value={q} onChangeText={setQ} maxLength={140} /><Btn kind="pri" testID="ask-pub" label="Publicar pregunta" onPress={() => { if (q.trim().length < 5) return say('Escribe tu pregunta con al menos 5 caracteres.'); need(async () => { const { data: x } = await supabase.auth.getSession(); const { data, error } = await supabase.from('plaza_threads').insert({ space_id: id, author_id: x.session!.user.id, title: q.trim() }).select('id').single(); if (error) return say(errText(error)); setQ(''); setAsk(false); router.push(`/pregunta/${data.id}`); }); }} /></Card> : <Btn testID="ask-open" kind="sun" icon="add" label="Hacer una pregunta" onPress={() => setAsk(true)} />}
        {threads.map((x) => { const c = x.answers?.[0]?.count ?? 0; return <Card key={x.id} testID="thread-row" onPress={() => router.push(`/pregunta/${x.id}`)}><T kind="display" style={{ fontSize: 18 }}>{x.title}</T><T kind="muted" style={{ fontSize: 13 }}>@{x.author?.username} · {when(x.created_at)} · {c} {c === 1 ? 'respuesta' : 'respuestas'}</T></Card>; })}
      </> : !items.length ? <Empty title={s.type === 'canal' ? 'Aún no hay publicaciones' : 'Aún no hay mensajes'} /> : items.map((m) => {
        const mine = m.author_id === uid;
        return s.type === 'canal' ? <Card key={m.id} testID="post"><T kind="muted" style={{ fontSize: 13 }}>{when(m.created_at)}</T>{m.body ? <T>{m.body}</T> : null}<MediaView media={m.media} /><LocLink lat={m.lat} lng={m.lng} place={m.place} /></Card> : (
          <View key={m.id} testID="bubble" style={{ flexDirection: mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
            {mine ? null : <Av name={m.author?.username ?? '?'} size={32} />}
            <View style={{ maxWidth: '82%', backgroundColor: mine ? t.mine : t.surface, borderRadius: 14, padding: 10, gap: 4 }}>
              {mine ? null : <T kind="bold" style={{ color: t.brand, fontSize: 13 }} onPress={() => need(() => router.push(`/chat/${m.author_id}`))}>@{m.author?.username}</T>}
              {m.body ? <T>{m.body}</T> : null}<MediaView media={m.media} /><LocLink lat={m.lat} lng={m.lng} place={m.place} /><T kind="muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>{when(m.created_at)}</T>
            </View>
          </View>);
      })}
    </Screen>
  );
}
