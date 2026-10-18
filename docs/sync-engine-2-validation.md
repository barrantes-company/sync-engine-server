# Evidencia de validación: SYNC ENGINE 2.0

Entorno local: Windows, Node `v24.20.0`, Chrome real indicado mediante `CHROME_PATH`. Fecha: 2026-10-18.

| Verificación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts --no-fund --no-audit` | Instalación limpia: 389 paquetes; lockfile sincronizado. |
| `npm ls --depth=0` | Dependencias directas resueltas; `ws` y `socket.io-client` disponibles para ejecución. |
| `npm run test:staging` | 18/18, sin omisiones: 5 unitarias/configuración, 5 persistencia/arranque y 8 integración real. |
| `npm test` | 40 pruebas aprobadas, 0 fallidas, 3 omitidas por ser POSIX; `no-speed-insights` también correcto. Sin errores de hooks de limpieza en la ejecución final. |
| `npm run lint` | Sintaxis correcta en todos los módulos enumerados, incluido puente y routing. |
| `npm run build` | Webpack `5.111.1`: bundle generado correctamente. |
| `git diff --check` | Sin errores de whitespace. |
| Blueprint de Render | Validación local correcta con PyYAML y `Draft202012Validator`, contra el esquema oficial descargado de `https://render.com/schema/render.yaml.json`. No se aplicó el Blueprint. |
| Configuración Vercel | Instancia validada contra el esquema oficial; bloqueo de despliegues para esta rama. La comprobación del metaschema completo de Vercel falla en una propiedad ajena (`functions.experimentalTriggers`); se validó la instancia sin esa comprobación previa. |
| `npm audit --omit=dev --json` | 9 paquetes de severidad moderada; 0 altos y 0 críticos. No es una auditoría limpia. |

## Cobertura real de seguridad y datos

- Socket.IO por WebSocket y por long polling, servidor en un proceso Node independiente y clientes reales.
- Un usuario con dos dispositivos, segundo usuario, tercero ajeno y socket anónimo; sin envío global si faltan destinatarios, son inválidos o están offline.
- Cambio de identidad en una conexión y fallo de reautenticación: se retira el acceso anterior. Sesiones caducadas y revocadas dejan de recibir Pub/Sub aunque el socket permanezca conectado.
- Mensaje privado real enviado por Socket.IO y confirmado en JSON; un tercero no obtiene el contenido por HTTP.
- Dos puentes de identidades distintas y clientes WS reales: token ausente, incorrecto o del otro puente produce 401. Un upstream no autenticado no puede reenviar datos.
- JSON corrupto, vacío, raíz o colecciones de tipo incorrecto, y lectura simulada EACCES: error sin reemplazar el contenido. Arranque de servidor real sobre JSON corrupto termina antes de escuchar.
- 60 escrituras en cola y recarga desde un módulo nuevo; error de rename conserva el último archivo confirmado. Reinicio de proceso completo recupera la conversación privada persistida.

No se usaron cuentas, sesiones, archivos ni credenciales productivas. La entrega desde GCP se inyectó exclusivamente por IPC en el helper de pruebas; no se declara integración con IAM ni Pub/Sub real de Google Cloud.

## Regresión

La suite existente incluye XSS, archivos privados, rangos HTTP y HEAD, cookies, canales y administración, bóveda cifrada, reintentos sin duplicar, cola offline/reconexión, imágenes, WAV y WebM reales, Media Center, service worker, widget y tokens FCM.

Tres pruebas del ciclo de vida con ejecutables POSIX se omiten por diseño en Windows. CI Ubuntu las ejecuta. No se consideran ejecutadas localmente.

Los primeros intentos detectaron instalación incompleta, fixtures de token y origen incompatibles con las defensas actuales, dependencia implícita de `crypto`, 404 del widget bajo carpetas ocultas y limpieza de procesos Chromium en Windows. Se corrigieron los defectos y se repitieron las verificaciones. El cierre por CDP precede al fallback de terminación del árbol de procesos en Windows. La ejecución final completa no contiene fallos de pruebas ni de hooks; no se interpretan como éxito los logs de intentos anteriores.

## Pendiente fuera del entorno local

CI Ubuntu del PR; creación y primer despliegue de staging tras autorización; credenciales/IAM de GCP y push exclusivos de staging; persistencia de disco después de redeploy real de Render; clientes nativos Android/iOS. Los riesgos de DB JSON, límites históricos y dependencias se detallan en `sync-engine-2-staging.md`.
