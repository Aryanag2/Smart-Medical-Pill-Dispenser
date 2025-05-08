### Entry 1: January 25, 2025

**Objectives:**
- Summarize challenges in medication adherence for seniors  
- Review existing smart-dispensing solutions on the market  
- Define clear design goals (cost, accuracy, connectivity, power backup)  
- Sketch the initial system concept and high-level architecture  

**Record (Right-Hand Page):**
- **Demographics & adherence:**  
  - U.S. 65+ population grew by 9.4 % from 2020 to 2023  
  - 54 % of seniors take four or more prescription drugs  
  - 50 % of doses are forgotten or mistimed  
- **Financial impact:**  
  - Average annual medication spend ≈ \$800 per user  
  - Non-adherence wastes up to 50 % of that cost annually  
- **Competitive analysis:**  
  - **Hero dispenser:** \$540/year subscription; Wi-Fi only  
  - **MedMinder & Petal:** similar price points, require constant internet  
- **Identified user needs:**  
  - **Upfront cost ≤ \$250**; **server fees ≤ \$5/month**  
  - **Offline-first operation** after initial Bluetooth setup  
  - **Simple interface:** LEDs for dose & refill status; mobile web-app alerts  
  - **Battery backup** to cover power outages and maintain RTC  
- **Design targets:**  
  - **Dispensing accuracy ≥ 98.4 %** per scheduled dose  
  - **Alert latency < 5 seconds** from scheduled dispense time  
  - **Refill notification** when pill stock ≤ 10 %  
- **Next steps:**  
  1. Finalize and print high-level block diagram  
  2. Source candidate modules for each subsystem  
  3. Prepare parts list for initial breadboard prototyping  

**Figures:**
- `hero_device.jpeg` – Photo of the Hero smart dispenser (competitor device)  
- `hero_blockdiagram.png` – Hero’s high-level system block diagram  


