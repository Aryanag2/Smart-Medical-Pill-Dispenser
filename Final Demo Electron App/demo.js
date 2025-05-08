const scanButton = document.getElementById('scan-button');
const stopScanButton = document.getElementById('stop-scan-button');
const disconnectButton = document.getElementById('disconnect-button');
const devicesList = document.getElementById('devices-list').querySelector('.devices-list-content');

const bleStatus = document.getElementById('ble-status');
const connectionStatus = document.getElementById('connection-status');
const demoMessages = document.getElementById('demo-messages');

const fillButton = document.getElementById('fill-button');
const refillButton = document.getElementById('refill-button');
const scheduleButton = document.getElementById('schedule-button');
const formArea = document.getElementById('form-area');
const scheduleList = document.getElementById('schedule-list');

const compartmentCards = {
  1: document.getElementById('compartment1-card'),
  2: document.getElementById('compartment2-card'),
  3: document.getElementById('compartment3-card')
};

const compartmentInfos = {
  1: document.getElementById('compartment1-info'),
  2: document.getElementById('compartment2-info'),
  3: document.getElementById('compartment3-info')
};

const compartmentCounts = {
  1: document.getElementById('compartment1-count'),
  2: document.getElementById('compartment2-count'),
  3: document.getElementById('compartment3-count')
};

const compartmentWeights = {
  1: document.getElementById('compartment1-weight'),
  2: document.getElementById('compartment2-weight'),
  3: document.getElementById('compartment3-weight')
};

let isConnected = false;
let isScanning = false;
let currentProcess = null; 
let activeCompartment = null;
let selectedMedications = [];
let ledBlinkInterval = null; 

const compartmentData = {
  1: { filled: false, pillName: '', pillCount: 0, pillWeight: 0, maxPillCount: 0 },
  2: { filled: false, pillName: '', pillCount: 0, pillWeight: 0, maxPillCount: 0 },
  3: { filled: false, pillName: '', pillCount: 0, pillWeight: 0, maxPillCount: 0 }
};

let schedules = [];
let nextScheduleId = 1;

// Add a variable to track whether we should auto-scroll
let shouldAutoScroll = true;

// Add an event listener to detect when the user manually scrolls
demoMessages.addEventListener('scroll', function() {
  // If user is near bottom (within 20px), enable auto-scroll
  const scrollPosition = demoMessages.scrollHeight - demoMessages.scrollTop - demoMessages.clientHeight;
  shouldAutoScroll = scrollPosition < 20;
});

function checkDueSchedules() {
  const now = new Date();
  
  const dueSchedules = schedules.filter(schedule => {
    const scheduleTime = new Date(schedule.datetime);
    return scheduleTime <= now;
  });
  
  if (dueSchedules.length > 0) {
    for (let i = 1; i <= 3; i++) {
      sendCommand(`COMP${i}_LED ON`);
    }
    
    dueSchedules.forEach(schedule => {
      logMessage(`It's time for "${schedule.name}" medication!`, 'system');
      
      const scheduleItem = document.querySelector(`.schedule-item[data-id="${schedule.id}"]`);
      if (scheduleItem) {
        scheduleItem.classList.add('due');
      }
    });
    
    if (isConnected) {
      sendCommand('SCHEDULE_DUE:true');
    }
    
    return true;
  }
  
  return false;
}

let scheduleCheckInterval;

function startScheduleChecking() {
  if (!scheduleCheckInterval) {
    const hasDueSchedules = checkDueSchedules();
    if (isConnected) {
      sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
    }
    
    scheduleCheckInterval = setInterval(() => {
      const hasDueSchedules = checkDueSchedules();
      if (isConnected) {
        sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
      }
    }, 60000);
  }
}

function stopScheduleChecking() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = null;
  }
}


scanButton.addEventListener('click', () => {
  startScanning();
});

stopScanButton.addEventListener('click', () => {
  stopScanning();
});

disconnectButton.addEventListener('click', () => {
  disconnectDevice();
});

fillButton.addEventListener('click', () => {
  showFillForm();
});

refillButton.addEventListener('click', () => {
  showRefillForm();
});

scheduleButton.addEventListener('click', () => {
  showScheduleForm();
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
    fillButton.disabled = false;
    updateRefillButtonState();
    updateScheduleButtonState();
    
    clearInterval(ledBlinkInterval);
    sendCommand('BT_LED ON');
    
    sendTimeToDevice();
    
    // Request pill data from ESP32
    sendCommand('REQUEST_PILL_DATA');
    logMessage('Requesting pill data from device...', 'system');
    
    scanButton.disabled = true;
    stopScanButton.disabled = true;
    
    devicesList.innerHTML = '<p class="connected-message">Connected to device. Disconnect to pair with a different device.</p>';
      
    connectionStatus.classList.add('connected');
    
    startScheduleChecking();
  } else {
    isConnected = false;
    disconnectButton.disabled = true;
    fillButton.disabled = true;
    refillButton.disabled = true;
    scheduleButton.disabled = true;
    
    sendCommand('BT_LED OFF');
    
    scanButton.disabled = false;
    
    connectionStatus.classList.remove('connected');
    
    if (!isScanning) {
      devicesList.innerHTML = '<p class="no-devices">No devices found yet. Start scanning to discover devices.</p>';
    }
    
    stopScheduleChecking();
    
    if (currentProcess) {
      cancelCurrentProcess();
    }
    
    currentWeightDisplay.textContent = 'No data';
    postDispenseWeightDisplay.textContent = 'Post-dispense: No data';
    
    calProgressContainer.style.display = 'none';
  }
});

window.api.onDeviceData((data) => {
  logMessage(`Received: ${data}`, 'received');
  
  if (data === 'REQUEST_TIME') {
    sendTimeToDevice();
    return;
  }
  
  if (data === 'REQUEST_SCHEDULES') {
    syncSchedulesToDevice();
    return;
  }
  
  if (data === 'CHECK_SCHEDULES') {
    const hasDueSchedules = checkDueSchedules();
    sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
    logMessage(`Sent schedule status to device: ${hasDueSchedules ? 'Due schedules found' : 'No schedules due'}`, 'system');
    return;
  }
  
  // Handle received pill data
  if (data.startsWith('PILL_DATA:')) {
    try {
      const pillData = JSON.parse(data.substring(10));
      logMessage('Received pill data from device', 'system');
      
      let restoredCompartments = [];
      
      // Update local compartment data with received data
      for (const [compartmentNum, data] of Object.entries(pillData)) {
        if (data && data.filled) {
          compartmentData[compartmentNum] = data;
          updateCompartmentDisplay(parseInt(compartmentNum));
          restoredCompartments.push(compartmentNum);
        }
      }
      
      if (restoredCompartments.length > 0) {
        logMessage(`Restored pill data for compartments: ${restoredCompartments.join(', ')}`, 'system');
      }
      
      updateRefillButtonState();
      updateScheduleButtonState();
    } catch (error) {
      logMessage(`Error parsing pill data: ${error.message}`, 'system');
    }
    return;
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

function logMessage(message, type = 'system') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  
  // Store the current scroll position and check if we're at the bottom
  const isAtBottom = shouldAutoScroll;
  
  demoMessages.appendChild(messageElement);
  
  // Only auto-scroll if the user hasn't scrolled up
  if (isAtBottom) {
    demoMessages.scrollTop = demoMessages.scrollHeight;
  }
  
  const messages = demoMessages.querySelectorAll('.message');
  if (messages.length > 100) {
    demoMessages.removeChild(messages[0]);
  }
}

function updateCompartmentDisplay(compartmentNumber) {
  const data = compartmentData[compartmentNumber];
  const card = compartmentCards[compartmentNumber];
  const info = compartmentInfos[compartmentNumber];
  const count = compartmentCounts[compartmentNumber];
  const weight = compartmentWeights[compartmentNumber];
  
  card.className = 'compartment-card';
  if (data.filled) {
    card.classList.add('filled');
    const minPillThreshold = 2;
    const percentThreshold = Math.floor(data.maxPillCount * 0.1);
    const lowThreshold = Math.max(minPillThreshold, percentThreshold);
    
    if (data.pillCount === 0 || data.pillCount <= lowThreshold) {
      card.classList.add('low');
      
      if (isConnected && data.pillCount > 0) {
        sendCommand('REFILL_LED ON');
      }
    } else {
      if (isConnected && !isCompartmentLow()) {
        sendCommand('REFILL_LED OFF');
      }
    }
  } else {
    card.classList.add('empty');
  }
  
  if (data.filled) {
    info.textContent = data.pillName;
    count.textContent = `Pills: ${data.pillCount}`;
    weight.textContent = `Weight per pill: ${data.pillWeight}g`;
  } else {
    info.textContent = 'Empty';
    count.textContent = '';
    weight.textContent = '';
  }
}

function isCompartmentLow() {
  for (let i = 1; i <= 3; i++) {
    const data = compartmentData[i];
    if (data.filled && data.pillCount > 0) {
      const minPillThreshold = 2;
      const percentThreshold = Math.floor(data.maxPillCount * 0.1);
      const lowThreshold = Math.max(minPillThreshold, percentThreshold);
      
      if (data.pillCount <= lowThreshold) {
        return true;
      }
    }
  }
  return false;
}

function updateRefillButtonState() {
  const hasFilledCompartment = Object.values(compartmentData).some(data => data.filled);
  refillButton.disabled = !isConnected || !hasFilledCompartment;
}

function updateScheduleButtonState() {
  const hasFilledCompartment = Object.values(compartmentData).some(data => data.filled);
  scheduleButton.disabled = !isConnected || !hasFilledCompartment;
}


function showFillForm() {
  currentProcess = 'fill';
  
  const availableCompartments = [];
  for (let i = 1; i <= 3; i++) {
    if (!compartmentData[i].filled) {
      availableCompartments.push(i);
    }
  }
  
  if (availableCompartments.length === 0) {
    logMessage('No empty compartments available for filling', 'system');
    return;
  }
  
  const formHTML = `
    <h3 class="form-title">Fill Compartment</h3>
    <div class="form-group">
      <label for="fill-compartment">Select Compartment:</label>
      <select id="fill-compartment" class="form-select">
        ${availableCompartments.map(num => `<option value="${num}">Compartment ${num}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="pill-name">Pill Name:</label>
      <input type="text" id="pill-name" class="form-control" placeholder="e.g., Aspirin" required>
    </div>
    <div class="form-group">
      <label for="pill-count">Number of Pills:</label>
      <input type="number" id="pill-count" class="form-control" min="1" max="100" value="20" required>
    </div>
    <div class="form-group">
      <label for="pill-weight">Weight per Pill (g):</label>
      <input type="number" id="pill-weight" class="form-control" min="0.01" step="0.01" value="0.5" required>
    </div>
    <div class="form-action">
      <button id="cancel-fill" class="form-cancel">Cancel</button>
      <button id="begin-fill" class="form-submit">Begin Filling</button>
    </div>
  `;
  
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  document.getElementById('cancel-fill').addEventListener('click', () => {
    cancelCurrentProcess();
  });
  
  document.getElementById('begin-fill').addEventListener('click', () => {
    const compartmentNumber = parseInt(document.getElementById('fill-compartment').value);
    const pillName = document.getElementById('pill-name').value.trim();
    const pillCount = parseInt(document.getElementById('pill-count').value);
    const pillWeight = parseFloat(document.getElementById('pill-weight').value);
    
    if (!pillName) {
      logMessage('Please enter a pill name', 'system');
      return;
    }
    
    if (isNaN(pillCount) || pillCount < 1) {
      logMessage('Please enter a valid number of pills', 'system');
      return;
    }
    
    if (isNaN(pillWeight) || pillWeight <= 0) {
      logMessage('Please enter a valid pill weight', 'system');
      return;
    }
    
    beginFilling(compartmentNumber, pillName, pillCount, pillWeight);
  });
}

function beginFilling(compartmentNumber, pillName, pillCount, pillWeight) {
  activeCompartment = compartmentNumber;
  
  const processingHTML = `
    <div class="filling-process">
      <h3 class="process-title">Filling Compartment ${compartmentNumber}</h3>
      <p class="process-instruction">
        Please place <strong>${pillCount} ${pillName}</strong> pills in 
        <span class="process-compartment">Compartment ${compartmentNumber}</span>
      </p>
      <p>The compartment LED will be lit during filling.</p>
      <div class="process-buttons">
        <button id="cancel-filling" class="form-cancel">Cancel</button>
        <button id="complete-filling" class="form-submit">Filling Complete</button>
      </div>
    </div>
  `;
  
  formArea.innerHTML = processingHTML;
  
  sendCommand(`COMP${compartmentNumber}_LED ON`);
  logMessage(`Beginning filling process for Compartment ${compartmentNumber}`, 'system');
  
  document.getElementById('cancel-filling').addEventListener('click', () => {
    sendCommand(`COMP${compartmentNumber}_LED OFF`);
    cancelCurrentProcess();
  });
  
  document.getElementById('complete-filling').addEventListener('click', () => {
    completeFilling(compartmentNumber, pillName, pillCount, pillWeight);
  });
}

function completeFilling(compartmentNumber, pillName, pillCount, pillWeight) {
  blinkCompartmentLED(compartmentNumber, 2)
    .then(() => {
      compartmentData[compartmentNumber] = {
        filled: true,
        pillName,
        pillCount,
        pillWeight,
        maxPillCount: pillCount 
      };
      
      updateCompartmentDisplay(compartmentNumber);
      updateRefillButtonState();
      updateScheduleButtonState();
      
      // Save pill data to ESP32
      if (isConnected) {
        savePillDataToDevice();
      }
      
      activeCompartment = null;
      currentProcess = null;
      formArea.innerHTML = '';
      formArea.classList.remove('active');
      
      logMessage(`Successfully filled Compartment ${compartmentNumber} with ${pillCount} ${pillName} pills`, 'system');
    });
}


function showRefillForm() {
  currentProcess = 'refill';
  
  const filledCompartments = [];
  for (let i = 1; i <= 3; i++) {
    if (compartmentData[i].filled) {
      filledCompartments.push(i);
    }
  }
  
  const formHTML = `
    <h3 class="form-title">Refill Compartment</h3>
    <div class="form-group">
      <label for="refill-compartment">Select Compartment:</label>
      <select id="refill-compartment" class="form-select">
        ${filledCompartments.map(num => 
          `<option value="${num}">Compartment ${num} (${compartmentData[num].pillName})</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="refill-count">Number of Pills to Add:</label>
      <input type="number" id="refill-count" class="form-control" min="1" max="100" value="10" required>
    </div>
    <div class="form-action">
      <button id="cancel-refill" class="form-cancel">Cancel</button>
      <button id="begin-refill" class="form-submit">Begin Refilling</button>
    </div>
  `;
  
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  document.getElementById('cancel-refill').addEventListener('click', () => {
    cancelCurrentProcess();
  });
  
  document.getElementById('begin-refill').addEventListener('click', () => {
    const compartmentNumber = parseInt(document.getElementById('refill-compartment').value);
    const additionalPills = parseInt(document.getElementById('refill-count').value);
    
    if (isNaN(additionalPills) || additionalPills < 1) {
      logMessage('Please enter a valid number of pills to add', 'system');
      return;
    }
    
    beginRefilling(compartmentNumber, additionalPills);
  });
}

function beginRefilling(compartmentNumber, additionalPills) {
  activeCompartment = compartmentNumber;
  const { pillName } = compartmentData[compartmentNumber];
  
  const processingHTML = `
    <div class="filling-process">
      <h3 class="process-title">Refilling Compartment ${compartmentNumber}</h3>
      <p class="process-instruction">
        Please add <strong>${additionalPills} more ${pillName}</strong> pills to 
        <span class="process-compartment">Compartment ${compartmentNumber}</span>
      </p>
      <p>The compartment LED will be lit during refilling.</p>
      <div class="process-buttons">
        <button id="cancel-refilling" class="form-cancel">Cancel</button>
        <button id="complete-refilling" class="form-submit">Refilling Complete</button>
      </div>
    </div>
  `;
  
  formArea.innerHTML = processingHTML;
  
  sendCommand(`COMP${compartmentNumber}_LED ON`);
  sendCommand(`REFILL_LED ON`);
  logMessage(`Beginning refilling process for Compartment ${compartmentNumber}`, 'system');
  
  document.getElementById('cancel-refilling').addEventListener('click', () => {
    sendCommand(`COMP${compartmentNumber}_LED OFF`);
    sendCommand(`REFILL_LED OFF`);
    cancelCurrentProcess();
  });
  
  document.getElementById('complete-refilling').addEventListener('click', () => {
    completeRefilling(compartmentNumber, additionalPills);
  });
}

function completeRefilling(compartmentNumber, additionalPills) {
  blinkCompartmentLED(compartmentNumber, 2)
    .then(() => {
      sendCommand(`REFILL_LED OFF`);
      
      compartmentData[compartmentNumber].pillCount += additionalPills;
      
      if (compartmentData[compartmentNumber].pillCount > compartmentData[compartmentNumber].maxPillCount) {
        compartmentData[compartmentNumber].maxPillCount = compartmentData[compartmentNumber].pillCount;
      }
      
      updateCompartmentDisplay(compartmentNumber);
      
      // Save updated pill data to ESP32
      if (isConnected) {
        savePillDataToDevice();
      }
      
      activeCompartment = null;
      currentProcess = null;
      formArea.innerHTML = '';
      formArea.classList.remove('active');
      
      logMessage(`Successfully added ${additionalPills} ${compartmentData[compartmentNumber].pillName} pills to Compartment ${compartmentNumber}`, 'system');
    });
}

function showScheduleForm() {
  currentProcess = 'schedule';
  selectedMedications = [];
  
  const availableMedications = [];
  for (let i = 1; i <= 3; i++) {
    if (compartmentData[i].filled) {
      availableMedications.push({
        compartment: i,
        name: compartmentData[i].pillName,
        available: compartmentData[i].pillCount
      });
    }
  }
  
  const formHTML = `
    <h3 class="form-title">Schedule Medication</h3>
    <div class="form-group">
      <label for="schedule-name">Schedule Name:</label>
      <input type="text" id="schedule-name" class="form-control" placeholder="e.g., Morning Medication" required>
    </div>
    <div class="form-group">
      <label for="schedule-date">Date:</label>
      <input type="date" id="schedule-date" class="form-control" required>
    </div>
    <div class="form-group">
      <label for="schedule-time">Time:</label>
      <input type="time" id="schedule-time" class="form-control" required>
    </div>
    
    <div class="medication-selection">
      <h4>Select Medications</h4>
      <div class="form-group">
        <label for="medication-select">Available Medications:</label>
        <select id="medication-select" class="form-select">
          ${availableMedications.map(med => 
            `<option value="${med.compartment}">${med.name} (${med.available} pills available)</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="medication-quantity">Quantity:</label>
        <input type="number" id="medication-quantity" class="form-control" min="1" value="1" required>
      </div>
      <button id="add-medication" class="add-medication-btn">Add Medication</button>
      
      <div class="selected-medications" id="selected-medications">
        <p class="no-selected-meds">No medications selected yet.</p>
      </div>
    </div>
    
    <div class="form-action">
      <button id="cancel-schedule" class="form-cancel">Cancel</button>
      <button id="create-schedule" class="form-submit">Create Schedule</button>
    </div>
  `;
  
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  const today = new Date();
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = today.toISOString().split('T')[0];
  
  const nextHour = new Date(today.getTime() + 60 * 60 * 1000);
  const timeInput = document.getElementById('schedule-time');
  timeInput.value = nextHour.getHours().toString().padStart(2, '0') + ':' + 
                    nextHour.getMinutes().toString().padStart(2, '0');
  
  document.getElementById('cancel-schedule').addEventListener('click', () => {
    cancelCurrentProcess();
  });
  
  document.getElementById('add-medication').addEventListener('click', () => {
    addMedicationToSchedule();
  });
  
  document.getElementById('create-schedule').addEventListener('click', () => {
    createSchedule();
  });
}

function addMedicationToSchedule() {
  const medicationSelect = document.getElementById('medication-select');
  const quantityInput = document.getElementById('medication-quantity');
  const selectedMedsContainer = document.getElementById('selected-medications');
  
  const compartmentNum = parseInt(medicationSelect.value);
  const quantity = parseInt(quantityInput.value);
  
  if (isNaN(quantity) || quantity < 1) {
    logMessage('Please enter a valid quantity', 'system');
    return;
  }
  
  const availablePills = compartmentData[compartmentNum].pillCount;
  if (quantity > availablePills) {
    logMessage(`Not enough pills available. Only ${availablePills} ${compartmentData[compartmentNum].pillName} pills remaining.`, 'system');
    return;
  }
  
  const existingMedIndex = selectedMedications.findIndex(med => med.compartment === compartmentNum);
  if (existingMedIndex !== -1) {
    selectedMedications[existingMedIndex].quantity += quantity;
  } else {
    selectedMedications.push({
      compartment: compartmentNum,
      name: compartmentData[compartmentNum].pillName,
      quantity: quantity
    });
  }
  
  updateSelectedMedicationsDisplay();
}

function updateSelectedMedicationsDisplay() {
  const selectedMedsContainer = document.getElementById('selected-medications');
  
  if (selectedMedications.length === 0) {
    selectedMedsContainer.innerHTML = '<p class="no-selected-meds">No medications selected yet.</p>';
    return;
  }
  
  let html = '';
  selectedMedications.forEach((med, index) => {
    html += `
      <div class="selected-medication" data-index="${index}">
        <span class="selected-medication-name">${med.name}</span>
        <span class="selected-medication-quantity">
          <input type="number" class="medication-quantity" value="${med.quantity}" 
                 min="1" max="${compartmentData[med.compartment].pillCount}" 
                 data-index="${index}" onchange="updateMedicationQuantity(${index}, this.value)">
        </span>
        <button class="remove-medication" onclick="removeMedication(${index})">Remove</button>
      </div>
    `;
  });
  
  selectedMedsContainer.innerHTML = html;
  
  document.querySelectorAll('.medication-quantity').forEach(input => {
    input.addEventListener('change', (event) => {
      const index = parseInt(event.target.dataset.index);
      const newQuantity = parseInt(event.target.value);
      updateMedicationQuantity(index, newQuantity);
    });
  });
  
  document.querySelectorAll('.remove-medication').forEach(button => {
    button.addEventListener('click', (event) => {
      const index = parseInt(event.target.parentElement.dataset.index);
      removeMedication(index);
    });
  });
}

function updateMedicationQuantity(index, newQuantity) {
  newQuantity = parseInt(newQuantity);
  
  if (isNaN(newQuantity) || newQuantity < 1) {
    logMessage('Please enter a valid quantity', 'system');
    updateSelectedMedicationsDisplay(); 
    return;
  }
  
  const compartmentNum = selectedMedications[index].compartment;
  const availablePills = compartmentData[compartmentNum].pillCount;
  
  if (newQuantity > availablePills) {
    logMessage(`Not enough pills available. Only ${availablePills} ${compartmentData[compartmentNum].pillName} pills remaining.`, 'system');
    updateSelectedMedicationsDisplay(); 
    return;
  }
  
  selectedMedications[index].quantity = newQuantity;
  updateSelectedMedicationsDisplay();
}

function removeMedication(index) {
  selectedMedications.splice(index, 1);
  updateSelectedMedicationsDisplay();
}

function createSchedule() {
  const scheduleName = document.getElementById('schedule-name').value.trim();
  const scheduleDate = document.getElementById('schedule-date').value;
  const scheduleTime = document.getElementById('schedule-time').value;
  
  if (!scheduleName) {
    logMessage('Please enter a schedule name', 'system');
    return;
  }
  
  if (!scheduleDate) {
    logMessage('Please select a date', 'system');
    return;
  }
  
  if (!scheduleTime) {
    logMessage('Please select a time', 'system');
    return;
  }
  
  if (selectedMedications.length === 0) {
    logMessage('Please add at least one medication to the schedule', 'system');
    return;
  }
  
  const scheduleDatetime = new Date(`${scheduleDate}T${scheduleTime}`);
  
  const schedule = {
    id: nextScheduleId++,
    name: scheduleName,
    datetime: scheduleDatetime,
    medications: JSON.parse(JSON.stringify(selectedMedications)), 
    active: true,
    created: new Date(),
    recurring: true, 
    lastDispensed: null
  };
  
  schedules.push(schedule);
  
  updateSchedulesDisplay();
  
  currentProcess = null;
  formArea.innerHTML = '';
  formArea.classList.remove('active');
  selectedMedications = [];
  
  logMessage(`Schedule "${scheduleName}" created for ${formatDate(scheduleDatetime)}`, 'system');
  
  if (isConnected) {
    const hour = scheduleDatetime.getHours();
    const minute = scheduleDatetime.getMinutes();
    const daysOfWeek = 0x7F; 
    
    sendCommand(`ADD_SCHEDULE:${schedule.id},${hour},${minute},${daysOfWeek}`);
    logMessage(`Sent new schedule to device: ${scheduleName} at ${hour}:${minute}`, 'system');
  }
  
  checkDueSchedules();
}

function updateSchedulesDisplay() {
  if (schedules.length === 0) {
    scheduleList.innerHTML = '<p class="no-schedules">No scheduled medications. Create a schedule to get started.</p>';
    return;
  }
  
  const sortedSchedules = [...schedules].sort((a, b) => a.datetime - b.datetime);
  
  let html = '';
  sortedSchedules.forEach(schedule => {
    const totalPills = schedule.medications.reduce((sum, med) => sum + med.quantity, 0);
    
    const isDue = new Date(schedule.datetime) <= new Date();
    const dueClass = isDue ? 'due' : '';
    
    const lastDispensedInfo = schedule.lastDispensed ? 
      `<div class="schedule-last-dispensed">Last taken: ${formatDate(new Date(schedule.lastDispensed))}</div>` : '';
    
    const disabledAttr = !isConnected ? 'disabled' : '';
    
    html += `
      <div class="schedule-item ${dueClass}" data-id="${schedule.id}">
        <div class="schedule-info">
          <div class="schedule-title">${schedule.name}</div>
          <div class="schedule-datetime">${formatDate(new Date(schedule.datetime))}</div>
          ${lastDispensedInfo}
          <div class="schedule-pills">
            ${schedule.medications.map(med => 
              `<span class="schedule-pill">${med.name} (${med.quantity})</span>`
            ).join('')}
            <span class="schedule-pill">Total: ${totalPills} pills</span>
          </div>
        </div>
        <div class="schedule-actions">
          <button class="schedule-delete" data-id="${schedule.id}" ${disabledAttr}>Delete</button>
          <button class="schedule-activate" data-id="${schedule.id}" ${disabledAttr} ${isDue ? 'style="background-color: #e74c3c;"' : ''}>
            ${isDue ? 'Take Now' : 'Dispense'}
          </button>
        </div>
      </div>
    `;
  });
  
  scheduleList.innerHTML = html;
  
  document.querySelectorAll('.schedule-delete').forEach(button => {
    button.addEventListener('click', (event) => {
      if (!isConnected || event.target.disabled) return;
      
      const id = parseInt(event.target.dataset.id);
      deleteSchedule(id);
    });
  });
  
  document.querySelectorAll('.schedule-activate').forEach(button => {
    button.addEventListener('click', (event) => {
      if (!isConnected || event.target.disabled) return;
      
      const id = parseInt(event.target.dataset.id);
      activateSchedule(id);
    });
  });
}

function deleteSchedule(id) {
  const scheduleIndex = schedules.findIndex(s => s.id === id);
  if (scheduleIndex !== -1) {
    const scheduleName = schedules[scheduleIndex].name;
    
    if (isConnected) {
      schedules.splice(scheduleIndex, 1);
      syncSchedulesToDevice();
    } else {
      schedules.splice(scheduleIndex, 1);
    }
    
    updateSchedulesDisplay();
    logMessage(`Schedule "${scheduleName}" deleted`, 'system');
  }
}

function updateRefillLEDStatus() {
  if (isConnected) {
    if (isCompartmentLow()) {
      sendCommand('REFILL_LED ON');
    } else {
      sendCommand('REFILL_LED OFF');
    }
  }
}

async function activateSchedule(id) {
  if (!isConnected) {
    logMessage('Cannot dispense medication. Device not connected.', 'system');
    return;
  }
  
  if (isDispensing) {
    logMessage('Already dispensing medications. Please wait.', 'system');
    return;
  }
  
  isDispensing = true;
  
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) {
    isDispensing = false;
    return;
  }
  
  logMessage(`Activating schedule "${schedule.name}"...`, 'system');
  
  try {
    for (let i = 1; i <= 3; i++) {
      await sendCommand(`COMP${i}_LED OFF`);
    }
    
    await runLedAnimation();
    
    const totalPills = schedule.medications.reduce((sum, med) => sum + med.quantity, 0);
    logMessage(`Dispensing a total of ${totalPills} pills...`, 'system');
    
    for (const med of schedule.medications) {
      const compartmentNum = med.compartment;
      
      if (compartmentData[compartmentNum].pillCount < med.quantity) {
        logMessage(`Warning: Not enough ${med.name} pills in Compartment ${compartmentNum}!`, 'system');
        continue;
      }
      
      logMessage(`Dispensing ${med.quantity} ${med.name} pills from Compartment ${compartmentNum}`, 'system');
      
      // Save the current pill count
      const previousCount = compartmentData[compartmentNum].pillCount;
      
      for (let i = 0; i < med.quantity; i++) {
        await sendCommand(`COMP${compartmentNum}_LED ON`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await simulateServoDispense(compartmentNum);
        
        await sendCommand(`COMP${compartmentNum}_LED OFF`);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        compartmentData[compartmentNum].pillCount--;
        
        // Update UI after each pill dispensed
        updateCompartmentDisplay(compartmentNum);
        
        updateRefillLEDStatus();
      }
      
      if (compartmentData[compartmentNum].pillCount <= 0) {
        compartmentData[compartmentNum].filled = false;
        compartmentData[compartmentNum].pillCount = 0;
        logMessage(`Compartment ${compartmentNum} is now empty`, 'system');
      }
      
      // If pill count changed, save to device
      if (previousCount !== compartmentData[compartmentNum].pillCount) {
        savePillDataToDevice();
      }
    }
    
    // Save updated pill counts to ESP32
    if (isConnected) {
      savePillDataToDevice();
    }
    
    updateRefillLEDStatus();
    
    schedule.lastDispensed = new Date();
    
    if (schedule.recurring) {
      const nextOccurrence = new Date(schedule.datetime);
      nextOccurrence.setDate(nextOccurrence.getDate() + 1);
      schedule.datetime = nextOccurrence;
      
      logMessage(`Schedule "${schedule.name}" updated for next occurrence: ${formatDate(nextOccurrence)}`, 'system');
    }
    
    updateSchedulesDisplay();
    
    updateRefillButtonState();
    updateScheduleButtonState();
    
    logMessage(`Schedule "${schedule.name}" completed`, 'system');
  } catch (error) {
    logMessage(`Error during dispensing: ${error.message}`, 'system');
  } finally {
    isDispensing = false;
  }
}

let isDispensing = false;

async function simulateServoDispense(compartmentNum) {
  logMessage(`Opening compartment ${compartmentNum} servo...`, 'system');
  await sendCommand(`SERVO${compartmentNum} OPEN`);
  await new Promise(resolve => setTimeout(resolve, 1000)); 
  
  logMessage(`Closing compartment ${compartmentNum} servo...`, 'system');
  await sendCommand(`SERVO${compartmentNum} CLOSE`);
  await new Promise(resolve => setTimeout(resolve, 1000)); 
  return true;
}

async function runLedAnimation() {
  for (let i = 1; i <= 3; i++) {
    await sendCommand(`COMP${i}_LED ON`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    await sendCommand(`COMP${i}_LED OFF`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}


function formatDate(date) {
  const options = { 
    weekday: 'short',
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString('en-US', options);
}

async function blinkCompartmentLED(compartmentNumber, times) {
  for (let i = 0; i < times; i++) {
    await sendCommand(`COMP${compartmentNumber}_LED OFF`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await sendCommand(`COMP${compartmentNumber}_LED ON`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return sendCommand(`COMP${compartmentNumber}_LED OFF`);
}

function cancelCurrentProcess() {
  if (activeCompartment) {
    sendCommand(`COMP${activeCompartment}_LED OFF`);
    activeCompartment = null;
  }
  
  if (currentProcess === 'refill') {
    sendCommand(`REFILL_LED OFF`);
  }
  
  currentProcess = null;
  formArea.innerHTML = '';
  formArea.classList.remove('active');
  selectedMedications = [];
  
  logMessage('Process cancelled', 'system');
}

function initializeUI() {
  for (let i = 1; i <= 3; i++) {
    updateCompartmentDisplay(i);
  }
  
  updateRefillButtonState();
  updateScheduleButtonState();
  
  updateSchedulesDisplay();
}

window.addEventListener('DOMContentLoaded', initializeUI);

if (isConnected) {
  startScheduleChecking();
}

window.addEventListener('beforeunload', () => {
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  stopScheduleChecking();
  window.api.removeAllListeners();
});

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

function syncSchedulesToDevice() {
  if (!isConnected) return;
  
  sendCommand('CLEAR_SCHEDULES');
  logMessage('Clearing device schedules...', 'system');
  
  setTimeout(() => {
    schedules.forEach(schedule => {
      const scheduleTime = new Date(schedule.datetime);
      const hour = scheduleTime.getHours();
      const minute = scheduleTime.getMinutes();
      

      const daysOfWeek = 0x7F; 
      
      sendCommand(`ADD_SCHEDULE:${schedule.id},${hour},${minute},${daysOfWeek}`);
      logMessage(`Sent schedule to device: ${schedule.name} at ${hour}:${minute}`, 'system');
    });
    
    logMessage(`Synchronized ${schedules.length} schedules with device`, 'system');
  }, 500);
}

// Add function to save pill data to device
function savePillDataToDevice() {
  if (!isConnected) return;
  
  try {
    const pillDataJson = JSON.stringify(compartmentData);
    sendCommand(`SAVE_PILL_DATA:${pillDataJson}`);
    logMessage('Saved pill data to device', 'system');
  } catch (error) {
    logMessage(`Error saving pill data: ${error.message}`, 'system');
  }
} 