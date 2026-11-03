# Instrucciones de trabajo para Sync Engine

## Validacion local

- Ejecuta los scripts de Node con `npm.cmd` en PowerShell para evitar el bloqueo de `npm.ps1`.
- Comprobaciones rapidas:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `npm.cmd run test:license`
- La suite `npm.cmd test` contiene pruebas de navegador y red. Ejecutala por grupos y con un limite de tiempo cuando el entorno no tenga Chromium o permita abrir sockets locales.
- `npm.cmd run test:staging` requiere procesos hijos, HTTP local y WebSocket. Un error `EACCES` al abrir `127.0.0.1` indica una restriccion del entorno, no una correccion valida del codigo.

## Android

- Usa `android\gradlew.bat` en Windows y `android/gradlew` en CI Linux.
- El wrapper versionado es la fuente de verdad para Gradle; no sustituyas su version por una instalacion global.
- La compilacion de debug no autoriza publicar ni reemplazar artefactos de release.

## Seguridad y secretos

- No leas, imprimas ni confirmes valores de `.env`, claves privadas, keystores, tokens o credenciales.
- Usa variables de entorno locales para secretos y reporta solo si estan configuradas o ausentes.
- No ejecutes `npm audit fix` automaticamente: primero identifica el paquete y el impacto.

## Alcance

- Antes de editar, comprueba `git status` y conserva cambios locales ajenos.
- No hagas commit, push, deploy, migraciones ni cambios de produccion sin autorizacion explicita.
- Reporta separadamente validaciones PASS, FAIL, BLOCKED y NOT RUN.
