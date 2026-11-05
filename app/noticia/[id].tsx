import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Composer } from '../../components/Composer';
import { check, Editable, EditForm, locCols, locOf, OwnActions } from '../../components/Own';
import { removeMedia } from '../../lib/media';
import { MediaView, LocLink } from '../../components/MediaView';
import { Av, Card, Empty, Loading, Row, Screen, ShareBtn, T } from '../../components/ui';
import { Votes } from '../../components/Votes';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { when } from '../../lib/util';

export default function Noticia() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { uid, say } = useApp(); const [ed, setEd] = useState(false);
  const [n, setN] = useState<any>(undefined); const [cs, setCs] = useState<any[]>([]);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('plaza_news').select('*, author:plaza_profiles!author_id(username)').eq('id', id).maybeSingle(),
      supabase.from('plaza_news_comments').select('*, author:plaza_profiles!author_id(username)').eq('news_id', id).order('created_at'),
    ]);
    setN(a.data ?? null); setCs(b.data ?? []);
  }, [id]);
  useEffect(() => {
    load();
    const ch = supabase.channel('nc-' + id + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'plaza_news_comments', filter: `news_id=eq.${id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);
  if (n === undefined) return <Screen title="Noticia" back><Loading /></Screen>;
  if (!n) return <Screen title="Noticia" back><Empty title="No encontramos esta noticia" text="Puede haber sido eliminada." /></Screen>;
  return (
    <Screen title={n.title} sub={`${cs.length} ${cs.length === 1 ? 'comentario' : 'comentarios'}`} back right={<ShareBtn path={`/noticia/${n.id}`} title={n.title} />}
      foot={<Composer placeholder="Escribe un comentario" folder={() => `pub/${uid}`} onSend={async (o) => { const { error } = await supabase.from('plaza_news_comments').insert({ news_id: n.id, author_id: uid ?? (await supabase.auth.getSession()).data.session!.user.id, body: o.body, media: o.media }); if (error) throw error; await load(); }} />}>
      <Card>
        <T kind="muted" style={{ fontSize: 13 }}>{n.is_breaking ? 'Última hora · ' : ''}{n.municipio} · @{n.author?.username} · {when(n.created_at)}{n.edited_at ? ' · editada' : ''}</T>
        {ed ? <EditForm loc={{ value: locOf(n) }} fields={[{ key: 'title', label: 'Titular', value: n.title, max: 120, min: 8, msg: 'Escribe un titular de al menos 8 caracteres.' }, { key: 'municipio', label: 'Localidad', value: n.municipio, locality: true, min: 2, msg: 'Escribe la localidad de la noticia.' }, { key: 'body', label: 'Detalles (opcional)', value: n.body, multiline: true, max: 4000 }]} onCancel={() => setEd(false)} onSave={async (v, l) => { check(await supabase.from('plaza_news').update({ ...v, ...locCols(l) }).eq('id', n.id)); setEd(false); say('Cambios guardados'); load(); }} /> : <>
        <T kind="display" style={{ fontSize: 26 }}>{n.title}</T>
        {n.body ? <T>{n.body}</T> : null}
        <MediaView media={n.media} /><LocLink lat={n.lat} lng={n.lng} place={n.place} /><Votes news={n} />
        {n.author_id === uid ? <OwnActions what="esta noticia" onEdit={() => setEd(true)} onDelete={async () => { check(await supabase.from('plaza_news').delete().eq('id', n.id)); await removeMedia(n.media); if (router.canGoBack()) router.back(); else router.replace('/'); }} /> : null}
        </>}
      </Card>
      <T kind="bold">{cs.length} {cs.length === 1 ? 'comentario' : 'comentarios'}</T>
      {!cs.length ? <T kind="muted">Sé la primera persona en comentar.</T> : null}
      {cs.map((c) => <Card key={c.id} testID="comment"><Row><Av name={c.author?.username ?? '?'} /><T kind="semi">@{c.author?.username}</T><T kind="muted" style={{ fontSize: 13 }}>{when(c.created_at)}</T></Row><Editable table="plaza_news_comments" id={c.id} body={c.body} media={c.media} edited={c.edited_at} own={c.author_id === uid} what="este comentario" onDone={load}><MediaView media={c.media} /></Editable></Card>)}
      <View style={{ height: 4 }} />
    </Screen>
  );
}
