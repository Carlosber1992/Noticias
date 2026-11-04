import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { useApp } from '../../lib/app';
import { F, useT } from '../../lib/theme';

const icon = (n: any) => ({ color, size }: any) => <Ionicons name={n} color={color} size={size} />;
export default function L() {
  const t = useT(); const { uid, guest, dmUnread, reqCount, spaceUnread } = useApp();
  if (!uid && !guest) return <Redirect href="/entrar" />;
  const b = dmUnread + reqCount;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.brand, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line }, tabBarLabelStyle: { fontFamily: F.semi, fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('newspaper-outline') }} />
      <Tabs.Screen name="cerca" options={{ title: 'Cerca', tabBarIcon: icon('location-outline'), tabBarBadge: spaceUnread || undefined }} />
      <Tabs.Screen name="preguntar" options={{ title: 'Preguntar', tabBarIcon: icon('help-circle-outline') }} />
      <Tabs.Screen name="foros" options={{ title: 'Foros', tabBarIcon: icon('chatbox-ellipses-outline') }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icon('person-outline'), tabBarBadge: b || undefined }} />
    </Tabs>
  );
}
