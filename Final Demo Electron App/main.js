const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const noble = require('@abandonware/noble');

let mainWindow;

const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; 
const RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; 

let connectedDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isScanning = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');


  mainWindow.on('closed', () => {
    mainWindow = null;
    if (connectedDevice) {
      connectedDevice.disconnect();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  initBLE();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


function initBLE() {
  noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
      console.log('Bluetooth is powered on');
      mainWindow.webContents.send('ble-status', 'Bluetooth is ready');
    } else {
      console.log('Bluetooth is not powered on:', state);
      mainWindow.webContents.send('ble-status', `Bluetooth ${state}`);
      stopScanning();
    }
  });

  noble.on('discover', (peripheral) => {
    const name = peripheral.advertisement.localName;
    console.log(`Discovered device: ${name || 'Unknown'} (${peripheral.id})`);
    
    if (name === 'SmartPillDispenser') {
      console.log('Found Smart Pill Dispenser!');
      mainWindow.webContents.send('device-found', {
        id: peripheral.id,
        name: name || 'Unknown',
        rssi: peripheral.rssi
      });
    }
  });
}

function startScanning() {
  if (noble.state === 'poweredOn' && !isScanning) {
    noble.startScanning([], true); 
    isScanning = true;
    console.log('Started scanning for devices');
    mainWindow.webContents.send('scanning-status', true);
  } else {
    console.log('Cannot start scanning:', noble.state);
    mainWindow.webContents.send('ble-status', `Cannot scan. Bluetooth: ${noble.state}`);
  }
}

function stopScanning() {
  if (isScanning) {
    noble.stopScanning();
    isScanning = false;
    console.log('Stopped scanning for devices');
    mainWindow.webContents.send('scanning-status', false);
  }
}

async function connectToDevice(deviceId) {
  try {
    stopScanning();
    
    const device = noble._peripherals[deviceId];
    
    if (!device) {
      throw new Error('Device not found');
    }
    
    console.log(`Connecting to ${device.advertisement.localName || 'Unknown Device'}`);
    mainWindow.webContents.send('connection-status', 'Connecting...');
    
    await device.connectAsync();
    connectedDevice = device;
    console.log('Connected to device');
    
    const { characteristics } = await device.discoverSomeServicesAndCharacteristicsAsync(
      [SERVICE_UUID], 
      [RX_UUID, TX_UUID]
    );
    
    for (const characteristic of characteristics) {
      if (characteristic.uuid === RX_UUID.replace(/-/g, '')) {
        rxCharacteristic = characteristic;
        console.log('Found RX characteristic');
      } else if (characteristic.uuid === TX_UUID.replace(/-/g, '')) {
        txCharacteristic = characteristic;
        console.log('Found TX characteristic');
        
        await txCharacteristic.subscribeAsync();
        txCharacteristic.on('data', (data) => {
          const message = data.toString();
          console.log('Received from device:', message);
          mainWindow.webContents.send('device-data', message);
        });
      }
    }
    
    if (!rxCharacteristic || !txCharacteristic) {
      throw new Error('Required characteristics not found');
    }
    
    mainWindow.webContents.send('connection-status', 'Connected');
    
    device.once('disconnect', () => {
      console.log('Device disconnected');
      connectedDevice = null;
      rxCharacteristic = null;
      txCharacteristic = null;
      mainWindow.webContents.send('connection-status', 'Disconnected');
    });
    
    return true;
  } catch (error) {
    console.error('Connection error:', error);
    mainWindow.webContents.send('connection-status', `Connection failed: ${error.message}`);
    return false;
  }
}

function disconnectDevice() {
  if (connectedDevice) {
    connectedDevice.disconnect();
    connectedDevice = null;
    rxCharacteristic = null;
    txCharacteristic = null;
    console.log('Disconnected from device');
    mainWindow.webContents.send('connection-status', 'Disconnected');
  }
}

async function sendCommand(command) {
  if (connectedDevice && rxCharacteristic) {
    try {
      console.log('Sending command:', command);
      await rxCharacteristic.writeAsync(Buffer.from(command), false);
      console.log('Command sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending command:', error);
      return false;
    }
  } else {
    console.error('Device not connected');
    return false;
  }
}


ipcMain.handle('start-scanning', async () => {
  startScanning();
  return true;
});

ipcMain.handle('stop-scanning', async () => {
  stopScanning();
  return true;
});

ipcMain.handle('connect-device', async (event, deviceId) => {
  return await connectToDevice(deviceId);
});

ipcMain.handle('disconnect-device', async () => {
  disconnectDevice();
  return true;
});

ipcMain.handle('send-command', async (event, command) => {
  return await sendCommand(command);
}); 