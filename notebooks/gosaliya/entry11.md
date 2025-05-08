
### Entry 11: April 27, 2025

**Objectives:**
- Validate full PCB functionality  
- Develop Electron desktop app for device control  
- Finalize firmware: HX711 calibration, BLE button link, flash-based schedule storage, and UI polish  

**Record (Right-Hand Page):**
- Received and tested revised PCB; all subsystems powered, no overheating  
- Calibrated HX711 in firmware for ±0.1 g accuracy; updated `readWeight()` routine  
- Mapped BLE “pair” button to trigger dispense and status commands  
- Implemented SPIFFS-based schedule storage in flash memory; supports up to 10 dose-times  
- Built Electron app with React UI: “Dispense Now,” “View Schedule,” and real-time status indicators  
- Iterated UI for user-friendly labels, feedback spinners, and error dialogs  

**Figures (Left-Hand Page):**
- `final-electron-demo.png` — Screenshot of Electron app dashboard  
- `working-pcb.png` — Photo of working PCB with LEDs and button mounted  

