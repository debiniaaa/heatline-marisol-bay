// Hands and hardware: a swing of the fists, and — once Sol trusts you — a pistol.
// Hits are resolved with plain ray maths against pedestrians, cars and building
// boxes, with a spark burst wherever the bullet lands.
import { S } from './state.js';
import { scarePeds, knockDown } from './pedestrians.js';
import { sfxShot, sfxThud } from './audio.js';

let shootCooldown = 0;
let sparkPoints = null, sparkData = null;
const SPARKS = 240;

export function initCombat(scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  sparkPoints = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.32, transparent: true, opacity: 0.95 }));
  sparkPoints.frustumCulled = false;
  sparkData = Array.from({ length: SPARKS }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  for (const s of sparkData) s.life = 0;
  scene.add(sparkPoints);
  hideSparks();
}
function hideSparks() {
  const arr = sparkPoints.geometry.attributes.position.array;
  for (let i = 0; i < SPARKS; i++) { arr[i * 3 + 1] = -50; }
  sparkPoints.geometry.attributes.position.needsUpdate = true;
}
export function spawnSparks(x, y, z, n = 10, spread = 3.2) {
  if (!sparkPoints) return;
  const arr = sparkPoints.geometry.attributes.position.array;
  let placed = 0;
  for (let i = 0; i < SPARKS && placed < n; i++) {
    const s = sparkData[i];
    if (s.life > 0) continue;
    s.life = 0.4 + Math.random() * 0.3;
    s.vx = (Math.random() - 0.5) * spread; s.vy = Math.random() * 3.4; s.vz = (Math.random() - 0.5) * spread;
    arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    placed++;
  }
  sparkPoints.geometry.attributes.position.needsUpdate = true;
}
export function updateCombat(dt) {
  shootCooldown = Math.max(0, shootCooldown - dt);
  if (!sparkPoints) return;
  const arr = sparkPoints.geometry.attributes.position.array;
  let any = false;
  for (let i = 0; i < SPARKS; i++) {
    const s = sparkData[i];
    if (s.life <= 0) continue;
    any = true;
    s.life -= dt;
    s.vy -= 9.8 * dt;
    arr[i * 3] += s.vx * dt; arr[i * 3 + 1] += s.vy * dt; arr[i * 3 + 2] += s.vz * dt;
    if (s.life <= 0) arr[i * 3 + 1] = -50;
  }
  if (any) sparkPoints.geometry.attributes.position.needsUpdate = true;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = 1e9;
  const axes = [
    [ox, dx, b.minX, b.maxX], [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return -1; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function damagePed(ped, dmg, cause, hx, hz) {
  const u = ped.userData;
  if (u.dead) return;
  u.health -= dmg;
  scarePeds(ped.group.position.x, ped.group.position.z, 15);
  if (u.health <= 0) {
    knockDown(ped);
    if (cause !== 'accident') S.hooks.addHeat(42, ped.group.position.x, ped.group.position.z, 36);
  } else if (cause === 'shot' || cause === 'melee') {
    u.state = 'flee'; u.fleeFrom = { x: hx, z: hz }; u.fleeFor = 3;
  }
}

export function tryShoot() {
  if (!S.pistolDrawn || shootCooldown > 0 || S.mode !== 'play') return;
  shootCooldown = 0.24;
  sfxShot();
  const cam = S.camera;
  const origin = cam.position.clone();
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const ox = origin.x, oy = origin.y, oz = origin.z;
  let bestT = 260, bestKind = null, bestPed = null, bestCar = null;
  for (const ped of S.peds) {
    if (ped.userData.dead) continue;
    const p = ped.group.position;
    const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, p.x, 1.0, p.z, 0.85);
    if (t > 0 && t < bestT) { bestT = t; bestKind = 'ped'; bestPed = ped; }
  }
  for (const car of S.cars) {
    const p = car.group.position;
    const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, p.x, 0.8, p.z, 2.7);
    if (t > 0 && t < bestT) { bestT = t; bestKind = 'car'; bestCar = car; bestPed = null; }
  }
  for (const b of S.world.colliders) {
    const t = rayBox(ox, oy, oz, dir.x, dir.y, dir.z, b);
    if (t > 0 && t < bestT) { bestT = t; bestKind = 'wall'; bestPed = null; bestCar = null; }
  }
  const hx = ox + dir.x * bestT, hy = Math.max(0.15, oy + dir.y * bestT), hz = oz + dir.z * bestT;
  spawnSparks(hx, hy, hz, bestKind ? 12 : 3);
  const px = S.driving ? S.driving.group.position.x : S.player.group.position.x;
  const pz = S.driving ? S.driving.group.position.z : S.player.group.position.z;
  scarePeds(px, pz, 26);
  S.hooks.addHeat(16, px, pz, 40); // gunfire carries
  if (bestKind === 'ped' && bestPed) damagePed(bestPed, 68, 'shot', px, pz);
  if (bestKind === 'car' && bestCar && bestCar.userData.police) S.hooks.addHeat(14, hx, hz, 60);
}

export function tryMelee() {
  if (S.mode !== 'play' || S.driving) return;
  const p = S.player.group.position;
  const facing = S.player.group.rotation.y;
  const f = { x: Math.sin(facing), z: Math.cos(facing) };
  sfxThud();
  let hit = false;
  for (const ped of S.peds) {
    if (ped.userData.dead) continue;
    const pp = ped.group.position;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.6 && (dx * f.x + dz * f.z) / (d || 1) > 0.25) {
      damagePed(ped, 55, 'melee', p.x, p.z);
      spawnSparks(pp.x, 1.1, pp.z, 5, 1.6);
      hit = true;
    }
  }
  if (hit) S.hooks.addHeat(18, p.x, p.z, 30);
}
