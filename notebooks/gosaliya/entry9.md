### Entry 9: April 13, 2025

**Objectives:**
- Test first full PCB revision (PCB1) with all subsystems  
- Diagnose power-subsystem failures (trace width, overheating)  
- Perform tolerance & thermal analysis  
- Design and order revised power-only PCB  

**Record (Right-Hand Page):**
- PCB1 arrived; soldered ESP32, RTC, load-cell amp, linear shutter, LEDs & button, and power regulators  
- Powered on: observed 5 V rail drop to 4.2 V under 500 mA load and regulator surface overheating after ~5 min  
- Measured PCB trace resistance; calculated I²R losses vs. expected voltage drop  
- Conducted tolerance analysis on regulator dropout voltage and copper trace ampacity  
- Determined that power traces (0.3 mm width) are undersized for peak currents  
- Decided to isolate power stage onto its own PCB with 1 mm-wide traces, added thermal vias and larger copper pours  
- Placed order for power-only PCB revision; delivery expected in 2 weeks  

**Figures (Left-Hand Page):**
- `fig9_1.png` — Photo of overheated regulator area on PCB1  
- `fig9_2.png` — Power-subsystem schematic excerpt showing revised trace widths  

*Attach `fig9_1.png` and `fig9_2.png` on the left-hand page.*
