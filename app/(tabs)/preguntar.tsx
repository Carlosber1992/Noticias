import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Btn, Card, Chip, Empty, Field, Loading, Row, Screen, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { errText, when } from '../../lib/util';

type A = { q: string; docs: any[] | null };
export default function Preguntar() {
  const t = useT(); const p = useLocalSearchParams<{ q?: string; tab?: string }>(); const { need, say } = useApp();
  const [tab, setTab] = useState('com'); const [list, setList] = useState<any[] | null>(null); const [only, setOnly] = useState(false);
  const [newQ, setNewQ] = useState(false); const [q, setQ] = useState(''); const [forums, setForums] = useState<any[]>([]); const [to, setTo] = useState('libre');
  const [asks, setAsks] = useState<A[]>([]); const [ask, setAsk] = useState(''); const used = useRef('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('plaza_threads').select('*, author:plaza_profiles!author_id(username), space:plaza_spaces!space_id(id,name), answers:plaza_messages(count)').order('created_at', { ascending: false }).limit(100);
    setList(data ?? []);
    const f = await supabase.from('plaza_spaces').select('id,name,is_private').eq('type', 'foro');
    setForums(f.data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const ch = supabase.channel('threads').on('postgres_changes', { event: '*', schema: 'public', table: 'plaza_threads' }, load).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plaza_messages' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load]);
  const go = async (text: string) => {
    text = text.trim(); if (!text) return;
    setAsk(''); setAsks((x) => [...x, { q: text, docs: null }]);
    const { data } = await supabase.rpc('plaza_search', { q: text });
    setAsks((x) => x.map((a) => (a.q === text && !a.docs ? { ...a, docs: data ?? [] } : a)));
  };
  useEffect(() => { if (p.tab === 'auto') setTab('auto'); if (p.q && used.current !== p.q) { used.current = p.q; go(p.q); } }, [p.q, p.tab]);
  const publish = (title: string, target: string) => need(async () => {
    try {
      const { data: s } = await supabase.auth.getSession(); const me = s.session!.user.id;
      const space = target === 'libre' ? (await supabase.rpc('plaza_free_forum')).data : target;
      const { data, error } = await supabase.from('plaza_threads').insert({ space_id: space, author_id: me, title }).select('id').single();
      if (error) throw error;
      setNewQ(false); setQ(''); router.push(`/pregunta/${data.id}`);
    } catch (e) { say(errText(e)); }
  });
  const tabs = <Row><Chip testID="tab-com" label="Preguntas abiertas" on={tab === 'com'} onPress={() => setTab('com')} /><Chip testID="tab-auto" label="Respuesta automática" on={tab === 'auto'} onPress={() => setTab('auto')} /></Row>;
  if (tab === 'auto') return (
    <Screen title="Preguntar" sub="Busca en lo publicado en Plaza"
      foot={<View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, padding: 8, flexDirection: 'row', gap: 6 }}><TextInput testID="ask" value={ask} onChangeText={setAsk} onSubmitEditing={() => go(ask)} placeholder="Escribe tu pregunta" placeholderTextColor={t.muted} accessibilityLabel="Escribe tu pregunta" style={{ flex: 1, minHeight: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.bg, color: t.ink }} /><Btn testID="ask-go" kind="pri" label="Preguntar" onPress={() => go(ask)} /></View>}>
      {tabs}
      {!asks.length ? <Empty title="¿Qué quieres saber?" text="Te mostramos al momento lo que ya se publicó sobre el tema. No necesitas cuenta." /> : null}
      {asks.map((a, i) => <View key={i} style={{ gap: 6 }}>
        <View style={{ alignSelf: 'flex-end', backgroundColor: t.mine, borderRadius: 14, padding: 10, maxWidth: '85%' }}><T>{a.q}</T></View>
        <Card testID="answer">{!a.docs ? <T kind="muted">Buscando…</T> : a.docs.length ? <>
          <T kind="bold" style={{ color: t.brand, fontSize: 13 }}>Según lo publicado en Plaza</T>
          <T>{a.docs[0].snippet || a.docs[0].title}</T>
          {a.docs.slice(0, 3).map((d: any) => <Pressable key={d.id} onPress={() => router.push(d.kind === 'news' ? `/noticia/${d.id}` : d.kind === 'thread' ? `/pregunta/${d.id}` : `/espacio/${d.id}`)} style={{ backgroundColor: t.bg, borderRadius: 10, padding: 10 }}><T kind="semi" numberOfLines={1}>{d.title}</T><T kind="muted" numberOfLines={1} style={{ fontSize: 13 }}>{d.snippet}</T></Pressable>)}
        </> : <T>No encontré nada publicado sobre eso en Plaza. Puedes preguntarle a la comunidad.</T>}
          {a.docs ? <Btn testID="to-community" small icon="people-outline" label="Preguntar a la comunidad" onPress={() => publish(a.q.padEnd(5, '?').slice(0, 140), 'libre')} style={{ alignSelf: 'flex-start' }} /> : null}
        </Card></View>)}
    </Screen>
  );
  const shown = (list ?? []).filter((x) => !only || !x.answers?.[0]?.count);
  return (
    <Screen title="Preguntar" sub="La gente responde aquí" right={<Btn testID="new-q" small kind="sun" icon="add" label="Preguntar" onPress={() => setNewQ(!newQ)} />}>
      {tabs}
      {newQ ? <Card>
        <Field testID="q-title" label="Pregunta" value={q} onChangeText={setQ} maxLength={140} placeholder="¿Qué quieres saber?" />
        <T kind="semi" style={{ fontSize: 14 }}>Comunidad</T>
        <Row><Chip label="Libre, sin comunidad" on={to === 'libre'} onPress={() => setTo('libre')} />{forums.filter((f) => f.name !== 'Preguntas libres').map((f) => <Chip key={f.id} label={f.name} on={to === f.id} onPress={() => setTo(f.id)} />)}</Row>
        <Btn testID="q-pub" kind="pri" label="Publicar pregunta" onPress={() => (q.trim().length < 5 ? say('Escribe tu pregunta con al menos 5 caracteres.') : publish(q.trim(), to))} />
      </Card> : null}
      <Row><Chip label="Recientes" on={!only} onPress={() => setOnly(false)} /><Chip label="Sin responder" on={only} onPress={() => setOnly(true)} /></Row>
      {!list ? <Loading /> : !shown.length ? <Empty title="No hay preguntas aquí" text="Haz la primera pregunta." /> : shown.map((x) => { const c = x.answers?.[0]?.count ?? 0; return (
        <Card key={x.id} testID="q-row" onPress={() => router.push(`/pregunta/${x.id}`)}><T kind="display" style={{ fontSize: 18 }}>{x.title}</T><T kind="muted" style={{ fontSize: 13 }}>{c ? '' : 'Sin responder · '}{x.space?.name} · @{x.author?.username} · {when(x.created_at)} · {c} {c === 1 ? 'respuesta' : 'respuestas'}</T></Card>
      ); })}
    </Screen>
  );
}
