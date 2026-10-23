# 🚒 Dispatch HQ — Open Beta Release Notes

**Version:** 0.4.0-alpha  
**Release Date:** August 2026  
**Play now:** https://dispatch-hq-deandrewharris.zocomputer.io  
**Engine:** React · TypeScript · Vite · Hono/Bun · WebSocket · MapLibre GL · OSRM

---

## What is Dispatch HQ?

**Dispatch HQ** is a real-time emergency-dispatch simulation game that puts you in the command chair of a city’s first-response network. Pick a city, choose your service, build stations, recruit units, and dispatch them to calls as they pop up across a live map. It’s built as a modern, browser-based take on the emergency-management genre — no installs, no Flash, just a fast map and a clean dark UI.

> Command the chaos. Build the network. Save the city.

This is an **open beta**. The core loop is playable end-to-end, and we’re looking for testers willing to break things, suggest features, and help shape the roadmap toward v1.0.

---

## ✨ What You Can Play Today

### 🗺️ Live City Map
- Real MapLibre GL map with dark, light, and satellite styles.
- Five launch cities: **Los Angeles, New York, Chicago, Miami, and Seattle**.
- Unit markers, station icons, mission pulses, and route lines update in real time.

### 🚒 Three Separate Services
Choose your department at the start of each run:

| Service | Units | Vibe |
|---------|-------|------|
| **Fire** 🔥 | Engine, Ladder, Rescue, Hazmat, Chief, Water Tanker, Air Support | Big red trucks, structure fires, hazmat scenes |
| **Police** 🚔 | Patrol, SWAT, K9, Traffic | Pursuits, crowd control, tactical responses |
| **EMS** 🚑 | Ambulance, Paramedic, Air Ambulance | Street-level medical, life-flight rescues |

Each service has its own stations, units, mission types, and reward economy.

### 🏢 Build, Upgrade, Recruit
- Place stations on the map and upgrade them through 5 levels.
- Recruit service-specific units with different speeds, capacities, and costs.
- Manage credit and XP as you expand your coverage.

### 📻 Dispatch Loop
- Missions spawn dynamically near your city.
- Cross-service calls: severe incidents can request backup from Police, EMS, or Fire.
- Dispatch units, watch them route to the scene, and complete calls for credits and XP.
- A 1-second game tick drives mission timers, unit movement, and status changes.

### 🎛️ Command UI
- **TopBar**: credits/XP, stress meter, map style toggle, settings, pause.
- **Sidebar**: missions, stations, units, leaderboard, chat.
- **BottomBar**: Assistant, Tactical Map, Radio Comms, map controls.
- **Unified Dispatch Center (CAD)**: inline incident board, unit list, call dialog, and triage scoring.
- **Radio Comms**: dispatch/unit/broadcast channels with auto-generated radio chatter.
- **Stress Meter**: rises when calls fail, decays when you win.
- **Random Events**: weather, protests, heat waves, drone sightings, and other city-wide curveballs.
- **Fog of War**: map vision driven by your station coverage.
- **Tech Tree**: 4 branches (vehicles, stations, economy, training), 4 tiers each.
- **Onboarding / Tutorial**: a 6-step guided first run with skip option.
- **Save System**: local auto-save every 30 seconds, plus manual `Ctrl+S`.
- **Guest Mode**: jump in instantly with no account required.

### 🤖 Dispatch Assistant
An offline, rule-based AI assistant is built into the CAD to answer basic commands, give dispatch advice, and walk new players through their first shifts.

### 🔊 Audio Foundations
Audio hooks are wired throughout the game for future siren, dispatch tone, radio chatter, and completion effects. (Sound assets are in progress — expect them in the next update.)

---

## 🎨 Design & Art Direction

Dispatch HQ uses a **dark-first, command-center aesthetic**:

- Deep slate backgrounds (`bg-gray-950`) with clean white text.
- Service-coded accents: **orange** for Fire, **blue** for Police, **green** for EMS.
- Card-based panels with glassy surfaces and soft borders.
- Framer Motion animations for panel slides, mission pulses, toasts, and transitions.
- Lucide icons for crisp, consistent iconography.
- Transparent logo/favicon centered in the main menu and loading screen.

The design goal is to feel like a real CAD workstation — dense information, readable at a glance, and satisfying to operate under pressure.

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Framer Motion |
| State | Zustand 5 |
| Map | MapLibre GL JS |
| Routing | OSRM demo server + straight-line fallback |
| Backend | Hono 4 on Bun |
| Realtime | WebSocket server |
| Database | PostgreSQL + Drizzle ORM |
| Monorepo | pnpm workspaces + Turborepo |

The game is built for **modern browsers** and runs best on desktop right now. Mobile/tablet layouts are on the roadmap.

---

## 🧪 How to Beta Test

1. **Open the game:** https://dispatch-hq-deandrewharris.zocomputer.io
2. **Pick Guest Mode** or create an account.
3. **Choose a city and service**, then play through the tutorial or skip it.
4. **Build a station**, recruit a unit, and dispatch to a few calls.
5. **Report any bugs** through the in-game bug reporter (gear icon → Bug Report) or by opening an issue in the project repo.
6. **Share feedback** on what feels good, what breaks, and what you want next.

We especially want to know about:
- UI bugs, black screens, or broken buttons
- Map/route weirdness or units driving through buildings
- Confusing tutorial steps
- Performance issues or long load times
- Feature ideas for Police/EMS that would make them feel distinct from Fire

---

## 💛 Support Dispatch HQ

Dispatch HQ is a solo indie project. Every donation goes directly into server costs, map tiles, audio assets, art, and development time. If you enjoy the beta and want to see the game grow, here are the ways to support:

- **Stripe:** [donation link coming soon — $5 / $10 / custom]
- **Cash App:** `$YourCashTag` *(replace with your tag)*
- **PayPal:** `paypal.me/YourLink` *(replace with your link)*
- **Ko-fi / Buy Me a Coffee:** `ko-fi.com/YourName` *(replace with your link)*
- **Patreon:** `patreon.com/YourName` *(replace with your link)*

Supporters will be credited in the upcoming **Credits** screen and get first access to closed test builds. Thank you for helping keep the lights on downtown.

---

## 🗺️ What’s Next (Toward v1.0)

- Real OSRM driving routes wired into every dispatch path
- Larger, more readable unit markers and callout labels
- Sound effects + radio chatter audio
- Patrol routes that move units through the city
- Save slots and server-persistent progress
- Multiplayer co-op dispatch
- Campaign scenarios and disasters
- Mutual aid, staffing shifts, and budget economy
- Custom domain + press kit + trailer

---

## 📬 Stay in Touch

- **Email:** deandrewh26@gmail.com
- **GitHub:** https://github.com/Subject-Emu-5259
- **Instagram:** https://instagram.com/officialfmgmuneydre
- **LinkedIn:** https://linkedin.com/in/deandrewharris94/
- **Play now:** https://dispatch-hq-deandrewharris.zocomputer.io

Thanks for playing. The city doesn’t sleep — and neither does Dispatch HQ.

— *Dre & the Dispatch HQ team*
