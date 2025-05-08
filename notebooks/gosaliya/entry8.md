### Entry 8: April 6, 2025

**Objectives:**
- Prototype web interface for device control & monitoring  
- Integrate JavaScript frontend with device via BLE/WebSocket  
- Test UI commands for dispensing and status updates  

**Record (Right-Hand Page):**
- Created basic web app structure in `index.html` with buttons for “Dispense Dose” and “Check Status”  
- Implemented BLE connection and command handlers in `main.js`  
- Developed `demo.js` to wire up UI buttons to BLE commands and display device responses  
- Verified browser↔device communication: “Dispense” and “Status” operations complete in 2–3 s  
- Noted occasional packet loss under weak signal; plan to add retry logic and visual feedback (spinner)  
- Defined next steps: full feature integration, robust error handling, and UI styling  

**Figures (Left-Hand Page):**
- `fig8_1.png` — Screenshot of web app dashboard with control buttons  
- `fig8_2.png` — Diagram of Web App ↔ Device communication flow  

*Attach `fig8_1.png` and `fig8_2.png` on the left-hand page.*  
