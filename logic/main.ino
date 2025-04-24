#include <Arduino.h>
#include <ESP32Servo.h>
#include "HX711.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <time.h>
#include <Preferences.h>

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_RX        "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_TX        "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

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

const int LOADCELL_DOUT_PIN = 32;
const int LOADCELL_SCK_PIN  = 33;
HX711 scale;

BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
bool isScanning = false;
unsigned long lastWeightUpdate = 0;
const unsigned long weightInterval = 5000;

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

void addSchedule(int id, int hour, int minute, int daysOfWeek);
void clearSchedules();
void saveSchedules();
void loadSchedules();
bool checkSchedulesDue();
void alertScheduleDue();

bool dispensePending = false;
unsigned long lastServoActionTime = 0;
const unsigned long servoCompletionTimeout = 3000;
unsigned long lastDispenseCheck = 0;
const unsigned long dispenseCheckInterval = 2000;

bool servoMotionPending = false;
bool weightMeasurementNeeded = false;
unsigned long servoCompletionTime = 0;
const unsigned long servoSettlingTime = 1000;
const unsigned long servoOperationTimeout = 3000;

float calibrationWeight = 0.0614;
long calibrationReading = 0;
float calibrationFactor = 0.5;

bool isAutoCalibrating = false;
unsigned long calibrationStartTime = 0;
int calibrationStep = 0;
float knownWeightMg = 0;

float getFilteredWeight() {
  const int samples = 20;
  float readings[samples];
  float sum = 0;
  
  for(int i = 0; i < samples; i++) {
    readings[i] = scale.get_units(3);
    sum += readings[i];
    delay(5);
  }
  
  float average = sum / samples;
  
  float weight_mg = average * 1000;
  
  return weight_mg;
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
      "CALIBRATE:WEIGHT_IN_MG\n"
      "AUTO_CALIBRATE:WEIGHT_IN_MG\n"
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
    
    digitalWrite(bluetooth_LED, LOW);
    bluetooth_LED_State = false;
    
    servo1.write(175); servo1Pos = 180;
    servo2.write(168.5); servo2Pos = 180;
    servo3.write(175); servo3Pos = 180;
    digitalWrite(vibrationMotorPin, LOW); motorState = false;
    
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
        "TARE\n"
        "RAW\n"
        "CALIBRATE:WEIGHT_IN_MG\n"
        "AUTO_CALIBRATE:WEIGHT_IN_MG\n"
        "SET_TIME:YYYY-MM-DD HH:MM:SS\n"
        "ADD_SCHEDULE:ID,HOUR,MINUTE,DAYS\n"
        "CLEAR_SCHEDULES\n"
        "SCHEDULE_DUE:true/false\n"
        "HELP";
      pTxCharacteristic->setValue(helpText);
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "TARE") {
      scale.tare(20);
      Serial.println("Scale tared.");
      pTxCharacteristic->setValue("OK: Scale tared");
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd == "RAW") {
      long raw = scale.read_average(10);
      char buf[32];
      snprintf(buf, sizeof(buf), "RAW: %ld", raw);
      Serial.println(buf);
      pTxCharacteristic->setValue(buf);
      pTxCharacteristic->notify();
      return;
    }
    
    if (cmd.startsWith("CALIBRATE:")) {
      String weightStr = cmd.substring(10);
      float knownWeightMg = weightStr.toFloat();
      
      if (knownWeightMg <= 0) {
        String response = "Error: Invalid weight value. Format: CALIBRATE:WEIGHT_IN_MG";
        pTxCharacteristic->setValue(response.c_str());
        pTxCharacteristic->notify();
        return;
      }
      
      Serial.printf("Starting calibration with %.2f mg reference weight\n", knownWeightMg);
      
      calibrateScale(knownWeightMg);
      return;
    }
    
    if (cmd.startsWith("AUTO_CALIBRATE:")) {
      String weightStr = cmd.substring(15);
      float knownWeightMg = weightStr.toFloat();
      
      if (knownWeightMg <= 0) {
        String response = "Error: Invalid weight value. Format: AUTO_CALIBRATE:WEIGHT_IN_MG";
        pTxCharacteristic->setValue(response.c_str());
        pTxCharacteristic->notify();
        return;
      }
      
      Serial.printf("Starting automatic calibration with %.2f mg reference weight\n", knownWeightMg);
      
      startAutoCalibration(knownWeightMg);
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
      
      weightMeasurementNeeded = true;
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
      
      weightMeasurementNeeded = true;
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
      
      weightMeasurementNeeded = true;
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

void measureWeightAfterServo() {
  if (!weightMeasurementNeeded) return;
  
  if (millis() - servoCompletionTime >= servoSettlingTime) {
    float weight_mg = getFilteredWeight();
    Serial.printf("Post-dispense weight: %.2f mg\n", weight_mg);
    
    if (deviceConnected) {
      char buf[48];
      snprintf(buf, sizeof(buf), "POST_DISPENSE_WEIGHT: %.2f mg", weight_mg);
      pTxCharacteristic->setValue(buf);
      pTxCharacteristic->notify();
    }
    
    weightMeasurementNeeded = false;
  }
}

void calibrateScale(float knownWeightMg) {
  if (knownWeightMg <= 0) {
    Serial.println("Error: Calibration weight must be greater than 0");
    return;
  }
  
  Serial.println("Taring scale...");
  scale.tare(20);
  delay(1000);
  
  Serial.printf("Please place %0.2f mg reference weight on the scale\n", knownWeightMg);
  
  if (deviceConnected) {
    char buf[64];
    snprintf(buf, sizeof(buf), "PLACE_WEIGHT: %.2f mg", knownWeightMg);
    pTxCharacteristic->setValue(buf);
    pTxCharacteristic->notify();
  }
  
  delay(5000);
  
  calibrationReading = scale.read_average(30);
  
  if (calibrationReading != 0) {
    calibrationFactor = (float)calibrationReading / knownWeightMg;
    scale.set_scale(calibrationFactor);
    
    Serial.printf("Calibration complete! New factor: %f\n", calibrationFactor);
    calibrationWeight = knownWeightMg;
    
    if (deviceConnected) {
      char buf[64];
      snprintf(buf, sizeof(buf), "CALIBRATED: %.6f", calibrationFactor);
      pTxCharacteristic->setValue(buf);
      pTxCharacteristic->notify();
    }
  } else {
    Serial.println("Calibration failed: zero reading");
    if (deviceConnected) {
      pTxCharacteristic->setValue("CALIBRATION_FAILED: Zero reading");
      pTxCharacteristic->notify();
    }
  }
}

void startAutoCalibration(float knownWeightMilligrams) {
  if (knownWeightMilligrams <= 0) {
    Serial.println("Error: Calibration weight must be greater than 0");
    
    if (deviceConnected) {
      pTxCharacteristic->setValue("CALIBRATION_FAILED: Invalid weight");
      pTxCharacteristic->notify();
    }
    return;
  }
  
  knownWeightMg = knownWeightMilligrams;
  
  isAutoCalibrating = true;
  calibrationStep = 0;
  calibrationStartTime = millis();
  
  Serial.println("Starting automatic calibration sequence...");
  Serial.println("Step 1: Taring scale - remove all weight");
  
  if (deviceConnected) {
    pTxCharacteristic->setValue("AUTO_CAL_START: Remove all weight from scale");
    pTxCharacteristic->notify();
  }
}

void updateAutoCalibration() {
  if (!isAutoCalibrating) {
    return;
  }
  
  switch (calibrationStep) {
    case 0:
      if (millis() - calibrationStartTime >= 3000) {
        scale.tare(20);
        Serial.println("Scale tared");
        
        if (deviceConnected) {
          pTxCharacteristic->setValue("AUTO_CAL_TARED: Scale zeroed");
          pTxCharacteristic->notify();
        }
        
        calibrationStep = 1;
        calibrationStartTime = millis();
        
        Serial.printf("Step 2: Place your %.1f mg weight on the scale\n", knownWeightMg);
        
        if (deviceConnected) {
          char buf[64];
          snprintf(buf, sizeof(buf), "AUTO_CAL_PLACE_WEIGHT: %.1f mg", knownWeightMg);
          pTxCharacteristic->setValue(buf);
          pTxCharacteristic->notify();
        }
      }
      break;
      
    case 1:
      if (millis() - calibrationStartTime >= 10000) {
        calibrationReading = scale.read_average(30);
        
        if (calibrationReading != 0 && knownWeightMg != 0) {
          calibrationFactor = (float)calibrationReading / knownWeightMg;
          
          scale.set_scale(calibrationFactor);
          
          Serial.printf("Raw reading for %.1f mg: %ld\n", knownWeightMg, calibrationReading);
          Serial.printf("Calculated calibration factor: %.6f\n", calibrationFactor);
          
          if (deviceConnected) {
            char buf[64];
            snprintf(buf, sizeof(buf), "AUTO_CAL_FACTOR: %.6f", calibrationFactor);
            pTxCharacteristic->setValue(buf);
            pTxCharacteristic->notify();
          }
          
          calibrationWeight = knownWeightMg;
          
          calibrationStep = 2;
          calibrationStartTime = millis();
          
          Serial.println("Step 3: Testing calibration...");
        } else {
          Serial.println("Calibration failed: Invalid readings");
          
          if (deviceConnected) {
            pTxCharacteristic->setValue("CALIBRATION_FAILED: Invalid readings");
            pTxCharacteristic->notify();
          }
          
          isAutoCalibrating = false;
        }
      }
      break;
      
    case 2:
      if (millis() - calibrationStartTime >= 2000) {
        float weight_mg = getFilteredWeight();
        
        Serial.printf("Test reading: %.2f mg (should be close to %.1f mg)\n", weight_mg, knownWeightMg);
        
        if (deviceConnected) {
          char buf[64];
          snprintf(buf, sizeof(buf), "AUTO_CAL_TEST: %.2f mg", weight_mg);
          pTxCharacteristic->setValue(buf);
          pTxCharacteristic->notify();
        }
        
        float percentError = abs(weight_mg - knownWeightMg) / knownWeightMg * 100.0;
        if (percentError <= 10.0) {
          Serial.println("Calibration successful!");
          if (deviceConnected) {
            pTxCharacteristic->setValue("AUTO_CAL_SUCCESS: Calibration completed");
            pTxCharacteristic->notify();
          }
        } else {
          Serial.printf("Warning: Calibration error of %.1f%% is high\n", percentError);
          if (deviceConnected) {
            char buf[64];
            snprintf(buf, sizeof(buf), "AUTO_CAL_WARNING: Error %.1f%%", percentError);
            pTxCharacteristic->setValue(buf);
            pTxCharacteristic->notify();
          }
        }
        
        Serial.println("Calibration complete. You can now remove the calibration weight.");
        if (deviceConnected) {
          pTxCharacteristic->setValue("AUTO_CAL_COMPLETE: Remove calibration weight");
          pTxCharacteristic->notify();
        }
        
        isAutoCalibrating = false;
      }
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Pill Dispenser BLE App...");
  
  preferences.begin("schedules", false);
  preferences.clear();
  preferences.end();
  
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  
  pinMode(compartment1_LED, OUTPUT);
  pinMode(compartment2_LED, OUTPUT);
  pinMode(compartment3_LED, OUTPUT);
  pinMode(power_LED, OUTPUT);
  pinMode(refill_LED, OUTPUT);
  pinMode(bluetooth_LED, OUTPUT);
  
  digitalWrite(compartment1_LED, LOW);
  digitalWrite(compartment2_LED, LOW);
  digitalWrite(compartment3_LED, LOW);
  digitalWrite(power_LED, HIGH);  // Power LED always ON
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
  
  Serial.println("Initializing HX711...");
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  long initRead = scale.read();
  if (initRead <= 0) {
    Serial.println("WARNING: HX711 not detected!");
  } else {
    Serial.println("HX711 connected.");
    scale.set_scale(0.5);
    scale.tare(20);
  }
  
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
  pServer->getAdvertising()->start();
  Serial.println("BLE Advertising Started");
  
  isScanning = true;
}

void loop() {
  if (isScanning && !deviceConnected) {
    unsigned long currentMillis = millis();
    
    if (currentMillis - blinkInterval >= 500) {
      blinkInterval = currentMillis;
      bluetooth_LED_State = !bluetooth_LED_State;
      digitalWrite(bluetooth_LED, bluetooth_LED_State ? HIGH : LOW);
    }
  }
  
  if (isAutoCalibrating) {
    updateAutoCalibration();
  }
  
  if (weightMeasurementNeeded) {
    measureWeightAfterServo();
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
  
  if (!weightMeasurementNeeded && millis() - lastWeightUpdate >= weightInterval) {
    lastWeightUpdate = millis();
    if (scale.wait_ready_timeout(500)) {
      float weight_mg = getFilteredWeight();
      Serial.printf("Weight: %.2f mg\n", weight_mg);
      if (deviceConnected) {
        char buf[32];
        snprintf(buf, sizeof(buf), "WEIGHT: %.2f mg", weight_mg);
        pTxCharacteristic->setValue(buf);
        pTxCharacteristic->notify();
      }
    } else {
      Serial.println("Load cell not ready.");
    }
  }
  
  delay(100);
}