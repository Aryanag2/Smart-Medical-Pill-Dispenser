const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // BLE Methods
    startScanning: () => ipcRenderer.invoke('start-scanning'),
    stopScanning: () => ipcRenderer.invoke('stop-scanning'),
    connectDevice: (deviceId) => ipcRenderer.invoke('connect-device', deviceId),
    disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
    sendCommand: (command) => ipcRenderer.invoke('send-command', command),
    
    // Event listeners
    onBleStatus: (callback) => ipcRenderer.on('ble-status', (_, status) => callback(status)),
    onScanningStatus: (callback) => ipcRenderer.on('scanning-status', (_, status) => callback(status)),
    onDeviceFound: (callback) => ipcRenderer.on('device-found', (_, device) => callback(device)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_, status) => callback(status)),
    onDeviceData: (callback) => ipcRenderer.on('device-data', (_, data) => callback(data)),

    // Clean up listeners (to avoid memory leaks)
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('ble-status');
      ipcRenderer.removeAllListeners('scanning-status');
      ipcRenderer.removeAllListeners('device-found');
      ipcRenderer.removeAllListeners('connection-status');
      ipcRenderer.removeAllListeners('device-data');
    }
  }
); 