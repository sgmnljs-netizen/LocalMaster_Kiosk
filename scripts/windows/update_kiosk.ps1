# ==============================================================================
# [GOLFOS KIOSK] Windows Unmanned Kiosk One-Click Cache Clear & Restart (update_kiosk.ps1 v2.0)
# - Pure ASCII comments to prevent Windows PowerShell 5.1 CP949 parser corruption
# - Target: C:\GolfOS\bin\update_kiosk.ps1
# ==============================================================================

param(
    [string]$ServerIp = "192.168.45.154"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$startTime = Get-Date

# 1. Terminate existing Kiosk Electron and Edge processes
Stop-Process -Name electron, msedge -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Clear Chromium / Electron caches (both Electron root profile & Edge Default profile)
$electronProfile = "C:\GolfOS\kiosk_electron_profile"
$edgeKioskProfile = "C:\GolfOS\kiosk_profile"

$cacheSubDirs = @(
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "Default\Cache",
    "Default\Code Cache",
    "Default\GPUCache"
)

foreach ($baseDir in @($electronProfile, $edgeKioskProfile)) {
    if (Test-Path $baseDir) {
        foreach ($sub in $cacheSubDirs) {
            $target = Join-Path $baseDir $sub
            if (Test-Path $target) {
                Remove-Item -Path $target -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 3. Relaunch Kiosk in interactive desktop session via Scheduled Task
$taskObj = Get-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
if ($taskObj) {
    Start-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
} else {
    schtasks /run /tn "LaunchGolfosKiosk" 2>$null | Out-Null
}

# 4. Poll up to 8 seconds strictly for electron or msedge (exclude msedgewebview2)
$kioskProc = $null
for ($i = 0; $i -lt 8; $i++) {
    Start-Sleep -Seconds 1
    $kioskProc = Get-Process -Name electron, msedge -ErrorAction SilentlyContinue | Where-Object { $_.Responding }
    if ($kioskProc) {
        break
    }
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

if ($kioskProc) {
    $first = @($kioskProc)[0]
    $json = [PSCustomObject]@{
        status = "SUCCESS"
        elapsed_sec = $elapsed
        device_type = "KIOSK"
        process_name = $first.ProcessName
        pid = $first.Id
        responding = $first.Responding
        server_ip = $ServerIp
    } | ConvertTo-Json -Compress
    Write-Output $json
} else {
    $json = [PSCustomObject]@{
        status = "FAIL"
        elapsed_sec = $elapsed
        device_type = "KIOSK"
        message = "Kiosk process (electron/msedge) did not start within 8s."
        server_ip = $ServerIp
    } | ConvertTo-Json -Compress
    Write-Output $json
    exit 1
}
