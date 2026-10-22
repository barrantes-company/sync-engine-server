# Widget Android nativo de SYNC ENGINE

Esta app instala un widget real de pantalla de inicio. Muestra la hora y fecha locales, que Android actualiza automáticamente, y abre la página web configurada al tocarlo.

## Instalar y activar

1. Abre el proyecto `android` en Android Studio y ejecuta la configuración Gradle de `:app` para instalar la app en un dispositivo Android (API 23 o superior).
2. Abre **SYNC ENGINE** desde el launcher, escribe la URL completa de tu instalación, por ejemplo `https://tu-dominio.example`, y pulsa **Guardar URL predeterminada**. No se presupone ningún dominio de producción.
3. Mantén pulsada un área vacía de la pantalla de inicio, elige **Widgets**, busca **SYNC ENGINE** y arrastra el widget a la pantalla.
4. En la pantalla de configuración del widget, revisa o introduce la dirección de tu servidor y pulsa **Guardar y añadir widget**. Cada instancia puede tener su propia URL.
5. Abre SYNC ENGINE, inicia sesión en los ajustes y permite notificaciones en Android 13 o superior.

El widget nativo muestra contadores y recibe avisos Android mediante FCM. Al pulsar una notificación, abre el panel del servidor en el navegador; las llamadas requieren que la interfaz web esté abierta para establecer WebRTC.

## Compilar desde la línea de comandos

Desde este directorio, ejecuta `gradle :app:assembleDebug` (o la tarea `:app:compileDebugJavaWithJavac` para compilar el código Java). Android Studio puede descargar los componentes Gradle/Android que falten.

## URL de fábrica

Para no escribir la URL en cada instalación, defínela al compilar: `$env:SYNC_DEFAULT_URL="https://tu-dominio.example"`. Se usa como URL predeterminada y, si es válida, el widget se añade sin pedir configuración. Sigue siendo editable en la app. Para firmar en release, define también `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD`.

Para compilar con Firebase Android, registra una app Android con el ID `com.barrantesco.syncengine` en Firebase y configura estas variables de entorno locales con los valores de **Project settings → Your apps**:

- `FIREBASE_ANDROID_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_ANDROID_APP_ID`
- `FIREBASE_SENDER_ID` (Project number)

Son identificadores de cliente, no claves privadas. El servidor requiere además la cuenta de servicio JSON de Firebase Admin guardada como secreto `FIREBASE_SERVICE_ACCOUNT` en el entorno de Render. No guardes ese JSON en el repositorio ni lo envíes por chat.

## Contadores, avisos y ajustes

- Abre la app (o el engranaje del widget), escribe la dirección del servidor e **inicia sesión**. Solo se guarda el token en el almacenamiento privado del teléfono, nunca la contraseña.
- El widget muestra mensajes sin leer y llamadas perdidas (`GET /api/widget/summary`). Se actualizan cada ~15 min (mínimo de Android) y al añadir el widget.
- FCM avisa en tiempo real de mensajes y llamadas entrantes cuando la app web del destinatario está desconectada. Requiere el permiso de notificaciones (Android 13+).
- Tocar el widget abre la app y pone a cero las llamadas perdidas.
- Ajustes: formato 24 h, zona horaria, contadores y notificaciones.
- Las llamadas WebRTC no pueden conectarse sin que la interfaz del destinatario se abra y acepte la llamada; FCM solo muestra el aviso entrante.
- El trabajo periódico de respaldo refresca los contadores aproximadamente cada 15 minutos.
