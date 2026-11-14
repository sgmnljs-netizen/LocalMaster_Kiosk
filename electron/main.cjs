const { app, BrowserWindow, Menu, nativeImage, dialog, session, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const KIOSK_BASE_WIDTH = 1080;
const KIOSK_BASE_HEIGHT = 1920;

// 1. 앱 이름 및 Windows 작업표시줄 AppUserModelID를 GOLFOS KIOSK로 고정
app.name = 'GOLFOS KIOSK';
if (typeof app.setName === 'function') {
  app.setName('GOLFOS KIOSK');
}
if (process.platform === 'win32') {
  app.setAppUserModelId('kr.co.segnet.golfos.kiosk');
}

// 2. 격리된 전용 KIOSK 프로필 디렉토리 지정 (단말 설정/세션/하드웨어 권한 영구 보존)
const userDataDir = process.platform === 'win32'
  ? 'C:\\GolfOS\\kiosk_electron_profile'
  : path.join(os.homedir(), '.golfos', 'kiosk_electron_profile');
const kioskLogDir = process.platform === 'win32'
  ? 'C:\\GolfOS\\logs'
  : path.join(os.homedir(), '.golfos', 'logs');
const kioskLogFile = path.join(kioskLogDir, 'kiosk_runtime.log');
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024; // 5MB 자동 로테이션

try {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(kioskLogDir, { recursive: true });
  app.setPath('userData', userDataDir);
} catch (_) {
  // 기본 경로 폴백
}

function appendKioskRuntimeLog(levelTag, message) {
  const line = `[${new Date().toISOString()}] [${levelTag}] ${String(message || '').replace(/\r?\n/g, ' ')}\n`;
  fs.promises
    .stat(kioskLogFile)
    .then((st) => {
      if (st.size > MAX_LOG_FILE_BYTES) {
        return fs.promises.rename(kioskLogFile, `${kioskLogFile}.1`).catch(() => {});
      }
    })
    .catch(() => {})
    .finally(() => {
      fs.promises.appendFile(kioskLogFile, line, 'utf8').catch(() => {});
    });
}


function readWindowsServerUrlFallback() {
  if (process.platform !== 'win32') return '';
  try {
    const raw = fs.readFileSync('C:\\GolfOS\\bin\\kiosk_server_url.txt', 'utf8').trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }
  } catch (_) {
    // ignore missing file
  }
  return '';
}

const args = process.argv.slice(2);
const isWindowedArg = args.includes('--window');
const isKioskMode = args.includes('--kiosk') && !isWindowedArg;
const isDevMode = args.includes('--dev');
const urlArg = args.find((a) => a.startsWith('http://') || a.startsWith('https://'));
const TARGET_URL =
  urlArg ||
  process.env.KIOSK_APP_URL ||
  (isDevMode ? 'http://localhost:5179' : (readWindowsServerUrlFallback() || 'http://127.0.0.1:8000/kiosk'));

// 3. 무인 터치스크린 오작동 방지 및 2-Tier 사설 LAN 서버(192.168.x.x / Tailscale) ➔ 로컬 브릿지(127.0.0.1:8090/18080) PNA 차단 해제
app.commandLine.appendSwitch('overscroll-history-navigation', '0');
app.commandLine.appendSwitch(
  'disable-features',
  'Translate,BackForwardCache,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,PrivateNetworkAccessPermissionPrompt'
);
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

try {
  const parsedOrigin = new URL(TARGET_URL).origin;
  const origins = Array.from(
    new Set([parsedOrigin, 'http://127.0.0.1:8000', 'http://localhost:5179'])
  );
  app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', origins.join(','));
} catch (_) {
  app.commandLine.appendSwitch(
    'unsafely-treat-insecure-origin-as-secure',
    'http://127.0.0.1:8000,http://localhost:5179'
  );
}

// 윈도우 10/11 고DPI(125%/150%) 블러 원천 차단 및 DirectWrite 안티앨리어싱 강제 (macOS Retina 과부하 방지를 위해 win32 전용)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('enable-font-antialiasing');
  app.commandLine.appendSwitch('enable-direct-write');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
}

const iconPngPath = path.join(__dirname, 'icon.png');
const iconIcoPath = path.join(__dirname, 'icon.ico');
const windowIconPath = process.platform === 'win32' && fs.existsSync(iconIcoPath)
  ? iconIcoPath
  : iconPngPath;

let mainWindow = null;

// 4. 단일 인스턴스 잠금 (바탕화면/하단 아이콘 중복 클릭 시 빈 창 생성 원천 차단 & 기존 창 포커스)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 5. 무인 키오스크 하드웨어 권한(카메라 안면인식/QR, WebSerial 영수증 프린터/스캐너, USB, HID) 자동 승인
function configureKioskHardwarePermissions() {
  if (!session || !session.defaultSession) return;

  const ALLOWED_PERMISSIONS = new Set([
    'media',
    'mediaKeySystem',
    'serial',
    'usb',
    'hid',
    'notifications',
    'fullscreen',
    'pointerLock',
  ]);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (['serial', 'usb', 'hid'].includes(details.deviceType)) {
      return true;
    }
    return false;
  });

  session.defaultSession.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });
}

function buildKioskAppMenu() {
  // Windows/Linux 무인 키오스크 전체화면 모드에서는 Alt 키 누름 시 상단 메뉴바가 절대 노출되지 않도록 완전 제거
  if (isKioskMode && process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'GOLFOS KIOSK',
            submenu: [
              { role: 'about', label: 'GOLFOS KIOSK 정보' },
              { type: 'separator' },
              { role: 'hide', label: 'GOLFOS KIOSK 가리기' },
              { role: 'hideOthers', label: '기타 가리기' },
              { role: 'unhide', label: '모두 보기' },
              { type: 'separator' },
              { role: 'quit', label: 'GOLFOS KIOSK 종료' },
            ],
          },
        ]
      : []),
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '오려두기' },
        { role: 'copy', label: '복사하기' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },
    {
      label: '화면',
      submenu: [
        {
          label: '전체화면 전환',
          accelerator: 'F11',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: '비상 새로고침 (엔지니어용)',
          accelerator: 'CommandOrControl+Shift+R',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function computeMonitorFitMetrics(display) {
  const targetDisplay = display || screen.getPrimaryDisplay();
  const area = isKioskMode
    ? targetDisplay.bounds
    : (targetDisplay.workArea || targetDisplay.bounds);
  const availWidth = Math.max(360, isKioskMode ? area.width : area.width - 32);
  const availHeight = Math.max(480, isKioskMode ? area.height : area.height - 44);
  const rawScale = Math.min(1, availWidth / KIOSK_BASE_WIDTH, availHeight / KIOSK_BASE_HEIGHT);
  const scale = Math.max(0.25, Math.round(rawScale * 1000) / 1000);
  const isCompactMonitor = scale < 0.999;
  const contentWidth = isCompactMonitor ? Math.round(KIOSK_BASE_WIDTH * scale) : KIOSK_BASE_WIDTH;
  const contentHeight = isCompactMonitor ? Math.round(KIOSK_BASE_HEIGHT * scale) : KIOSK_BASE_HEIGHT;
  return { scale, isCompactMonitor, contentWidth, contentHeight, area };
}

function createKioskWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const fit = computeMonitorFitMetrics(screen.getPrimaryDisplay());
  const windowX = fit.isCompactMonitor && !isKioskMode
    ? Math.round(fit.area.x + (fit.area.width - fit.contentWidth) / 2)
    : undefined;
  const windowY = fit.isCompactMonitor && !isKioskMode
    ? Math.round(fit.area.y + Math.max(0, (fit.area.height - fit.contentHeight - 28) / 2))
    : undefined;

  mainWindow = new BrowserWindow({
    title: 'GOLFOS KIOSK',
    width: fit.contentWidth,
    height: fit.contentHeight,
    x: windowX,
    y: windowY,
    useContentSize: true,
    minWidth: fit.isCompactMonitor ? Math.min(360, fit.contentWidth) : 1024,
    minHeight: fit.isCompactMonitor ? Math.min(480, fit.contentHeight) : 768,
    backgroundColor: '#041B14',
    icon: fs.existsSync(windowIconPath) ? windowIconPath : undefined,
    autoHideMenuBar: true,
    kiosk: isKioskMode,
    fullscreen: isKioskMode,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: isDevMode,
    },
  });

  const applyMonitorZoomFit = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const [contentW, contentH] = mainWindow.getContentSize();
      if (contentW > 0 && contentH > 0) {
        const fitted = Math.min(
          1.5,
          Math.max(0.25, Math.min(contentW / KIOSK_BASE_WIDTH, contentH / KIOSK_BASE_HEIGHT))
        );
        const nextZoom = Math.round(fitted * 1000) / 1000;
        mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
        mainWindow.webContents.setZoomFactor(nextZoom);
      }
    } catch (_) {
      // 무시
    }
  };

  mainWindow.webContents.on('dom-ready', applyMonitorZoomFit);
  mainWindow.webContents.on('did-finish-load', applyMonitorZoomFit);
  mainWindow.on('resize', applyMonitorZoomFit);

  // 창 제목을 항상 GOLFOS KIOSK로 고정
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle('GOLFOS KIOSK');
    }
  });

  // 외부 팝업창이나 새 빈 브라우저 창이 절대 뜨지 않도록 원천 차단
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // 무인 터치스크린 0.5초 롱프레스 시 크로미움 기본 우클릭 컨텍스트 메뉴 노출 원천 차단
  mainWindow.webContents.on('context-menu', (event) => {
    if (!isDevMode) {
      event.preventDefault();
    }
  });

  // 브라우저 기본 새로고침(F5 / Ctrl+R / Cmd+R), 뒤로가기(Alt+Left / BrowserBack), 새 창(Ctrl+N), 탭 닫기(Ctrl+W) OS 레벨 2중 차단
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    const ctrlOrCmd = input.control || input.meta;

    // F11 전체화면 토글 지원
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }

    // F12 / Cmd+Alt+I 개발자 도구 토글 지원 (개발 모드)
    if (isDevMode && input.type === 'keyDown' && (input.key === 'F12' || (ctrlOrCmd && input.alt && key === 'i'))) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
      return;
    }

    // Ctrl+Shift+R 엔지니어 비상 리로드 허용 및 개발 모드 시 일반 새로고침(Ctrl+R / Cmd+R / F5) 허용
    if (ctrlOrCmd && key === 'r' && (isDevMode || input.shift)) {
      return;
    }

    if (!isDevMode) {
      if (key === 'f5' || key === 'browserback' || key === 'browserforward') {
        event.preventDefault();
        return;
      }
      if (input.alt && (key === 'arrowleft' || key === 'arrowright' || key === 'home')) {
        event.preventDefault();
        return;
      }
    }

    // 실수 새로고침 / 새 창 / 창 닫기 / 인쇄 / 소스보기 단축키 차단
    if (ctrlOrCmd && ['r', 'n', 't', 'w', 'p', 's', 'f', 'u', 'g'].includes(key)) {
      event.preventDefault();
    }
  });

  // 렌더러의 beforeunload(VAN 카드 단말기 승인 대기 중 보호 가드) 발생 시 확인 다이얼로그 표시
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['계속 진행 (창 유지)', '강제 종료'],
      defaultId: 0,
      cancelId: 0,
      title: 'GOLFOS KIOSK 결제 보호 가드',
      message: '현재 카드 단말기 승인 또는 배정 처리가 진행 중입니다.\n창을 닫으면 결제 오류가 발생할 수 있습니다. 계속 유지하시겠습니까?',
    });
    if (choice === 1) {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!isKioskMode && !fit.isCompactMonitor) {
      mainWindow.maximize();
    }
    applyMonitorZoomFit();
    mainWindow.show();
    mainWindow.focus();
    if (isDevMode) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 키오스크 감사 로그([LM_KIOSK_AUDIT_LOG]) 및 렌더러 경고/에러(level >= 2)를 비동기로 디스크(C:\GolfOS\logs\kiosk_runtime.log)에 보존
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const msgStr = String(message || '');
    if (msgStr.includes('[LM_KIOSK_AUDIT_LOG]')) {
      appendKioskRuntimeLog('AUDIT', msgStr);
    } else if (level >= 2) {
      const tag = level === 2 ? 'WARN' : 'ERROR';
      appendKioskRuntimeLog(tag, `${msgStr} (${sourceId || 'renderer'}:${line || 0})`);
    }
  });

  let loadRetryTimer = null;
  let crashReloadTimer = null;
  let loadRetryCount = 0;
  let crashTimestamps = [];

  const clearRecoveryTimers = () => {
    if (loadRetryTimer) {
      clearTimeout(loadRetryTimer);
      loadRetryTimer = null;
    }
    if (crashReloadTimer) {
      clearTimeout(crashReloadTimer);
      crashReloadTimer = null;
    }
  };

  const buildWaitingSplashDataUrl = (attempt, targetUrl) => {
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>GOLFOS KIOSK</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-touch-callout:none;}
        body{background:#041B14;color:#F8FAFC;font-family:'Pretendard','Malgun Gothic',sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:48px;}
        .box{max-width:680px;padding:48px 40px;border-radius:28px;background:rgba(255,255,255,0.05);border:1px solid rgba(16,185,129,0.28);}
        .badge{display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(16,185,129,0.16);color:#34D399;font-size:15px;font-weight:800;letter-spacing:0.6px;margin-bottom:22px;}
        h1{font-size:30px;font-weight:900;margin-bottom:14px;line-height:1.35;}
        p{font-size:18px;color:#CBD5E1;line-height:1.6;font-weight:600;}
        .meta{margin-top:24px;font-size:14px;color:#94A3B8;font-family:monospace;}
      </style></head><body oncontextmenu="return false">
      <div class="box">
        <div class="badge">GOLFOS KIOSK AUTO-RECOVERY</div>
        <h1>매장 서버 연결 대기 중입니다</h1>
        <p>전원 투입 또는 서버 점검 직후 시스템을 준비하고 있습니다.<br/>서버 응답이 확인되는 즉시 자동으로 시작 화면으로 전환됩니다.</p>
        <div class="meta">재연결 시도 #${attempt} · ${String(targetUrl).replace(/[<>"']/g, '')}</div>
      </div></body></html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  };

  // [C-5] 아침 일괄 전원 ON 또는 서버 재기동 시 ERR_CONNECTION_REFUSED 영구 고착 방지 (3초 -> 5초 자동 재연결)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame === false) return;
    if (errorCode === -3) return; // ERR_ABORTED 정상 취소 무시
    if (String(validatedURL || '').startsWith('data:text/html')) return;

    loadRetryCount += 1;
    const retryDelayMs = loadRetryCount <= 2 ? 3000 : 5000;
    appendKioskRuntimeLog(
      'RECOVERY',
      `Main frame load failed (code=${errorCode}, desc=${errorDescription}, attempt=${loadRetryCount}). Retrying ${TARGET_URL} in ${retryDelayMs}ms`
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        if (!isKioskMode && !fit.isCompactMonitor) mainWindow.maximize();
        applyMonitorZoomFit();
        mainWindow.show();
      }
      mainWindow.loadURL(buildWaitingSplashDataUrl(loadRetryCount, TARGET_URL)).catch(() => {});
    }

    if (loadRetryTimer) clearTimeout(loadRetryTimer);
    loadRetryTimer = setTimeout(() => {
      loadRetryTimer = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(TARGET_URL).catch(() => {});
      }
    }, retryDelayMs);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    applyMonitorZoomFit();
    const currentUrl = mainWindow.webContents.getURL() || '';
    if (!currentUrl.startsWith('data:text/html')) {
      if (loadRetryCount > 0) {
        appendKioskRuntimeLog('RECOVERY', `Connected to ${currentUrl} after ${loadRetryCount} retry attempt(s).`);
      }
      loadRetryCount = 0;
      if (loadRetryTimer) {
        clearTimeout(loadRetryTimer);
        loadRetryTimer = null;
      }
    }
  });

  // [C-5] 24/7 무인 가동 중 렌더러 OOM/GPU 비정상 종료(render-process-gone) 발생 시 자동 복구
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const reason = details?.reason || 'unknown';
    appendKioskRuntimeLog('CRASH', `Renderer process gone: reason=${reason}, exitCode=${details?.exitCode}`);
    if (reason === 'clean-exit' || reason === 'killed') return;

    const now = Date.now();
    crashTimestamps = crashTimestamps.filter((ts) => now - ts < 60000);
    crashTimestamps.push(now);
    const delayMs = crashTimestamps.length > 4 ? 10000 : 1500;

    if (crashReloadTimer) clearTimeout(crashReloadTimer);
    crashReloadTimer = setTimeout(() => {
      crashReloadTimer = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        appendKioskRuntimeLog('RECOVERY', `Reloading TARGET_URL after renderer crash (${reason})`);
        mainWindow.loadURL(TARGET_URL).catch(() => {});
      }
    }, delayMs);
  });

  mainWindow.on('closed', () => {
    clearRecoveryTimers();
    mainWindow = null;
  });

  mainWindow.loadURL(TARGET_URL).catch(() => {});
  return mainWindow;
}

app.whenReady().then(() => {
  // macOS Dock 아이콘을 크롬이 아닌 GOLFOS KIOSK 전용 아이콘으로 즉시 설정
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPngPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPngPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (_) {
      // 무시
    }
  }

  configureKioskHardwarePermissions();
  buildKioskAppMenu();
  createKioskWindow();

  // macOS 하단 Dock 아이콘 클릭 시 빈 크롬창이 뜨지 않고 기존 KIOSK 창만 포커스
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createKioskWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
