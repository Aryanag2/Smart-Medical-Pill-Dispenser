// DOM Elements
// Connection controls
const scanButton = document.getElementById('scan-button');
const stopScanButton = document.getElementById('stop-scan-button');
const disconnectButton = document.getElementById('disconnect-button');
const devicesList = document.getElementById('devices-list').querySelector('.devices-list-content');

// Status elements
const bleStatus = document.getElementById('ble-status');
const connectionStatus = document.getElementById('connection-status');
const weightDisplay = document.getElementById('weight-display');
const deviceMessages = document.getElementById('device-messages');

// Compartment controls
const openButtons = document.querySelectorAll('.open-button');
const closeButtons = document.querySelectorAll('.close-button');
const ledButtons = document.querySelectorAll('.led-button');

// Status toggles
const powerLedButton = document.getElementById('power-led-button');
const refillLedButton = document.getElementById('refill-led-button');
const timeLedButton = document.getElementById('time-led-button');
const mainLedButton = document.getElementById('main-led-button');
const vibrateButton = document.getElementById('vibrate-button');

// Command input
const commandInput = document.getElementById('command-input');
const sendCommandButton = document.getElementById('send-command-button');

// State tracking
let isConnected = false;
let isScanning = false;

// Add a variable to track the LED blinking interval
let ledBlinkInterval = null;

// ========== Event Listeners ==========

// Scanning
scanButton.addEventListener('click', () => {
  startScanning();
});

stopScanButton.addEventListener('click', () => {
  stopScanning();
});

// Disconnect
disconnectButton.addEventListener('click', () => {
  disconnectDevice();
});

// Custom command
sendCommandButton.addEventListener('click', () => {
  const command = commandInput.value.trim();
  if (command) {
    sendCommand(command);
    commandInput.value = '';
  }
});

commandInput.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    sendCommandButton.click();
  }
});

// Compartment open/close buttons
openButtons.forEach(button => {
  button.addEventListener('click', () => {
    const compartment = button.dataset.compartment;
    sendCommand(`SERVO${compartment} OPEN`);
  });
});

closeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const compartment = button.dataset.compartment;
    sendCommand(`SERVO${compartment} CLOSE`);
  });
});

// LED controls for each compartment
ledButtons.forEach(button => {
  button.addEventListener('click', () => {
    const compartment = button.dataset.compartment;
    const currentState = button.dataset.state;
    const newState = currentState === 'off' ? 'on' : 'off';
    
    sendCommand(`COMP${compartment}_LED ${newState.toUpperCase()}`);
    
    // Update button state (will be confirmed when we get feedback)
    toggleButtonState(button, newState);
  });
});

// Status toggle buttons
powerLedButton.addEventListener('click', () => {
  toggleLed('POWER_LED', powerLedButton);
});

refillLedButton.addEventListener('click', () => {
  toggleLed('REFILL_LED', refillLedButton);
});

timeLedButton.addEventListener('click', () => {
  toggleLed('TIME_LED', timeLedButton);
});

mainLedButton.addEventListener('click', () => {
  toggleLed('LED', mainLedButton);
});

vibrateButton.addEventListener('click', () => {
  const currentState = vibrateButton.dataset.state;
  const newState = currentState === 'off' ? 'on' : 'off';
  
  sendCommand(`VIBRATE ${newState.toUpperCase()}`);
  toggleButtonState(vibrateButton, newState);
});

// ========== IPC Event Handlers ==========

// BLE status updates
window.api.onBleStatus((status) => {
  bleStatus.textContent = `Bluetooth: ${status}`;
  logMessage(`Bluetooth status: ${status}`, 'system');
});

// Scanning status updates
window.api.onScanningStatus((status) => {
  isScanning = status;
  scanButton.disabled = status;
  stopScanButton.disabled = !status;
  
  if (status) {
    logMessage('Scanning for devices...', 'system');
    // Clear previous devices list
    devicesList.innerHTML = '<p class="scanning">Scanning for devices...</p>';
    
    // Start blinking the bluetooth LED during scanning
    startLedBlinking();
  } else {
    logMessage('Stopped scanning', 'system');
    
    // Stop LED blinking if not connected
    if (!isConnected) {
      sendCommand('BT_LED OFF');
    }
    
    if (devicesList.querySelector('.device-item') === null) {
      devicesList.innerHTML = '<p class="no-devices">No devices found. Try scanning again.</p>';
    }
  }
});

// Device found
window.api.onDeviceFound((device) => {
  // Remove "scanning" message if it exists
  const scanningMsg = devicesList.querySelector('.scanning');
  if (scanningMsg) {
    devicesList.removeChild(scanningMsg);
  }
  
  // Check if device is already in the list
  const existingDevice = devicesList.querySelector(`[data-id="${device.id}"]`);
  if (existingDevice) {
    // Update RSSI
    existingDevice.querySelector('.device-rssi').textContent = `Signal: ${device.rssi} dB`;
    return;
  }
  
  // Remove "no devices" message if it exists
  const noDevicesMsg = devicesList.querySelector('.no-devices');
  if (noDevicesMsg) {
    devicesList.removeChild(noDevicesMsg);
  }
  
  // Create device item
  const deviceItem = document.createElement('div');
  deviceItem.className = 'device-item';
  deviceItem.dataset.id = device.id;
  
  deviceItem.innerHTML = `
    <div class="device-info">
      <div class="device-name">${device.name}</div>
      <div class="device-rssi">Signal: ${device.rssi} dB</div>
    </div>
    <button class="device-connect">Connect</button>
  `;
  
  // Add connect button handler
  deviceItem.querySelector('.device-connect').addEventListener('click', async () => {
    connectToDevice(device.id);
  });
  
  devicesList.appendChild(deviceItem);
  logMessage(`Found device: ${device.name}`, 'system');
});

// Connection status updates
window.api.onConnectionStatus((status) => {
  connectionStatus.textContent = `Device: ${status}`;
  logMessage(`Connection status: ${status}`, 'system');
  
  // Update UI based on connection status
  if (status === 'Connected') {
    isConnected = true;
    disconnectButton.disabled = false;
    enableControls(true);
    
    // Disable scanning when connected
    scanButton.disabled = true;
    stopScanButton.disabled = true;
    
    // Stop blinking and turn on bluetooth LED solid when connected
    clearInterval(ledBlinkInterval);
    sendCommand('BT_LED ON');
    
    // Sync time with the device
    sendTimeToDevice();
    
    // Clear device list and show connected message
    devicesList.innerHTML = '<p class="connected-message">Connected to device. Disconnect to pair with a different device.</p>';
      
    // Add connected status class to status bar for visual indication
    connectionStatus.classList.add('connected');
  } else {
    isConnected = false;
    disconnectButton.disabled = true;
    enableControls(false);
    
    // Turn off the bluetooth LED when disconnected
    sendCommand('BT_LED OFF');
    
    // Re-enable scanning when disconnected
    scanButton.disabled = false;
    
    // Remove connected status
    connectionStatus.classList.remove('connected');
    
    // Reset device list to default message
    if (!isScanning) {
      devicesList.innerHTML = '<p class="no-devices">No devices found yet. Start scanning to discover devices.</p>';
    }
    
    // Reset all control states
    resetControlStates();
  }
});

// Device data messages
window.api.onDeviceData((data) => {
  // Handle different types of data from device
  logMessage(`Received: ${data}`, 'received');
  
  // Handle requests from the device
  if (data === 'REQUEST_TIME') {
    sendTimeToDevice();
    return;
  }
  
  if (data === 'CHECK_SCHEDULES') {
    // This would be implemented in the demo page where schedules are managed
    // For now, just acknowledge
    logMessage('Device requested schedule check (not implemented in this page)', 'system');
    return;
  }
  
  // Process weight readings
  if (data.startsWith('WEIGHT:')) {
    const weight = data.split(':')[1].trim();
    weightDisplay.textContent = weight;
  }
});

// ========== Helper Functions ==========

// Start BLE scanning
function startScanning() {
  window.api.startScanning();
}

// Stop BLE scanning
function stopScanning() {
  window.api.stopScanning();
}

// Connect to a specific device
async function connectToDevice(deviceId) {
  logMessage('Connecting to device...', 'system');
  await window.api.connectDevice(deviceId);
}

// Disconnect from current device
function disconnectDevice() {
  logMessage('Disconnecting...', 'system');
  window.api.disconnectDevice();
}

// Send command to device
async function sendCommand(command) {
  logMessage(`Sending: ${command}`, 'sent');
  await window.api.sendCommand(command);
}

// Toggle LED state
function toggleLed(ledName, button) {
  const currentState = button.dataset.state;
  const newState = currentState === 'off' ? 'on' : 'off';
  
  sendCommand(`${ledName} ${newState.toUpperCase()}`);
  toggleButtonState(button, newState);
}

// Toggle button state UI
function toggleButtonState(button, state) {
  button.dataset.state = state;
  
  // Update button text with appropriate label
  const label = button.textContent.split(':')[0];
  button.textContent = `${label}: ${state.toUpperCase()}`;
}

// Enable/disable all UI controls
function enableControls(enabled) {
  // Compartment controls
  openButtons.forEach(btn => btn.disabled = !enabled);
  closeButtons.forEach(btn => btn.disabled = !enabled);
  ledButtons.forEach(btn => btn.disabled = !enabled);
  
  // Status toggles
  powerLedButton.disabled = !enabled;
  refillLedButton.disabled = !enabled;
  timeLedButton.disabled = !enabled;
  mainLedButton.disabled = !enabled;
  vibrateButton.disabled = !enabled;
  
  // Command input
  commandInput.disabled = !enabled;
  sendCommandButton.disabled = !enabled;
}

// Reset all control states
function resetControlStates() {
  // Reset toggle buttons
  const toggleButtons = [
    powerLedButton, 
    refillLedButton, 
    timeLedButton, 
    mainLedButton, 
    vibrateButton, 
    ...ledButtons
  ];
  
  toggleButtons.forEach(button => {
    toggleButtonState(button, 'off');
  });
  
  // Reset weight display
  weightDisplay.textContent = 'No weight data available';
}

// Log a message to the message log
function logMessage(message, type = 'system') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  
  deviceMessages.appendChild(messageElement);
  
  // Auto-scroll to bottom
  deviceMessages.scrollTop = deviceMessages.scrollHeight;
  
  // Limit number of messages (keep last 100)
  const messages = deviceMessages.querySelectorAll('.message');
  if (messages.length > 100) {
    deviceMessages.removeChild(messages[0]);
  }
}

// Send current time to the device
function sendTimeToDevice() {
  const now = new Date();
  const timeString = now.getFullYear() + '-' + 
                    (now.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                    now.getDate().toString().padStart(2, '0') + ' ' + 
                    now.getHours().toString().padStart(2, '0') + ':' + 
                    now.getMinutes().toString().padStart(2, '0') + ':' + 
                    now.getSeconds().toString().padStart(2, '0');
  
  sendCommand(`SET_TIME:${timeString}`);
  logMessage(`Synchronized time with device: ${timeString}`, 'system');
}

// Function to start LED blinking
function startLedBlinking() {
  // Clear any existing interval
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  
  // Initialize LED to ON
  sendCommand('BT_LED ON');
  
  let ledState = true;
  
  // Start blinking every 500ms
  ledBlinkInterval = setInterval(() => {
    ledState = !ledState;
    sendCommand(`BT_LED ${ledState ? 'ON' : 'OFF'}`);
  }, 500);
}

// Make sure to clear the interval when window is unloaded
window.addEventListener('beforeunload', () => {
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  window.api.removeAllListeners();
}); 