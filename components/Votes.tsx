import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { Btn, Row, T } from './ui';

export function Votes({ news, onChange }: { news: any; onChange?: () => void }) {
  const t = useT(); const { uid, need } = useApp(); const [mine, setMine] = useState<number>(0); const [d, setD] = useState({ u: 0, x: 0 });
  useEffect(() => { setD({ u: 0, x: 0 }); }, [news.up_count, news.down_count]);
  useEffect(() => { if (!uid) return setMine(0); supabase.from('plaza_news_votes').select('value').eq('news_id', news.id).eq('user_id', uid).maybeSingle().then(({ data }) => setMine(data?.value ?? 0)); }, [uid, news.id]);
  const u = news.up_count + d.u, x = news.down_count + d.x, sc = u - x, pct = u + x ? (u / (u + x)) * 100 : 50;
  const vote = (v: number) => need(async () => {
    const { data: s } = await supabase.auth.getSession(); const me = s.session!.user.id;
    const { data: cur } = await supabase.from('plaza_news_votes').select('value').eq('news_id', news.id).eq('user_id', me).maybeSingle();
    if (cur?.value === v) { await supabase.from('plaza_news_votes').delete().eq('news_id', news.id).eq('user_id', me); setMine(0); }
    else { await supabase.from('plaza_news_votes').upsert({ news_id: news.id, user_id: me, value: v }); setMine(v); }
    onChange?.();
  });
  return (
    <View style={{ gap: 6 }}>
      <Row>
        <Btn testID="up" small icon="thumbs-up-outline" kind={mine === 1 ? 'sun' : 'soft'} label={String(u)} onPress={() => vote(1)} />
        <T testID="score" kind="display" style={{ fontSize: 18, minWidth: 44, textAlign: 'center', color: sc > 0 ? t.brand : sc < 0 ? t.news : t.ink }}>{sc > 0 ? '+' : ''}{sc}</T>
        <Btn testID="down" small icon="thumbs-down-outline" kind={mine === -1 ? 'sun' : 'soft'} label={String(x)} onPress={() => vote(-1)} />
      </Row>
      <View style={{ height: 5, borderRadius: 9, flexDirection: 'row', overflow: 'hidden', backgroundColor: t.news }}><View style={{ width: `${pct}%`, backgroundColor: t.brand }} /></View>
    </View>
  );
}
