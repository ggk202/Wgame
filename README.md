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

## Look

The ship and crew follow an ISS-era, NASA-style look. It's built entirely from procedural geometry and canvas textures (no image assets), so it still loads instantly and runs on iPad:
* **Exterior:** a white quilted-insulation crew module with a cupola-style bridge, mission markings and an original patch; an open lattice truss; white spherical tanks; gold-foil reaction-mass tanks; ISS-style radiator wings; violet auxiliary solar arrays; a shadow shield and the torch-drive nozzle. The moon or planet at each port shows below.
* **Interior:** off-white equipment racks with placards, ISS-yellow handrails, strapped stowage bags, cable trays, laptop workstations and blue crew seats.
* **Crew:** casual crew wear a polo in their player colour. Suited crew wear a white EMU-style spacesuit with a life-support backpack, chest control module, gold sun visor, helmet lights and colour-coded identification stripes. In first person, a helmet frame appears while suited.

**Rendering:** PBR materials with an image-based environment, filmic tone mapping, soft shadow maps from each deck's ceiling key light and from the Sun on EVA. Planet atmospheres have no mesh shell. A camera-facing quad over each planet ray-marches single Rayleigh and Mie scattering per pixel, using real scale heights and optical depths for Earth, Mars (dust-dominated) and Jupiter. The glowing limb, daylight haze, reddened terminator and the planet's shadow in the air all come from that. Sunlight reaching the ground is filtered by air mass, and a procedural cloud deck drifts inside the atmosphere. Menu → Graphics sets Low (no shadows), Medium (the tablet default) or High.

## Tutorial

**New here? Play the tutorial** in the lobby starts a solo Recruit voyage with the storyteller asleep. An instructor box walks you through it in about 15 minutes and ticks each step off as you do it, live:

1. Moving around and taking the lift.
2. Using consoles.
3. Undocking, the autopilot, turning by hand and SAS.
4. The reactor and heat.
5. Suiting up.
6. A live-fire drill against an unarmed target hulk.
7. A short manual docking at Phobos.

Skip a step with `N`. At the end you can keep flying in free play (the storyteller wakes up) or return to the lobby. Tutorial games are never autosaved.

## The ship

The CSV Wolfram is about 150 m long. From bow to stern:

* **Bow:** the docking port.
* **Pressure modules:** the command and habitation modules, then the centrifuge hub with its spinning ring and three spokes, then the engineering and cargo modules. The cargo module has the starboard airlock and a work pod berthed on the port side.
* **Spine truss:** a tank farm (spherical D-He3 tanks and long gold-foil reaction-mass tanks) and two big radiator wings.
* **Stern:** the drive bus, the shadow shield and a magnetic nozzle.

Weapons:

* **Spinal railgun:** twin ventral rails run the length of the modules, with the muzzle beside the bow port.
* **Three 6-barrel gatling PDCs:** two dorsal and one ventral. Each gun picks its own target, either a torpedo you've flagged in manual mode or the nearest threat it can see. It then slews onto that torpedo's actual approach path, spins up and walks tracer streams onto it.
  * **Firing arcs:** a gun only fires on what it can see from its mount, above its own horizon and with no hull in the way. A torpedo from a blind angle gets through unopposed unless the helm rolls the ship.
  * **Salvos:** torpedoes arrive on their own curving paths, so a salvo comes in from several directions at once.
  * **Idle:** the guns sweep slowly when there's nothing to shoot.
* **Seeing ordnance:** torpedoes, tracers, missiles and explosions are drawn in the space around the ship, so you see them from EVA, on the external cameras, and through the bridge windows, the skylights and the ring's viewports.
* **Dorsal 8-cell launcher:** fires Kestrel short-range missiles. It reloads itself from stock, fires salvos of 1, 2 or 4, and its cell lids pop as the missiles boost out.

Nine **external cameras** can be cycled at the Helm and at Fire Control. They are CCTV feeds rendered live into the console.

Interiors are built for both thrust gravity and zero-g:

* tread-plate floors and acoustic ceilings;
* eight structural ribs per deck, with rack bays between them;
* handrails at waist and head height, ceiling grab bars and foot loops;
* a hazard-striped open trunk with a safety railing, a ladder and a platform lift.

Static geometry is merged by material, so the detail stays cheap to draw.

**Sounds:** most effects are synthesized in code. Three recorded CC0/CC-BY sounds are trimmed, looped and normalised in `sounds/`, with credits in `sounds/CREDITS.md`:

* **Consoles:** opening a console plays a computer start-up (power thunk and spin-up whine), which then settles into a looping running hum.
* **PDCs:** the gatlings fire with a recorded Phalanx CIWS burst.
* **Malfunction alarm:** this marks real ship trouble. One tone sounds per fault, fire or breach. The full alarm repeats during red alert while something is burning, breached, destroyed or the reactor is down. Combat alone keeps the synthesized klaxon.

If a recording fails to load, everything falls back to synthesis.

**Muffled weapons:** there is no sound in vacuum. Inside, gunfire, launches and impacts reach you as low thuds conducted through the hull (low-passed with a resonant hump). On EVA they reach you only through your gloves and the tether, so they're duller and quieter still.

**Console tabs:** each console keeps its most important controls pinned at the top, with everything else in tabs. Click a tab, or flip between them with `[` and `]`. On consoles with a live view (the Fire Control and Sensors telescopes, and the Helm's docking camera during an approach), the view sits in a left column and the tabs fill the right, so nothing needs scrolling.

## Flying the ship

The ship has a full rotational state. Its quaternion attitude and angular rates are driven by RCS thrusters, and the main drive pushes along wherever the nose points.

* **Helm station:** a wraparound desk with a main console, attitude and docking side screens, a pilot couch, and hand controllers that move with your inputs. While seated: `W/S` pitch, `A/D` yaw, `Q/E` roll, `X` kills rotation (SAS Hold). On-screen hold buttons do the same on touch.
* **SAS modes:** Off, Hold, Prograde, Retrograde, Target and Dock-align, depending on difficulty. Recruit and Spacer get all of them. Veteran gets Hold only, so pointing is by hand. Newtonian gets none, so every rotation you start you must stop yourself. Any stick input overrides SAS on that axis. The 180° flip needs a pointing SAS; without one, you fly it by hand.
* **Docking is manual.** Request an approach in orbit and you start about 200 m from the station with sideways drift and misalignment. Fly the docking-camera view with RCS translation (`I/K` forward/back, `J/L` left/right, `U/O` up/down) and rotation. You need to centre the standoff cross on the target and touch the port inside the capture window: < 0.35 m off-axis, < 0.25 m/s, < 3° and roll < 5°. Missing it bounces you off, and doing so hard damages the bow and nearby systems. Recruit and Spacer get a predicted-contact marker and a recommended closing speed. Newtonian shows only range and closing speed.
* **Combat geometry:** the spinal railgun fires only along the nose, within 1.5° of the target. Nose-on, the ship also presents a much smaller silhouette, and rotating spoils enemy firing solutions. Railgun recoil and hits knock the ship's attitude.

**Combat telescope:** Fire Control and Sensors show an optical telescope locked on the target. Enemy ships (corvettes, gunships, frigates, drones) are modelled and seen turning on RCS, burning their drives, and firing: muzzle flashes, incoming slugs and missiles, PDC tracers, hits and explosions. A boresight marker shows where our railgun points, with RAIL SOLUTION when it bears.

## Consoles

Every screen on the ship is live, showing its system's readouts in a retro amber/orange phosphor style. Pressing **E** on a console flies the camera square onto its screen and releases the mouse, so you use the full interface directly on that screen. Leave with the **EXIT CONSOLE** button below it, `Esc` or `E`. Lockers, the lift and the Tab status view open as free-standing terminals in the same style. Consoles power up with a CRT warm-up and POST boot sequence. Mechanical relays clack while they boot and chatter quietly while idle, and every screen in a room re-boots in a relay cascade when power comes back after a blackout.

## The ship

| Deck | Systems |
|---|---|
| 4 Bridge | Helm, Navigation, Sensors, Fire Control, Comms, Status board |
| 3 Habitation | Atmosphere control & electrolysis, CO₂ scrubbers, water recycler, hydroponics, medbay, cryo bay (backup crew), storm shelter |
| 2 Engineering | D–³He fusion reactor (magnetic confinement tuning, SCRAM and restart), power distribution with priorities and breakers, battery, thermal control, coolant pumps |
| 1 Cargo | Fabricator, stores, repair drone bay (external systems), torpedo magazine |
| 0 Drive | Fusion torch drive, drive control, reaction-mass tanks, pellet injector |

**Exterior (EVA):** suit up at an emergency locker, then cycle out through the starboard airlock on the Cargo deck. You fly a SAFER-style jet pack (`WASD`, `Space`/`C`, `Shift` for more push) on a 110 m safety tether. Near the hull, letting go means grabbing a handrail. Out in the open you drift.

You can repair the external systems by hand (`R`, with a spare kit if destroyed): two radiator wings (they glow as the heat sink fills), three gatling PDCs, the missile launcher, the spinal railgun, the high-gain antenna and the sensor array. You can also weld hull plating with a Hull Patch (`F`).

Outside there is no radiation shielding, suit O₂ lasts 5 minutes (refill at the hatch), and weapon hits on external systems hurt crew nearby. Any thrust above 0.08 g sweeps you off the hull and the tether reels you in, injured. Repair drones remain the remote alternative.

## Hard sci-fi rules

* **Newtonian travel:** burn, coast, flip 180° and burn to stop, using the rocket equation and a reaction-mass budget. The ship's clock is time-compressed while cruising and drops to real time in combat.
* **Thrust is gravity:** the decks are stacked nose-to-tail with their floors facing the drive. Under thrust you walk, and above 2.2 g crew who aren't sitting at a console get hurt.
* **Zero-g:** with the drive off, everyone floats. You push off where you look, grab handrails, and drift through the open trunk between decks. When the drive lights, floating crew fall toward the drive. A fall down the trunk under thrust can injure or kill.
* **Centrifuge ring:** a 51 m ring around the hub between Habitation and Engineering. Spin it to 0.17–0.5 g (about 2.5–4.2 rpm) at Centrifuge Control. Spinning up costs power and twists the hull, which SAS has to counter, and the bearings wear. Inside, "down" is outward. Under thrust the floor tilts toward the drive. It has twelve empty science bays ready for experiments. Twelve 8 m windows run along the side walls between the labs, and six 5 m glass viewports are set into the floor. Through them the stars wheel past at the ring's spin rate, and you can see the lit panes from outside.
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
| SAS (attitude autopilot) | all modes + dock align | all modes | hold only | none |
| Backup crew in cryo | 8 | 5 | 3 | 1 |

Storytellers: **Cassiopeia** (steady escalation), **Halley** (merciful), **Kessler** (chaotic). Each leg also has scripted beats: a distress call, a pirate ambush, a proton storm, a drone swarm and a final blockade.

## Controls

Desktop: `WASD` move, mouse look (click to capture), `Shift` run, `E` use, `R` (hold) repair, `F` (hold) use item, `G` drop, `Tab` ship status, `T` chat, `1–4` vote, `H` help, `M` mute, `Esc` menu.

iPad and tablets: left virtual stick to move, drag the right side to look, and the **USE / REPAIR / ITEM / DROP** buttons.

Keyboards, mice and trackpads work on every device, including an iPad with a Magic Keyboard or Bluetooth mouse. Using one switches to keyboard & mouse controls, and clicking the view locks the pointer. You can also tap **MOUSE** or use Menu → Lock mouse pointer. Touching the screen switches back to touch controls. Where a browser refuses pointer lock, hold the mouse button and drag to look. Look sensitivity and inverted vertical look are in the menu.

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
* `tools/capture-demo.cjs` renders a deterministic demo video, with offline-rendered game audio, using Playwright and ffmpeg.
