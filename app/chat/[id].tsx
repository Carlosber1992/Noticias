import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Composer } from '../../components/Composer';
import { MediaView } from '../../components/MediaView';
import { Loading, Screen, T } from '../../components/ui';
import { useApp } from '../../lib/app';
import { supabase } from '../../lib/supabase';
import { useT } from '../../lib/theme';
import { when } from '../../lib/util';

export default function Chat() {
  const t = useT(); const { id } = useLocalSearchParams<{ id: string }>(); const { uid, refreshBadges } = useApp();
  const [name, setName] = useState(''); const [ms, setMs] = useState<any[] | null>(null);
  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('plaza_dms').select('*').or(`and(sender_id.eq.${uid},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${uid})`).order('created_at').limit(300);
    setMs(data ?? []);
    await supabase.rpc('plaza_mark_read', { p_other: id }); refreshBadges();
  }, [id, uid, refreshBadges]);
  useEffect(() => {
    supabase.from('plaza_profiles').select('username').eq('id', id).maybeSingle().then(({ data }) => setName(data?.username ?? ''));
    load();
    if (!uid) return;
    const ch = supabase.channel('c-' + id + '-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'plaza_dms', filter: `recipient_id=eq.${uid}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, uid, load]);
  const pair = () => [uid, id].sort().join('_');
  return (
    <Screen title={`@${name}`} sub="Mensaje directo" back foot={<Composer placeholder="Escribe un mensaje" folder={() => `dm/${pair()}`} onSend={async (o) => { const { error } = await supabase.from('plaza_dms').insert({ sender_id: uid, recipient_id: id, body: o.body, media: o.media }); if (error) throw error; load(); }} />}>
      {!ms ? <Loading /> : !ms.length ? <T kind="muted" style={{ textAlign: 'center' }}>Escribe el primer mensaje para @{name}.</T> : ms.map((m) => { const me = m.sender_id === uid; return (
        <View key={m.id} testID="dm" style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: me ? t.mine : t.surface, borderRadius: 14, padding: 10, gap: 4 }}>{m.body ? <T>{m.body}</T> : null}<MediaView media={m.media} /><T kind="muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>{when(m.created_at)}</T></View>
      ); })}
    </Screen>
  );
}
