// Valores públicos: la protección real está en las reglas de la base de datos.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://qbcabwbpobqgwblrzhzb.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiY2Fid2Jwb2JxZ3dibHJ6aHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NDk0NTEsImV4cCI6MjEwOTMyNTQ1MX0.UupboTgpdPZY8nEEYXG08XVNKHokzzorR8KQEKK9Cqg';
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://plaza-noticias.vercel.app';
