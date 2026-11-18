# WOLFRAM

**A cooperative, first-person, hard sci-fi spaceship crew simulator for 1–5 players. It runs entirely in the browser.**

The *CSV Wolfram* is a 4,000-tonne fusion torch freighter hauling a reactor core from Luna to Ganymede, with stops at Phobos and Ceres. Nobody is assigned a role. Crew drift into jobs by walking to whatever is on fire, venting, overheating or being shot at. A RimWorld-style storyteller paces the voyage with failures, hazards, combat and opportunities.

▶ **Play:** `https://ggk202.github.io/Wgame/` · **Model viewer:** `https://ggk202.github.io/Wgame/viewer.html`

## Multiplayer

* One player clicks **Host multiplayer game** and gets a 5-character **join code**.
* Up to 4 others enter the code and click **Join**.
* The host's browser runs the whole simulation. Clients send inputs and actions, and the host streams ship state back.
* Connections are peer-to-peer over WebRTC using [PeerJS](https://peerjs.com). The free public PeerJS broker only introduces the peers. There is no game server.
* Some strict corporate or mobile networks block peer-to-peer connections (no TURN relay is configured). If joining times out, try another network.
* The host can save at any time (Menu → Save / Export). A saved game can be reloaded and re-hosted with a new code. Players who rejoin with the same name get their character back.

## The ship

| Deck | Systems |
|---|---|
| 4 Bridge | Helm, Navigation, Sensors, Fire Control, Comms, Status board |
| 3 Habitation | Atmosphere control & electrolysis, CO₂ scrubbers, water recycler, hydroponics, medbay, cryo bay (backup crew), storm shelter |
| 2 Engineering | D–³He fusion reactor (magnetic confinement tuning, SCRAM and restart), power distribution with priorities and breakers, battery, thermal control, coolant pumps |
| 1 Cargo | Fabricator, stores, repair drone bay (external systems), torpedo magazine |
| 0 Drive | Fusion torch drive, drive control, reaction-mass tanks, pellet injector |

Outside the hull are two radiator wings, three PDC turrets, a spinal railgun, a high-gain antenna and a sensor array. These are repaired by drones.

## Hard sci-fi rules

* **Newtonian travel:** burn, coast, flip 180° and burn to stop, using the rocket equation and a reaction-mass budget. The ship's clock is time-compressed while cruising and drops to real time in combat.
* **No artificial gravity:** thrust is gravity. Above 2.2 g, crew who aren't sitting at a console get hurt. Below 0.05 g you walk on mag boots.
* **Heat:** the reactor, drive, electronics, fires and railgun shots all fill a heat sink that only radiators can empty. Retracted radiators are safer in combat but dump heat 6× slower.
* **Atmosphere:** each deck tracks O₂, N₂ and CO₂ partial pressures and temperature. Breaches vent decks, and venting on purpose kills fires. Repressurising costs finite gas reserves.
* **Radiation:** proton storms (shelter behind the water walls), coolant leaks and reactor accidents. Dose accumulates per crew member.
* **Combat at range:** drive plumes mean there is no stealth. Lock targets with sensors. Railgun slugs can only be dodged. PDCs intercept torpedoes and drones. Chaff spoofs torpedoes.
* **Light-lag:** messages from Earth arrive minutes old.

## Difficulty

| | Recruit | Spacer | Veteran | Newtonian |
|---|---|---|---|---|
| Autopilot | ✓ | ✓ | – | – |
| Automatic reactor load following | ✓ | ✓ | – | – |
| Reactor field auto-tune | full | assist | – | – |
| Automatic radiators | ✓ | ✓ | – | – |
| Automatic fire sprinklers | ✓ | – | – | – |
| Automatic point defence | ✓ | ✓ | ✓ | – |
| Nanite repair | fast + seals small breaches | slow | – | – |
| Backup crew in cryo | 8 | 5 | 3 | 1 |

Storytellers: **Cassiopeia** (steady escalation), **Halley** (merciful), **Kessler** (chaotic). Each leg also has scripted beats: a distress call, a pirate ambush, a proton storm, a drone swarm and a final blockade.

## Controls

Desktop: `WASD` move, mouse look (click to capture), `Shift` run, `E` use, `R` (hold) repair, `F` (hold) use item, `G` drop, `Tab` ship status, `T` chat, `1–4` vote, `H` help, `M` mute, `Esc` menu.

iPad and tablets: left virtual stick to move, drag the right side to look, and the **USE / REPAIR / ITEM / DROP** buttons.

## Development

Plain ES modules, with no build step for the site. Three.js (r160) and PeerJS load from CDNs.

```
index.html, css/style.css, js/*.js     the game (served as-is by GitHub Pages)
tools/simtest.js                       headless simulation soak test:  node tools/simtest.js
tools/build_single.py                  bundles everything into one HTML file (solo debug build)
```

* `?net=local` uses a BroadcastChannel instead of WebRTC, so you can test multiplayer in several tabs of one browser.
* `?debug=1` enables the debug panel when hosting. It is always on in solo; press `` ` `` in game.
* The JS console exposes the game as `window.WOLFRAM`.
