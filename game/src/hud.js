// The heads-up display: cash and health top-left, stars and a live minimap top-right,
// objective banner up top, prompts and banners centre-stage. DOM for text, a small
// canvas for the map — cheap, crisp, and readable in a screenshot.
import { S, stars } from './state.js';
import { ROADS } from './world.js';
import { getMissionTarget } from './missions.js';

const el = {};
let lastStars = -1, lastCash = -1, bannerTimer = null, toastTimer = null;

export function initHUD() {
  for (const id of ['hud', 'cash', 'healthBar', 'armorLine', 'stars', 'speedo', 'speedVal', 'carName',
    'objective', 'objectiveTitle', 'objectiveText', 'objectiveDist', 'prompt', 'bustWrap', 'bustBar',
    'banner', 'bannerTitle', 'bannerSub', 'crosshair', 'toast', 'vignette', 'minimap']) {
    el[id] = document.getElementById(id);
  }
}

export function banner(title, sub = '', ms = 2700) {
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub;
  el.banner.style.opacity = '1';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.banner.style.opacity = '0'; }, ms);
}
export function toast(html, ms = 4600) {
  el.toast.innerHTML = html;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), ms);
}
export function setObjective(title, text, distM) {
  if (!title) { el.objective.classList.add('hidden'); return; }
  el.objective.classList.remove('hidden');
  el.objectiveTitle.textContent = title;
  el.objectiveText.textContent = text;
  el.objectiveDist.textContent = distM != null ? `${Math.round(distM)} m` : '';
}
export function showPrompt(html) {
  if (!html) { el.prompt.classList.add('hidden'); return; }
  el.prompt.innerHTML = html;
  el.prompt.classList.remove('hidden');
}

export function updateHUD() {
  if (S.cash !== lastCash) {
    lastCash = S.cash;
    el.cash.innerHTML = `<small>CASH</small>$${S.cash.toLocaleString('en-US')}`;
  }
  el.healthBar.style.width = `${Math.max(0, S.health)}%`;
  const st = stars();
  if (st !== lastStars) {
    lastStars = st;
    el.stars.innerHTML = '★'.repeat(st) + `<span class="off">${'★'.repeat(5 - st)}</span>`;
  }
  const sinceHit = S.time - S.lastDamageAt;
  el.vignette.style.opacity = sinceHit < 0.6 ? String(0.85 * (1 - sinceHit / 0.6)) : (S.health < 30 ? '0.35' : '0');
  if (S.driving) {
    el.speedo.classList.remove('hidden');
    el.speedVal.textContent = String(Math.round(Math.abs(S.driving.userData.speed) * 2.24));
    el.carName.textContent = S.driving.userData.name.toUpperCase();
  } else el.speedo.classList.add('hidden');
  el.crosshair.classList.toggle('hidden', !S.pistolDrawn || S.mode !== 'play');
  if (S.bust > 0.02 && S.mode === 'play') {
    el.bustWrap.classList.remove('hidden');
    el.bustBar.style.width = `${S.bust * 100}%`;
  } else el.bustWrap.classList.add('hidden');
  drawMinimap();
}

function drawMinimap() {
  const cv = el.minimap;
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, C = W / 2, scale = W / 660;
  const px = (x) => C + x * scale, py = (z) => C + z * scale;
  g.fillStyle = '#232d3a'; g.fillRect(0, 0, W, W);
  // the bay
  g.fillStyle = '#1b6f8f'; g.fillRect(0, py(316), W, W - py(316));
  g.fillStyle = '#eacf9d'; g.fillRect(0, py(284), W, py(316) - py(284));
  // streets
  g.strokeStyle = 'rgba(220,225,235,0.5)'; g.lineWidth = 2;
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), W); g.stroke();
    g.beginPath(); g.moveTo(0, py(r)); g.lineTo(W, py(r)); g.stroke();
  }
  // objective
  const target = getMissionTarget();
  if (target) {
    g.fillStyle = '#ffd94d';
    const x = px(target.x), y = py(target.z);
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore();
  }
  // police
  for (const cop of S.police) {
    const p = cop.group.position;
    g.fillStyle = (Math.floor(S.time * 2.6 + cop.userData.id) % 2) ? '#ff4444' : '#4488ff';
    g.beginPath(); g.arc(px(p.x), py(p.z), 3.2, 0, 7); g.fill();
  }
  // player arrow
  const pp = S.driving ? S.driving.group.position : S.player.group.position;
  const heading = S.driving ? S.driving.userData.heading : S.player.group.rotation.y;
  g.save();
  g.translate(px(pp.x), py(pp.z));
  g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill();
  g.restore();
}
