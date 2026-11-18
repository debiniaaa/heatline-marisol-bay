// HEATLINE: Marisol Bay — boot, input, the wanted/damage plumbing, and the game loop.
// Everything else lives in its own module; this file just wires the night together.
import { S, stars, rng } from './state.js';
import { buildWorld, LOCATIONS } from './world.js';
import { makePlayer, tryInteract, nearestCar } from './player.js';
import { stepPlayerCar, resolveCarPairs } from './vehicles.js';
import { spawnTraffic, spawnParked, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds, witnessesNear, scarePeds } from './pedestrians.js';
import { updatePolice } from './police.js';
import { initCombat, updateCombat, tryShoot, tryMelee, damagePed, spawnSparks } from './combat.js';
import { initMissions, updateMissions, startCourier, resetMissions } from './missions.js';
import { initHUD, updateHUD, banner, toast, showPrompt } from './hud.js';
import { initAudio, updateAudio, sfxCrash } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { setupShot, updateShot } from './shots.js';

const params = new URLSearchParams(location.search);
S.shot = params.get('shot');
S.seed = Number(params.get('seed') || 7);
const rand = rng(S.seed * 1000 + 17);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.getElementById('scene').appendChild(renderer.domElement);
S.renderer = renderer;
S.scene = new THREE.Scene();
S.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 3200);
S.camera.position.set(240, 120, 420);

S.world = buildWorld(S.scene, S.seed);
S.player = makePlayer(S.scene);
spawnParked(S.scene, S.world, rand);
S.traffic = spawnTraffic(S.scene, rand, 13);
spawnPeds(S.scene, rand, 18);
initCombat(S.scene);
initMissions(S.scene);
initHUD();

// ---------- cross-cutting hooks ----------
S.hooks.addHeat = (points, x, z, witnessRadius = 30) => {
  const witnessed = witnessRadius >= 900 || S.police.length > 0 || witnessesNear(x, z, witnessRadius);
  if (witnessed) S.heat = Math.min(100, S.heat + points);
};
S.hooks.damagePlayer = (n) => {
  if (S.mode !== 'play' && S.mode !== 'shot') return;
  S.health -= n;
  S.lastDamageAt = S.time;
  if (S.health <= 0 && S.mode === 'play') wasted();
};
S.hooks.banner = banner;
S.hooks.toast = toast;
S.hooks.cashChanged = () => storeSave(S);
S.hooks.onBusted = () => busted();

let endKind = 'busted';
function busted() {
  if (S.mode !== 'play') return;
  const fine = Math.min(S.cash, 150 + 50 * stars());
  S.cash -= fine;
  S.heat = 0; S.bust = 0;
  endKind = 'busted';
  showEnd('BUSTED', 'Marisol Bay PD',
    'The cuffs are warm from the sun. The desk sergeant keeps your keys, your dignity, and a donation to the helicopter fund.',
    `Fine paid: $${fine}`);
}
function wasted() {
  const fee = Math.min(S.cash, 200);
  S.cash -= fee;
  S.heat = Math.max(0, S.heat - 40);
  endKind = 'wasted';
  showEnd('WASTED', 'St. Coral Hospital',
    'You wake up smelling of antiseptic and sunscreen. The bay kept your secrets; the hospital kept your wallet.',
    `Medical bill: $${fee}`);
}
function showEnd(title, kicker, text, fine) {
  S.mode = 'over';
  if (S.driving) { S.driving.userData.driver = null; S.driving = null; }
  document.exitPointerLock?.();
  document.getElementById('endTitle').textContent = title;
  document.getElementById('endKicker').textContent = kicker;
  document.getElementById('endText').textContent = text;
  document.getElementById('endFine').textContent = fine;
  document.getElementById('endScreen').classList.remove('hidden');
  storeSave(S);
}

// A handle for curious players (and my own playtests) in the dev console.
window.__heatline = S;

// ---------- flow ----------
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const hudEl = document.getElementById('hud');
const saved = loadSave();
if (saved) document.getElementById('continueBtn').classList.remove('hidden');

function begin(withSave) {
  if (withSave && saved) {
    S.cash = saved.cash; S.storyIndex = saved.storyIndex;
    S.hasPistol = saved.hasPistol; S.storyDone = saved.storyDone;
  }
  initAudio();
  startScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
  S.mode = 'play';
  renderer.domElement.requestPointerLock?.();
  if (S.storyDone) toast('<b>Free roam.</b> The bay is yours — press <b>Q</b> for courier work.');
  else toast('<b>Sol Vega</b> is waiting at the café by the coast road. Follow the gold beacon.');
}
document.getElementById('startBtn').addEventListener('click', () => begin(false));
document.getElementById('continueBtn').addEventListener('click', () => begin(true));
document.getElementById('resumeBtn').addEventListener('click', () => {
  pauseScreen.classList.add('hidden');
  S.mode = 'play';
  renderer.domElement.requestPointerLock?.();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  clearSave();
  S.cash = 250; S.health = 100; S.heat = 0; S.bust = 0;
  S.storyIndex = 0; S.storyDone = false; S.hasPistol = false; S.pistolDrawn = false;
  if (S.driving) { S.driving.userData.driver = null; S.driving = null; }
  resetMissions();
  S.player.teleport(26, 258);
  pauseScreen.classList.add('hidden');
  S.mode = 'play';
  renderer.domElement.requestPointerLock?.();
});
document.getElementById('endBtn').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  S.health = 100; S.bust = 0;
  const spot = endKind === 'busted' ? LOCATIONS.pd : LOCATIONS.hospital;
  S.player.teleport(spot.x, spot.z);
  S.mode = 'play';
  renderer.domElement.requestPointerLock?.();
});

function pauseGame() {
  if (S.mode !== 'play') return;
  S.mode = 'pause';
  pauseScreen.classList.remove('hidden');
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  S.keys[e.code] = true;
  if (S.mode === 'play') {
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyF') tryMelee();
    if (e.code === 'KeyQ') startCourier();
    if (e.code === 'KeyX') {
      if (S.hasPistol) { S.pistolDrawn = !S.pistolDrawn; }
      else toast('No iron yet. Sol Vega might fix that — finish her first job.');
    }
    if (e.code === 'KeyP') { document.exitPointerLock?.(); pauseGame(); }
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  } else if (S.mode === 'pause' && e.code === 'KeyP') {
    pauseScreen.classList.add('hidden');
    S.mode = 'play';
    renderer.domElement.requestPointerLock?.();
  }
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (S.pointerLocked) { S.mouseDX += e.movementX || 0; S.mouseDY += e.movementY || 0; }
});
document.addEventListener('pointerlockchange', () => {
  S.pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!S.pointerLocked && S.mode === 'play' && !S.shot) pauseGame();
});
renderer.domElement.addEventListener('mousedown', () => {
  if (S.mode !== 'play') return;
  if (!S.pointerLocked) { renderer.domElement.requestPointerLock?.(); return; }
  if (S.pistolDrawn) tryShoot();
  else if (!S.driving) tryMelee();
});
addEventListener('resize', () => {
  S.camera.aspect = innerWidth / innerHeight;
  S.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- shot mode ----------
if (S.shot) {
  startScreen.classList.add('hidden');
  S.mode = 'shot';
  setupShot(S.shot);
  if (S.shot === 'cover') {
    startScreen.classList.remove('hidden');
    for (const sel of ['.blurb', '.controls']) startScreen.querySelector(sel).style.display = 'none';
    startScreen.querySelectorAll('button').forEach((b) => { b.style.display = 'none'; });
    startScreen.style.background = 'linear-gradient(180deg, rgba(26,8,32,.08) 55%, rgba(10,4,16,.55) 100%)';
    startScreen.style.justifyContent = 'flex-start';
    startScreen.style.paddingTop = '7vh';
  } else {
    hudEl.classList.remove('hidden');
  }
}

// ---------- the loop ----------
const clock = new THREE.Clock();
let frames = 0;

function stepDriving(dt) {
  const car = S.driving;
  const k = S.keys;
  const input = {
    throttle: (k['KeyW'] || k['ArrowUp'] ? 1 : 0) + (k['KeyS'] || k['ArrowDown'] ? -1 : 0),
    steer: (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) + (k['KeyD'] || k['ArrowRight'] ? -1 : 0),
    handbrake: !!k['Space'],
    boost: !!(k['ShiftLeft'] || k['ShiftRight']),
  };
  const impact = stepPlayerCar(car.group, input, dt, S.world);
  if (impact > 4) {
    const pos = car.group.position;
    sfxCrash(Math.min(1, impact / 26));
    spawnSparks(pos.x, 0.8, pos.z, Math.min(18, 4 + impact), 3.4);
    scarePeds(pos.x, pos.z, 13);
    if (impact > 11) {
      S.hooks.damagePlayer((impact - 11) * 0.55);
      S.hooks.addHeat(11, pos.x, pos.z, 27);
    } else S.hooks.addHeat(5, pos.x, pos.z, 27);
  }
}

function carPedCollisions(dt) {
  const pp = S.player.group.position;
  for (const car of S.cars) {
    const u = car.userData;
    if (Math.abs(u.speed) < 4.5) continue;
    const cp = car.group.position;
    if (!S.driving && u.driver !== 'player') {
      const d = Math.hypot(cp.x - pp.x, cp.z - pp.z);
      if (d < 2.3) {
        S.hooks.damagePlayer(9);
        S.player.teleport(pp.x + (pp.x - cp.x) * 0.4, pp.z + (pp.z - cp.z) * 0.4);
      }
    }
    for (const ped of S.peds) {
      if (ped.userData.dead) continue;
      const pedPos = ped.group.position;
      if (Math.abs(pedPos.x - cp.x) > 3 || Math.abs(pedPos.z - cp.z) > 3) continue;
      if (Math.hypot(pedPos.x - cp.x, pedPos.z - cp.z) < 2.5) {
        const before = ped.userData.health;
        damagePed(ped, Math.min(95, Math.abs(u.speed) * 7), 'car', cp.x, cp.z);
        if (ped.userData.health > 0 && ped.userData.health < before && u.driver === 'player') {
          S.hooks.addHeat(24, pedPos.x, pedPos.z, 34);
        }
        if (u.driver === 'player') { u.speed *= 0.82; sfxCrash(0.35); }
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  frames++;

  if (S.mode === 'menu') {
    const a = S.time * 0.045;
    S.camera.position.set(Math.sin(a) * 305, 96 + Math.sin(S.time * 0.13) * 14, Math.cos(a) * 305);
    S.camera.lookAt(0, 14, 30);
    S.world.update(dt, S.time);
    updateTraffic(dt); updatePeds(dt);
  } else if (S.mode === 'shot') {
    S.world.update(dt, S.time);
    updateTraffic(dt); updatePeds(dt);
    if (S.shot === 'chase') updatePolice(dt);
    updateShot(dt);
    updateCombat(dt);
    if (S.shot !== 'cover') updateHUD();
    if (frames > 70) window.__shotReady = true;
  } else if (S.mode === 'play') {
    if (S.driving) stepDriving(dt);
    S.player.update(dt);
    S.mouseDX = 0; S.mouseDY = 0;
    carPedCollisions(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateMissions(dt);
    updateCombat(dt);
    resolveCarPairs(S.cars, (rel) => {
      if (rel > 13 && S.driving) {
        const pos = S.driving.group.position;
        sfxCrash(0.7);
        spawnSparks(pos.x, 0.8, pos.z, 10, 3);
        S.hooks.damagePlayer((rel - 13) * 0.4);
        S.hooks.addHeat(7, pos.x, pos.z, 27);
      }
    });
    if (S.time - S.lastDamageAt > 8 && S.health < 100) S.health = Math.min(100, S.health + 2.6 * dt);
    // contextual prompt
    if (!S.driving) {
      const near = nearestCar(3.6);
      showPrompt(near ? `<b>E</b> ${near.userData.owned ? 'Drive the' : 'Steal the'} ${near.userData.name}` : null);
    } else showPrompt('<b>E</b> Get out');
    updateHUD();
    updateAudio(dt);
    S.world.update(dt, S.time);
  } else {
    // pause / over: the city holds its breath, the sea does not
    S.world.update(dt, S.time);
  }
  renderer.render(S.scene, S.camera);
}
animate();
