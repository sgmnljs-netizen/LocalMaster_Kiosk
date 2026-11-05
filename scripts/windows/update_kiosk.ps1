# ==============================================================================
# [GOLFOS KIOSK] Windows Unmanned Kiosk One-Click Cache Clear & Restart (update_kiosk.ps1 v2.1)
# - Pure ASCII comments to prevent Windows PowerShell 5.1 CP949 parser corruption
# - Target: C:\GolfOS\bin\update_kiosk.ps1
# ==============================================================================

param(
    [string]$ServerIp = "192.168.45.154"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$startTime = Get-Date
$kioskUrl = "http://${ServerIp}:8000/kiosk"

# 0. Persist target ServerIp URL for run_kiosk_app.bat & boot recovery
$binDir = "C:\GolfOS\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-Content -Path (Join-Path $binDir "kiosk_server_url.txt") -Value $kioskUrl -Encoding ASCII -NoNewline -ErrorAction SilentlyContinue

# 1. Terminate existing Kiosk Electron and Edge processes
Stop-Process -Name electron, msedge -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 2. Clear Chromium / Electron caches (Electron root profile, Edge canonical profile, and legacy kiosk_edge_profile)
$electronProfile = "C:\GolfOS\kiosk_electron_profile"
$edgeKioskProfile = "C:\GolfOS\kiosk_profile"
$legacyEdgeProfile = "C:\GolfOS\kiosk_edge_profile"

$cacheSubDirs = @(
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "Default\Cache",
    "Default\Code Cache",
    "Default\GPUCache",
    "Default\Service Worker\CacheStorage",
    "Default\Service Worker\ScriptCache"
)

foreach ($baseDir in @($electronProfile, $edgeKioskProfile, $legacyEdgeProfile)) {
    if (Test-Path $baseDir) {
        foreach ($sub in $cacheSubDirs) {
            $target = Join-Path $baseDir $sub
            if (Test-Path $target) {
                Remove-Item -Path $target -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 3. Refresh Desktop & Startup Shortcuts (Electron Native Shell first, Batch Launcher fallback)
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$electronExe = "C:\GolfOS\runtime\electron\electron.exe"
$mainCjs = "C:\GolfOS\electron\main.cjs"
$runnerBat = "C:\GolfOS\bin\run_kiosk_app.bat"
$kioskIco = "C:\GolfOS\bin\golfos-kiosk-icon.ico"
$binIco = "C:\GolfOS\bin\golfos-icon.ico"
$iconToUse = if (Test-Path $kioskIco) { "$kioskIco,0" } elseif (Test-Path $binIco) { "$binIco,0" } else { "" }

try {
    $wsh = New-Object -ComObject WScript.Shell
    foreach ($folder in @($desktop, $startup)) {
        if ($folder -and (Test-Path $folder)) {
            # Remove legacy underscore shortcut to prevent duplicate boot windows
            $legacyLnk = Join-Path $folder "GOLFOS_Kiosk.lnk"
            if (Test-Path $legacyLnk) {
                Remove-Item -Path $legacyLnk -Force -ErrorAction SilentlyContinue
            }

            $kioskLnk = $wsh.CreateShortcut((Join-Path $folder "GOLFOS KIOSK.lnk"))
            if ((Test-Path $electronExe) -and (Test-Path $mainCjs)) {
                $kioskLnk.TargetPath = $electronExe
                $kioskLnk.Arguments = "`"$mainCjs`" $kioskUrl --kiosk"
                $kioskLnk.WorkingDirectory = "C:\GolfOS"
            } elseif (Test-Path $runnerBat) {
                $kioskLnk.TargetPath = "cmd.exe"
                $kioskLnk.Arguments = "/c `"`"$runnerBat`" $kioskUrl`""
                $kioskLnk.WorkingDirectory = "C:\GolfOS\bin"
                $kioskLnk.WindowStyle = 7
            }
            if ($iconToUse) { $kioskLnk.IconLocation = $iconToUse }
            $kioskLnk.Description = "GOLFOS Unmanned Kiosk"
            $kioskLnk.Save()
        }
    }
} catch {}

# 3a. Unify legacy run_kiosk.bat and Scheduled Tasks (GolfOS_Kiosk_UI / RunKioskNow) to canonical run_kiosk_app.bat
$legacyRunnerBat = "C:\GolfOS\bin\run_kiosk.bat"
if (Test-Path $runnerBat) {
    $shimContent = "@echo off`r`ncall `"$runnerBat`" $kioskUrl`r`n"
    Set-Content -Path $legacyRunnerBat -Value $shimContent -Encoding ASCII -Force -ErrorAction SilentlyContinue
}
foreach ($legacyTask in @("GolfOS_Kiosk_UI", "RunKioskNow", "LaunchKioskNow")) {
    Unregister-ScheduledTask -TaskName $legacyTask -Confirm:$false -ErrorAction SilentlyContinue
}

# 3b. Enforce NHN KCP SecureVCAT silent tray mode (POS_SelfYN=N) so standalone payment window never covers Kiosk
$kcpIniPath = "C:\NHNKCPSecureVCAT\Config\NHNKCPSecureVCAT.ini"
$kcpExePath = "C:\NHNKCPSecureVCAT\NHNKCPSecureVCAT.exe"
$legacyCfgPy = "C:\GolfOS\bin\configure_kiosk_vcat.py"
try {
    if (Test-Path $legacyCfgPy) {
        $pyRaw = [System.IO.File]::ReadAllText($legacyCfgPy, [System.Text.Encoding]::UTF8)
        if ($pyRaw -match "POS_SelfYN=Y") {
            $pyFixed = $pyRaw -replace "POS_SelfYN=Y", "POS_SelfYN=N"
            [System.IO.File]::WriteAllText($legacyCfgPy, $pyFixed, [System.Text.Encoding]::UTF8)
        }
    }
    if (Test-Path $kcpIniPath) {
        $cp949 = [System.Text.Encoding]::GetEncoding(949)
        $iniRaw = [System.IO.File]::ReadAllText($kcpIniPath, $cp949)
        $iniFixed = $iniRaw
        $iniFixed = [regex]::Replace($iniFixed, "(?m)^POS_SelfYN\s*=\s*Y", "POS_SelfYN=N")
        $iniFixed = [regex]::Replace($iniFixed, "(?m)^Sign_YN\s*=\s*N", "Sign_YN=Y")
        $iniFixed = [regex]::Replace($iniFixed, "(?m)^Sign_SelfYN\s*=\s*N", "Sign_SelfYN=Y")
        $iniFixed = [regex]::Replace($iniFixed, "(?m)^Sign_Port\s*=\s*\S+", "Sign_Port=")
        if ($iniFixed -ne $iniRaw) {
            [System.IO.File]::WriteAllText($kcpIniPath, $iniFixed, $cp949)
            Stop-Process -Name "NHNKCPSecureVCATMonit","NHNKCPSecureVCAT" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
            if (Test-Path $kcpExePath) {
                Start-Process -FilePath $kcpExePath -WorkingDirectory "C:\NHNKCPSecureVCAT" -ErrorAction SilentlyContinue
            }
        }
    }
} catch {}

# 3c. Terminate unnecessary Windows 11 consumer bloatware on Kiosk Mini-PC
$bloatProcesses = @("copilotapp", "Copilot", "copilotapphost", "PhoneExperienceHost", "Widgets", "WidgetService", "OneDrive")
foreach ($bp in $bloatProcesses) {
    Stop-Process -Name $bp -Force -ErrorAction SilentlyContinue
}

# 4. Restart GolfOS Unified Hardware/VCAT Bridge (vcat_bridge.py on :8090 / :18080)
$bridgeScript = "C:\GolfOS\bin\vcat_bridge.py"
$bridgeOnline = $false
if (Test-Path $bridgeScript) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'vcat_bridge\.py' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Name "ble_watcher" -Force -ErrorAction SilentlyContinue
    cmd /c "taskkill /F /IM ble_watcher.exe /T >nul 2>&1"
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
            if ($resp.status -in @("ONLINE", "DEGRADED")) { $bridgeOnline = $true; break }
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
                if ($resp.status -in @("ONLINE", "DEGRADED")) { $bridgeOnline = $true; break }
            } catch {}
        }
    }
}

# 5. Ensure LaunchGolfosKiosk Scheduled Task exists (interactive desktop session) and trigger it
$interactiveUser = $null
try {
    $explorerProc = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($explorerProc) {
        $ownerInfo = Invoke-CimMethod -InputObject $explorerProc -MethodName GetOwner -ErrorAction SilentlyContinue
        if ($ownerInfo -and $ownerInfo.User) {
            $interactiveUser = $ownerInfo.User
        }
    }
} catch {}
if (-not $interactiveUser) {
    $interactiveUser = $env:USERNAME
}

$launchExe = $null
$launchArgs = ""
$launchWorkDir = "C:\GolfOS"
if ((Test-Path $electronExe) -and (Test-Path $mainCjs)) {
    $launchExe = $electronExe
    $launchArgs = "`"$mainCjs`" $kioskUrl --kiosk"
    $launchWorkDir = "C:\GolfOS"
} elseif (Test-Path $runnerBat) {
    $launchExe = "cmd.exe"
    $launchArgs = "/c `"`"$runnerBat`" $kioskUrl`""
    $launchWorkDir = "C:\GolfOS\bin"
} else {
    $edgeCandidates = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($ec in $edgeCandidates) {
        if (Test-Path $ec) {
            $launchExe = $ec
            $launchArgs = "--app=$kioskUrl --user-data-dir=`"$edgeKioskProfile`" --kiosk --no-first-run --no-default-browser-check --kiosk-printing --high-dpi-support=1 --force-device-scale-factor=1"
            break
        }
    }
}

if ($launchExe) {
    try {
        $action = New-ScheduledTaskAction -Execute $launchExe -Argument $launchArgs -WorkingDirectory $launchWorkDir
        $principal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName "LaunchGolfosKiosk" -Action $action -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
    } catch {
        schtasks /create /tn "LaunchGolfosKiosk" /tr "`"$launchExe`" $launchArgs" /sc ONCE /st 00:00 /it /f 2>$null | Out-Null
    }
}

$taskObj = Get-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
if ($taskObj) {
    Start-ScheduledTask -TaskName "LaunchGolfosKiosk" -ErrorAction SilentlyContinue
} else {
    schtasks /run /tn "LaunchGolfosKiosk" 2>$null | Out-Null
}

# 6. Poll 8s for Scheduled Task launch; fallback to direct Start-Process ONLY in interactive desktop session (SessionId != 0)
$kioskProc = $null
for ($i = 0; $i -lt 8; $i++) {
    Start-Sleep -Seconds 1
    $kioskProc = Get-Process -Name electron, msedge -ErrorAction SilentlyContinue | Where-Object { $_.Responding }
    if ($kioskProc) { break }
}

$currentSessionId = 0
try {
    $currentSessionId = (Get-Process -Id $PID -ErrorAction SilentlyContinue).SessionId
} catch {
    $currentSessionId = 0
}

if ((-not $kioskProc) -and $launchExe -and ($currentSessionId -ne 0)) {
    Start-Process -FilePath $launchExe -ArgumentList $launchArgs -WorkingDirectory $launchWorkDir -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 5; $i++) {
        Start-Sleep -Seconds 1
        $kioskProc = Get-Process -Name electron, msedge -ErrorAction SilentlyContinue | Where-Object { $_.Responding }
        if ($kioskProc) { break }
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
        message = "Kiosk process (electron/msedge) did not start within 9s."
        server_ip = $ServerIp
    } | ConvertTo-Json -Compress
    Write-Output $json
    exit 1
}
