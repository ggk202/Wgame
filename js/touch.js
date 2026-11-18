// Touch controls for iPad / tablets: left virtual stick, right-side drag to look, action buttons.
import { input } from './player.js';

export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 1 || matchMedia('(pointer: coarse)').matches;
}

export function setupTouch(root, hooks) {
  root.classList.add('touch');
  const wrap = document.createElement('div');
  wrap.id = 'touchui';
  wrap.innerHTML = `
    <div id="stick"><div id="knob"></div></div>
    <div id="lookpad"></div>
    <div id="tbtns">
      <button data-b="use" class="tb big">USE</button>
      <button data-b="repair" class="tb">REPAIR</button>
      <button data-b="item" class="tb">ITEM</button>
      <button data-b="drop" class="tb small">DROP</button>
      <button data-b="sprint" class="tb small">RUN</button>
    </div>
    <div id="ttop">
      <button data-b="mouse" class="tb small">MOUSE</button>
      <button data-b="status" class="tb small">SHIP</button>
      <button data-b="chat" class="tb small">CHAT</button>
      <button data-b="menu" class="tb small">MENU</button>
    </div>`;
  root.appendChild(wrap);
  const stick = wrap.querySelector('#stick'), knob = wrap.querySelector('#knob'), look = wrap.querySelector('#lookpad');
  let stickId = null, sx = 0, sy = 0;
  const R = 55;
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; moveStick(t); }, { passive: false });
  const moveStick = (t) => {
    let dx = t.clientX - sx, dy = t.clientY - sy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.tright = dx / R; input.tfwd = -dy / R;
  };
  let lookId = null, lx = 0, ly = 0;
  look.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { e.preventDefault(); moveStick(t); }
      if (t.identifier === lookId) { e.preventDefault(); input.lookX += (t.clientX - lx) * 1.6; input.lookY += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; knob.style.transform = ''; input.tfwd = 0; input.tright = 0; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
  window.addEventListener('touchstart', () => hooks.touchSeen && hooks.touchSeen(), { passive: true, capture: true });
  for (const b of wrap.querySelectorAll('[data-b]')) {
    const name = b.dataset.b;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); b.classList.add('on');
      if (name === 'use') input.use = true;
      else if (name === 'drop') input.drop = true;
      else if (name === 'repair') input.trepair = true;
      else if (name === 'item') input.titem = true;
      else if (name === 'sprint') { input.tsprint = !input.tsprint; b.classList.toggle('lit', input.tsprint); }
      else hooks.button(name);
      hooks.unlockAudio && hooks.unlockAudio();
    }, { passive: false });
    b.addEventListener('touchend', (e) => {
      e.preventDefault(); b.classList.remove('on');
      if (name === 'repair') input.trepair = false;
      if (name === 'item') input.titem = false;
    }, { passive: false });
  }
  return {
    setLabels(l) { for (const [k, v] of Object.entries(l)) { const b = wrap.querySelector(`[data-b="${k}"]`); if (b) { b.textContent = v || k.toUpperCase(); b.classList.toggle('dim', !v); } } },
    show(v) { wrap.style.display = v ? '' : 'none'; },
    reset() { input.tfwd = 0; input.tright = 0; input.trepair = false; input.titem = false; knob.style.transform = ''; },
  };
}
