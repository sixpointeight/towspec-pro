# TowSpec Pro | Recovery Database

## Overview
A lightweight, mobile-friendly static web application for roadside assistance professionals. Users can scan a vehicle's VIN barcode or enter it manually to retrieve towing procedures, neutral engagement instructions, and tie-down points.

## Tech Stack
- **Frontend:** Pure HTML5, CSS3, Vanilla JavaScript
- **Styling:** Tailwind CSS (via CDN)
- **Libraries:** Quagga2 (barcode/VIN scanning via camera)
- **APIs:** NHTSA VIN decoder API (vpic.nhtsa.dot.gov)
- **Build System:** None — pure static site, no build step required

## Project Layout
- `index.html` — Single-page application containing all UI, logic, and the internal towing database
- `netlify.toml` — Netlify security headers config (not used in Replit)
- `replit.md` — This file

## Running the App
The app is served via Python's built-in HTTP server on port 5000:
```
python3 -m http.server 5000 --bind 0.0.0.0
```

## Features
- VIN barcode scanning via device camera (Quagga2)
- Manual 17-digit VIN entry
- NHTSA API integration for vehicle make/model/year lookup
- Internal towing procedures database (hardcoded JS array)
- Offline-ready badge (service worker / PWA-style)
- Mobile-first responsive design
