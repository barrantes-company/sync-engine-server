Write-Host "--- PRUEBA 1: Healthcheck ---" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get | ConvertTo-Json

Write-Host "`n--- PRUEBA 2: Autenticación (Identity Service) ---" -ForegroundColor Cyan
$authBody = @{
    username = "operador_test"
    password = "secret_password"
    device_info = @{ version = "20261103"; client_type = "apk_android" }
} | ConvertTo-Json

$authRes = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" -Method Post -Body $authBody -ContentType "application/json"
$authRes | ConvertTo-Json

Write-Host "`n--- PRUEBA 3: Sincronización y Webhook SSOT (Relay Service) ---" -ForegroundColor Cyan
$relayBody = @{
    event_id = "EVT-TEST-POWERSHELL-01"
    channel_id = "workspace_auditoria"
    sender_id = $authRes.data.user_id
    event_type = "SYNC_LOG"
    payload = @{ message = "Prueba de transmisión local a Webhook Apps Script"; status = "OK" }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/relay/event" -Method Post -Body $relayBody -ContentType "application/json" | ConvertTo-Json
