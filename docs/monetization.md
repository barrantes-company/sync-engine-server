# Monetización: estado actual

## Límites de planes

Los límites se comprueban en el servidor; la interfaz solo los muestra.

| Plan | Tamaño máximo por archivo | Bóveda cifrada | Canales privados |
| --- | ---: | ---: | ---: |
| Free | 50 MiB | Sin nuevas escrituras | Sin creación |
| Pro | 2 GiB | Hasta 100 elementos | Hasta 5 |
| Enterprise | 2 GiB | Hasta 1.000 elementos | Hasta 100 |

La bóveda cifra el contenido en el dispositivo. Los usuarios Free conservan la
lectura y el borrado de elementos guardados, pero no pueden crear ni editar
elementos sin un plan activo. Las suscripciones caducadas se tratan como Free;
los canales no predeterminados requieren un plan activo.

## Pagos

No hay proveedor de pagos conectado. El endpoint de actualización no concede
planes, los cupones están desactivados y el checkout no solicita datos de pago.
Las facturas sin identificador de factura de un proveedor no se presentan como
pagos reales. Los precios de la interfaz son referencias no validadas.

Antes de habilitar pagos se debe elegir proveedor y países de venta, configurar
precios/catálogo y URLs públicas de la aplicación, verificar eventos de pago en
el servidor y definir cómo se gestionan renovaciones, reembolsos, impagos,
cancelaciones e impuestos. Ningún campo enviado por el navegador acredita un
cobro.

## Pendiente de validar antes de vender

- Entrevistar a equipos pequeños y otros clientes potenciales para confirmar
  quién compra, qué problema urgente resuelve el producto y qué precio acepta.
- Verificar que las funciones anunciadas existan y estén aplicadas en servidor;
  los límites anteriores son los únicos diferenciales de plan actualmente
  implementados.
- Definir entidad vendedora, correo de soporte, jurisdicción, retención de datos,
  términos, política de privacidad y cancelaciones con asesoría apropiada para
  los mercados elegidos. Este repositorio no inventa datos legales o de contacto.
- Elegir analítica y su política de consentimiento/retención antes de asociar
  eventos de uso a cuentas. No se envía telemetría a terceros.
