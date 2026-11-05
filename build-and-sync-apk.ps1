$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$gradle = Join-Path $root 'android\gradlew.bat'
$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
$destination = Join-Path $root 'public\sync-engine-debug.apk'

Push-Location (Join-Path $root 'android')
try {
    & $gradle assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "assembleDebug terminó con código $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) {
    throw "No se encontró el APK esperado: $apk"
}

Copy-Item -LiteralPath $apk -Destination $destination -Force
Write-Host "APK sincronizado: $destination"
