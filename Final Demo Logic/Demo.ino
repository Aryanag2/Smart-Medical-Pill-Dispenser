#include <Arduino.h>
#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <time.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HX711.h>

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_RX        "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_TX        "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

#define HX711_SCK_PIN 33
#define HX711_DT_PIN 32

HX711 scale;
const float REFERENCE_WEIGHT = 64.1; // Reference weight in grams
float raw_zero_reading = 0.0;        // Raw reading when scale is empty
float raw_reference_reading = 0.0;   // Raw reading with reference weight
float current_weight = 0.0;          // Current weight measurement
bool is_calibrated = false;          // Calibration status flag

Servo servo1, servo2, servo3;
const int servo1Pin = 22;
const int servo2Pin = 23;
const int servo3Pin = 25;

int servo1Pos = 0;
int servo2Pos = 0;
int servo3Pos = 0;

const int ledPin = 12;
bool ledState = false;

const int compartment1_LED = 13;
const int compartment2_LED = 14;
const int compartment3_LED = 16;
const int power_LED = 18;
const int refill_LED = 19;
const int bluetooth_LED = 27;

const int vibrationMotorPin = 26;
bool motorState = false;

const int bluetoothButtonPin = 17;   
bool startAdvertising = false;       

BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
bool isScanning = false;

struct tm timeinfo;
bool timeIsSynchronized = false;
unsigned long lastTimeCheck = 0;
const unsigned long timeCheckInterval = 2000;

bool hasDueSchedules = false;
unsigned long blinkInterval = 0;
bool bluetooth_LED_State = false;

#define MAX_SCHEDULES 20
Preferences preferences;
struct Schedule {
  bool active;
  int id;
  int hour;
  int minute;
  int daysOfWeek;
};
Schedule schedules[MAX_SCHEDULES];
int numSchedules = 0;

Preferences pillDataPrefs;
StaticJsonDocument<1024> pillData;

void addSchedule(int id, int hour, int minute, int daysOfWeek);
void clearSchedules();
void saveSchedules();
void loadSchedules();
bool checkSchedulesDue();
void alertScheduleDue();
void savePillData(const char* jsonData);
void loadPillData();

bool dispensePending = false;
unsigned long lastServoActionTime = 0;
const unsigned long servoCompletionTimeout = 3000;
unsigned long lastDispenseCheck = 0;
const unsigned long dispenseCheckInterval = 2000;

bool servoMotionPending = false;
unsigned long servoCompletionTime = 0;
const unsigned long servoOperationTimeout = 3000;

void addSchedule(int id, int hour, int minute, int daysOfWeek) {
  for (int i = 0; i < numSchedules; i++) {
    if (schedules[i].id == id) {
      schedules[i].hour = hour;
      schedules[i].minute = minute;
      schedules[i].daysOfWeek = daysOfWeek;
      schedules[i].active = true;
      saveSchedules();
      return;
    }
  }
  
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

void clearSchedules() {
  numSchedules = 0;
  saveSchedules();
}

void saveSchedules() {
  preferences.begin("schedules", false);
  
  preferences.putInt("count", numSchedules);
  
  for (int i = 0; i < numSchedules; i++) {
    char key[16];
    sprintf(key, "sched%d", i);
    
    uint32_t data = schedules[i].id & 0x3F;
    data |= ((uint32_t)(schedules[i].hour & 0x1F) << 6);
    data |= ((uint32_t)(schedules[i].minute & 0x3F) << 11);
    data |= ((uint32_t)(schedules[i].daysOfWeek & 0x7F) << 17);
    data |= ((uint32_t)(schedules[i].active ? 1 : 0) << 24);
    
    preferences.putUInt(key, data);
  }
  
  preferences.end();
  Serial.printf("Saved %d schedules to flash\n", numSchedules);
}

void loadSchedules() {
  preferences.begin("schedules", true);
  
  numSchedules = preferences.getInt("count", 0);
  if (numSchedules > MAX_SCHEDULES) {
    numSchedules = MAX_SCHEDULES;
  }
  
  for (int i = 0; i < numSchedules; i++) {
    char key[16];
    sprintf(key, "sched%d", i);
    uint32_t data = preferences.getUInt(key, 0);
    
    schedules[i].id = data & 0x3F;
    schedules[i].hour = (data >> 6) & 0x1F;
    schedules[i].minute = (data >> 11) & 0x3F;
    schedules[i].daysOfWeek = (data >> 17) & 0x7F;
    schedules[i].active = ((data >> 24) & 0x01) != 0;
  }
  
  preferences.end();
  Serial.printf("Loaded %d schedules from flash\n", numSchedules);
}

bool checkSchedulesDue() {
  if (!timeIsSynchronized || numSchedules == 0) {
    return false;
  }
  
  int currentHour = timeinfo.tm_hour;
  int currentMinute = timeinfo.tm_min;
  int currentDayOfWeek = (timeinfo.tm_wday == 0) ? 0 : timeinfo.tm_wday - 1;
  int dayBit = 1 << currentDayOfWeek;
  
  for (int i = 0; i < numSchedules; i++) {
    if (!schedules[i].active) {
      continue;
    }
    
    if ((schedules[i].daysOfWeek & dayBit) == 0) {
      continue;
    }
    
    if (schedules[i].hour == currentHour && 
        schedules[i].minute == currentMinute) {
      return true;
    }
  }
  
  return false;
}

void alertScheduleDue() {
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

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("BLE Device Connected");
    
    digitalWrite(bluetooth_LED, HIGH);
    bluetooth_LED_State = true;
    
    isScanning = false;
    
    pTxCharacteristic->setValue("REQUEST_TIME");
    pTxCharacteristic->notify();
    
    pTxCharacteristic->setValue("REQUEST_SCHEDULES");
    pTxCharacteristic->notify();
    
    loadPillData();
    String jsonString;
    serializeJson(pillData, jsonString);
    String response = "PILL_DATA:" + jsonString;
    pTxCharacteristic->setValue(response.c_str());
    pTxCharacteristic->notify();
    
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
      "SET_TIME:YYYY-MM-DD HH:MM:SS\n"
      "ADD_SCHEDULE:ID,HOUR,MINUTE,DAYS\n"
      "CLEAR_SCHEDULES\n"
      "SCHEDULE_DUE:true/false\n"
      "SAVE_PILL_DATA:JSON\n"
      "REQUEST_PILL_DATA\n"
      "HELP";
    pTxCharacteristic->setValue(helpText);
    pTxCharacteristic->notify();
  }
  
  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    Serial.println("BLE Device Disconnected");
    
    digitalWrite(bluetooth_LED, LOW);
    bluetooth_LED_State = false;
    
    servo1.write(175); servo1Pos = 180;
    servo2.write(168.5); servo2Pos = 180;
    servo3.write(175); servo3Pos = 180;
    digitalWrite(vibrationMotorPin, LOW); motorState = false;
    
    pillDataPrefs.end();
    pillDataPrefs.begin("pilldata", false);
    
    pServer->getAdvertising()->start();
    Serial.println("Advertising restarted");
    
    isScanning = true;
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rx = pCharacteristic->getValue();
    if (rx.isEmpty()) return;
    String cmd = String(rx.c_str());
    cmd.trim();
    Serial.print("Received command: ");
    Serial.println(cmd);
    
    if (cmd.startsWith("TARE_SCALE")) {
      tareScale();
      pTxCharacteristic->setValue("OK: Scale tared (zeroed)");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "AUTO_CALIBRATE") {
      calibrateWithReferenceWeight();
      if (is_calibrated) {
        pTxCharacteristic->setValue("OK: Scale calibrated with 64.1g reference weight");
      } else {
        pTxCharacteristic->setValue("ERROR: Calibration failed");
      }
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "GET_WEIGHT") {
      String weightMsg = "WEIGHT:" + String(current_weight, 1) + "g";
      pTxCharacteristic->setValue(weightMsg.c_str());
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd.startsWith("SAVE_PILL_DATA:")) {
      String dataStr = cmd.substring(15);
      Serial.print("Saving pill data: ");
      Serial.println(dataStr);
      
      savePillData(dataStr.c_str());
      
      pTxCharacteristic->setValue("OK: Pill data saved");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "REQUEST_PILL_DATA") {
      Serial.println("Pill data requested");
      
      loadPillData();
      
      String jsonString;
      serializeJson(pillData, jsonString);
      
      String response = "PILL_DATA:" + jsonString;
      pTxCharacteristic->setValue(response.c_str());
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd.startsWith("SET_TIME:")) {
      String timeStr = cmd.substring(9);
      Serial.print("Setting time to: ");
      Serial.println(timeStr);
      
      int year, month, day, hour, minute, second;
      sscanf(timeStr.c_str(), "%d-%d-%d %d:%d:%d", &year, &month, &day, &hour, &minute, &second);
      
      timeinfo.tm_year = year - 1900;
      timeinfo.tm_mon = month - 1;
      timeinfo.tm_mday = day;
      timeinfo.tm_hour = hour;
      timeinfo.tm_min = minute;
      timeinfo.tm_sec = second;
      
      timeIsSynchronized = true;
      
      pTxCharacteristic->setValue("OK: Time synchronized");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd.startsWith("ADD_SCHEDULE:")) {
      String scheduleStr = cmd.substring(13);
      Serial.print("Adding schedule: ");
      Serial.println(scheduleStr);
      
      int id, hour, minute, days;
      sscanf(scheduleStr.c_str(), "%d,%d,%d,%d", &id, &hour, &minute, &days);
      
      addSchedule(id, hour, minute, days);
      
      pTxCharacteristic->setValue("OK: Schedule added");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "CLEAR_SCHEDULES") {
      Serial.println("Clearing all schedules");
      clearSchedules();
      
      pTxCharacteristic->setValue("OK: All schedules cleared");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd.startsWith("SCHEDULE_DUE:")) {
      String statusStr = cmd.substring(13);
      statusStr.trim();
      statusStr.toLowerCase();
      
      hasDueSchedules = (statusStr == "true");
      
      if (hasDueSchedules) {
        Serial.println("Medication schedule is due!");
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
        "GET_WEIGHT\n"
        "TARE_SCALE\n"
        "AUTO_CALIBRATE\n"
        "SET_TIME:YYYY-MM-DD HH:MM:SS\n"
        "ADD_SCHEDULE:ID,HOUR,MINUTE,DAYS\n"
        "CLEAR_SCHEDULES\n"
        "SCHEDULE_DUE:true/false\n"
        "SAVE_PILL_DATA:JSON\n"
        "REQUEST_PILL_DATA\n"
        "HELP";
      pTxCharacteristic->setValue(helpText);
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "SERVO1 OPEN" && servo1Pos != 0) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo1.write(10);
      servo1Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 1 Opened");
    } else if (cmd == "SERVO1 CLOSE" && servo1Pos != 180) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo1.write(175);
      servo1Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 1 Closed");
      
      servoCompletionTime = millis();
      servoMotionPending = false;
    }
    
    if (cmd == "SERVO2 OPEN" && servo2Pos != 0) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo2.write(10);
      servo2Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 2 Opened");
    } else if (cmd == "SERVO2 CLOSE" && servo2Pos != 180) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo2.write(168.5);
      servo2Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 2 Closed");
      
      servoCompletionTime = millis();
      servoMotionPending = false;
    }
    
    if (cmd == "SERVO3 OPEN" && servo3Pos != 0) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo3.write(10);
      servo3Pos = 0;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 3 Opened");
    } else if (cmd == "SERVO3 CLOSE" && servo3Pos != 180) {
      servoMotionPending = true;
      servoCompletionTime = millis() + servoOperationTimeout;
      
      servo3.write(175);
      servo3Pos = 180;
      dispensePending = true;
      lastServoActionTime = millis();
      Serial.println("Compartment 3 Closed");
      
      servoCompletionTime = millis();
      servoMotionPending = false;
    }
    
    if (cmd == "VIBRATE ON") {
      digitalWrite(vibrationMotorPin, HIGH);
      motorState = true;
      Serial.println("Vibration Motor Turned ON");
    } else if (cmd == "VIBRATE OFF") {
      digitalWrite(vibrationMotorPin, LOW);
      motorState = false;
      Serial.println("Vibration Motor Turned OFF");
    }
    
    if (cmd == "COMP1_LED ON") {
      digitalWrite(compartment1_LED, HIGH);
      Serial.println("Compartment 1 LED Turned ON");
    } else if (cmd == "COMP1_LED OFF") {
      digitalWrite(compartment1_LED, LOW);
      Serial.println("Compartment 1 LED Turned OFF");
    }
    
    if (cmd == "COMP2_LED ON") {
      digitalWrite(compartment2_LED, HIGH);
      Serial.println("Compartment 2 LED Turned ON");
    } else if (cmd == "COMP2_LED OFF") {
      digitalWrite(compartment2_LED, LOW);
      Serial.println("Compartment 2 LED Turned OFF");
    }
    
    if (cmd == "COMP3_LED ON") {
      digitalWrite(compartment3_LED, HIGH);
      Serial.println("Compartment 3 LED Turned ON");
    } else if (cmd == "COMP3_LED OFF") {
      digitalWrite(compartment3_LED, LOW);
      Serial.println("Compartment 3 LED Turned OFF");
    }
    
    if (cmd == "POWER_LED ON") {
      digitalWrite(power_LED, HIGH);
      Serial.println("Power LED Turned ON");
    } else if (cmd == "POWER_LED OFF") {
      digitalWrite(power_LED, LOW);
      Serial.println("Power LED Turned OFF");
    }
    
    if (cmd == "REFILL_LED ON") {
      digitalWrite(refill_LED, HIGH);
      Serial.println("Refill LED Turned ON");
    } else if (cmd == "REFILL_LED OFF") {
      digitalWrite(refill_LED, LOW);
      Serial.println("Refill LED Turned OFF");
    }
    
    if (cmd == "BT_LED ON") {
      digitalWrite(bluetooth_LED, HIGH);
      bluetooth_LED_State = true;
      Serial.println("Bluetooth LED Turned ON");
    } else if (cmd == "BT_LED OFF") {
      digitalWrite(bluetooth_LED, LOW);
      bluetooth_LED_State = false;
      Serial.println("Bluetooth LED Turned OFF");
    }
    
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

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Pill Dispenser BLE App...");
  
  preferences.begin("schedules", false);
  preferences.clear();
  preferences.end();
  
  pillDataPrefs.begin("pilldata", false);
  loadPillData();
  
  setupWeightSensor();
  
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  
  pinMode(compartment1_LED, OUTPUT);
  pinMode(compartment2_LED, OUTPUT);
  pinMode(compartment3_LED, OUTPUT);
  pinMode(power_LED, OUTPUT);
  pinMode(refill_LED, OUTPUT);
  pinMode(bluetooth_LED, OUTPUT);
  pinMode(bluetoothButtonPin, INPUT_PULLUP);  

  digitalWrite(compartment1_LED, LOW);
  digitalWrite(compartment2_LED, LOW);
  digitalWrite(compartment3_LED, LOW);
  digitalWrite(power_LED, HIGH);  
  digitalWrite(refill_LED, LOW);
  digitalWrite(bluetooth_LED, LOW);
  
  pinMode(vibrationMotorPin, OUTPUT);
  digitalWrite(vibrationMotorPin, LOW);
  
  delay(500);
  servo1.attach(servo1Pin);
  servo2.attach(servo2Pin);
  servo3.attach(servo3Pin);
  
  delay(100);
  servo1.write(175);
  servo2.write(168.5);
  servo3.write(175);
  servo1Pos = 180;
  servo2Pos = 180;
  servo3Pos = 180;
  
  timeinfo.tm_year = 123;
  timeinfo.tm_mon = 0;
  timeinfo.tm_mday = 1;
  timeinfo.tm_hour = 0;
  timeinfo.tm_min = 0;
  timeinfo.tm_sec = 0;
  
  loadSchedules();
  
  BLEDevice::init("SmartPillDispenser");
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  
  pTxCharacteristic = pService->createCharacteristic(
    CHAR_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());
  
  BLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    CHAR_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE
  );
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  
  pService->start();
  Serial.println("BLE Service Ready. Press button on GPIO 17 to start advertising.");
  
  isScanning = false;
}

void loop() {
  if (!startAdvertising && digitalRead(bluetoothButtonPin) == LOW) {
    delay(50); 
    if (digitalRead(bluetoothButtonPin) == LOW) {  
      Serial.println("Button pressed - Starting BLE Advertising");
      BLEDevice::getAdvertising()->start();
      startAdvertising = true;
      isScanning = true;
      
      while (digitalRead(bluetoothButtonPin) == LOW) {
        delay(10);
      }
    }
  }

  if (isScanning && !deviceConnected) {
    unsigned long currentMillis = millis();
    
    if (currentMillis - blinkInterval >= 500) {
      blinkInterval = currentMillis;
      bluetooth_LED_State = !bluetooth_LED_State;
      digitalWrite(bluetooth_LED, bluetooth_LED_State ? HIGH : LOW);
    }
  }
  
  unsigned long currentMillis = millis();
  if (dispensePending && (currentMillis - lastDispenseCheck >= dispenseCheckInterval)) {
    lastDispenseCheck = currentMillis;
    
    if (currentMillis - lastServoActionTime >= servoCompletionTimeout) {
      digitalWrite(compartment1_LED, LOW);
      digitalWrite(compartment2_LED, LOW);
      digitalWrite(compartment3_LED, LOW);
      Serial.println("Dispense completed, LEDs turned off");
      dispensePending = false;
    }
  }
  
  if (currentMillis - lastTimeCheck >= timeCheckInterval) {
    lastTimeCheck = currentMillis;
    
    if (timeIsSynchronized) {
      timeinfo.tm_sec += 2;
      mktime(&timeinfo);
      
      if (deviceConnected) {
        pTxCharacteristic->setValue("CHECK_SCHEDULES");
        pTxCharacteristic->notify();
      } else {
        hasDueSchedules = checkSchedulesDue();
        
        if (hasDueSchedules) {
          Serial.println("Local schedule is due!");
          alertScheduleDue();
        }
      }
    }
  }
  
  if (deviceConnected && hasDueSchedules) {
    for (int i = 0; i < 2; i++) {
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
  
  static unsigned long lastWeightCheck = 0;
  if (millis() - lastWeightCheck > 1000) { 
    lastWeightCheck = millis();
    updateWeightReading();
    
    if (deviceConnected) {
      String weightMsg = "WEIGHT:" + String(current_weight, 1) + "g";
      pTxCharacteristic->setValue(weightMsg.c_str());
      pTxCharacteristic->notify();
    }
  }
  
  delay(100);
}

void loadPillData() {
  pillData.clear();
  
  String jsonString = pillDataPrefs.getString("data", "{}");
  
  DeserializationError error = deserializeJson(pillData, jsonString);
  if (error) {
    Serial.print("Failed to parse pill data: ");
    Serial.println(error.c_str());
    pillData.clear();
  } else {
    Serial.println("Pill data loaded successfully");
  }
}

void savePillData(const char* jsonData) {
  pillDataPrefs.putString("data", jsonData);
  Serial.println("Pill data saved to flash memory");
  
  pillData.clear();
  DeserializationError error = deserializeJson(pillData, jsonData);
  if (error) {
    Serial.print("Failed to parse saved pill data: ");
    Serial.println(error.c_str());
  }
}

void endSession() {
  preferences.end();
  pillDataPrefs.end();
}

// Setup weight sensor
void setupWeightSensor() {
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scale.set_scale(); 
  scale.tare();      
  
  Preferences prefs;
  prefs.begin("scale_data", true);
  raw_zero_reading = prefs.getFloat("zero", 0.0);
  raw_reference_reading = prefs.getFloat("ref", 0.0);
  is_calibrated = prefs.getBool("calibrated", false);
  prefs.end();
  
  Serial.println("HX711 initialized");
  if (is_calibrated) {
    Serial.println("Scale is calibrated with reference weight of 64.1g");
    Serial.print("Zero reading: ");
    Serial.println(raw_zero_reading);
    Serial.print("Reference reading: ");
    Serial.println(raw_reference_reading);
  } else {
    Serial.println("Scale is not calibrated. Please use AUTO_CALIBRATE command");
  }
}

// Update weight reading based on calibration
void updateWeightReading() {
  if (scale.is_ready()) {
    long raw_value = scale.get_value(5); // Average of 5 readings
    
    if (is_calibrated && raw_reference_reading != raw_zero_reading) {
      // Calculate weight based on calibration
      float raw_weight_diff = raw_reference_reading - raw_zero_reading;
      float gram_per_unit = REFERENCE_WEIGHT / raw_weight_diff;
      current_weight = (raw_value - raw_zero_reading) * gram_per_unit;
      
      // Prevent negative weights
      if (current_weight < 0) {
        current_weight = 0;
      }
    } else {
      // Not calibrated, just show raw value
      current_weight = raw_value / 1000.0; // Divide by 1000 to make the number more readable
    }
    
    Serial.print("Raw: ");
    Serial.print(raw_value);
    Serial.print(" | Weight: ");
    Serial.print(current_weight, 1);
    Serial.println(" g");
  }
}

// Tare the scale (reset to zero)
void tareScale() {
  if (scale.is_ready()) {
    scale.tare();
    // Update zero reading for calibration
    raw_zero_reading = scale.get_value(10);
    
    // Save the new zero reading
    if (is_calibrated) {
      Preferences prefs;
      prefs.begin("scale_data", false);
      prefs.putFloat("zero", raw_zero_reading);
      prefs.end();
    }
    
    Serial.print("Scale tared with raw value: ");
    Serial.println(raw_zero_reading);
  }
}

// Calibrate with reference weight
void calibrateWithReferenceWeight() {
  if (scale.is_ready()) {
    // Get raw reading for reference weight (64.1g)
    raw_reference_reading = scale.get_value(10); 
    
    float raw_weight_diff = raw_reference_reading - raw_zero_reading;
    if (raw_weight_diff <= 0) {
      Serial.println("Calibration ERROR: Reference weight reading must be greater than zero reading");
      return;
    }
    
    // Save calibration data
    Preferences prefs;
    prefs.begin("scale_data", false);
    prefs.putFloat("zero", raw_zero_reading);
    prefs.putFloat("ref", raw_reference_reading);
    prefs.putBool("calibrated", true);
    prefs.end();
    
    is_calibrated = true;
    
    Serial.println("Scale calibrated successfully with reference weight of 64.1g");
    Serial.print("Zero reading: ");
    Serial.println(raw_zero_reading);
    Serial.print("Reference reading: ");
    Serial.println(raw_reference_reading);
  }
}