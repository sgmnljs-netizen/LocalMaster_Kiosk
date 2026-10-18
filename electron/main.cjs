const { app, BrowserWindow, Menu, nativeImage, dialog, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

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
try {
  fs.mkdirSync(userDataDir, { recursive: true });
  app.setPath('userData', userDataDir);
} catch (_) {
  // 기본 경로 폴백
}

// 3. 무인 터치스크린 오작동 방지: 스와이프 뒤로가기, 핀치 줌, 자동 번역, 음성 안내 차단 해제
app.commandLine.appendSwitch('overscroll-history-navigation', '0');
app.commandLine.appendSwitch('disable-features', 'Translate,BackForwardCache');
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const args = process.argv.slice(2);
const isWindowedArg = args.includes('--window');
const isKioskMode = args.includes('--kiosk') && !isWindowedArg;
const isDevMode = args.includes('--dev');
const urlArg = args.find((a) => a.startsWith('http://') || a.startsWith('https://'));
const TARGET_URL =
  urlArg ||
  process.env.KIOSK_APP_URL ||
  (isDevMode ? 'http://localhost:5179' : 'http://127.0.0.1:8000/kiosk');

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

function createKioskWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    title: 'GOLFOS KIOSK',
    width: 1080,
    height: 1920,
    minWidth: 1024,
    minHeight: 768,
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

  // 브라우저 기본 새로고침(Ctrl+R / Cmd+R), 새 창(Ctrl+N / Cmd+N), 탭 닫기(Ctrl+W / Cmd+W) OS 레벨 2중 차단
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    const ctrlOrCmd = input.control || input.meta;

    // F11 전체화면 토글 지원
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }

    // Ctrl+Shift+R / Cmd+Shift+R 은 엔지니어 비상 리로드 허용
    if (ctrlOrCmd && input.shift && key === 'r') {
      return;
    }

    // 실수 새로고침 / 새 창 / 창 닫기 단축키 차단
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
    if (!isKioskMode) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(TARGET_URL);
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
