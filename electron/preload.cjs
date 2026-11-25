const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('golfosKioskBridge', {
  isElectron: true,
  openParkingPopup: (options) => ipcRenderer.invoke('kiosk:open-parking-popup', options),
  closeParkingPopup: () => ipcRenderer.invoke('kiosk:close-parking-popup'),
  clearParkingSession: () => ipcRenderer.invoke('kiosk:clear-parking-session'),
  onParkingPopupClosed: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => {
      callback(payload || {});
    };
    ipcRenderer.on('kiosk:parking-popup-closed', listener);
    return () => {
      ipcRenderer.removeListener('kiosk:parking-popup-closed', listener);
    };
  },
});
