const { ipcRenderer } = require('electron');

let lastSentAt = 0;
function notifyActivity() {
  const now = Date.now();
  if (now - lastSentAt < 500) return;
  lastSentAt = now;
  try {
    ipcRenderer.send('parking-view:activity');
  } catch (_) {
    // 무시
  }
}

['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown', 'wheel'].forEach((ev) => {
  window.addEventListener(ev, notifyActivity, { capture: true, passive: true });
});
