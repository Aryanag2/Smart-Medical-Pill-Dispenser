### Entry 10: April 20, 2025

**Objectives:**
- Test breadboard setup in machine shop environment  
- Integrate enclosure with buttons and LEDs  
- Prototype 3D-printed trimmer parts to prevent pill jamming  

**Record (Right-Hand Page):**
- Brought breadboard prototype to machine shop for fit check in enclosure  
- Mounted LEDs for dose status and pushbuttons for pairing/refill alerts  
- Observed pill jams in rotating gate design; designed “trimmer” guides to smooth flow  
- Sent trimmer models to SCD for 3D printing in PETG to test clearances  
- Verified button actuation and LED visibility through enclosure cutouts  

**Figures (Left-Hand Page):**
- `fig10_1.png` — Photo of breadboard inside enclosure with buttons and LEDs installed  
- `fig10_2.png` — Render of 3D-printed trimmer guide prototypes  

*Attach `fig10_1.png` and `fig10_2.png` on the left-hand page.*  


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
- `fig11_1.png` — Screenshot of Electron app dashboard  
- `fig11_2.png` — Photo of working PCB with LEDs and button mounted  

