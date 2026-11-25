const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('golfosParkingHeader', {
  close: () => ipcRenderer.send('parking-header:action', 'close'),
  back: () => ipcRenderer.send('parking-header:action', 'back'),
  reload: () => ipcRenderer.send('parking-header:action', 'reload'),
  onCountdownTick: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, remainSec) => {
      callback(Number(remainSec));
    };
    ipcRenderer.on('parking-header:tick', listener);
    return () => {
      ipcRenderer.removeListener('parking-header:tick', listener);
    };
  },
});
