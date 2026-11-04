import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, useFonts } from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Btn, Loading, T } from '../components/ui';
import { AppProvider, useApp } from '../lib/app';
import { useT } from '../lib/theme';

function Inner() {
  const { ready } = useApp(); const t = useT();
  const [fonts] = useFonts({ BricolageGrotesque_800ExtraBold, Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold });
  if (!ready || !fonts) return <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}><Loading /></View>;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />;
}
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  const t = useT();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <T kind="display" style={{ fontSize: 24, textAlign: 'center' }}>Algo salió mal</T>
      <T kind="muted" style={{ textAlign: 'center' }}>Vuelve a cargar esta pantalla para continuar.</T>
      <Btn kind="pri" label="Reintentar" onPress={retry} />
    </View>
  );
}
export default function Root() {
  return <SafeAreaProvider><AppProvider><StatusBar style="auto" /><Inner /></AppProvider></SafeAreaProvider>;
}
