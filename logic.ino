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

// ----- HX711 Load Cell Setup -----
const int LOADCELL_DOUT_PIN = 32;
const int LOADCELL_SCK_PIN  = 33;
HX711 scale;

// ----- BLE Globals -----
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
unsigned long lastWeightUpdate = 0;
const unsigned long weightInterval = 5000;  // 5 s

// ----- BLE Server Callbacks -----
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("BLE Device Connected");
    // send help menu on connect
    const char* helpText =
      "CMDs:\n"
      "SERVO1 OPEN/CLOSE\n"
      "SERVO2 OPEN/CLOSE\n"
      "SERVO3 OPEN/CLOSE\n"
      "LED ON/OFF\n"
      "TARE\n"
      "RAW\n"
      "HELP";
    pTxCharacteristic->setValue(helpText);
    pTxCharacteristic->notify();
  }

  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    Serial.println("BLE Device Disconnected");
    // Reset outputs on disconnect
    servo1.write(0); servo1Pos = 0;
    servo2.write(0); servo2Pos = 0;
    servo3.write(0); servo3Pos = 0;
    digitalWrite(ledPin, LOW); ledState = false;
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
      Serial.println("Compartment 1 Opened");
    } else if (cmd == "SERVO1 CLOSE" && servo1Pos != 0) {
      servo1.write(10);
      servo1Pos = 0;
      Serial.println("Compartment 1 Closed");
    }

    // Servo 2
    if (cmd == "SERVO2 OPEN" && servo2Pos != 180) {
      servo2.write(168.5);
      servo2Pos = 180;
      Serial.println("Compartment 2 Opened");
    } else if (cmd == "SERVO2 CLOSE" && servo2Pos != 0) {
      servo2.write(10);
      servo2Pos = 0;
      Serial.println("Compartment 2 Closed");
    }

    // Servo 3
    if (cmd == "SERVO3 OPEN" && servo3Pos != 180) {
      servo3.write(175);
      servo3Pos = 180;
      Serial.println("Compartment 3 Opened");
    } else if (cmd == "SERVO3 CLOSE" && servo3Pos != 0) {
      servo3.write(10);
      servo3Pos = 0;
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
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Smart Pill Dispenser BLE App...");

  // LED
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);

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
