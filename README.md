# heatline-marisol-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/debiniaaa/heatline-marisol-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/debiniaaa/heatline-marisol-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**HEATLINE: Marisol Bay** is an original open-world crime game that runs entirely in a desktop browser from static files — no build step, no network, no assets on disk. Everything on screen is generated in code: a sun-soaked pastel city on a bay, built at load time from a seed.

You play Rio Calloway, a wheelman one bus ticket ahead of his past. Explore Marisol Bay on foot or behind the wheel of anything with keys in it. Traffic cruises the grid, pedestrians mind their business until they can't, and the Marisol Bay PD answers every witnessed crime with another star and another Interceptor. Fixer Sol Vega offers a three-job story — an errand, a theft, a getaway — plus endless courier runs for cash. There is a pistol if you earn it, a bust meter if you linger, and a hospital bill if you test the merchandise.

## What's in the bay

- A generated art-deco city: street grid, towers and walk-ups with lit windows, palms, lamps, a beach, a working docks pier, and named landmarks (The Palms Hotel, St. Coral Hospital, the MBPD station, Club Sirena).
- Driving with traffic AI that keeps lanes, turns at intersections and queues politely; parked cars along every kerb, all stealable.
- A five-star wanted system: witnesses matter, police predict your line and try to pin you, and hiding bleeds the heat away.
- Missions and money: a three-job story chain, repeatable courier deliveries, fines, hospital fees, and progress saved to localStorage.
- A full HUD: cash, health, wanted stars, objective with distance, speedometer, and a live minimap with police and objective markers.
- Sound with zero audio files: engine, sirens, gunfire, chimes and a warm synth pad loop, all WebAudio.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Controls: WASD move/drive, mouse look, E enter or steal a car, X draw the pistol, click to shoot, F melee, Shift sprint/boost, Space handbrake, Q take a courier job, P pause.

## Layout

- `game/` — the game itself: `index.html`, vendored three.js (`game/vendor/three.min.js`), and one-job-per-file modules in `game/src/` (world, vehicles, traffic, pedestrians, police, player, combat, missions, hud, audio, save, shots).
- `main.ts` — the entry program that copies `game/` and `screenshots/` to the output and writes the dossier.
- `screenshots/` — four real renders of the game, taken from its photo mode (`?shot=cover|street|drive|chase`).

This entry was built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01).

---

<sub>Entered on [make.fun](https://make.fun/?ref=gs2esb70&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
