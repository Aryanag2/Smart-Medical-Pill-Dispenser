### Entry 2: February 8, 2025

**Objectives:**
- Decompose system into major subsystems  
- Survey existing modules & designs  
- Finalize top-level parts list  

**Record (Right-Hand Page):**
- **Six subsystems identified:**  
  1. Real-Time Clock + battery backup  
  2. MCU & comms (ESP8266 → ESP32)  
  3. Motor control (stepper & servo drivers)  
  4. Weight sensing (HX711 + load cell)  
  5. Mechanical housing & pill routing  
  6. User interface (LEDs, buzzer, button, web-app)  
- **Module survey notes:**  
  - RTC: DS3231 (±2 ppm accuracy, coin-cell backup)  
  - MCU: ESP8266 dev-kit prototyping → ESP32-WROOM for more I/O & BLE  
  - Drivers: L298N for stepper; HS-318 servo for funnel shutter  
  - Sensor: 1 kg load cell + HX711 amplifier (±0.2 g)  
  - Enclosure: PLA 3D-print core, wood frame from machine shop  
- **Integration sketch:**  
  - Data-flow arrows between MCU, sensors, actuators, and UI drawn for clarity  
- **Final parts list:**  
  - ESP32-WROOM-32D  
  - DS3231 RTC module  
  - HX711 + 1 kg load cell  
  - L298N motor driver board  
  - HS-318 servos × 2  
  - LEDs: power, mode, refill, and 3× compartment indicators  
  - Pushbutton (pairing/reset)  
  - Regulators: 12 V→5 V (LM7805), 5 V→3.3 V (LP2950)  
  - 12 V Li-ion backup pack  

**Figures (Left-Hand Page):**
- `esp32.jpeg` – ESP32-WROOM-32D module photo  
- `ds3231.jpeg` – DS3231 RTC module photo  

