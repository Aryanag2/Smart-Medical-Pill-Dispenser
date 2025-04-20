const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const noble = require('@abandonware/noble');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow;

// Service UUID for the Smart Pill Dispenser
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
// Characteristic UUIDs for communication
const TX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // For notifications from device
const RX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // For writing to device

// BLE device properties
let connectedDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isScanning = false;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html
  mainWindow.loadFile('index.html');

  // Open DevTools for debugging (can be commented out for production)
  // mainWindow.webContents.openDevTools();

  // Handle window being closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Disconnect BLE device if connected
    if (connectedDevice) {
      connectedDevice.disconnect();
    }
  });
}

// Initialize the app when ready
app.whenReady().then(() => {
  createWindow();
  
  // For macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Initialize BLE
  initBLE();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ========== BLE Functions ==========

function initBLE() {
  // Handle BLE state changes
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

  // Handle discovered devices
  noble.on('discover', (peripheral) => {
    const name = peripheral.advertisement.localName;
    console.log(`Discovered device: ${name || 'Unknown'} (${peripheral.id})`);
    
    // Check if this is our pill dispenser (by name or other criteria)
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

// Start scanning for BLE devices
function startScanning() {
  if (noble.state === 'poweredOn' && !isScanning) {
    noble.startScanning([], true); // Scan for all devices
    isScanning = true;
    console.log('Started scanning for devices');
    mainWindow.webContents.send('scanning-status', true);
  } else {
    console.log('Cannot start scanning:', noble.state);
    mainWindow.webContents.send('ble-status', `Cannot scan. Bluetooth: ${noble.state}`);
  }
}

// Stop scanning for BLE devices
function stopScanning() {
  if (isScanning) {
    noble.stopScanning();
    isScanning = false;
    console.log('Stopped scanning for devices');
    mainWindow.webContents.send('scanning-status', false);
  }
}

// Connect to a BLE device
async function connectToDevice(deviceId) {
  try {
    stopScanning();
    
    // Find the device with the given ID
    const device = noble._peripherals[deviceId];
    
    if (!device) {
      throw new Error('Device not found');
    }
    
    console.log(`Connecting to ${device.advertisement.localName || 'Unknown Device'}`);
    mainWindow.webContents.send('connection-status', 'Connecting...');
    
    // Connect to the device
    await device.connectAsync();
    connectedDevice = device;
    console.log('Connected to device');
    
    // Discover services and characteristics
    const { characteristics } = await device.discoverSomeServicesAndCharacteristicsAsync(
      [SERVICE_UUID], 
      [RX_UUID, TX_UUID]
    );
    
    // Find the TX and RX characteristics
    for (const characteristic of characteristics) {
      if (characteristic.uuid === RX_UUID.replace(/-/g, '')) {
        rxCharacteristic = characteristic;
        console.log('Found RX characteristic');
      } else if (characteristic.uuid === TX_UUID.replace(/-/g, '')) {
        txCharacteristic = characteristic;
        console.log('Found TX characteristic');
        
        // Subscribe to notifications from the TX characteristic
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
    
    // Handle disconnection
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

// Disconnect from the currently connected device
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

// Send a command to the device
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

// ========== IPC Handlers ==========

// Handle start scanning request from renderer
ipcMain.handle('start-scanning', async () => {
  startScanning();
  return true;
});

// Handle stop scanning request from renderer
ipcMain.handle('stop-scanning', async () => {
  stopScanning();
  return true;
});

// Handle connect to device request from renderer
ipcMain.handle('connect-device', async (event, deviceId) => {
  return await connectToDevice(deviceId);
});

// Handle disconnect device request from renderer
ipcMain.handle('disconnect-device', async () => {
  disconnectDevice();
  return true;
});

// Handle send command request from renderer
ipcMain.handle('send-command', async (event, command) => {
  return await sendCommand(command);
}); 