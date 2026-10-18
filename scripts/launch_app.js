#!/usr/bin/env node
/**
 * GOLFOS KIOSK Standalone App Shell Launcher
 * - Priority 1: Dedicated Electron Native App Shell (GOLFOS KIOSK icon, Dock/Taskbar identity, single-instance lock, hardware permissions auto-approval)
 * - Priority 2: Fallback Edge/Chrome --app mode with isolated profile & kiosk flags if Electron binary is not available
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const siblingPosRoot = path.resolve(projectRoot, '..', 'LocalMaster_POS');

const args = process.argv.slice(2);
const isWindowed = args.includes('--window');
const isKiosk = args.includes('--kiosk') || (!isWindowed && process.env.KIOSK_FULLSCREEN === 'true');
const isDevOnly = args.includes('--dev');
const isDryRun = args.includes('--dry-run');
const isBrowserFallback = args.includes('--browser');
const customUrlArg =
  args.find((a) => a.startsWith('--url=')) ||
  args.find((a) => a.startsWith('http://') || a.startsWith('https://'));

const PROD_URL = process.env.KIOSK_APP_URL || 'http://127.0.0.1:8000/kiosk';
const DEV_URL = process.env.KIOSK_DEV_URL || 'http://localhost:5179';

function probeUrl(urlStr, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function resolveTargetUrl() {
  if (customUrlArg) {
    return customUrlArg.startsWith('--url=') ? customUrlArg.slice('--url='.length) : customUrlArg;
  }
  if (isDevOnly) {
    if (await probeUrl(DEV_URL)) return DEV_URL;
    if (await probeUrl(PROD_URL)) return PROD_URL;
    return DEV_URL;
  }
  if (await probeUrl(PROD_URL)) {
    return PROD_URL;
  }
  if (await probeUrl(DEV_URL)) {
    return DEV_URL;
  }
  return PROD_URL;
}

function resolveProfileDir() {
  if (process.env.KIOSK_PROFILE_DIR) {
    return process.env.KIOSK_PROFILE_DIR;
  }
  if (process.platform === 'win32') {
    return 'C:\\GolfOS\\kiosk_profile';
  }
  return path.join(os.homedir(), '.golfos', 'kiosk_profile');
}

function brandMacElectronBundle(macApp) {
  try {
    const stampFile = path.join(macApp, 'Contents', '.golfos_kiosk_branded');
    if (!fs.existsSync(stampFile)) {
      const plistPath = path.join(macApp, 'Contents', 'Info.plist');
      const customIcns = path.join(projectRoot, 'electron', 'icon.icns');
      const targetIcns = path.join(macApp, 'Contents', 'Resources', 'electron.icns');
      if (fs.existsSync(customIcns)) {
        fs.copyFileSync(customIcns, targetIcns);
      }
      if (fs.existsSync(plistPath)) {
        execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName 'GOLFOS KIOSK'" "${plistPath}"`, { stdio: 'ignore' });
        execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'GOLFOS KIOSK'" "${plistPath}"`, { stdio: 'ignore' });
        execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier 'kr.co.segnet.golfos.kiosk'" "${plistPath}"`, { stdio: 'ignore' });
      }
      execSync(`codesign --force --deep --sign - "${macApp}"`, { stdio: 'ignore' });
      fs.writeFileSync(stampFile, '1');
    }
  } catch {
    // Ignore branding errors on read-only filesystems
  }
}

function findElectronExecutable() {
  if (isBrowserFallback) return null;

  if (process.platform === 'darwin') {
    const localMacApp = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app');
    const localMacBin = path.join(localMacApp, 'Contents', 'MacOS', 'Electron');
    if (fs.existsSync(localMacBin)) {
      brandMacElectronBundle(localMacApp);
      return localMacBin;
    }

    // If Electron is installed in sibling LocalMaster_POS, clone a dedicated Kiosk bundle so POS & KIOSK have separate Dock icons
    const runtimeMacApp = path.join(projectRoot, 'electron', '.runtime', 'Electron.app');
    const runtimeMacBin = path.join(runtimeMacApp, 'Contents', 'MacOS', 'Electron');
    const siblingMacApp = path.join(siblingPosRoot, 'node_modules', 'electron', 'dist', 'Electron.app');
    if (!fs.existsSync(runtimeMacBin) && fs.existsSync(siblingMacApp)) {
      try {
        fs.mkdirSync(path.dirname(runtimeMacApp), { recursive: true });
        execSync(`cp -R "${siblingMacApp}" "${runtimeMacApp}"`, { stdio: 'ignore' });
        const posStamp = path.join(runtimeMacApp, 'Contents', '.golfos_branded');
        if (fs.existsSync(posStamp)) fs.unlinkSync(posStamp);
      } catch {
        // Fallback if copy fails
      }
    }
    if (fs.existsSync(runtimeMacBin)) {
      brandMacElectronBundle(runtimeMacApp);
      return runtimeMacBin;
    }
  }

  if (process.platform === 'win32') {
    const winCandidates = [
      path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
      path.join(siblingPosRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ];
    return winCandidates.find((p) => fs.existsSync(p)) || null;
  }

  const linuxCandidates = [
    path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron'),
    path.join(siblingPosRoot, 'node_modules', 'electron', 'dist', 'electron'),
  ];
  return linuxCandidates.find((p) => fs.existsSync(p)) || null;
}

function findBrowserExecutable() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    return candidates.find((p) => p && fs.existsSync(p)) || null;
  }

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  const linuxCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return linuxCandidates.find((p) => fs.existsSync(p)) || null;
}

async function main() {
  const targetUrl = await resolveTargetUrl();
  const profileDir = resolveProfileDir();
  const electronExe = findElectronExecutable();
  const electronMain = path.join(projectRoot, 'electron', 'main.cjs');

  if (electronExe && fs.existsSync(electronMain) && !isDryRun) {
    const electronArgs = [
      electronMain,
      targetUrl,
      ...(isKiosk ? ['--kiosk'] : []),
      ...(isWindowed ? ['--window'] : []),
      ...(isDevOnly ? ['--dev'] : []),
    ];
    console.log(`[GOLFOS KIOSK] Launching Native Electron App Shell (GOLFOS KIOSK) -> ${targetUrl}`);
    const child = spawn(electronExe, electronArgs, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, KIOSK_APP_URL: targetUrl },
    });
    child.unref();
    return;
  }

  const browserExe = findBrowserExecutable();
  fs.mkdirSync(profileDir, { recursive: true });

  const browserFlags = [
    `--app=${targetUrl}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,TranslateUI,OverscrollHistoryNavigation',
    '--overscroll-history-navigation=0',
    '--disable-pinch',
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    isKiosk ? '--kiosk' : '--start-maximized',
    ...(isDevOnly ? ['--auto-open-devtools-for-tabs'] : []),
  ];

  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          targetUrl,
          profileDir,
          electronExe,
          browserExe,
          browserFlags,
        },
        null,
        2
      )
    );
    return;
  }

  if (!browserExe) {
    console.error('[GOLFOS KIOSK] 실행 가능한 런타임(Electron 또는 Chrome/Edge)을 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log(`[GOLFOS KIOSK] Launching standalone Kiosk App Shell -> ${targetUrl}`);
  const child = spawn(browserExe, browserFlags, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

main().catch((err) => {
  console.error('[GOLFOS KIOSK] Failed to launch Kiosk App Shell:', err);
  process.exit(1);
});
