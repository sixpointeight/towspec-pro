# TowSpec Pro | Recovery Database

## Overview
A mobile-friendly web application for roadside assistance professionals. Scan or manually enter a vehicle VIN to get full AAA RSI towing procedures including tow information, shift interlock override, battery location, jump starting, lockout procedures, and more.

## Tech Stack
- **Backend:** Python + Flask (server.py) — authenticates with AAA RSI, proxies procedure requests
- **Frontend:** Vanilla HTML/CSS/JS with Tailwind CSS (CDN) and Quagga2 (VIN barcode scanner)
- **Vehicle Database:** vehicles.json — 16,218 vehicles from rsi.aaa.biz (year/make/model/drivetrain/fuelType/URL)
- **External APIs:** NHTSA VIN decoder (public), AAA RSI procedures (requires credentials)

## Project Layout
- `server.py` — Flask backend for Replit dev: serves static files on port 5000, `/api/procedure` endpoint
- `netlify/functions/procedure.js` — Netlify serverless function (same logic, Node.js, no dependencies)
- `netlify.toml` — Netlify config: redirects `/api/procedure` → function, sets publish dir
- `index.html` — Single-page frontend (calls `/api/procedure` — works on both Replit and Netlify)
- `vehicles.json` — 16,218 vehicle records scraped from rsi.aaa.biz/procedures sitemaps
- `requirements.txt` — Python dependencies (flask, requests, beautifulsoup4)
- `replit.md` — This file

## Deploying to Netlify
1. Push code to GitHub (vehicles.json must be committed — it's ~2.8MB)
2. In Netlify dashboard → Site configuration → Environment variables, add:
   - `AAA_RSI_USERNAME` = your AAA RSI username
   - `AAA_RSI_PASSWORD` = your AAA RSI password
3. Deploy — Netlify will auto-detect the `netlify.toml` and build/serve the function

## Environment Secrets Required
- `AAA_RSI_USERNAME` — AAA RSI account username
- `AAA_RSI_PASSWORD` — AAA RSI account password

## Running the App
```
python3 server.py
```
Starts on port 5000. Logs in to AAA RSI at startup and maintains a session.

## How It Works
1. User enters/scans a 17-digit VIN
2. NHTSA API decodes VIN → year, make, model, drivetrain, fuel type
3. App searches local vehicles.json for matching AAA RSI records
4. User selects a configuration variant (AWD/FWD/RWD + fuel type)
5. Frontend calls `/api/procedure?url=...` on the Flask backend
6. Backend fetches the authenticated AAA RSI page, parses procedure sections
7. Sections displayed: Tow Information, Shift Interlock Override, Battery Location,
   Jump Starting, Tire Service, Fuel Type, Fuel Delivery, Electronic Key, Lockout Procedures
