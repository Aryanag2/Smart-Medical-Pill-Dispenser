### Entry 5: March 3, 2025

**Objectives:**
- Kick off firmware development on the breadboard  
- Validate control of mechanical & sensing subsystems  
- Lay groundwork for mobile/web interface commands  

**Record (Right-Hand Page):**
- **Arduino IDE setup:**  
  - Installed ESP32 core, HX711 and Servo libraries  
  - Created sketch with `setup()` and `loop()` stubs  
- **Breadboard firmware tests:**  
  - Servo on pin 4 moved to 0°, 90°, and 180° reliably  
  - Stepper via L298N indexed compartments; tuned `stepDelay` to correct step errors  
  - Load cell calibrated using `scale.set_scale()` and `scale.tare()`, LED on pin 12 lights when weight threshold exceeded  
- **Bluetooth pairing & UI stub:**  
  - Button on pin 5 initiates pairing mode via BLE  
  - Sketch logs “LED ON”/“LED OFF” commands over Serial; full web-app integration to come  
- **Code structure:**  
  - Implemented basic state machine (`IDLE`, `PAIRING`, `DISPENSE`, `ERROR`) for early prototyping  

**Figures (Left-Hand Page):**
- `code_flow.png` – Firmware Code Flow Diagram  
- `data_flow.png` – Data Flow Diagram  