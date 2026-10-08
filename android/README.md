# Widget Android nativo de SYNC ENGINE

Esta app instala un widget real de pantalla de inicio. Muestra la hora y fecha locales, que Android actualiza automáticamente, y abre la página web configurada al tocarlo.

## Instalar y activar

1. Abre el proyecto `android` en Android Studio y ejecuta la configuración Gradle de `:app` para instalar la app en un dispositivo Android (API 23 o superior).
2. Abre **SYNC ENGINE** desde el launcher, escribe la URL completa de tu instalación, por ejemplo `https://tu-dominio.example/widget.html`, y pulsa **Guardar URL predeterminada**. No se presupone ningún dominio de producción.
3. Mantén pulsada un área vacía de la pantalla de inicio, elige **Widgets**, busca **SYNC ENGINE** y arrastra el widget a la pantalla.
4. En la pantalla de configuración del widget, revisa o introduce la URL de `/widget.html` y pulsa **Guardar y añadir widget**. Cada instancia puede tener su propia URL.
5. Toca el widget para abrir el panel en el navegador e inicia sesión allí. La sesión/autenticación pertenece al sitio web en el navegador; esta app no lee ni guarda tokens.

El widget nativo no ofrece unread counts, captura de imágenes ni otras acciones web. Esas funciones, cuando estén disponibles en el panel, requieren iniciar sesión en el panel web abierto. Configura únicamente una URL HTTP(S) de confianza que termine en `/widget.html`.

## Compilar desde la línea de comandos

Desde este directorio, ejecuta `gradle :app:assembleDebug` (o la tarea `:app:compileDebugJavaWithJavac` para compilar el código Java). Android Studio puede descargar los componentes Gradle/Android que falten.

## URL de fábrica

Para no escribir la URL en cada instalación, defínela al compilar: `$env:SYNC_DEFAULT_URL="https://tu-dominio.example/widget.html"`. Se usa como URL predeterminada y, si es válida, el widget se añade sin pedir configuración. Sigue siendo editable en la app. Para firmar en release, define también `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD`.
