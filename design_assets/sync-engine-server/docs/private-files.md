# P0-02: archivos privados

## Política y modelo

- `files` en `data/sync_db.json` registra el ID de recurso, propietario autenticado,
  nombre físico, nombre original, tamaño, MIME declarado y fecha de subida.
- El ID identifica el recurso; no es un secreto ni concede acceso.
- Los mensajes nuevos guardan `fileIds` calculados por el servidor. El emisor solo
  puede asociar un archivo que él subió. Proporcionar una URL o un `fileIds` en el
  payload del cliente no permite fabricar una asociación.
- Una lectura exige identidad válida, metadata registrada, archivo físico y al
  menos un mensaje vigente que asocie el recurso. El lector debe ser `fromId` o
  `toId` de ese mensaje y su autor debe coincidir con el propietario registrado.
- Una subida sin mensaje asociado no concede lectura, ni siquiera al propietario.
- Si el propietario lo comparte en varios mensajes, cada asociación vigente
  concede acceso exclusivamente a sus respectivos participantes.
- La lista de contactos y los mensajes fijados no son fuentes de autorización.

## HTTP y consumidores

`GET /api/files/:fileId` (también HEAD) y el alias `/uploads/:filename` comparten la
misma comprobación. El directorio continúa en disco; el middleware intercepta sus
rutas normalizadas antes de `express.static`. No existe un alias público.

La API devuelve 401 sin identidad válida, 404 sin metadata/recurso y 403 sin una
asociación autorizada. Se usa `sendFile` para streaming y Range, sin cargar el
archivo completo en RAM. Se conservan sandbox CSP y nosniff de P0-01.

El cliente principal y el widget llaman a `POST /api/files/access` con el Bearer
existente antes de preparar medios. El servidor lo transporta en cookies HttpOnly
SameSite=Strict con alcance `/api/files` y `/uploads`; no crea sesiones nuevas ni
cambia su expiración. Cada lectura vuelve a validar el token con el mecanismo
existente y después autoriza el recurso. Las demás APIs siguen aceptando solo su
autenticación anterior. HTTPS directo o indicado por el proxy usa cookies Secure.
El despliegue debe conservar correctamente ese esquema y los headers.

El transporte permite imágenes, audio, video y descargas nativas sin secretos en
las URLs ni descargar medios completos como blobs en JavaScript. El cierre local
limpia esas cookies; no revoca la sesión existente. Un Bearer explícito tiene
precedencia sobre la cookie, incluso si es inválido.

Las respuestas privadas incluyen `Cache-Control: private, no-store`. El service
worker excluye estas rutas y elimina sus cachés de versiones anteriores al activar
v4. Los archivos previamente descargados por un usuario no pueden recuperarse o
revocarse retroactivamente en su dispositivo.

## Borrado y retención

Eliminar para todos, vaciar el historial o retirar un mensaje por la retención
existente elimina su autorización de lectura. Si no queda otra asociación válida,
los participantes reciben rechazo. Los bytes y la metadata permanecen en disco,
sin acceso: esta tarea no introduce borrado físico ni recolección automática.

Una transferencia ya autorizada/en curso o una copia ya descargada no se revoca
retroactivamente. Nuevas solicitudes, incluidos nuevos rangos, se autorizan de nuevo.

## Archivos anteriores

Los archivos sin registro de subida confiable y mensajes sin `fileIds` quedan
bloqueados. Los campos históricos `fileData.url/data` y `audioData` muestran una
referencia, pero anteriormente podían ser enviados libremente: no prueban quién
subió los bytes. No hay migración automática ni acceso temporal por propietario
supuesto. También se bloquean avatares antiguos basados en esas URLs sin vínculo;
los avatares JPEG de Canvas y recursos públicos propios siguen funcionando.

Una migración separada debe inventariar archivos/mensajes, obtener evidencia
confiable de la subida (logs, backups u otro registro verificable), validar usuario
y asociaciones reales, y generar metadata/fileIds solo para relaciones demostradas.
Las relaciones ambiguas quedan bloqueadas; si no existe evidencia, el propietario
debe volver a subir y compartir el recurso. No basta con tenerlo fijado o conocer
su nombre. Este proceso requiere revisión de datos reales, no se ejecutó aquí.

Los recursos HTTP externos y datos raster/audio inline permitidos por P0-01 no son
archivos locales servidos por estas rutas. Su presencia en un mensaje no concede
permisos sobre ningún archivo local. P0-03 y P0-04 requieren tareas independientes.
