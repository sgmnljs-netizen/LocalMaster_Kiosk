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

# 3. Restart GolfOS Unified Hardware/VCAT Bridge (vcat_bridge.py on :8090 / :18080)
$bridgeScript = "C:\GolfOS\bin\vcat_bridge.py"
$bridgeOnline = $false
if (Test-Path $bridgeScript) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'vcat_bridge\.py' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 400

    $bridgeTask = Get-ScheduledTask -TaskName "GolfOS_VCAT_Bridge" -ErrorAction SilentlyContinue
    if ($bridgeTask) {
        Start-ScheduledTask -TaskName "GolfOS_VCAT_Bridge" -ErrorAction SilentlyContinue
    } else {
        schtasks /run /tn "GolfOS_VCAT_Bridge" 2>$null | Out-Null
    }

    for ($b = 0; $b -lt 3; $b++) {
        Start-Sleep -Milliseconds 500
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:18080/health" -TimeoutSec 1 -ErrorAction Stop
            if ($resp.status -eq "ONLINE") { $bridgeOnline = $true; break }
        } catch {}
    }

    if (-not $bridgeOnline) {
        $pyCandidates = @(
            "C:\GolfOS\runtime\python\pythonw.exe",
            "C:\GolfOS\venv\Scripts\pythonw.exe",
            "C:\Python312\pythonw.exe",
            "C:\Python311\pythonw.exe",
            "C:\Python310\pythonw.exe",
            "C:\Program Files\Python312\pythonw.exe",
            "C:\Program Files\Python311\pythonw.exe",
            "C:\Program Files\Python310\pythonw.exe",
            "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python312\pythonw.exe",
            "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\pythonw.exe",
            "pythonw.exe",
            "python.exe"
        )
        foreach ($pyCandidate in $pyCandidates) {
            $cmdInfo = Get-Command $pyCandidate -ErrorAction SilentlyContinue
            if ($cmdInfo -and ($cmdInfo.Source -notmatch 'WindowsApps')) {
                Start-Process -FilePath $cmdInfo.Source -ArgumentList "`"$bridgeScript`"" -WorkingDirectory "C:\GolfOS\bin" -WindowStyle Hidden -ErrorAction SilentlyContinue
                break
            }
        }
        for ($b = 0; $b -lt 6; $b++) {
            Start-Sleep -Milliseconds 500
            try {
                $resp = Invoke-RestMethod -Uri "http://127.0.0.1:18080/health" -TimeoutSec 1 -ErrorAction Stop
                if ($resp.status -eq "ONLINE") { $bridgeOnline = $true; break }
            } catch {}
        }
    }
}

# 4. Relaunch Kiosk in interactive desktop session via Scheduled Task
$taskObj = Get-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
if ($taskObj) {
    Start-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
} else {
    schtasks /run /tn "LaunchGolfosKiosk" 2>$null | Out-Null
}

# 5. Poll up to 8 seconds strictly for electron or msedge (exclude msedgewebview2)
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
        bridge_online = $bridgeOnline
        server_ip = $ServerIp
    } | ConvertTo-Json -Compress
    Write-Output $json
} else {
    $json = [PSCustomObject]@{
        status = "FAIL"
        elapsed_sec = $elapsed
        device_type = "KIOSK"
        bridge_online = $bridgeOnline
        message = "Kiosk process (electron/msedge) did not start within 8s."
        server_ip = $ServerIp
    } | ConvertTo-Json -Compress
    Write-Output $json
    exit 1
}
