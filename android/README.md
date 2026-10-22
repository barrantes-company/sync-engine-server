# Widget Android nativo de SYNC ENGINE

Esta app instala el widget de SYNC ENGINE y muestra su interfaz principal dentro de la APK. El widget presenta la hora y fecha locales, contadores, animaciones y accesos directos.

## Instalar y activar

1. Abre el proyecto `android` en Android Studio y ejecuta la configuración Gradle de `:app` para instalar la app en un dispositivo Android (API 23 o superior).
2. Abre **SYNC ENGINE** desde el launcher para mostrar la interfaz principal dentro de la APK. No es necesario escribir una URL.
3. Mantén pulsada un área vacía de la pantalla de inicio, elige **Widgets**, busca **SYNC ENGINE** y arrastra el widget; se añade sin solicitar configuración.
4. Inicia sesión en Ajustes para activar los contadores/notificaciones nativos y permite las notificaciones en Android 13 o superior.

El widget y la interfaz de la APK se conectan con `https://sync-engine-server.onrender.com`. Al pulsar el widget o una notificación, la app abre su interfaz principal integrada; las llamadas requieren que la interfaz esté abierta para establecer WebRTC.

## Compilar desde la línea de comandos

Desde este directorio, ejecuta `gradle :app:assembleDebug` (o la tarea `:app:compileDebugJavaWithJavac` para compilar el código Java). Android Studio puede descargar los componentes Gradle/Android que falten.

## URL de fábrica

La URL de producción está definida como predeterminada. Si se compila para otro servidor, puede sustituirse con la variable de entorno `SYNC_DEFAULT_URL` (origen HTTP(S), sin `/widget.html`). La app no solicita ni permite editar la URL desde el teléfono. Para firmar en release, define también `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD`.

Para compilar con Firebase Android, registra una app Android con el ID `com.barrantesco.syncengine` en Firebase y configura estas variables de entorno locales con los valores de **Project settings → Your apps**:

- `FIREBASE_ANDROID_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_ANDROID_APP_ID`
- `FIREBASE_SENDER_ID` (Project number)

Son identificadores de cliente, no claves privadas. El servidor requiere además la cuenta de servicio JSON de Firebase Admin guardada como secreto `FIREBASE_SERVICE_ACCOUNT` en el entorno de Render. No guardes ese JSON en el repositorio ni lo envíes por chat.

## Contadores, avisos y ajustes

- Abre la app o el engranaje del widget e **inicia sesión**. Solo se guarda el token en el almacenamiento privado del teléfono, nunca la contraseña.
- El widget muestra mensajes sin leer y llamadas perdidas (`GET /api/widget/summary`). Se actualizan cada ~15 min (mínimo de Android) y al añadir el widget.
- FCM avisa en tiempo real de mensajes y llamadas entrantes cuando la app web del destinatario está desconectada. Requiere el permiso de notificaciones (Android 13+).
- Tocar el widget abre la interfaz integrada y pone a cero las llamadas perdidas.
- Ajustes: formato 24 h, zona horaria, contadores, animación de estelas y notificaciones.
- Las llamadas WebRTC no pueden conectarse sin que la interfaz del destinatario se abra y acepte la llamada; FCM solo muestra el aviso entrante.
- El trabajo periódico de respaldo refresca los contadores aproximadamente cada 15 minutos.
