
const scanButton = document.getElementById('scan-button');
const stopScanButton = document.getElementById('stop-scan-button');
const disconnectButton = document.getElementById('disconnect-button');
const devicesList = document.getElementById('devices-list').querySelector('.devices-list-content');

const bleStatus = document.getElementById('ble-status');
const connectionStatus = document.getElementById('connection-status');
const weightDisplay = document.getElementById('weight-display');
const deviceMessages = document.getElementById('device-messages');

const openButtons = document.querySelectorAll('.open-button');
const closeButtons = document.querySelectorAll('.close-button');
const ledButtons = document.querySelectorAll('.led-button');

const powerLedButton = document.getElementById('power-led-button');
const refillLedButton = document.getElementById('refill-led-button');
const timeLedButton = document.getElementById('time-led-button');
const mainLedButton = document.getElementById('main-led-button');
const vibrateButton = document.getElementById('vibrate-button');

const commandInput = document.getElementById('command-input');
const sendCommandButton = document.getElementById('send-command-button');

let isConnected = false;
let isScanning = false;

let ledBlinkInterval = null;


scanButton.addEventListener('click', () => {
  startScanning();
});

stopScanButton.addEventListener('click', () => {
  stopScanning();
});

disconnectButton.addEventListener('click', () => {
  disconnectDevice();
});

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

ledButtons.forEach(button => {
  button.addEventListener('click', () => {
    const compartment = button.dataset.compartment;
    const currentState = button.dataset.state;
    const newState = currentState === 'off' ? 'on' : 'off';
    
    sendCommand(`COMP${compartment}_LED ${newState.toUpperCase()}`);
    
    toggleButtonState(button, newState);
  });
});

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


window.api.onBleStatus((status) => {
  bleStatus.textContent = `Bluetooth: ${status}`;
  logMessage(`Bluetooth status: ${status}`, 'system');
});

window.api.onScanningStatus((status) => {
  isScanning = status;
  scanButton.disabled = status;
  stopScanButton.disabled = !status;
  
  if (status) {
    logMessage('Scanning for devices...', 'system');
    devicesList.innerHTML = '<p class="scanning">Scanning for devices...</p>';
    
    startLedBlinking();
  } else {
    logMessage('Stopped scanning', 'system');
    
    if (!isConnected) {
      sendCommand('BT_LED OFF');
    }
    
    if (devicesList.querySelector('.device-item') === null) {
      devicesList.innerHTML = '<p class="no-devices">No devices found. Try scanning again.</p>';
    }
  }
});

window.api.onDeviceFound((device) => {
  const scanningMsg = devicesList.querySelector('.scanning');
  if (scanningMsg) {
    devicesList.removeChild(scanningMsg);
  }
  
  const existingDevice = devicesList.querySelector(`[data-id="${device.id}"]`);
  if (existingDevice) {
    existingDevice.querySelector('.device-rssi').textContent = `Signal: ${device.rssi} dB`;
    return;
  }
  
  const noDevicesMsg = devicesList.querySelector('.no-devices');
  if (noDevicesMsg) {
    devicesList.removeChild(noDevicesMsg);
  }
  
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
  
  deviceItem.querySelector('.device-connect').addEventListener('click', async () => {
    connectToDevice(device.id);
  });
  
  devicesList.appendChild(deviceItem);
  logMessage(`Found device: ${device.name}`, 'system');
});

window.api.onConnectionStatus((status) => {
  connectionStatus.textContent = `Device: ${status}`;
  logMessage(`Connection status: ${status}`, 'system');
  
  if (status === 'Connected') {
    isConnected = true;
    disconnectButton.disabled = false;
    enableControls(true);
    
    scanButton.disabled = true;
    stopScanButton.disabled = true;
    
    clearInterval(ledBlinkInterval);
    sendCommand('BT_LED ON');
    
    sendTimeToDevice();
    
    devicesList.innerHTML = '<p class="connected-message">Connected to device. Disconnect to pair with a different device.</p>';
      
    connectionStatus.classList.add('connected');
  } else {
    isConnected = false;
    disconnectButton.disabled = true;
    enableControls(false);
    
    sendCommand('BT_LED OFF');
    
    scanButton.disabled = false;
    
    connectionStatus.classList.remove('connected');
    
    if (!isScanning) {
      devicesList.innerHTML = '<p class="no-devices">No devices found yet. Start scanning to discover devices.</p>';
    }
    
    resetControlStates();
  }
});

window.api.onDeviceData((data) => {
  logMessage(`Received: ${data}`, 'received');
  
  if (data === 'REQUEST_TIME') {
    sendTimeToDevice();
    return;
  }
  
  if (data === 'CHECK_SCHEDULES') {

    logMessage('Device requested schedule check (not implemented in this page)', 'system');
    return;
  }
  
  if (data.startsWith('WEIGHT:')) {
    const weight = data.split(':')[1].trim();
    weightDisplay.textContent = weight;
  }
});


function startScanning() {
  window.api.startScanning();
}

function stopScanning() {
  window.api.stopScanning();
}

async function connectToDevice(deviceId) {
  logMessage('Connecting to device...', 'system');
  await window.api.connectDevice(deviceId);
}

function disconnectDevice() {
  logMessage('Disconnecting...', 'system');
  window.api.disconnectDevice();
}

async function sendCommand(command) {
  logMessage(`Sending: ${command}`, 'sent');
  await window.api.sendCommand(command);
}

function toggleLed(ledName, button) {
  const currentState = button.dataset.state;
  const newState = currentState === 'off' ? 'on' : 'off';
  
  sendCommand(`${ledName} ${newState.toUpperCase()}`);
  toggleButtonState(button, newState);
}

function toggleButtonState(button, state) {
  button.dataset.state = state;
  
  const label = button.textContent.split(':')[0];
  button.textContent = `${label}: ${state.toUpperCase()}`;
}

function enableControls(enabled) {
  openButtons.forEach(btn => btn.disabled = !enabled);
  closeButtons.forEach(btn => btn.disabled = !enabled);
  ledButtons.forEach(btn => btn.disabled = !enabled);
  
  powerLedButton.disabled = !enabled;
  refillLedButton.disabled = !enabled;
  timeLedButton.disabled = !enabled;
  mainLedButton.disabled = !enabled;
  vibrateButton.disabled = !enabled;
  
  commandInput.disabled = !enabled;
  sendCommandButton.disabled = !enabled;
}

function resetControlStates() {
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
  
  weightDisplay.textContent = 'No weight data available';
}

function logMessage(message, type = 'system') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  
  deviceMessages.appendChild(messageElement);
  
  deviceMessages.scrollTop = deviceMessages.scrollHeight;
  
  const messages = deviceMessages.querySelectorAll('.message');
  if (messages.length > 100) {
    deviceMessages.removeChild(messages[0]);
  }
}

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

function startLedBlinking() {
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  
  sendCommand('BT_LED ON');
  
  let ledState = true;
  
  ledBlinkInterval = setInterval(() => {
    ledState = !ledState;
    sendCommand(`BT_LED ${ledState ? 'ON' : 'OFF'}`);
  }, 500);
}

window.addEventListener('beforeunload', () => {
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  window.api.removeAllListeners();
}); 