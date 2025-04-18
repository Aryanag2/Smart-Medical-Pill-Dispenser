#include <Arduino.h>
#include <ESP32Servo.h>
#include "HX711.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
// Nordic UART Service UUIDs
#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_UUID_RX        "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // for writing commands
#define CHAR_UUID_TX        "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // for notifications
// ----- Servo Setup -----
Servo servo1, servo2, servo3;
const int servo1Pin = 25;
const int servo2Pin = 22;
const int servo3Pin = 23;
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
const int bluetooth_LED = 27;
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
unsigned long lastWeightUpdate = 0;
const unsigned long weightInterval = 5000;  // 5 s
// ----- BLE Server Callbacks -----
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("BLE Device Connected");
    digitalWrite(bluetooth_LED, HIGH);  // Turn on Bluetooth LED when connected
    
    // send help menu on connect
    const char* helpText =
      "CMDs:\n"
      "SERVO1 OPEN/CLOSE\n"
      "SERVO2 OPEN/CLOSE\n"
      "SERVO3 OPEN/CLOSE\n"
      "LED ON/OFF\n"
      "VIBRATE ON/OFF\n"
      "COMP1_LED ON/OFF\n"
      "COMP2_LED ON/OFF\n"
      "COMP3_LED ON/OFF\n"
      "TARE\n"
      "RAW\n"
      "HELP";
    pTxCharacteristic->setValue(helpText);
    pTxCharacteristic->notify();
  }
  
  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    Serial.println("BLE Device Disconnected");
    digitalWrite(bluetooth_LED, LOW);  // Turn off Bluetooth LED when disconnected
    
    // Reset outputs on disconnect
    servo1.write(0); servo1Pos = 0;
    servo2.write(0); servo2Pos = 0;
    servo3.write(0); servo3Pos = 0;
    digitalWrite(ledPin, LOW); ledState = false;
    digitalWrite(compartment1_LED, LOW);
    digitalWrite(compartment2_LED, LOW);
    digitalWrite(compartment3_LED, LOW);
    digitalWrite(vibrationMotorPin, LOW); motorState = false;
    
    pServer->getAdvertising()->start();
    Serial.println("Advertising restarted");
  }
};
// ----- BLE Characteristic Callbacks -----
class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rx = pCharacteristic->getValue();
    if (rx.isEmpty()) return;
    String cmd = String(rx.c_str());
    cmd.trim();
    cmd.toUpperCase();
    Serial.print("Received command: ");
    Serial.println(cmd);
    
    // HELP
    if (cmd == "HELP") {
      const char* helpText =
        "CMDs:\n"
        "SERVO1 OPEN/CLOSE\n"
        "SERVO2 OPEN/CLOSE\n"
        "SERVO3 OPEN/CLOSE\n"
        "LED ON/OFF\n"
        "VIBRATE ON/OFF\n"
        "COMP1_LED ON/OFF\n"
        "COMP2_LED ON/OFF\n"
        "COMP3_LED ON/OFF\n"
        "TARE\n"
        "RAW\n"
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
    if (cmd == "SERVO1 OPEN" && servo1Pos != 180) {
      servo1.write(175);
      servo1Pos = 180;
      digitalWrite(compartment1_LED, HIGH);  // Turn on compartment 1 LED
      Serial.println("Compartment 1 Opened");
    } else if (cmd == "SERVO1 CLOSE" && servo1Pos != 0) {
      servo1.write(10);
      servo1Pos = 0;
      digitalWrite(compartment1_LED, LOW);   // Turn off compartment 1 LED
      Serial.println("Compartment 1 Closed");
    }
    
    // Servo 2
    if (cmd == "SERVO2 OPEN" && servo2Pos != 180) {
      servo2.write(168.5);
      servo2Pos = 180;
      digitalWrite(compartment2_LED, HIGH);  // Turn on compartment 2 LED
      Serial.println("Compartment 2 Opened");
    } else if (cmd == "SERVO2 CLOSE" && servo2Pos != 0) {
      servo2.write(10);
      servo2Pos = 0;
      digitalWrite(compartment2_LED, LOW);   // Turn off compartment 2 LED
      Serial.println("Compartment 2 Closed");
    }
    
    // Servo 3
    if (cmd == "SERVO3 OPEN" && servo3Pos != 180) {
      servo3.write(175);
      servo3Pos = 180;
      digitalWrite(compartment3_LED, HIGH);  // Turn on compartment 3 LED
      Serial.println("Compartment 3 Opened");
    } else if (cmd == "SERVO3 CLOSE" && servo3Pos != 0) {
      servo3.write(10);
      servo3Pos = 0;
      digitalWrite(compartment3_LED, LOW);   // Turn off compartment 3 LED
      Serial.println("Compartment 3 Closed");
    }
    
    // LED
    if (cmd == "LED ON" && !ledState) {
      digitalWrite(ledPin, HIGH);
      ledState = true;
      Serial.println("LED Turned ON");
    } else if (cmd == "LED OFF" && ledState) {
      digitalWrite(ledPin, LOW);
      ledState = false;
      Serial.println("LED Turned OFF");
    }
    
    // Vibration Motor
    if (cmd == "VIBRATE ON" && !motorState) {
      digitalWrite(vibrationMotorPin, HIGH);
      motorState = true;
      Serial.println("Vibration Motor Turned ON");
    } else if (cmd == "VIBRATE OFF" && motorState) {
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
  }
};
void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Pill Dispenser BLE App...");
  
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
  
  // Initialize all LEDs to OFF except power LED
  digitalWrite(compartment1_LED, LOW);
  digitalWrite(compartment2_LED, LOW);
  digitalWrite(compartment3_LED, LOW);
  digitalWrite(power_LED, HIGH);    // Power LED is ON while device is running
  digitalWrite(refill_LED, LOW);
  digitalWrite(bluetooth_LED, LOW); // BT LED will turn on when connected
  
  // Vibration Motor
  pinMode(vibrationMotorPin, OUTPUT);
  digitalWrite(vibrationMotorPin, LOW);
  
  // Servos
  servo1.attach(servo1Pin);
  servo2.attach(servo2Pin);
  servo3.attach(servo3Pin);
  servo1.write(0);
  servo2.write(0);
  servo3.write(0);
  
  // Load cell init
  Serial.println("Initializing HX711...");
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  long initRead = scale.read();
  if (initRead <= 0) {
    Serial.println("WARNING: HX711 not detected!");
    // blink LED as warning
    for (int i = 0; i < 3; i++) {
      digitalWrite(ledPin, HIGH);
      delay(200);
      digitalWrite(ledPin, LOW);
      delay(200);
    }
  } else {
    Serial.println("HX711 connected.");
    scale.set_scale(420.0983);
    scale.tare();
  }
  
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
}
void loop() {
  // Check if weight is below threshold to set refill LED
  if (scale.wait_ready_timeout(100)) {
    float weight = scale.get_units(1);
    if (weight < 5.0) {  // If weight is less than 5g, turn on refill LED
      digitalWrite(refill_LED, HIGH);
    } else {
      digitalWrite(refill_LED, LOW);
    }
  }
  
  // Periodic weight notification
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