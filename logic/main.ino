#include <Arduino.h>
#include <ESP32Servo.h>
#include "HX711.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <time.h>
#include <Preferences.h>
// Nordic UART Service UUIDs
#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_RX        "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // for writing commands
#define CHAR_UUID_TX        "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // for notifications
// ----- Servo Setup -----
Servo servo1, servo2, servo3;
const int servo1Pin = 22;
const int servo2Pin = 23;
const int servo3Pin = 25;
// track current positions
int servo1Pos = 0;
int servo2Pos = 0;
int servo3Pos = 0;
// ----- LED Setup -----
const int ledPin = 12;
bool ledState = false;
// ----- Added LEDs Setup -----
const int compartment1_LED = 13;
const int compartment2_LED = 14;
const int compartment3_LED = 16;  // Fixed from compartment2_LED to compartment3_LED
const int power_LED = 18;
const int refill_LED = 19;
const int bluetooth_LED = 27;  // Renamed from time_to_take_LED to bluetooth_LED
// ----- Vibration Motor Setup -----
const int vibrationMotorPin = 26;
bool motorState = false;
// ----- HX711 Load Cell Setup -----
const int LOADCELL_DOUT_PIN = 32;
const int LOADCELL_SCK_PIN  = 33;
HX711 scale;
// ----- BLE Globals -----
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
bool isScanning = false;
unsigned long lastWeightUpdate = 0;
const unsigned long weightInterval = 5000;  // 5 s
// ----- Time Management -----
struct tm timeinfo;
bool timeIsSynchronized = false;
unsigned long lastTimeCheck = 0;
const unsigned long timeCheckInterval = 2000;  // Check schedules every 2 seconds
// ----- Schedule Management -----
bool hasDueSchedules = false;
unsigned long blinkInterval = 0;
bool bluetooth_LED_State = false;
// ----- Schedule Storage -----
#define MAX_SCHEDULES 20
Preferences preferences;
struct Schedule {
  bool active;
  int id;
  int hour;
  int minute;
  int daysOfWeek;  // Bit field: bit 0 = Sunday, bit 1 = Monday, etc.
};
Schedule schedules[MAX_SCHEDULES];
int numSchedules = 0;
// Forward declarations of schedule functions
void addSchedule(int id, int hour, int minute, int daysOfWeek);
void clearSchedules();
void saveSchedules();
void loadSchedules();
bool checkSchedulesDue();
void alertScheduleDue();
// ----- Dispense Tracking -----
bool dispensePending = false;
unsigned long lastServoActionTime = 0;
const unsigned long servoCompletionTimeout = 3000; // 3 seconds after servo action to turn off LEDs
unsigned long lastDispenseCheck = 0;
const unsigned long dispenseCheckInterval = 2000; // Check dispense completion every 2 seconds
// ----- BLE Server Callbacks -----
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("BLE Device Connected");
    
    // Turn on bluetooth LED solid when connected
    digitalWrite(bluetooth_LED, HIGH);
    bluetooth_LED_State = true;
    
    // Stop blinking if it was blinking
    isScanning = false;
    
    // Request time from the connected device
    pTxCharacteristic->setValue("REQUEST_TIME");
    pTxCharacteristic->notify();
    
    // Request schedules from the connected device
    pTxCharacteristic->setValue("REQUEST_SCHEDULES");
    pTxCharacteristic->notify();
    
    // send help menu on connect
    const char* helpText =
      "CMDs:\n"
      "SERVO1 OPEN/CLOSE\n"
      "SERVO2 OPEN/CLOSE\n"
      "SERVO3 OPEN/CLOSE\n"
      "VIBRATE ON/OFF\n"
      "COMP1_LED ON/OFF\n"
      "COMP2_LED ON/OFF\n"
      "COMP3_LED ON/OFF\n"
      "POWER_LED ON/OFF\n"
      "REFILL_LED ON/OFF\n"
      "BT_LED ON/OFF\n"
      "TARE\n"
      "RAW\n"
      "SET_TIME:YYYY-MM-DD HH:MM:SS\n"
      "ADD_SCHEDULE:ID,HOUR,MINUTE,DAYS\n"
      "CLEAR_SCHEDULES\n"
      "SCHEDULE_DUE:true/false\n"
      "HELP";
    pTxCharacteristic->setValue(helpText);
    pTxCharacteristic->notify();
  }
  
  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    Serial.println("BLE Device Disconnected");
    
    // Turn off bluetooth LED when disconnected
    digitalWrite(bluetooth_LED, LOW);
    bluetooth_LED_State = false;
    
    // Reset servo positions on disconnect
    servo1.write(175); servo1Pos = 180;  // Close position
    servo2.write(168.5); servo2Pos = 180;  // Close position
    servo3.write(175); servo3Pos = 180;  // Close position
    digitalWrite(vibrationMotorPin, LOW); motorState = false;
    
    pServer->getAdvertising()->start();
    Serial.println("Advertising restarted");
    
    // Start blinking the bluetooth LED when advertising again
    isScanning = true;
  }
};
// ----- BLE Characteristic Callbacks -----
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rx = pCharacteristic->getValue();
    if (rx.isEmpty()) return;
    String cmd = String(rx.c_str());
    cmd.trim();
    Serial.print("Received command: ");
    Serial.println(cmd);
    
    // Check for time setting command (case sensitive for the timestamp)
    if (cmd.startsWith("SET_TIME:")) {
      String timeStr = cmd.substring(9); // Extract timestamp part
      Serial.print("Setting time to: ");
      Serial.println(timeStr);
      
      // Parse the timestamp (format: YYYY-MM-DD HH:MM:SS)
      int year, month, day, hour, minute, second;
      sscanf(timeStr.c_str(), "%d-%d-%d %d:%d:%d", &year, &month, &day, &hour, &minute, &second);
      
      // Set the internal time
      timeinfo.tm_year = year - 1900;  // Years since 1900
      timeinfo.tm_mon = month - 1;     // Months since January
      timeinfo.tm_mday = day;
      timeinfo.tm_hour = hour;
      timeinfo.tm_min = minute;
      timeinfo.tm_sec = second;
      
      // Mark time as synchronized
      timeIsSynchronized = true;
      
      // Acknowledge receipt of time
      pTxCharacteristic->setValue("OK: Time synchronized");
      pTxCharacteristic->notify();
      return;
    }
    
    // Check for schedule addition command
    if (cmd.startsWith("ADD_SCHEDULE:")) {
      String scheduleStr = cmd.substring(13); // Extract schedule part
      Serial.print("Adding schedule: ");
      Serial.println(scheduleStr);
      
      // Parse the schedule (format: ID,HOUR,MINUTE,DAYS)
      // DAYS is a bitmask where bit 0 = Sunday, bit 1 = Monday, etc.
      int id, hour, minute, days;
      sscanf(scheduleStr.c_str(), "%d,%d,%d,%d", &id, &hour, &minute, &days);
      
      addSchedule(id, hour, minute, days);
      
      // Acknowledge receipt of schedule
      pTxCharacteristic->setValue("OK: Schedule added");
      pTxCharacteristic->notify();
      return;
    }
    
    // Check for clear schedules command
    if (cmd == "CLEAR_SCHEDULES") {
      Serial.println("Clearing all schedules");
      clearSchedules();
      
      // Acknowledge
      pTxCharacteristic->setValue("OK: All schedules cleared");
      pTxCharacteristic->notify();
      return;
    }
    
    // Check for schedule due status
    if (cmd.startsWith("SCHEDULE_DUE:")) {
      String statusStr = cmd.substring(13); // Extract status part
      statusStr.trim();
      statusStr.toLowerCase();
      
      // Update due schedule status
      hasDueSchedules = (statusStr == "true");
      
      if (hasDueSchedules) {
        Serial.println("Medication schedule is due!");
        // Flash all compartment LEDs to indicate schedule is due
        for (int i = 0; i < 3; i++) {
          digitalWrite(compartment1_LED, HIGH);
          digitalWrite(compartment2_LED, HIGH);
          digitalWrite(compartment3_LED, HIGH);
          delay(300);
          digitalWrite(compartment1_LED, LOW);
          digitalWrite(compartment2_LED, LOW);
          digitalWrite(compartment3_LED, LOW);
          delay(300);
        }
      } else {
        Serial.println("No schedules due");
      }
      
      pTxCharacteristic->setValue("OK: Schedule status updated");
      pTxCharacteristic->notify();
      return;
    }
    
    cmd.toUpperCase();
    
    // HELP
    if (cmd == "HELP") {
      const char* helpText =
        "CMDs:\n"
        "SERVO1 OPEN/CLOSE\n"
        "SERVO2 OPEN/CLOSE\n"
        "SERVO3 OPEN/CLOSE\n"
        "VIBRATE ON/OFF\n"
        "COMP1_LED ON/OFF\n"
        "COMP2_LED ON/OFF\n"
        "COMP3_LED ON/OFF\n"
        "POWER_LED ON/OFF\n"
        "REFILL_LED ON/OFF\n"
        "BT_LED ON/OFF\n"
        "TARE\n"
        "RAW\n"
        "SET_TIME:YYYY-MM-DD HH:MM:SS\n"
        "ADD_SCHEDULE:ID,HOUR,MINUTE,DAYS\n"
        "CLEAR_SCHEDULES\n"
        "SCHEDULE_DUE:true/false\n"
        "HELP";
      pTxCharacteristic->setValue(helpText);
      pTxCharacteristic->notify();
      return;
    }
    
    // TARE
    if (cmd == "TARE") {
      scale.tare();
      Serial.println("Scale tared.");
      pTxCharacteristic->setValue("OK: Scale tared");
      pTxCharacteristic->notify();
      return;
    }
    
    // RAW
    if (cmd == "RAW") {
      long raw = scale.read_average(5);
      char buf[32];
      snprintf(buf, sizeof(buf), "RAW: %ld", raw);
      Serial.println(buf);
      pTxCharacteristic->setValue(buf);
      pTxCharacteristic->notify();
      return;
    }
    
    // Servo 1
    if (cmd == "SERVO1 OPEN" && servo1Pos != 0) {
      servo1.write(10);  // OPEN position (lower angle)
      servo1Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 1 Opened");
    } else if (cmd == "SERVO1 CLOSE" && servo1Pos != 180) {
      servo1.write(175);  // CLOSE position (higher angle)
      servo1Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 1 Closed");
    }

    // Servo 2
    if (cmd == "SERVO2 OPEN" && servo2Pos != 0) {
      servo2.write(10);  // OPEN position (lower angle)
      servo2Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 2 Opened");
    } else if (cmd == "SERVO2 CLOSE" && servo2Pos != 180) {
      servo2.write(168.5);  // CLOSE position (higher angle)
      servo2Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 2 Closed");
    }

    // Servo 3
    if (cmd == "SERVO3 OPEN" && servo3Pos != 0) {
      servo3.write(10);  // OPEN position (lower angle)
      servo3Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 3 Opened");
    } else if (cmd == "SERVO3 CLOSE" && servo3Pos != 180) {
      servo3.write(175);  // CLOSE position (higher angle)
      servo3Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 3 Closed");
    }
    
    // Vibration Motor
    if (cmd == "VIBRATE ON") {
      digitalWrite(vibrationMotorPin, HIGH);
      motorState = true;
      Serial.println("Vibration Motor Turned ON");
    } else if (cmd == "VIBRATE OFF") {
      digitalWrite(vibrationMotorPin, LOW);
      motorState = false;
      Serial.println("Vibration Motor Turned OFF");
    }
    
    // Compartment 1 LED
    if (cmd == "COMP1_LED ON") {
      digitalWrite(compartment1_LED, HIGH);
      Serial.println("Compartment 1 LED Turned ON");
    } else if (cmd == "COMP1_LED OFF") {
      digitalWrite(compartment1_LED, LOW);
      Serial.println("Compartment 1 LED Turned OFF");
    }
    
    // Compartment 2 LED
    if (cmd == "COMP2_LED ON") {
      digitalWrite(compartment2_LED, HIGH);
      Serial.println("Compartment 2 LED Turned ON");
    } else if (cmd == "COMP2_LED OFF") {
      digitalWrite(compartment2_LED, LOW);
      Serial.println("Compartment 2 LED Turned OFF");
    }
    
    // Compartment 3 LED
    if (cmd == "COMP3_LED ON") {
      digitalWrite(compartment3_LED, HIGH);
      Serial.println("Compartment 3 LED Turned ON");
    } else if (cmd == "COMP3_LED OFF") {
      digitalWrite(compartment3_LED, LOW);
      Serial.println("Compartment 3 LED Turned OFF");
    }
    
    // Power LED
    if (cmd == "POWER_LED ON") {
      digitalWrite(power_LED, HIGH);
      Serial.println("Power LED Turned ON");
    } else if (cmd == "POWER_LED OFF") {
      digitalWrite(power_LED, LOW);
      Serial.println("Power LED Turned OFF");
    }
    
    // Refill LED
    if (cmd == "REFILL_LED ON") {
      digitalWrite(refill_LED, HIGH);
      Serial.println("Refill LED Turned ON");
    } else if (cmd == "REFILL_LED OFF") {
      digitalWrite(refill_LED, LOW);
      Serial.println("Refill LED Turned OFF");
    }
    
    // Bluetooth LED (renamed from time to take LED)
    if (cmd == "BT_LED ON") {
      digitalWrite(bluetooth_LED, HIGH);
      bluetooth_LED_State = true;
      Serial.println("Bluetooth LED Turned ON");
    } else if (cmd == "BT_LED OFF") {
      digitalWrite(bluetooth_LED, LOW);
      bluetooth_LED_State = false;
      Serial.println("Bluetooth LED Turned OFF");
    }
    
    // For backward compatibility with "LED ON/OFF" commands, map them to BT_LED
    if (cmd == "LED ON") {
      digitalWrite(bluetooth_LED, HIGH);
      bluetooth_LED_State = true;
      Serial.println("Bluetooth LED Turned ON (via legacy LED command)");
    } else if (cmd == "LED OFF") {
      digitalWrite(bluetooth_LED, LOW);
      bluetooth_LED_State = false;
      Serial.println("Bluetooth LED Turned OFF (via legacy LED command)");
    }
  }
};
// ----- Schedule Management Functions -----
// Add a schedule to the array
void addSchedule(int id, int hour, int minute, int daysOfWeek) {
  // Check if we already have this schedule ID
  for (int i = 0; i < numSchedules; i++) {
    if (schedules[i].id == id) {
      // Update existing schedule
      schedules[i].hour = hour;
      schedules[i].minute = minute;
      schedules[i].daysOfWeek = daysOfWeek;
      schedules[i].active = true;
      saveSchedules();
      return;
    }
  }
  
  // Add new schedule if we have room
  if (numSchedules < MAX_SCHEDULES) {
    schedules[numSchedules].id = id;
    schedules[numSchedules].hour = hour;
    schedules[numSchedules].minute = minute;
    schedules[numSchedules].daysOfWeek = daysOfWeek;
    schedules[numSchedules].active = true;
    numSchedules++;
    saveSchedules();
  }
}
// Clear all schedules
void clearSchedules() {
  numSchedules = 0;
  saveSchedules();
}
// Save schedules to persistent storage
void saveSchedules() {
  preferences.begin("schedules", false);
  
  // Save number of schedules
  preferences.putInt("count", numSchedules);
  
  // Save each schedule
  for (int i = 0; i < numSchedules; i++) {
    char key[16];
    sprintf(key, "sched%d", i);
    
    // Pack schedule data into a 32-bit integer:
    // - Bits 0-5: ID (0-63)
    // - Bits 6-10: Hour (0-23)
    // - Bits 11-16: Minute (0-59)
    // - Bits 17-23: Days of week (bit field)
    // - Bit 24: Active flag
    uint32_t data = schedules[i].id & 0x3F; // 6 bits for ID
    data |= ((uint32_t)(schedules[i].hour & 0x1F) << 6); // 5 bits for hour
    data |= ((uint32_t)(schedules[i].minute & 0x3F) << 11); // 6 bits for minute
    data |= ((uint32_t)(schedules[i].daysOfWeek & 0x7F) << 17); // 7 bits for days
    data |= ((uint32_t)(schedules[i].active ? 1 : 0) << 24); // 1 bit for active
    
    preferences.putUInt(key, data);
  }
  
  preferences.end();
  Serial.printf("Saved %d schedules to flash\n", numSchedules);
}
// Load schedules from persistent storage
void loadSchedules() {
  preferences.begin("schedules", true);
  
  // Load number of schedules
  numSchedules = preferences.getInt("count", 0);
  if (numSchedules > MAX_SCHEDULES) {
    numSchedules = MAX_SCHEDULES;
  }
  
  // Load each schedule
  for (int i = 0; i < numSchedules; i++) {
    char key[16];
    sprintf(key, "sched%d", i);
    uint32_t data = preferences.getUInt(key, 0);
    
    // Unpack schedule data
    schedules[i].id = data & 0x3F;
    schedules[i].hour = (data >> 6) & 0x1F;
    schedules[i].minute = (data >> 11) & 0x3F;
    schedules[i].daysOfWeek = (data >> 17) & 0x7F;
    schedules[i].active = ((data >> 24) & 0x01) != 0;
  }
  
  preferences.end();
  Serial.printf("Loaded %d schedules from flash\n", numSchedules);
}
// Check if any schedules are due
bool checkSchedulesDue() {
  if (!timeIsSynchronized || numSchedules == 0) {
    return false;
  }
  
  // Get current time
  int currentHour = timeinfo.tm_hour;
  int currentMinute = timeinfo.tm_min;
  int currentDayOfWeek = (timeinfo.tm_wday == 0) ? 0 : timeinfo.tm_wday - 1; // 0 = Sunday
  int dayBit = 1 << currentDayOfWeek;
  
  // Check each schedule
  for (int i = 0; i < numSchedules; i++) {
    if (!schedules[i].active) {
      continue;
    }
    
    // Check if schedule is for today
    if ((schedules[i].daysOfWeek & dayBit) == 0) {
      continue;
    }
    
    // Check if schedule time matches current time
    if (schedules[i].hour == currentHour && 
        schedules[i].minute == currentMinute) {
      return true;
    }
  }
  
  return false;
}
// Alert user that a schedule is due
void alertScheduleDue() {
  // Flash all compartment LEDs
  for (int i = 0; i < 3; i++) {
    digitalWrite(compartment1_LED, HIGH);
    digitalWrite(compartment2_LED, HIGH);
    digitalWrite(compartment3_LED, HIGH);
    delay(300);
    digitalWrite(compartment1_LED, LOW);
    digitalWrite(compartment2_LED, LOW);
    digitalWrite(compartment3_LED, LOW);
    delay(300);
  }
}
void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Pill Dispenser BLE App...");
  
  // Initialize preferences
  preferences.begin("schedules", false);
  preferences.clear();
  preferences.end();
  
  // LED
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  
  // New LEDs
  pinMode(compartment1_LED, OUTPUT);
  pinMode(compartment2_LED, OUTPUT);
  pinMode(compartment3_LED, OUTPUT);
  pinMode(power_LED, OUTPUT);
  pinMode(refill_LED, OUTPUT);
  pinMode(bluetooth_LED, OUTPUT);
  
  // Initialize all LEDs to OFF - don't automatically turn on power LED
  digitalWrite(compartment1_LED, LOW);
  digitalWrite(compartment2_LED, LOW);
  digitalWrite(compartment3_LED, LOW);
  digitalWrite(power_LED, LOW);  // Changed to OFF since you want manual control
  digitalWrite(refill_LED, LOW);
  digitalWrite(bluetooth_LED, LOW);
  
  // Vibration Motor
  pinMode(vibrationMotorPin, OUTPUT);
  digitalWrite(vibrationMotorPin, LOW);
  
  // Servos - add delay for stability
  delay(500);
  servo1.attach(servo1Pin);
  servo2.attach(servo2Pin);
  servo3.attach(servo3Pin);
  
  delay(100);
  servo1.write(175);  // Start in CLOSED position (higher angle)
  servo2.write(168.5);  // Start in CLOSED position (higher angle)
  servo3.write(175);  // Start in CLOSED position (higher angle)
  servo1Pos = 180;  // Track as closed
  servo2Pos = 180;  // Track as closed
  servo3Pos = 180;  // Track as closed
  
  // Load cell init
  Serial.println("Initializing HX711...");
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  long initRead = scale.read();
  if (initRead <= 0) {
    Serial.println("WARNING: HX711 not detected!");
    // blink Bluetooth LED as warning
    for (int i = 0; i < 3; i++) {
      digitalWrite(bluetooth_LED, HIGH);
      delay(200);
      digitalWrite(bluetooth_LED, LOW);
      delay(200);
    }
  } else {
    Serial.println("HX711 connected.");
    scale.set_scale(420.0983);
    scale.tare();
  }
  
  // Initialize RTC with a default time
  timeinfo.tm_year = 123;  // 2023
  timeinfo.tm_mon = 0;     // January
  timeinfo.tm_mday = 1;
  timeinfo.tm_hour = 0;
  timeinfo.tm_min = 0;
  timeinfo.tm_sec = 0;
  
  // Load saved schedules
  loadSchedules();
  
  // BLE init
  BLEDevice::init("SmartPillDispenser");
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  
  // TX (notify)
  pTxCharacteristic = pService->createCharacteristic(
    CHAR_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());
  
  // RX (write)
  BLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    CHAR_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE
  );
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("BLE Advertising Started");
  
  // Set scanning flag to true to start blinking the bluetooth LED
  isScanning = true;
}
void loop() {
  // Handle bluetooth LED blinking during scanning
  if (isScanning && !deviceConnected) {
    unsigned long currentMillis = millis();
    
    // Blink the bluetooth LED every 500ms
    if (currentMillis - blinkInterval >= 500) {
      blinkInterval = currentMillis;
      bluetooth_LED_State = !bluetooth_LED_State;
      digitalWrite(bluetooth_LED, bluetooth_LED_State ? HIGH : LOW);
    }
  }
  
  // Check for dispense completion
  unsigned long currentMillis = millis();
  if (dispensePending && (currentMillis - lastDispenseCheck >= dispenseCheckInterval)) {
    lastDispenseCheck = currentMillis;
    
    // If it's been more than servoCompletionTimeout since last servo action
    if (currentMillis - lastServoActionTime >= servoCompletionTimeout) {
      // Turn off all compartment LEDs
      digitalWrite(compartment1_LED, LOW);
      digitalWrite(compartment2_LED, LOW);
      digitalWrite(compartment3_LED, LOW);
      Serial.println("Dispense completed, LEDs turned off");
      dispensePending = false;
    }
  }
  
  // Check time and schedules
  if (currentMillis - lastTimeCheck >= timeCheckInterval) {
    lastTimeCheck = currentMillis;
    
    if (timeIsSynchronized) {
      // Increment seconds and handle time overflow
      timeinfo.tm_sec += 2;  // Add two seconds
      mktime(&timeinfo);  // Normalize the time
      
      if (deviceConnected) {
        // If connected, ask the app if any schedules are due
        pTxCharacteristic->setValue("CHECK_SCHEDULES");
        pTxCharacteristic->notify();
      } else {
        // If not connected, check local schedules
        hasDueSchedules = checkSchedulesDue();
        
        if (hasDueSchedules) {
          Serial.println("Local schedule is due!");
          alertScheduleDue();
        }
      }
    }
  }
  
  // If there are due schedules and we're connected, flash compartment LEDs
  if (deviceConnected && hasDueSchedules) {
    // Flash all compartment LEDs
    for (int i = 0; i < 2; i++) {  // 2 flash cycles
      digitalWrite(compartment1_LED, HIGH);
      digitalWrite(compartment2_LED, HIGH);
      digitalWrite(compartment3_LED, HIGH);
      delay(300);
      digitalWrite(compartment1_LED, LOW);
      digitalWrite(compartment2_LED, LOW);
      digitalWrite(compartment3_LED, LOW);
      delay(300);
    }
  }
  
  // Weight measurements
  if (millis() - lastWeightUpdate >= weightInterval) {
    lastWeightUpdate = millis();
    if (scale.wait_ready_timeout(500)) {
      float weight = scale.get_units(5);
      Serial.printf("Weight: %.2f g\n", weight);
      if (deviceConnected) {
        char buf[32];
        snprintf(buf, sizeof(buf), "WEIGHT: %.2f g", weight);
        pTxCharacteristic->setValue(buf);
        pTxCharacteristic->notify();
      }
    } else {
      Serial.println("Load cell not ready.");
    }
  }
  
  delay(100);
}