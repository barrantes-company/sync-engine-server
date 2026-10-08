# Alcance MVP: sincronización, notificaciones y clientes

## Comportamiento implementado

- El cliente web recupera el historial privado del servidor al seleccionar una conversación y vuelve a cargar la conversación activa después de autenticar el socket tras una reconexión.
- Los mensajes privados de texto enviados sin conexión se guardan en IndexedDB del navegador y se reintentan al volver a autenticar. La interfaz distingue mensajes pendientes y fallidos. El servidor usa el ID de cliente para impedir duplicados cuando un reintento ya se había guardado.
- La cola offline no incluye mensajes de canal, archivos ni audio. El texto pendiente se conserva localmente sin cifrado; se elimina del outbox cuando el servidor confirma el envío.
- Las notificaciones Web Push requieren que cada usuario las active desde **Configuración de perfil**. El permiso del navegador, la suscripción del service worker y las claves VAPID del servidor son requisitos independientes.
- El widget Android es un acceso nativo con reloj y fecha que abre `/widget.html` en el navegador. Mensajes, sesión y acciones interactivas siguen perteneciendo al panel web; no es un cliente Android nativo.

## Configuración de Web Push

Genera un par de claves VAPID para el despliegue y define `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_EMAIL` en el entorno del servidor. `VAPID_PRIVATE_KEY` es un secreto y no debe publicarse ni incluirse en el cliente. Si falta una clave o no es válida, el endpoint de configuración indica que Push no está disponible y el servidor continúa funcionando sin ese servicio.

## Decisiones de producto aún por confirmar

- Si el requisito de “sincronización local” abarca también la consulta offline del historial, la cola de canales, archivos/audio o sincronización entre dispositivos; la implementación actual solo retiene texto privado saliente en el dispositivo.
- Si Android/desktop deben ser clientes con mensajería propia o si bastan los accesos web actuales.
- Si los temas visuales configurables son parte del MVP. Hoy hay identidad visual fija y edición de nombre/avatar, no selector de temas.

La migración de almacenamiento, la paginación/búsqueda offline, webhooks e IA quedan fuera de esta entrega; deben priorizarse solo si se confirman como requisitos del producto.
