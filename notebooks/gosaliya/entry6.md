### Entry 6: March 10, 2025

**Objectives:**
- Final team meeting before full breadboard demo  
- Refactor and modularize firmware functions  
- Calibrate sensors in code & verify accuracy  
- Note: web app functionality pending — focus remains on breadboard firmware  

**Record (Right-Hand Page):**
- **Modular code:**  
  - Split sketch into `dispensePill()`, `indexCompartment()`, `readWeight()`, `handleBTCommands()`  
- **Sensor calibration:**  
  - Tested with 1 g, 2 g, and 5 g weights; adjusted calibration factor for consistent ±0.2 g readings  
- **Persistence & scheduling stub:**  
  - Prepared SPIFFS routines using `Preferences` to store dose-times offline  
  - Added RTC-driven trigger logic; UI hookup deferred until web-app code is ready  
- **Failsafe & debugging:**  
  - Added error-LED blink on stall detection  
  - Serial logging timestamps each state and error for tuning timing constants