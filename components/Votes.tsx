import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/theme';
import { Btn, Row, T } from './ui';

// El conteo cambia al instante al tocar; si el servidor falla, vuelve al valor anterior.
export function Votes({ news }: { news: any }) {
  const t = useT(); const { uid, need, say } = useApp();
  const [c, setC] = useState({ up: news.up_count, down: news.down_count, mine: 0 });
  const known = useRef(false); const busy = useRef(false); const cur = useRef(c); cur.current = c;
  useEffect(() => { if (!busy.current) setC((x) => ({ ...x, up: news.up_count, down: news.down_count })); }, [news.up_count, news.down_count]);
  useEffect(() => {
    known.current = false;
    if (!uid) { setC((x) => ({ ...x, mine: 0 })); return; }
    supabase.from('plaza_news_votes').select('value').eq('news_id', news.id).eq('user_id', uid).maybeSingle().then(({ data }) => { known.current = true; if (!busy.current) setC((x) => ({ ...x, mine: data?.value ?? 0 })); });
  }, [uid, news.id]);
  const vote = (v: number) => need(async () => {
    if (busy.current) return;
    busy.current = true;
    const before = cur.current;
    try {
      const me = (await supabase.auth.getSession()).data.session!.user.id;
      let mine = before.mine;
      if (!known.current) mine = (await supabase.from('plaza_news_votes').select('value').eq('news_id', news.id).eq('user_id', me).maybeSingle()).data?.value ?? 0;
      const next = mine === v ? 0 : v;
      setC({ up: before.up + (next === 1 ? 1 : 0) - (mine === 1 ? 1 : 0), down: before.down + (next === -1 ? 1 : 0) - (mine === -1 ? 1 : 0), mine: next });
      const { error } = next === 0 ? await supabase.from('plaza_news_votes').delete().eq('news_id', news.id).eq('user_id', me) : await supabase.from('plaza_news_votes').upsert({ news_id: news.id, user_id: me, value: next });
      if (error) throw error;
      known.current = true;
    } catch { setC(before); say('No se pudo guardar tu voto. Inténtalo de nuevo.'); }
    busy.current = false;
  });
  const sc = c.up - c.down, pct = c.up + c.down ? (c.up / (c.up + c.down)) * 100 : 50;
  return (
    <View style={{ gap: 6 }}>
      <Row>
        <Btn testID="up" small icon="thumbs-up-outline" kind={c.mine === 1 ? 'sun' : 'soft'} label={String(c.up)} onPress={() => vote(1)} />
        <T testID="score" kind="display" style={{ fontSize: 18, minWidth: 44, textAlign: 'center', color: sc > 0 ? t.brand : sc < 0 ? t.news : t.ink }}>{sc > 0 ? '+' : ''}{sc}</T>
        <Btn testID="down" small icon="thumbs-down-outline" kind={c.mine === -1 ? 'sun' : 'soft'} label={String(c.down)} onPress={() => vote(-1)} />
      </Row>
      <View style={{ height: 5, borderRadius: 9, flexDirection: 'row', overflow: 'hidden', backgroundColor: c.up + c.down ? t.news : t.surface2 }}>{c.up + c.down ? <View style={{ width: `${pct}%`, backgroundColor: t.brand }} /> : null}</View>
    </View>
  );
}
