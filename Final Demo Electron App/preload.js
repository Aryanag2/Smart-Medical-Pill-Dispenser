const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld(
  'api', {
    startScanning: () => ipcRenderer.invoke('start-scanning'),
    stopScanning: () => ipcRenderer.invoke('stop-scanning'),
    connectDevice: (deviceId) => ipcRenderer.invoke('connect-device', deviceId),
    disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
    sendCommand: (command) => ipcRenderer.invoke('send-command', command),
    
    onBleStatus: (callback) => ipcRenderer.on('ble-status', (_, status) => callback(status)),
    onScanningStatus: (callback) => ipcRenderer.on('scanning-status', (_, status) => callback(status)),
    onDeviceFound: (callback) => ipcRenderer.on('device-found', (_, device) => callback(device)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_, status) => callback(status)),
    onDeviceData: (callback) => ipcRenderer.on('device-data', (_, data) => callback(data)),

    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('ble-status');
      ipcRenderer.removeAllListeners('scanning-status');
      ipcRenderer.removeAllListeners('device-found');
      ipcRenderer.removeAllListeners('connection-status');
      ipcRenderer.removeAllListeners('device-data');
    }
  }
); 