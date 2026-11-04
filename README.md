# Plaza

Demo de una app comunitaria de noticias, foros, grupos y canales. Todo está en un solo archivo, `index.html`, y no necesita instalación: basta con abrirlo en un navegador.

**Es una demostración.** No tiene servidor: los datos se guardan en el navegador de cada persona, así que dos personas en dispositivos distintos no pueden comunicarse todavía.

## Probarla

Abre `index.html` y entra con **Usuario demo** (usuario `demo`, contraseña `demo1234`), o crea una cuenta con usuario y contraseña. También puedes usar **Leer sin cuenta**.

## Qué incluye

- **Registro rápido:** solo usuario y contraseña. El correo y el celular son opcionales.
- **Inicio:** noticias con última hora, me gusta y no me gusta, comentarios, buscador por municipio o tema y filtro por distancia.
- **Cerca:** grupos y canales en un mapa, filtrados por distancia.
- **Preguntar:** preguntas abiertas que responde la comunidad, y respuestas automáticas.
- **Foros:** públicos o privados, con preguntas y respuestas.
- **Perfil:** mensajes privados, crear grupos y canales, solicitudes de acceso y lo que sigues.
- **Espacios privados:** se encuentran, pero su contenido solo lo ve quien aprueba el administrador.
- **Multimedia y compartir:** fotos, videos, audios y ubicación, con enlaces para WhatsApp, Telegram y otras apps.

## Qué está simulado

- Las noticias y preguntas que entran solas, las respuestas de otros usuarios, los votos que cambian solos y las aprobaciones de otros administradores.
- La cercanía usa un mapa ilustrado con puntos de ejemplo, no GPS ni mapas reales.
- Vincular correo o celular no envía ninguna verificación.
- Las noticias y personas son de ejemplo, aunque algunos municipios sean reales.
- Los archivos subidos desaparecen al recargar la página.
- **Respuesta automática** usa Claude solo dentro de la versión publicada en Claude. Fuera de ahí muestra la publicación más parecida.

## Qué falta para la versión real

- Servidor y base de datos, con cuentas y contraseñas protegidas en el servidor. La protección de los espacios privados también debe hacerse ahí.
- Almacenamiento de archivos y notificaciones.
- GPS, mapas reales y una lista oficial de municipios.
- Bloquear y reportar usuarios, y moderación de contenido.
- Recuperación de cuenta para quien no vincule correo ni celular.
