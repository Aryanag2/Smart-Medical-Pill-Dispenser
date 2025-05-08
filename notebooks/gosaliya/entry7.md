### Entry 7: March 17, 2025

**Objectives:**
- Conduct full breadboard integration demo  
- Validate end-to-end dispensing cycle  
- Identify firmware refinements before design review  

**Record (Right-Hand Page):**
- Assembled ESP32, , load-cell amplifier, servo motors, LEDs, button, and battery backup on the breadboard  
- Uploaded consolidated firmware with modular functions (`dispensePill()`, `indexCompartment()`, `readWeight()`, `handleBTCommands()`)  
- Ran demo sequence: wake, dispense dose, verify weight, signal success via LED  
- Measured average dispense latency: 1.8 s  
- Logged dispense errors for tuning threshold and timing constants  
- Team feedback: shutter mechanism consistent; LED alerts clear; adjust weight threshold by ±0.3 g  
- Prepared notes for upcoming design review and final paper  

**Figures (Left-Hand Page):**
- `breadboard.png` – Photo of integrated breadboard assembly  
- `basic-blueooth.png` - Basic bluetooth connectivity from ES32  
