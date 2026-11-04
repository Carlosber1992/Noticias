# Plaza

App comunitaria de noticias, foros, grupos y canales, para web, Android e iPhone con un solo código.

- **App:** Expo (React Native y web)
- **Datos, cuentas, archivos y tiempo real:** Supabase
- **Web:** Vercel

`demo.html` es el demo original, sin servidor.

## Funciones

- Cuenta solo con usuario y contraseña. También se puede leer sin cuenta.
- **Inicio:** noticias en vivo, última hora, me gusta y no me gusta, comentarios, búsqueda por localidad o tema y filtro por distancia.
- **Cerca:** grupos y canales disponibles por distancia, los propios y los que sigues, con mensajes sin leer.
- **Preguntar:** preguntas abiertas que responde la gente, y respuestas automáticas con lo ya publicado.
- **Foros:** públicos o privados.
- **Perfil:** mensajes privados, solicitudes de acceso y datos de contacto.
- **Privados:** se encuentran por nombre, pero el administrador debe aprobar el acceso. La base de datos bloquea el contenido a quien no tenga permiso.
- Fotos, videos, audios, ubicación y enlaces para compartir.

## Ejecutar

Requiere Node 22 o superior.

```bash
npm install
npm run web      # navegador
npm start        # abre el código QR para probar en el celular con Expo Go
```

Publicar la web: `npm run build:web` genera `dist/`. Vercel lo hace solo con cada cambio en `main`.

Para las tiendas se usa EAS Build, y hacen falta cuentas de Apple Developer y Google Play.

## Base de datos

- `supabase/migrations/`: tablas, reglas de acceso y funciones.
- `supabase/functions/plaza-register/`: crea cuentas sin correo real.
- `supabase/functions/plaza-alert/`: envía las alertas como notificación.

## Panel de control

El panel vive en Claude como artifact. `panel/plaza-panel.html` es su copia fuente. Solo entra el dueño del proyecto, por su conector de Supabase, con `public.plaza_panel(p_fn,p_a)`. Ninguna cuenta de la app tiene administración.

La clave de `lib/config.ts` es pública por diseño. Nunca subas la clave `service_role`.

## Pendiente antes de un lanzamiento abierto

- Reportar usuarios y contenido desde la app.
- Recuperar contraseña: hoy el correo y el celular se guardan, pero no se verifican.
- Límite de registros para evitar cuentas automáticas.
- Notificaciones en Android e iPhone nativos: hoy las alertas con la app cerrada solo llegan al navegador.
- Mapa real: Cerca usa un radar de distancia.
- Elegir un punto exacto en un mapa: hoy se usa GPS o una ciudad.
- Respuestas redactadas con IA: hoy muestran lo más parecido a lo publicado.
- Publicación en App Store y Google Play.
