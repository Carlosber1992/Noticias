import { useFocusEffect, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LocLink, MediaView } from '../../components/MediaView';
import { Btn, Card, Chip, Empty, Field, Loading, Row, Screen, ShareBtn, T } from '../../components/ui';
import { Votes } from '../../components/Votes';
import { useApp } from '../../lib/app';
import { withPins } from '../../lib/pins';
import { enablePush, pushState } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { distKm, km, nz, when } from '../../lib/util';

const NEWS_SELECT = '*, author:plaza_profiles!author_id(username), comments:plaza_news_comments(count)';
export default function Inicio() {
  const t = useT(); const { here, need, say } = useApp();
  const [list, setList] = useState<any[] | null>(null); const [q, setQ] = useState(''); const [radius, setRadius] = useState<number | null>(null); const [sort, setSort] = useState('new'); const [push, setPush] = useState(pushState());
  const load = useCallback(async () => {
    const { data } = await supabase.from('plaza_news').select(NEWS_SELECT).order('pin_rank', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(200);
    setList(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const ch = supabase.channel('news' + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'plaza_news' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const munis = useMemo(() => [...new Set((list ?? []).map((n) => n.municipio))].sort(), [list]);
  const dist = (n: any) => (here && n.lat != null ? distKm(here, n) : 1e9);
  const shown = useMemo(() => {
    const w = nz(q).split(/\s+/).filter((x) => x && !['de', 'del', 'en', 'la', 'el', 'noticias', 'noticia'].includes(x));
    const r = (list ?? []).filter((n) => (!radius || dist(n) <= radius) && w.every((x) => nz([n.municipio, n.title, n.body, n.context, n.place].join(' ')).includes(x)));
    const sc = (n: any) => n.up_count - n.down_count;
    const sorted = r.sort(sort === 'top' ? (a, b) => sc(b) - sc(a) : sort === 'near' ? (a, b) => dist(a) - dist(b) : (a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return sort === 'new' ? withPins(sorted) : sorted;
  }, [list, q, radius, sort, here]);
  return (
    <Screen testID="inicio" title="Noticias" sub="Se actualiza sola" right={<Btn testID="publish" small kind="sun" icon="add" label="Publicar" onPress={() => need(() => router.push('/publicar'))} />}>
      {push === 'off' ? <Card><Row style={{ justifyContent: 'space-between' }}><T kind="semi" style={{ flex: 1, minWidth: 180 }}>Recibe las alertas importantes aunque tengas la app cerrada.</T><Btn testID="push-on" small kind="sun" icon="notifications-outline" label="Activar alertas" onPress={async () => { try { await enablePush(); } catch { say('No pudimos activar las alertas. Inténtalo de nuevo.'); } setPush(pushState()); }} /></Row></Card> : null}
      <Field testID="news-q" value={q} onChangeText={setQ} placeholder="Busca por localidad, tema o palabra" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{munis.map((m) => <Chip key={m} label={m} on={nz(q) === nz(m)} onPress={() => setQ(nz(q) === nz(m) ? '' : m)} />)}</ScrollView>
      <Card>
        <Row>
          <Chip testID="near" label="Cerca de mí" on={!!radius} onPress={() => { if (!here) return router.push('/cerca'); setRadius(radius ? null : 2); }} />
          {[1, 2, 5].map((r) => <Chip key={r} label={`${r} km`} on={radius === r} onPress={() => (here ? setRadius(r) : router.push('/cerca'))} />)}
          {radius ? <><Btn small label="−" onPress={() => setRadius(Math.max(1, radius - 1))} /><T kind="bold">{km(radius)}</T><Btn small label="+" onPress={() => setRadius(radius + 1)} /></> : null}
        </Row>
        {radius && here ? <T kind="muted" style={{ fontSize: 13 }}>Desde {here.label}</T> : null}
      </Card>
      <Row><Chip label="Más recientes" on={sort === 'new'} onPress={() => setSort('new')} /><Chip label="Más votadas" on={sort === 'top'} onPress={() => setSort('top')} />{here ? <Chip label="Más cercanas" on={sort === 'near'} onPress={() => setSort('near')} /> : null}</Row>
      <T testID="news-count" kind="muted">{list ? `${shown.length} ${shown.length === 1 ? 'noticia' : 'noticias'}` : ''}</T>
      {!list ? <Loading /> : !shown.length ? <Empty title={list.length ? 'Sin resultados' : 'Aún no hay noticias'} text={list.length ? 'Prueba con otra localidad, palabra o distancia.' : 'Publica la primera noticia.'}>{q ? <Btn small kind="sun" label="Preguntar por esto" onPress={() => router.push({ pathname: '/preguntar', params: { q, tab: 'auto' } })} /> : null}</Empty> : shown.map((n) => {
        const c = n.comments?.[0]?.count ?? 0;
        return (
          <Card key={n.id} testID="news-card">
            <Row>{sort === 'new' && n.pin_rank != null ? <View testID="pinned" style={{ backgroundColor: t.sun, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><T kind="bold" style={{ color: t.sunInk, fontSize: 12 }}>Anclada</T></View> : null}{n.is_breaking ? <View style={{ backgroundColor: t.news, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><T kind="bold" style={{ color: t.surface, fontSize: 12 }}>Última hora</T></View> : null}<T kind="muted" style={{ fontSize: 13 }}>{n.municipio} · @{n.author?.username} · {when(n.created_at)}{here && n.lat != null ? ` · a ${km(distKm(here, n))}` : ''}</T></Row>
            <Pressable onPress={() => router.push(`/noticia/${n.id}`)} style={{ gap: 4 }}><T kind="display" style={{ fontSize: 20 }}>{n.title}</T>{n.body ? <T>{n.body}</T> : null}</Pressable>
            <MediaView media={n.media} /><LocLink lat={n.lat} lng={n.lng} place={n.place} />
            <Votes news={n} />
            <Row style={{ justifyContent: 'space-between' }}><Btn small kind="ghost" icon="chatbubble-outline" label={c ? `Ver ${c} ${c === 1 ? 'comentario' : 'comentarios'}` : 'Abrir y comentar'} onPress={() => router.push(`/noticia/${n.id}`)} /><ShareBtn path={`/noticia/${n.id}`} title={n.title} /></Row>
          </Card>
        );
      })}
    </Screen>
  );
}
