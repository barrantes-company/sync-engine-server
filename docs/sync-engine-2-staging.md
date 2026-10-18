# SYNC ENGINE 2.0: candidato staging

## Alcance y base

Rama `staging-sync-engine-2`, creada desde `origin/main` actualizado: `4b9c1d76295ecb6f2fe7a0154c6d1daa64251b81`.
El checkout original y sus cambios locales se preservan mediante un worktree independiente.
No se modifica `main`, no se fusiona el PR y no se autoriza ningún despliegue con este documento.
`vercel.json` desactiva los despliegues Git únicamente para `staging-sync-engine-2`, sin cambiar el comportamiento de otras ramas. Los commits de preparación incluyen `[skip render]` para evitar despliegues accidentales. Referencia: [configuración Git de Vercel](https://vercel.com/docs/project-configuration/git-configuration).

## Auditoría y correcciones

| Hallazgo | Estado observado en la base | Corrección del candidato |
| --- | --- | --- |
| SEC-01 | El callback de Pub/Sub usa `io.emit`, incluyendo usuarios ajenos y sockets anónimos. | Destinatarios explícitos (`toSyncId`, `recipientSyncId`, `recipientSyncIds`), identidad actual del socket y sesión vigente. Sin destinatarios válidos se descarta el evento. Reautenticación limpia la identidad y salas anteriores. |
| SEC-02 | El puente escucha en todas las interfaces, sin autenticar WS ni el upstream y retransmite a todos sus clientes. | Token independiente de 32 caracteres como mínimo, comparación con `timingSafeEqual`, HTTP 401 en handshake, upstream autenticado, enlace solo a loopback, HTTPS obligatorio para upstream remoto y filtro adicional de destinatario. |
| DATA-01 | Un fallo al leer JSON devuelve una base vacía en memoria, susceptible de sobrescribir el archivo original. | Error `DB_READ_FAILED`, sin contenido sensible, bloqueo de escrituras posterior al error, comprobación de formas de colecciones y fallo antes de aceptar tráfico. Un archivo inexistente sigue inicializando una base nueva. |

Se exporta `readDb`, ya utilizado por el servidor pero ausente de sus exports, y se importa explícitamente `crypto` para generar nombres de archivo sin depender de un global de Node. `DATA_DIR` y `UPLOADS_DIR` permiten utilizar un volumen exclusivo de staging. `PORT` respeta el valor del proveedor, incluido 8080; TLS local puede desactivarse detrás del proxy de Render.
La ruta del widget usa `sendFile` con `root` explícito, evitando el 404 que provocaban directorios ancestros ocultos del worktree y de los temporales. No se permite servir archivos ocultos.

### Regresión de interfaz encontrada

La base y RC1 contienen `public/index.html` con el literal `FULL_CONTENT_FROM_FILE` (22 bytes), en lugar de la aplicación.
Se recupera el archivo del commit `32f4806`, última versión funcional del historial del archivo antes del reemplazo en #53. La recuperación se limita a esta rama; no toma cambios sin commit del checkout original.
La suite del navegador comprueba la interfaz recuperada. No se declara validación nativa de Android/iOS ni aceptación visual de todos los diseños.

## Comparación con ZIP RC1

Artefacto local: `SYNC_ENGINE_2_0_STAGING_RC1.zip`.
SHA-256: `f4d2494712c709ff5cc0296613597fb2011b36949803c84808588a6e960fed4d`.

RC1 identifica los mismos tres hallazgos y aporta filtros explícitos, autenticación del puente y error de lectura. Se evalúa como candidato; no se importa en bloque.
Comparación binaria contra la base: 234 archivos en RC1; 223 idénticos, 4 modificados (`db.js`, `package.json`, `server.js`, `ws-bridge.js`) y 7 añadidos. No falta ningún archivo versionado de la base.

| Tema | RC1 | Candidato de esta rama |
| --- | --- | --- |
| Audiencia Pub/Sub | Usa `onlineUsers`; puede retener una identidad anterior al reautenticar. Cuenta destinatarios aunque estén offline. | Usa identidad actual y vuelve a validar la sesión. Cuenta sockets realmente destinatarios. |
| Puente | Token y autenticación upstream; host configurable y validación de destinatario delegada al servidor. | Además, solo loopback, upstream remoto HTTPS y comprobación local del destinatario. Un proceso representa una sola identidad. |
| Persistencia | Rechaza lectura fallida. | Además, impide escrituras tras el fallo, valida colecciones y bloquea el arranque sobre JSON corrupto. |
| Pruebas nuevas | Dobles de `io` y clientes, más comprobaciones de texto del código. | Pruebas unitarias y procesos reales con HTTP, Socket.IO websocket/polling, WS puro, disco y reinicio. |
| Render | Sin rama explícita, disco ni desactivación de autodeploy. | Rama fija, autodeploy desactivado, una instancia y volumen independiente para DB/archivos. |
| Dependencias del puente | `ws` no declarada directamente; `socket.io-client` solo en desarrollo. | Ambas declaradas para ejecución con lockfile actualizado. |
| Interfaz | Placeholder de 22 bytes. | Archivo funcional recuperado del historial. |

## Render: preparación sin despliegue

Workspace confirmado por Jose: `My Workspace` (`tea-darusfjbc2fs738l4ea0`).
La inspección de solo lectura identificó producción como `sync-engine-server`, rama `main`, autodeploy activo. No se modificó ese servicio ni se leyeron sus variables secretas.

`render-staging.yaml` describe **un servicio nuevo** `sync-engine-2-staging`:

- Repositorio autorizado y rama `staging-sync-engine-2`; `autoDeployTrigger: off`.
- Runtime Node 24, región Ohio, una instancia. El plan y el disco son de pago: aprobar el coste antes de crear.
- Volumen nuevo `/var/data/sync-engine-2-staging`: DB en `db/` y archivos en `uploads/`. Nunca montar datos de producción.
- Sin grupos de entorno, dominios, sesiones, archivos ni credenciales de producción. La base nueva emite sus propias sesiones al registrar usuarios desechables.
- Pub/Sub desactivado inicialmente, sin Firebase/VAPID. Para probarlos se necesitan claves y proyecto/topic/subscription exclusivos de staging. El código rechaza los nombres de Pub/Sub de producción cuando `APP_ENV=staging`.
- El puente WS no forma parte de `npm start` ni se expone por Render. Su token y sesión upstream deben ser exclusivos de una identidad de prueba; el navegador no puede establecer libremente el header Authorization del handshake WS.

**No aplicar todavía el Blueprint.** Desactivar autodeploy controla futuros commits; no permite asumir que la creación omite el primer despliegue. La herramienta conectada tampoco permite configurar el disco del Blueprint. Crear o desplegar requiere autorización de Jose y aplicar la configuración completa, sin crear antes un servicio con almacenamiento efímero.

Fuentes oficiales consultadas: [Blueprint](https://render.com/docs/blueprint-spec), [discos persistentes](https://render.com/docs/disks), [despliegues](https://render.com/docs/deploys), [creación de servicios](https://api-docs.render.com/reference/create-service).

## Validación reproducible

Comandos del candidato:

```sh
npm ci
npm run lint
npm run test:staging
npm test
npm run build
git diff --check
```

`test:staging` usa usuarios y sesiones desechables, carpetas temporales, puertos aleatorios y procesos con un entorno limitado. No carga `.env` del checkout original, no usa su DB y no contacta GCP.
La integración utiliza el servidor y DB reales; se inyecta exclusivamente la llegada de Pub/Sub por IPC privado en el proceso de pruebas. Es evidencia de transporte y aislamiento desde el callback, **no** de IAM, entrega ni reconexión de Google Cloud.
Los fixtures heredados traducen sus etiquetas legibles a tokens SHA-256 de prueba para respetar el formato actual del validador de sesiones, sin relajar el servidor.
Los orígenes de los puertos efímeros se añaden únicamente a la whitelist de los fixtures. El helper de Chromium termina su propio árbol de procesos en Windows para no dejar procesos ni perfiles bloqueados.

Resultados finales y limitaciones de ejecución: ver `docs/sync-engine-2-validation.md`.

## Riesgos y requisitos pendientes

- `npm audit --omit=dev` informa 9 paquetes afectados de severidad moderada, 0 altas y 0 críticas, por la cadena de `uuid` ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). Afecta SDKs Google/Firebase; el arreglo propuesto por npm incluye saltos mayores de Pub/Sub y Firebase Admin. No se aplica `npm audit fix --force`; requiere una actualización de SDKs y validación aparte.
- Validar en GCP staging el contrato de los productores: ahora deben incluir destinatarios explícitos. Un evento con solo `fromSyncId` o `channelId` se descarta deliberadamente.
- JSON sigue siendo una DB en memoria y de un único proceso, con escrituras asíncronas que algunas rutas no esperan. No se garantiza durabilidad frente a caída brusca antes de completar la cola ni transacciones entre procesos. No escalar a varias instancias.
- Se conservan los límites históricos existentes (5000 mensajes privados y 1500 de canal); la recuperación de datos ya truncados queda fuera del alcance.
- La creación automática de DB al faltar el archivo no distingue un servicio nuevo de un archivo eliminado. Tras corrupción se requiere recuperar manualmente un backup verificado y reiniciar; no hay restauración automática.
- La comprobación de sesión vigente añadida aquí cubre Pub/Sub. La revocación en todos los demás eventos de sockets ya conectados requiere una revisión adicional.
- No se ha desplegado en Render ni validado persistencia frente a un redeploy real, TLS del proveedor, push, credenciales/IAM o clientes móviles nativos.
- El frontend servido por Render usa su propio origen. `vercel.json` conserva rewrites heredados hacia producción; los despliegues de esta rama están desactivados y no se debe publicar un frontend staging en Vercel con esos rewrites.

## Siguiente paso, tras aprobación

1. Aprobar creación/coste y primer despliegue **solo** de `sync-engine-2-staging` con el Blueprint completo.
2. Crear disco nuevo y credenciales exclusivas si se habilitan integraciones; mantener autodeploy desactivado.
3. Crear usuarios desechables, comprobar aislamiento y reiniciar o redesplegar únicamente staging para verificar que DB y archivos sobreviven.
4. Adjuntar evidencia al PR. Producción y cualquier merge requieren autorización separada.
