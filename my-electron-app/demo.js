// DOM Elements - Connection controls (shared with main page)
const scanButton = document.getElementById('scan-button');
const stopScanButton = document.getElementById('stop-scan-button');
const disconnectButton = document.getElementById('disconnect-button');
const devicesList = document.getElementById('devices-list').querySelector('.devices-list-content');

// Status elements
const bleStatus = document.getElementById('ble-status');
const connectionStatus = document.getElementById('connection-status');
const demoMessages = document.getElementById('demo-messages');

// Demo-specific elements
const fillButton = document.getElementById('fill-button');
const refillButton = document.getElementById('refill-button');
const scheduleButton = document.getElementById('schedule-button');
const formArea = document.getElementById('form-area');
const scheduleList = document.getElementById('schedule-list');

// Compartment info elements
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

// State tracking
let isConnected = false;
let isScanning = false;
let currentProcess = null; // 'fill', 'refill', or 'schedule'
let activeCompartment = null;
let selectedMedications = [];
let ledBlinkInterval = null; // Track LED blinking interval

// Pill inventory data
const compartmentData = {
  1: { filled: false, pillName: '', pillCount: 0, pillWeight: 0 },
  2: { filled: false, pillName: '', pillCount: 0, pillWeight: 0 },
  3: { filled: false, pillName: '', pillCount: 0, pillWeight: 0 }
};

// Schedule data
let schedules = [];
let nextScheduleId = 1;

// Check for due schedules
function checkDueSchedules() {
  const now = new Date();
  
  // Find schedules that are due
  const dueSchedules = schedules.filter(schedule => {
    const scheduleTime = new Date(schedule.datetime);
    // Check if the scheduled time is in the past
    return scheduleTime <= now;
  });
  
  if (dueSchedules.length > 0) {
    // Light up all compartment LEDs to signal it's time to take medication
    for (let i = 1; i <= 3; i++) {
      sendCommand(`COMP${i}_LED ON`);
    }
    
    // Update UI to show due schedules
    dueSchedules.forEach(schedule => {
      logMessage(`It's time for "${schedule.name}" medication!`, 'system');
      
      // Find the schedule item in the DOM and highlight it
      const scheduleItem = document.querySelector(`.schedule-item[data-id="${schedule.id}"]`);
      if (scheduleItem) {
        scheduleItem.classList.add('due');
      }
    });
    
    // Notify the device that schedules are due
    if (isConnected) {
      sendCommand('SCHEDULE_DUE:true');
    }
    
    return true;
  }
  
  return false;
}

// Set up interval to check for due schedules
let scheduleCheckInterval;

// Start schedule checking
function startScheduleChecking() {
  if (!scheduleCheckInterval) {
    // Check immediately and then every minute
    const hasDueSchedules = checkDueSchedules();
    // Initial notification to device
    if (isConnected) {
      sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
    }
    
    scheduleCheckInterval = setInterval(() => {
      const hasDueSchedules = checkDueSchedules();
      // Only send updates when connected
      if (isConnected) {
        sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
      }
    }, 60000);
  }
}

// Stop schedule checking
function stopScheduleChecking() {
  if (scheduleCheckInterval) {
    clearInterval(scheduleCheckInterval);
    scheduleCheckInterval = null;
  }
}

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

// Fill button
fillButton.addEventListener('click', () => {
  showFillForm();
});

// Refill button
refillButton.addEventListener('click', () => {
  showRefillForm();
});

// Schedule button
scheduleButton.addEventListener('click', () => {
  showScheduleForm();
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
    fillButton.disabled = false;
    updateRefillButtonState();
    updateScheduleButtonState();
    
    // Stop blinking and turn on bluetooth LED solid when connected
    clearInterval(ledBlinkInterval);
    sendCommand('BT_LED ON');
    
    // Sync time with the device
    sendTimeToDevice();
    
    // Disable scanning when connected
    scanButton.disabled = true;
    stopScanButton.disabled = true;
    
    // Clear device list and show connected message
    devicesList.innerHTML = '<p class="connected-message">Connected to device. Disconnect to pair with a different device.</p>';
      
    // Add connected status class to status bar for visual indication
    connectionStatus.classList.add('connected');
    
    // Start checking for due schedules
    startScheduleChecking();
  } else {
    isConnected = false;
    disconnectButton.disabled = true;
    fillButton.disabled = true;
    refillButton.disabled = true;
    scheduleButton.disabled = true;
    
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
    
    // Stop checking for due schedules
    stopScheduleChecking();
    
    // Reset any ongoing process
    if (currentProcess) {
      cancelCurrentProcess();
    }
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
  
  if (data === 'REQUEST_SCHEDULES') {
    // Send all schedules to the device
    syncSchedulesToDevice();
    return;
  }
  
  if (data === 'CHECK_SCHEDULES') {
    // Check if there are any due schedules and notify the device
    const hasDueSchedules = checkDueSchedules();
    sendCommand(`SCHEDULE_DUE:${hasDueSchedules}`);
    logMessage(`Sent schedule status to device: ${hasDueSchedules ? 'Due schedules found' : 'No schedules due'}`, 'system');
    return;
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

// Log a message to the message log
function logMessage(message, type = 'system') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  
  demoMessages.appendChild(messageElement);
  
  // Auto-scroll to bottom
  demoMessages.scrollTop = demoMessages.scrollHeight;
  
  // Limit number of messages (keep last 100)
  const messages = demoMessages.querySelectorAll('.message');
  if (messages.length > 100) {
    demoMessages.removeChild(messages[0]);
  }
}

// Update compartment display
function updateCompartmentDisplay(compartmentNumber) {
  const data = compartmentData[compartmentNumber];
  const card = compartmentCards[compartmentNumber];
  const info = compartmentInfos[compartmentNumber];
  const count = compartmentCounts[compartmentNumber];
  const weight = compartmentWeights[compartmentNumber];
  
  // Update classes
  card.className = 'compartment-card';
  if (data.filled) {
    card.classList.add('filled');
    // If less than 25% of pills remain, mark as low
    if (data.pillCount <= 5) {
      card.classList.add('low');
    }
  } else {
    card.classList.add('empty');
  }
  
  // Update content
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

// Update the state of the refill button based on compartment status
function updateRefillButtonState() {
  // Enable refill button only if at least one compartment is filled
  const hasFilledCompartment = Object.values(compartmentData).some(data => data.filled);
  refillButton.disabled = !isConnected || !hasFilledCompartment;
}

// Update the state of the schedule button based on compartment status
function updateScheduleButtonState() {
  // Enable schedule button only if at least one compartment is filled
  const hasFilledCompartment = Object.values(compartmentData).some(data => data.filled);
  scheduleButton.disabled = !isConnected || !hasFilledCompartment;
}

// ========== Fill Compartment Process ==========

// Show the fill compartment form
function showFillForm() {
  currentProcess = 'fill';
  
  // Get available (empty) compartments
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
  
  // Create the form HTML
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
  
  // Set the form content and show it
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  // Add event listeners to the form buttons
  document.getElementById('cancel-fill').addEventListener('click', () => {
    cancelCurrentProcess();
  });
  
  document.getElementById('begin-fill').addEventListener('click', () => {
    const compartmentNumber = parseInt(document.getElementById('fill-compartment').value);
    const pillName = document.getElementById('pill-name').value.trim();
    const pillCount = parseInt(document.getElementById('pill-count').value);
    const pillWeight = parseFloat(document.getElementById('pill-weight').value);
    
    // Validate inputs
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
    
    // Start the filling process
    beginFilling(compartmentNumber, pillName, pillCount, pillWeight);
  });
}

// Begin the filling process
function beginFilling(compartmentNumber, pillName, pillCount, pillWeight) {
  activeCompartment = compartmentNumber;
  
  // Update the form area with filling instructions
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
  
  // Light up the corresponding compartment LED
  sendCommand(`COMP${compartmentNumber}_LED ON`);
  logMessage(`Beginning filling process for Compartment ${compartmentNumber}`, 'system');
  
  // Add event listeners
  document.getElementById('cancel-filling').addEventListener('click', () => {
    sendCommand(`COMP${compartmentNumber}_LED OFF`);
    cancelCurrentProcess();
  });
  
  document.getElementById('complete-filling').addEventListener('click', () => {
    completeFilling(compartmentNumber, pillName, pillCount, pillWeight);
  });
}

// Complete the filling process
function completeFilling(compartmentNumber, pillName, pillCount, pillWeight) {
  // Blink LED twice and then turn off
  blinkCompartmentLED(compartmentNumber, 2)
    .then(() => {
      // Update compartment data
      compartmentData[compartmentNumber] = {
        filled: true,
        pillName,
        pillCount,
        pillWeight
      };
      
      // Update display
      updateCompartmentDisplay(compartmentNumber);
      updateRefillButtonState();
      updateScheduleButtonState();
      
      // Clean up
      activeCompartment = null;
      currentProcess = null;
      formArea.innerHTML = '';
      formArea.classList.remove('active');
      
      logMessage(`Successfully filled Compartment ${compartmentNumber} with ${pillCount} ${pillName} pills`, 'system');
    });
}

// ========== Refill Compartment Process ==========

// Show the refill compartment form
function showRefillForm() {
  currentProcess = 'refill';
  
  // Get filled compartments
  const filledCompartments = [];
  for (let i = 1; i <= 3; i++) {
    if (compartmentData[i].filled) {
      filledCompartments.push(i);
    }
  }
  
  // Create the form HTML
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
  
  // Set the form content and show it
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  // Add event listeners to the form buttons
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
    
    // Start the refilling process
    beginRefilling(compartmentNumber, additionalPills);
  });
}

// Begin the refilling process
function beginRefilling(compartmentNumber, additionalPills) {
  activeCompartment = compartmentNumber;
  const { pillName } = compartmentData[compartmentNumber];
  
  // Update the form area with refilling instructions
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
  
  // Light up the corresponding compartment LED
  sendCommand(`COMP${compartmentNumber}_LED ON`);
  logMessage(`Beginning refilling process for Compartment ${compartmentNumber}`, 'system');
  
  // Add event listeners
  document.getElementById('cancel-refilling').addEventListener('click', () => {
    sendCommand(`COMP${compartmentNumber}_LED OFF`);
    cancelCurrentProcess();
  });
  
  document.getElementById('complete-refilling').addEventListener('click', () => {
    completeRefilling(compartmentNumber, additionalPills);
  });
}

// Complete the refilling process
function completeRefilling(compartmentNumber, additionalPills) {
  // Blink LED twice and then turn off
  blinkCompartmentLED(compartmentNumber, 2)
    .then(() => {
      // Update compartment data
      compartmentData[compartmentNumber].pillCount += additionalPills;
      
      // Update display
      updateCompartmentDisplay(compartmentNumber);
      
      // Clean up
      activeCompartment = null;
      currentProcess = null;
      formArea.innerHTML = '';
      formArea.classList.remove('active');
      
      logMessage(`Successfully added ${additionalPills} ${compartmentData[compartmentNumber].pillName} pills to Compartment ${compartmentNumber}`, 'system');
    });
}

// ========== Schedule Functionality ==========

// Show the schedule form
function showScheduleForm() {
  currentProcess = 'schedule';
  selectedMedications = [];
  
  // Get available medications (from filled compartments)
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
  
  // Create the form HTML
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
  
  // Set the form content and show it
  formArea.innerHTML = formHTML;
  formArea.classList.add('active');
  
  // Set default date to today
  const today = new Date();
  const dateInput = document.getElementById('schedule-date');
  dateInput.value = today.toISOString().split('T')[0];
  
  // Set default time to now + 1 hour
  const nextHour = new Date(today.getTime() + 60 * 60 * 1000);
  const timeInput = document.getElementById('schedule-time');
  timeInput.value = nextHour.getHours().toString().padStart(2, '0') + ':' + 
                    nextHour.getMinutes().toString().padStart(2, '0');
  
  // Add event listeners to the form buttons
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

// Add a medication to the current schedule
function addMedicationToSchedule() {
  const medicationSelect = document.getElementById('medication-select');
  const quantityInput = document.getElementById('medication-quantity');
  const selectedMedsContainer = document.getElementById('selected-medications');
  
  const compartmentNum = parseInt(medicationSelect.value);
  const quantity = parseInt(quantityInput.value);
  
  // Validate the quantity
  if (isNaN(quantity) || quantity < 1) {
    logMessage('Please enter a valid quantity', 'system');
    return;
  }
  
  // Check if enough pills are available
  const availablePills = compartmentData[compartmentNum].pillCount;
  if (quantity > availablePills) {
    logMessage(`Not enough pills available. Only ${availablePills} ${compartmentData[compartmentNum].pillName} pills remaining.`, 'system');
    return;
  }
  
  // Check if this medication is already in the list
  const existingMedIndex = selectedMedications.findIndex(med => med.compartment === compartmentNum);
  if (existingMedIndex !== -1) {
    // Update the quantity
    selectedMedications[existingMedIndex].quantity += quantity;
  } else {
    // Add new medication
    selectedMedications.push({
      compartment: compartmentNum,
      name: compartmentData[compartmentNum].pillName,
      quantity: quantity
    });
  }
  
  // Update the display
  updateSelectedMedicationsDisplay();
}

// Update the display of selected medications
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
  
  // Add event listeners for quantity changes
  document.querySelectorAll('.medication-quantity').forEach(input => {
    input.addEventListener('change', (event) => {
      const index = parseInt(event.target.dataset.index);
      const newQuantity = parseInt(event.target.value);
      updateMedicationQuantity(index, newQuantity);
    });
  });
  
  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-medication').forEach(button => {
    button.addEventListener('click', (event) => {
      const index = parseInt(event.target.parentElement.dataset.index);
      removeMedication(index);
    });
  });
}

// Update the quantity of a medication in the schedule
function updateMedicationQuantity(index, newQuantity) {
  newQuantity = parseInt(newQuantity);
  
  if (isNaN(newQuantity) || newQuantity < 1) {
    logMessage('Please enter a valid quantity', 'system');
    updateSelectedMedicationsDisplay(); // Reset the display
    return;
  }
  
  const compartmentNum = selectedMedications[index].compartment;
  const availablePills = compartmentData[compartmentNum].pillCount;
  
  if (newQuantity > availablePills) {
    logMessage(`Not enough pills available. Only ${availablePills} ${compartmentData[compartmentNum].pillName} pills remaining.`, 'system');
    updateSelectedMedicationsDisplay(); // Reset the display
    return;
  }
  
  selectedMedications[index].quantity = newQuantity;
  updateSelectedMedicationsDisplay();
}

// Remove a medication from the schedule
function removeMedication(index) {
  selectedMedications.splice(index, 1);
  updateSelectedMedicationsDisplay();
}

// Create a new schedule
function createSchedule() {
  const scheduleName = document.getElementById('schedule-name').value.trim();
  const scheduleDate = document.getElementById('schedule-date').value;
  const scheduleTime = document.getElementById('schedule-time').value;
  
  // Validate inputs
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
  
  // Create the schedule datetime
  const scheduleDatetime = new Date(`${scheduleDate}T${scheduleTime}`);
  
  // Create the schedule object
  const schedule = {
    id: nextScheduleId++,
    name: scheduleName,
    datetime: scheduleDatetime,
    medications: JSON.parse(JSON.stringify(selectedMedications)), // Deep copy
    active: true,
    created: new Date(),
    recurring: true, // Make schedules recurring by default
    lastDispensed: null
  };
  
  // Add to schedules list
  schedules.push(schedule);
  
  // Update schedules display
  updateSchedulesDisplay();
  
  // Clean up
  currentProcess = null;
  formArea.innerHTML = '';
  formArea.classList.remove('active');
  selectedMedications = [];
  
  logMessage(`Schedule "${scheduleName}" created for ${formatDate(scheduleDatetime)}`, 'system');
  
  // Sync with device if connected
  if (isConnected) {
    // Send just this new schedule to the device
    const hour = scheduleDatetime.getHours();
    const minute = scheduleDatetime.getMinutes();
    // For simplicity, we'll make every schedule active every day
    const daysOfWeek = 0x7F; // All days of the week
    
    sendCommand(`ADD_SCHEDULE:${schedule.id},${hour},${minute},${daysOfWeek}`);
    logMessage(`Sent new schedule to device: ${scheduleName} at ${hour}:${minute}`, 'system');
  }
  
  // Check for due schedules
  checkDueSchedules();
}

// Update the display of schedules
function updateSchedulesDisplay() {
  if (schedules.length === 0) {
    scheduleList.innerHTML = '<p class="no-schedules">No scheduled medications. Create a schedule to get started.</p>';
    return;
  }
  
  // Sort schedules by datetime
  const sortedSchedules = [...schedules].sort((a, b) => a.datetime - b.datetime);
  
  let html = '';
  sortedSchedules.forEach(schedule => {
    // Calculate total number of pills
    const totalPills = schedule.medications.reduce((sum, med) => sum + med.quantity, 0);
    
    // Check if this schedule is due
    const isDue = new Date(schedule.datetime) <= new Date();
    const dueClass = isDue ? 'due' : '';
    
    // Show when this was last dispensed
    const lastDispensedInfo = schedule.lastDispensed ? 
      `<div class="schedule-last-dispensed">Last taken: ${formatDate(new Date(schedule.lastDispensed))}</div>` : '';
    
    // Set disabled attribute based on connection status
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
  
  // Add event listeners for schedule actions
  document.querySelectorAll('.schedule-delete').forEach(button => {
    button.addEventListener('click', (event) => {
      // Only proceed if connected and button is not disabled
      if (!isConnected || event.target.disabled) return;
      
      const id = parseInt(event.target.dataset.id);
      deleteSchedule(id);
    });
  });
  
  document.querySelectorAll('.schedule-activate').forEach(button => {
    button.addEventListener('click', (event) => {
      // Only proceed if connected and button is not disabled
      if (!isConnected || event.target.disabled) return;
      
      const id = parseInt(event.target.dataset.id);
      activateSchedule(id);
    });
  });
}

// Delete a schedule
function deleteSchedule(id) {
  const scheduleIndex = schedules.findIndex(s => s.id === id);
  if (scheduleIndex !== -1) {
    const scheduleName = schedules[scheduleIndex].name;
    
    // Send clear command for this schedule to device if connected
    if (isConnected) {
      // Since we don't have a specific command to delete a single schedule,
      // we'll send all schedules again after removing this one
      schedules.splice(scheduleIndex, 1);
      syncSchedulesToDevice();
    } else {
      schedules.splice(scheduleIndex, 1);
    }
    
    updateSchedulesDisplay();
    logMessage(`Schedule "${scheduleName}" deleted`, 'system');
  }
}

// Activate a schedule (simulate medication dispense)
async function activateSchedule(id) {
  // Don't allow activation if not connected
  if (!isConnected) {
    logMessage('Cannot dispense medication. Device not connected.', 'system');
    return;
  }
  
  // Don't allow activation if already dispensing
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
    // Turn off all LEDs first
    for (let i = 1; i <= 3; i++) {
      await sendCommand(`COMP${i}_LED OFF`);
    }
    
    // Run a single LED rotation animation before dispensing
    await runLedAnimation();
    
    // Count total pills to dispense
    const totalPills = schedule.medications.reduce((sum, med) => sum + med.quantity, 0);
    logMessage(`Dispensing a total of ${totalPills} pills...`, 'system');
    
    // Dispense pills one by one from each compartment
    for (const med of schedule.medications) {
      const compartmentNum = med.compartment;
      
      // Check if we have enough pills
      if (compartmentData[compartmentNum].pillCount < med.quantity) {
        logMessage(`Warning: Not enough ${med.name} pills in Compartment ${compartmentNum}!`, 'system');
        continue;
      }
      
      logMessage(`Dispensing ${med.quantity} ${med.name} pills from Compartment ${compartmentNum}`, 'system');
      
      // Dispense pills one by one
      for (let i = 0; i < med.quantity; i++) {
        // Light up the current compartment LED
        await sendCommand(`COMP${compartmentNum}_LED ON`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate servo rotation for dispensing (one full rotation = one pill)
        await simulateServoDispense(compartmentNum);
        
        // Turn off the LED after dispensing
        await sendCommand(`COMP${compartmentNum}_LED OFF`);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Deduct one pill from inventory
        compartmentData[compartmentNum].pillCount--;
        
        // Update compartment display
        updateCompartmentDisplay(compartmentNum);
      }
      
      // Check if compartment is now empty
      if (compartmentData[compartmentNum].pillCount <= 0) {
        compartmentData[compartmentNum].filled = false;
        compartmentData[compartmentNum].pillCount = 0;
        logMessage(`Compartment ${compartmentNum} is now empty`, 'system');
      }
    }
    
    // Update schedule with last dispensed time
    schedule.lastDispensed = new Date();
    
    // If it's a recurring schedule, update the datetime for the next occurrence
    if (schedule.recurring) {
      // Calculate next occurrence (same time tomorrow)
      const nextOccurrence = new Date(schedule.datetime);
      nextOccurrence.setDate(nextOccurrence.getDate() + 1);
      schedule.datetime = nextOccurrence;
      
      logMessage(`Schedule "${schedule.name}" updated for next occurrence: ${formatDate(nextOccurrence)}`, 'system');
    }
    
    // Update display
    updateSchedulesDisplay();
    
    // Update button states
    updateRefillButtonState();
    updateScheduleButtonState();
    
    logMessage(`Schedule "${schedule.name}" completed`, 'system');
  } catch (error) {
    logMessage(`Error during dispensing: ${error.message}`, 'system');
  } finally {
    isDispensing = false;
  }
}

// Flag to prevent multiple dispensing operations at once
let isDispensing = false;

// Simulate servo motor dispensing a pill
async function simulateServoDispense(compartmentNum) {
  // Simulate servo opening (SERVO[compartmentNum] OPEN)
  logMessage(`Opening compartment ${compartmentNum} servo...`, 'system');
  await sendCommand(`SERVO${compartmentNum} OPEN`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for servo to complete movement
  
  // Simulate servo closing (SERVO[compartmentNum] CLOSE)
  logMessage(`Closing compartment ${compartmentNum} servo...`, 'system');
  await sendCommand(`SERVO${compartmentNum} CLOSE`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for servo to complete movement
  
  return true;
}

// Run LED animation (LED 1 -> LED 2 -> LED 3 sequence)
async function runLedAnimation() {
  for (let i = 1; i <= 3; i++) {
    // Turn on LED
    await sendCommand(`COMP${i}_LED ON`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Turn off LED
    await sendCommand(`COMP${i}_LED OFF`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// ========== Utility Functions ==========

// Format a date for display
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

// Blink compartment LED n times
async function blinkCompartmentLED(compartmentNumber, times) {
  for (let i = 0; i < times; i++) {
    await sendCommand(`COMP${compartmentNumber}_LED OFF`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await sendCommand(`COMP${compartmentNumber}_LED ON`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return sendCommand(`COMP${compartmentNumber}_LED OFF`);
}

// Cancel current process
function cancelCurrentProcess() {
  if (activeCompartment) {
    sendCommand(`COMP${activeCompartment}_LED OFF`);
    activeCompartment = null;
  }
  
  currentProcess = null;
  formArea.innerHTML = '';
  formArea.classList.remove('active');
  selectedMedications = [];
  
  logMessage('Process cancelled', 'system');
}

// ========== Initialize UI ==========
function initializeUI() {
  // Set initial compartment display
  for (let i = 1; i <= 3; i++) {
    updateCompartmentDisplay(i);
  }
  
  // Update button states
  updateRefillButtonState();
  updateScheduleButtonState();
  
  // Initialize schedules display
  updateSchedulesDisplay();
}

// Initialize the UI when the page loads
window.addEventListener('DOMContentLoaded', initializeUI);

// Start checking for schedules if connected
if (isConnected) {
  startScheduleChecking();
}

// Cleanup event listeners when window is unloaded
window.addEventListener('beforeunload', () => {
  if (ledBlinkInterval) {
    clearInterval(ledBlinkInterval);
  }
  stopScheduleChecking();
  window.api.removeAllListeners();
});

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

// Sync all schedules to the device
function syncSchedulesToDevice() {
  if (!isConnected) return;
  
  // First clear all schedules on the device
  sendCommand('CLEAR_SCHEDULES');
  logMessage('Clearing device schedules...', 'system');
  
  // Wait a moment for the clear command to complete
  setTimeout(() => {
    // Send each schedule to the device
    schedules.forEach(schedule => {
      const scheduleTime = new Date(schedule.datetime);
      const hour = scheduleTime.getHours();
      const minute = scheduleTime.getMinutes();
      
      // Calculate days of week
      // For simplicity, we'll make every schedule active every day (0x7F = all days)
      // In a real app, you would extract real day info from schedule.recurring pattern
      const daysOfWeek = 0x7F; // All days of the week
      
      // Send schedule to the device
      sendCommand(`ADD_SCHEDULE:${schedule.id},${hour},${minute},${daysOfWeek}`);
      logMessage(`Sent schedule to device: ${schedule.name} at ${hour}:${minute}`, 'system');
    });
    
    logMessage(`Synchronized ${schedules.length} schedules with device`, 'system');
  }, 500);
} 