# Smart Medical Pill Dispenser - Electron App

This is an Electron application for controlling the Smart Medical Pill Dispenser via Bluetooth Low Energy (BLE).

## Features

- Discover and connect to the Smart Pill Dispenser via BLE
- Control the three pill compartments (open/close)
- Control the status LEDs (power, refill, time to take medication)
- Monitor weight readings from the dispenser
- Vibration motor control
- Send custom commands to the dispenser

## Prerequisites

- Node.js (v14+ recommended)
- npm
- Electron
- Smart Medical Pill Dispenser with Arduino ESP32 running the corresponding firmware

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Rebuild native modules for Electron:
   ```
   npm run rebuild
   ```

## Running the Application

```
npm start
```

## Connecting to the Pill Dispenser

1. Make sure your Smart Medical Pill Dispenser is powered on
2. Click "Scan for Devices" in the application
3. When the dispenser appears in the list (identified as "SmartPillDispenser"), click "Connect"
4. Once connected, all control buttons will become available

## Available Commands

The Smart Medical Pill Dispenser supports the following commands:

- `SERVO1 OPEN/CLOSE` - Open/close compartment 1
- `SERVO2 OPEN/CLOSE` - Open/close compartment 2
- `SERVO3 OPEN/CLOSE` - Open/close compartment 3
- `LED ON/OFF` - Control main LED
- `VIBRATE ON/OFF` - Control vibration motor
- `COMP1_LED ON/OFF` - Control compartment 1 LED
- `COMP2_LED ON/OFF` - Control compartment 2 LED
- `COMP3_LED ON/OFF` - Control compartment 3 LED
- `POWER_LED ON/OFF` - Control power LED
- `REFILL_LED ON/OFF` - Control refill LED
- `TIME_LED ON/OFF` - Control time to take medication LED
- `TARE` - Tare the weight scale
- `RAW` - Get raw weight readings
- `HELP` - Display help menu

## Troubleshooting

- **Bluetooth Not Available**: Make sure Bluetooth is enabled on your computer
- **Device Not Found**: Ensure the dispenser is powered on and in range
- **Connection Issues**: Try restarting both the application and the dispenser

## License

ISC 