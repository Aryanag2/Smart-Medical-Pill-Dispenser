### Entry 4: February 25, 2025

**Objectives:**
- Demonstrate breadboard prototype of interface, power, and mechanical subsystems  
- Validate core module integrations  
- Assess feasibility of rotating funnel design  

**Record (Right-Hand Page):**
- **Breadboard setup:**  
  - Used ESP32 dev kit (with onboard USB) for MCU and programming  
  - Connected DS3231 RTC module, HX711 + 1 kg load cell, standard servo, LEDs, and pushbutton  
- **Firmware validation:**  
  - Moved servo to 0 °, 90 °, and 180 ° positions reliably  
  - Verified load-cell reading lights LED when weight threshold exceeded  
  - Tested Bluetooth pairing via button and simple LED on/off commands  
- **Design evaluation:**  
  - Consulted machine shop: rotating funnel + stepper had clearance and alignment issues  
  - Decided to switch to a servo-driven shutter for dispensing  
- **Next steps:**    
  2. work with machine shop and breadboard-test the  design  
  3. Refine firmware timing and calibration for the new mechanism  

**Figures (Left-Hand Page):**
- `breadboard.png` — Photo of the breadboard prototype setup  
  
