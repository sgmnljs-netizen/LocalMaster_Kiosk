import { spawn, exec } from 'child_process';
import os from 'os';

const PORT = 5179;
const URL = `http://localhost:${PORT}`;

// 개발자 도구 자동 오픈 여부 (기본값: false, --dev 옵션 시 true)
const openDevTools = process.argv.includes('--dev');
const devToolsFlag = openDevTools ? ' --auto-open-devtools-for-tabs' : '';

console.log('========================================================');
console.log(`  LocalMaster Kiosk - Cross-Platform App Launcher`);
console.log(`  Target URL: ${URL}`);
console.log(`  DevTools Auto-Open: ${openDevTools ? 'ENABLED' : 'DISABLED'}`);
console.log('========================================================');

const platform = os.platform();

if (platform === 'win32') {
  // Windows: Edge -> Chrome -> Default Browser 순 시도
  const edgeCmd = `start msedge --app="${URL}"${devToolsFlag}`;
  const chromeCmd = `start chrome --app="${URL}"${devToolsFlag}`;

  exec(edgeCmd, (err) => {
    if (err) {
      exec(chromeCmd, (err2) => {
        if (err2) {
          console.log('[WARNING] Edge/Chrome not found, launching default browser...');
          exec(`start ${URL}`);
        }
      });
    }
  });
} else if (platform === 'darwin') {
  // macOS
  const chromeApp = '/Applications/Google Chrome.app';
  const edgeApp = '/Applications/Microsoft Edge.app';

  exec(`test -d "${chromeApp}"`, (err) => {
    if (!err) {
      exec(`open -na "Google Chrome" --args --app="${URL}"${devToolsFlag}`);
    } else {
      exec(`test -d "${edgeApp}"`, (err2) => {
        if (!err2) {
          exec(`open -na "Microsoft Edge" --args --app="${URL}"${devToolsFlag}`);
        } else {
          exec(`open "${URL}"`);
        }
      });
    }
  });
} else {
  // Linux
  exec(`google-chrome --app="${URL}"${devToolsFlag} || chromium-browser --app="${URL}"${devToolsFlag} || xdg-open "${URL}"`);
}
