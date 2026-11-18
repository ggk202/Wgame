// Guided introduction: a solo Recruit voyage with the storyteller silenced and an instructor walking the player
// through moving, consoles, flying, ship systems, a live-fire drill and a manual docking.
import { nose, angDeg } from './attitude.js';
import { RAIL_CONE, startEncounter } from './combat.js';

const TUT_PRO = [0, 0, -1];
const tutNoseOff = (S) => angDeg(nose(S.att.q), TUT_PRO);
const tutTarget = (S) => S.enc && S.enc.enemies.find((e) => !e.dead && !e.gone);

// k(desktop, touch): pick the wording for the input method in use
export const TUT_STEPS = [
  { ch: 'Welcome', title: 'Welcome aboard the Wolfram',
    text: (k) => `You are crew on a 4,000-tonne fusion torch freighter. There are no NPCs: everything aboard is run by you and up to four friends.<br>This walkthrough takes about 15 minutes. You can skip any step${k(' with <kbd>N</kbd>', '')} or end it from the box below.`,
    manual: true },
  { ch: 'Basics', title: 'Look around and walk',
    text: (k) => k('Click the view to capture the mouse, then look with the mouse and walk with <kbd>W A S D</kbd>. <kbd>Esc</kbd> releases the mouse and opens the menu.', 'Drag on the right half of the screen to look. Use the left stick to walk.') + ' Walk a few steps.',
    start: (S, G) => { G.tutData.p0 = [G.ctl.x, G.ctl.z]; },
    done: (S, G) => Math.hypot(G.ctl.x - G.tutData.p0[0], G.ctl.z - G.tutData.p0[1]) > 3 },
  { ch: 'Basics', title: 'Take the lift to the Bridge',
    text: (k) => `You are on Deck 3, Habitation. The ship is a stack of five round decks joined by a central lift. Walk up to the lift doors in the middle of the deck and ${k('press <kbd>E</kbd>', 'tap <b>USE</b>')}, then pick <b>Deck 4: Command</b>.`,
    done: (S, G) => G.ctl.deck === 4 && !G.lifting },
  { ch: 'Basics', title: 'Sit at the Helm',
    text: (k) => `The Helm is the wraparound desk with the pilot couch, at the front of the Bridge. Walk up to it and ${k('press <kbd>E</kbd>', 'tap <b>USE</b>')}. The camera moves onto the console screen and the mouse is freed so you can use its buttons.`,
    done: (S, G) => G.panel.open && G.panelComp === 'helm' },
  { ch: 'Basics', title: 'Reading a console',
    text: () => 'Every console shows live data from the simulation. Here: the <b>attitude indicator</b> (where the nose points, rotation rates), the <b>SAS</b> modes, the flight controls and the port controls. A console only works while it has power and is not damaged. Scroll the screen to see everything.',
    manual: true },
  { ch: 'Flying', title: 'Undock',
    text: () => 'You are docked at Shackleton Yard, Luna. Press <b>Undock &amp; depart</b> at the top of the Helm screen.',
    done: (S) => S.nav.state === 'transit' },
  { ch: 'Flying', title: 'Engage the autopilot',
    text: () => 'Scroll down to <b>Flight</b> and turn on the <b>Autopilot</b>. On Recruit difficulty it points the ship, lights the drive and plans the burn. On harder difficulties you do all of that yourself.',
    done: (S) => S.nav.autopilot },
  { ch: 'Flying', title: 'Turn the ship by hand',
    text: (k) => `The main drive only pushes the way the nose points, and the ship turns with small RCS thrusters. ${k('Hold <kbd>A</kbd> or <kbd>D</kbd> to yaw (<kbd>W/S</kbd> pitch, <kbd>Q/E</kbd> roll).', 'Hold the <b>YAW</b> buttons under the attitude indicator.')} Touching the controls takes over from the autopilot. Turn the nose at least 10° away from prograde.`,
    done: (S) => tutNoseOff(S) > 10 },
  { ch: 'Flying', title: 'Let SAS bring it back',
    text: (k) => `There is no friction in space: the ship keeps turning until you stop it. ${k('<kbd>X</kbd> kills rotation (SAS Hold). Then', 'Tap SAS <b>Hold</b> to stop the rotation, then')} pick SAS <b>Prograde</b> and watch the nose swing back onto the PRO marker.`,
    done: (S) => S.att.mode === 'pro' && tutNoseOff(S) < 3 && Math.hypot(...S.att.w) < 0.01 },
  { ch: 'Flying', title: 'Back on autopilot',
    text: () => 'Engage the <b>Autopilot</b> again so the ship keeps flying while you are away from the Helm. The drive cuts out whenever the nose drifts off-axis, so someone has to watch the attitude on the higher difficulties.',
    done: (S) => S.nav.autopilot },
  { ch: 'Ship systems', title: 'Leave the console',
    text: (k) => `${k('Press <kbd>Esc</kbd>', 'Tap <b>EXIT CONSOLE</b>')} to stand up from the Helm.`,
    done: (S, G) => !G.panel.open },
  { ch: 'Ship systems', title: 'Visit the Reactor',
    text: (k) => `Take the lift down to <b>Deck 2: Engineering</b> and open the <b>Fusion Reactor</b> console (the big torus) with ${k('<kbd>E</kbd>', '<b>USE</b>')}. Everything aboard runs on its power.`,
    done: (S, G) => G.panel.open && G.panelComp === 'reactor' },
  { ch: 'Ship systems', title: 'Power and heat',
    text: () => 'The reactor makes power and a lot of waste heat. Keep <b>confinement</b> in the green, or it scrams and you run on batteries. Waste heat leaves only through the <b>radiators</b> outside, controlled at Thermal Control. Overheat the ship and systems start failing. When you have read the screen, press Next.',
    manual: true },
  { ch: 'Ship systems', title: 'Suit up',
    text: (k) => `Hull breaches, fires and EVA repairs all need a vacuum suit. Leave the console, find the red <b>emergency locker</b> on any deck and ${k('press <kbd>E</kbd>', 'tap <b>USE</b>')} to put a suit on.`,
    done: (S, G) => { const me = S.players[G.myId]; return me && me.suit; } },
  { ch: 'Combat', title: 'Live-fire drill: lock the target',
    text: () => 'A training hulk is drifting 300 km away. Ride up to the Bridge, open <b>Fire Control</b> (left of the Helm) and press <b>Next target</b> to lock it. The <b>optical telescope</b> at the top shows the ship itself.',
    start: (S) => { if (!S.enc) startEncounter(S, 'drill', 60); },
    done: (S) => { const t = tutTarget(S); return !!t && S.sensors.lock === t.id; } },
  { ch: 'Combat', title: 'Point the nose at it',
    text: () => 'The spinal railgun fires straight out of the nose. Go to the <b>Helm</b> and choose SAS <b>Target</b>, or steer by hand, until the telescope shows <b>RAIL SOLUTION</b> (nose within 1.5°).',
    done: (S) => { const t = tutTarget(S); return !t || angDeg(nose(S.att.q), t.dir) <= RAIL_CONE; } },
  { ch: 'Combat', title: 'Fire!',
    text: () => 'Back to <b>Fire Control</b>: <b>charge the railgun</b>, wait for lock quality of at least 40%, then <b>fire</b>. Slugs take several seconds to cross 300 km, and the target drifts. If you miss, recharge and shoot again. SAS Target keeps the nose on it.',
    done: (S) => !tutTarget(S) },
  { ch: 'Docking', title: 'Arriving at Phobos',
    text: () => 'Drill complete. We will skip the long coast to Mars: the ship drops into orbit at Phobos Station in a moment.',
    start: (S) => { S.enc = null; },
    tick: (S) => { if (S.nav.state === 'transit') { S.nav.x = S.nav.L - 1e8; S.nav.v = 0; } },
    done: (S) => S.nav.state === 'orbit' },
  { ch: 'Docking', title: 'Request an approach',
    text: () => 'Docking is flown by hand. Sit at the <b>Helm</b> and press <b>Request approach</b>. To keep it short, the training approach starts 60 m out instead of 200 m.',
    done: (S) => S.nav.state === 'approach',
    after: (S) => { if (S.prox) { S.prox.p = [2.5, -1.2, 60]; S.prox.v = [0, 0, -0.5]; } } },
  { ch: 'Docking', title: 'Fly it in',
    text: (k) => `The docking camera looks along our port. Centre the black cross on the white target with the RCS translation ${k('keys (<kbd>J/L</kbd> left/right, <kbd>U/O</kbd> up/down, <kbd>I/K</kbd> forward/back)', 'buttons')}. SAS <b>Dock align</b> keeps the ship square to the port. Bleed your speed below <b>0.25 m/s</b> for the last few metres and follow the <b>PREDICTED</b> contact marker. If you bounce off, <b>Back off &amp; re-approach</b>.`,
    done: (S) => S.nav.state === 'docking' || S.nav.state === 'docked' },
  { ch: 'Done', title: 'Tutorial complete',
    text: () => 'Soft capture. You have flown, fought and docked the Wolfram. The real voyage adds a storyteller who throws pirates, solar storms, failures and opportunities at you, and every system aboard can break. Crew up with friends, keep the reactor lit, and good luck.',
    final: true },
];

export class Tutorial {
  constructor(G) {
    this.G = G; this.i = -1; this.doneT = 0; G.tutData = {};
    const box = (this.box = document.createElement('div'));
    box.id = 'tut';
    box.innerHTML = `<div class="tut-head"><span class="tut-ch"></span><span class="tut-n"></span></div><div class="tut-title"></div><div class="tut-text"></div>
      <div class="tut-bar"><i></i></div><div class="tut-btns"><button class="btn tut-next">Next ▸</button><button class="btn tut-skip">Skip step</button><button class="btn tut-end">End tutorial</button></div>`;
    document.getElementById('hud').appendChild(box);
    box.querySelector('.tut-next').onclick = () => this.next();
    box.querySelector('.tut-skip').onclick = () => this.skip();
    box.querySelector('.tut-end').onclick = () => this.end();
    for (const ev of ['pointerdown', 'click']) box.addEventListener(ev, (e) => e.stopPropagation());
    this.go(0);
  }
  k(desk, touch) { return this.G.touchMode ? touch : desk; }
  go(i) {
    const G = this.G, S = G.S;
    const prev = TUT_STEPS[this.i];
    if (prev && prev.after) prev.after(S, G);
    this.i = i; this.doneT = 0;
    const st = TUT_STEPS[i];
    if (!st) return this.end();
    if (st.start) st.start(S, G);
    const b = this.box;
    b.classList.remove('ok');
    b.querySelector('.tut-ch').textContent = st.ch.toUpperCase();
    b.querySelector('.tut-n').textContent = `STEP ${i + 1} / ${TUT_STEPS.length}`;
    b.querySelector('.tut-title').textContent = st.title;
    b.querySelector('.tut-text').innerHTML = st.text(this.k.bind(this));
    b.querySelector('.tut-bar i').style.width = `${(i / (TUT_STEPS.length - 1)) * 100}%`;
    const nx = b.querySelector('.tut-next');
    nx.style.display = st.manual || st.final ? '' : 'none';
    nx.textContent = st.final ? 'Keep flying (free play)' : 'Next ▸';
    b.querySelector('.tut-skip').style.display = st.manual || st.final ? 'none' : '';
    b.querySelector('.tut-end').textContent = st.final ? 'Back to lobby' : 'End tutorial';
    G.sfx.relayBank && G.sfx.relayBank(2, 0.3, 0.6);
  }
  next() { const st = TUT_STEPS[this.i]; if (st && st.final) return this.freePlay(); this.go(this.i + 1); }
  skip() { if (TUT_STEPS[this.i] && !TUT_STEPS[this.i].final) this.go(this.i + 1); }
  freePlay() {
    const G = this.G; G.S.tutorial = false; this.box.remove(); G.tut = null;
    G.hud.toast('Free play: the storyteller is now awake', 'good');
  }
  end() {
    const st = TUT_STEPS[this.i];
    if (st && st.final) { location.reload(); return; }
    const b = this.box.querySelector('.tut-end'); // two-step confirm (no browser dialogs: they block in embedded frames)
    if (b.dataset.armed) { location.reload(); return; }
    b.dataset.armed = '1'; b.textContent = 'Click again to leave'; setTimeout(() => { delete b.dataset.armed; if (this.box.isConnected) b.textContent = 'End tutorial'; }, 3000);
  }
  tick(dt) {
    const G = this.G, S = G.S, st = TUT_STEPS[this.i];
    if (!st || st.manual || st.final) return;
    if (st.tick) st.tick(S, G);
    if (this.doneT > 0) { this.doneT -= dt; if (this.doneT <= 0) this.go(this.i + 1); return; }
    let ok = false;
    try { ok = st.done(S, G); } catch (e) { ok = false; }
    if (ok) { this.doneT = 1.3; this.box.classList.add('ok'); G.sfx.play('chime'); }
  }
}
