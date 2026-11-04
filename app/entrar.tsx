import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Field, T } from '../components/ui';
import { useApp } from '../lib/app';
import { useT } from '../lib/theme';

export default function Entrar() {
  const t = useT(); const { enter, setGuest, runPending, say } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const t0 = useRef(0);
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const go = async () => {
    setBusy(true); setErr('');
    const e = await enter(u, p); setBusy(false);
    if (e) return setErr(e);
    say(`Listo, @${u.trim()}${t0.current ? ` · ${((Date.now() - t0.current) / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s` : ''}`);
    leave(); runPending();
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: 16 }}>
            <T kind="display" style={{ fontSize: 26 }}>Plaza</T>
            <T kind="display" style={{ fontSize: 40, lineHeight: 44 }}>Entra ya. Sin correo ni celular.</T>
            <T kind="muted" style={{ fontSize: 16 }}>Elige usuario y contraseña. Si el usuario ya es tuyo, entras; si no, creamos tu cuenta.</T>
            <Field testID="u" label="Usuario" value={u} onChangeText={(v: string) => { t0.current = t0.current || Date.now(); setU(v); }} autoCapitalize="none" autoCorrect={false} placeholder="tu_usuario" />
            <Field testID="p" label="Contraseña" value={p} onChangeText={setP} secureTextEntry placeholder="Mínimo 8 caracteres" onSubmitEditing={go} />
            {err ? <T testID="err" role="alert" style={{ color: t.news }}>{err}</T> : null}
            <Btn testID="go" kind="pri" label={busy ? 'Entrando…' : 'Entrar o crear cuenta'} onPress={go} disabled={busy} />
            <T kind="muted" style={{ fontSize: 13 }}>Sin correo o celular vinculado no podrás recuperar tu contraseña. Puedes vincularlos en tu perfil.</T>
            <Btn testID="guest" label="Leer sin cuenta" onPress={() => { setGuest(true); router.replace('/'); }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
