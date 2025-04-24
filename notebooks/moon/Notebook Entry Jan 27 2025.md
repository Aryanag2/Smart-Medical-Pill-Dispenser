# **Personal Research Notebook – Concept Deep Dive**

*Aryan Moon* • January 27, 2025

---

## **1 ⎯ Smart Medical Pill Dispenser**

### **1.1 Problem Restated**

Medication non-adherence causes \~125 k US hospital deaths/year and billions in avoidable costs. Elderly and chronically ill patients struggle with getting their medications on time

**1.2 Landscape Scan**

1. Commercial Options  
   1. Hero  
      1. Proven market demand  
      2. HIPAA dashboards  
      3. Not very cost efficient  
         1. Costs the user over $500 every year  
      4. No refill sensing  
2. SPEC 2.0 Smart Pill Expert System  
   1. IoT dispenser that release dose at scheduled times  
   2. Gaps:  
      1. Still required user confirmation  
         1. False positive “Taken” events

**1.3 Key Technical Findings**

- Dispensing accuracy  
  - Optical pill counting usually beats weight based methods especially when pills are less than 1g  
- Sensors  
  - HX711 load cell amplifier is the industry staple  
- Connectivity  
  - BLE \+Wi-Fi dual stack module  
  - Must meet home healthcare requirements for mains isolations

### **1.4 Feasibility Snapshot**

- Complexity:Medium  
- Expected cost:  
  - $85 without enclosure  
- Something cool to add  
  - Refill-level weight trending

**1.5 Next Steps**

- Look into how the HX711 driver works and figure out the main parts for how its needed to be implemented  
- Look into the tolerance analysis for all the components needed for this project  
- Look into the design we should implement

