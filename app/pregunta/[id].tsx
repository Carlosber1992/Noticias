import { useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Composer } from '../../components/Composer';
import { check, Editable, EditForm, locCols, locOf, OwnActions } from '../../components/Own';
import { removeMedia } from '../../lib/media';
import { LocLink, MediaView } from '../../components/MediaView';
import { Av, Btn, Card, Empty, Loading, Row, Screen, ShareBtn, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { errText, when } from '../../lib/util';

export default function Pregunta() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { uid, need, say } = useApp();
  const [h, setH] = useState<any>(undefined); const [ms, setMs] = useState<any[]>([]); const [ed, setEd] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('plaza_threads').select('*, author:plaza_profiles!author_id(username), space:plaza_spaces!space_id(id,name,is_private)').eq('id', id).maybeSingle(),
      supabase.from('plaza_messages').select('*, author:plaza_profiles!author_id(username)').eq('thread_id', id).order('is_best', { ascending: false }).order('created_at'),
    ]);
    setH(a.data ?? null); setMs(b.data ?? []);
  }, [id]);
  useEffect(() => { load(); const ch = supabase.channel('t-' + id + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'plaza_messages', filter: `thread_id=eq.${id}` }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [id, load]);
  if (h === undefined) return <Screen title="Pregunta" back><Loading /></Screen>;
  if (!h) return <Screen title="Pregunta" back><Empty title="No puedes ver esta pregunta" text="Puede ser privada o haber sido eliminada." /></Screen>;
  const like = (m: any) => need(async () => { const { data: s } = await supabase.auth.getSession(); const me = s.session!.user.id; const { data: c } = await supabase.from('plaza_likes').select('message_id').eq('message_id', m.id).eq('user_id', me).maybeSingle(); if (c) await supabase.from('plaza_likes').delete().eq('message_id', m.id).eq('user_id', me); else await supabase.from('plaza_likes').insert({ message_id: m.id, user_id: me }); load(); });
  const best = async (m: any) => { const { error } = await supabase.rpc('plaza_mark_best', { p_message: m.id }); if (error) say(errText(error)); load(); };
  return (
    <Screen title={h.space?.name ?? 'Pregunta'} sub={`${ms.length} ${ms.length === 1 ? 'respuesta' : 'respuestas'}`} back right={<ShareBtn path={`/pregunta/${h.id}`} title={h.title} />}
      foot={<Composer allowLoc placeholder="Escribe tu respuesta" folder={() => (h.space?.is_private ? `priv/${h.space_id}` : `pub/${uid}`)} onSend={async (o) => { const { data: s } = await supabase.auth.getSession(); const { error } = await supabase.from('plaza_messages').insert({ space_id: h.space_id, thread_id: h.id, author_id: s.session!.user.id, ...o }); if (error) throw error; load(); }} />}>
      <Card><Row><Av name={h.author?.username ?? '?'} /><T kind="semi" onPress={() => h.author_id !== uid && router.push(`/chat/${h.author_id}`)}>@{h.author?.username}</T><T kind="muted" style={{ fontSize: 13 }}>{when(h.created_at)}</T></Row>{ed ? <EditForm loc={{ value: locOf(h) }} fields={[{ key: 'title', label: 'Pregunta', value: h.title, max: 140, min: 5, msg: 'Escribe tu pregunta con al menos 5 caracteres.' }, { key: 'body', label: 'Detalles (opcional)', value: h.body, multiline: true, max: 4000 }]} onCancel={() => setEd(false)} onSave={async (v, l) => { check(await supabase.from('plaza_threads').update({ ...v, ...locCols(l) }).eq('id', h.id)); setEd(false); say('Cambios guardados'); load(); }} /> : <><T kind="display" style={{ fontSize: 24 }}>{h.title}</T>{h.body ? <T>{h.body}</T> : null}<LocLink lat={h.lat} lng={h.lng} place={h.place} />{h.edited_at ? <T kind="muted" style={{ fontSize: 12 }}>Editada</T> : null}{h.author_id === uid ? <OwnActions what="esta pregunta" warn={ms.length ? 'También se borran sus respuestas.' : undefined} onEdit={() => setEd(true)} onDelete={async () => { check(await supabase.from('plaza_threads').delete().eq('id', h.id)); await removeMedia(ms.filter((m) => m.author_id === uid).flatMap((m) => m.media ?? [])); if (router.canGoBack()) router.back(); else router.replace('/preguntar'); }} /> : null}</>}</Card>
      <T kind="bold">{ms.length} {ms.length === 1 ? 'respuesta' : 'respuestas'}</T>
      {ms.map((m) => <Card key={m.id} testID="reply">
        <Row><Av name={m.author?.username ?? '?'} /><T kind="semi" onPress={() => m.author_id !== uid && need(() => router.push(`/chat/${m.author_id}`))}>@{m.author?.username}</T><T kind="muted" style={{ fontSize: 13 }}>{when(m.created_at)}{m.is_best ? ' · Mejor respuesta' : ''}</T></Row>
        <Editable table="plaza_messages" id={m.id} body={m.body} media={m.media} edited={m.edited_at} own={m.author_id === uid} what="esta respuesta" onDone={load}><MediaView media={m.media} /><LocLink lat={m.lat} lng={m.lng} place={m.place} /></Editable>
        <Row><Btn small icon="arrow-up" label={String(m.like_count)} onPress={() => like(m)} />{h.author_id === uid && !m.is_best ? <Btn small kind="ghost" label="Marcar como mejor" onPress={() => best(m)} /> : null}</Row>
      </Card>)}
    </Screen>
  );
}
