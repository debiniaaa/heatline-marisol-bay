// Cars: low-poly box-built bodies with proper wheels, lights and (for the PD) a flashing
// light bar, plus the arcade driving model every car shares — the player steers it with
// keys, traffic and police steer it by seeking a target point.
import { S, clamp, angDiff } from './state.js';
import { collide } from './world.js';
import { sfxCrash } from './audio.js';

const PALETTE = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22, 0xfd79a8, 0x95a5a6, 0x00cec9, 0xfdcb6e];
let carSerial = 0;

export function makeCar(colorHex, opts = {}) {
  const g = new THREE.Group();
  const paintMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0xf4f6f8 : colorHex });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2b4258 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.4), paintMat);
  body.position.y = 0.58; body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.34, 0.9), paintMat);
  nose.position.set(0, 0.48, 2.35); nose.castShadow = true;
  g.add(nose);
  if (opts.convertible) {
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 2.0), darkMat);
    tub.position.set(0, 0.92, -0.25);
    g.add(tub);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a4b2a }));
    seat.position.set(0, 0.86, -0.95);
    g.add(seat);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.52, 2.1), glassMat);
    cabin.position.set(0, 1.06, -0.25); cabin.castShadow = true;
    g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.08, 1.9), paintMat);
    roof.position.set(0, 1.35, -0.25);
    g.add(roof);
  }
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 2.6), darkMat);
    stripe.position.set(0, 0.6, -0.2);
    g.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.5], [0.88, 1.5], [-0.88, -1.5], [0.88, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.37, wz);
    g.add(w); wheels.push(w);
  }
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(lightGeo, headMat); h.position.set(s * 0.6, 0.62, 2.82); g.add(h);
    const t = new THREE.Mesh(lightGeo, tailMat); t.position.set(s * 0.6, 0.66, -2.22); g.add(t);
  }
  let lightMats = null;
  if (opts.police) {
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2255ff });
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), redMat);
    barR.position.set(-0.3, 1.48, -0.25);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), blueMat);
    barB.position.set(0.3, 1.48, -0.25);
    g.add(barR); g.add(barB);
    lightMats = [redMat, blueMat];
  }
  g.userData = {
    isCar: true,
    id: carSerial++,
    name: opts.name || 'Runabout',
    speed: 0,
    heading: opts.heading || 0,
    radius: 2.35,
    driver: null, // null | 'player' | 'traffic' | 'police'
    owned: !!opts.owned,
    police: !!opts.police,
    wheels, lightMats,
    crashCooldown: 0,
    baseColor: colorHex,
  };
  g.position.set(opts.x || 0, 0, opts.z || 0);
  g.rotation.y = g.userData.heading;
  return { group: g, userData: g.userData };
}

export function forwardOf(heading) { return { x: Math.sin(heading), z: Math.cos(heading) }; }

function integrate(car, dt, world) {
  const u = car.userData;
  const f = forwardOf(u.heading);
  const px = car.position.x + f.x * u.speed * dt;
  const pz = car.position.z + f.z * u.speed * dt;
  const [cx, cz] = collide(world, px, pz, u.radius);
  const penetration = Math.hypot(px - cx, pz - cz);
  car.position.x = cx; car.position.z = cz;
  car.position.y = 0;
  car.rotation.y = u.heading;
  // wheels roll and the front pair visually steers
  const roll = (u.speed * dt) / 0.37;
  for (let i = 0; i < 4; i++) {
    u.wheels[i].rotation.x += roll;
    if (i < 2) u.wheels[i].rotation.y = (u.steerVis || 0) * 0.9;
  }
  u.crashCooldown = Math.max(0, u.crashCooldown - dt);
  if (penetration > 0.55 && Math.abs(u.speed) > 7 && u.crashCooldown <= 0) {
    u.crashCooldown = 0.5;
    const impact = Math.abs(u.speed);
    u.speed *= 0.3;
    return impact;
  }
  if (penetration > 0.1 && Math.abs(u.speed) > 3) u.speed *= 0.82;
  return 0;
}

// Player-driven step. input = {throttle:-1..1, steer:-1..1, handbrake, boost}
export function stepPlayerCar(car, input, dt, world) {
  const u = car.userData;
  const boosting = input.boost && input.throttle > 0;
  const maxF = boosting ? 46 : 35;
  const accel = input.throttle > 0 ? 15 : input.throttle < 0 ? (u.speed > 0.5 ? -30 : -9) : 0;
  u.speed += accel * dt;
  u.speed -= u.speed * (input.handbrake ? 1.4 : 0.35) * dt;
  if (input.throttle === 0) u.speed -= Math.sign(u.speed) * Math.min(Math.abs(u.speed), 3.2 * dt);
  u.speed = clamp(u.speed, -13, maxF);
  const steerAuthority = 0.62 / (1 + Math.abs(u.speed) * 0.045);
  const steer = input.steer * steerAuthority;
  u.steerVis = lerpVis(u.steerVis || 0, input.steer, dt * 8);
  if (Math.abs(u.speed) > 0.2) {
    u.heading += steer * u.speed * dt * (input.handbrake ? 0.62 : 0.42);
  }
  return integrate(car, dt, world);
}
function lerpVis(a, b, t) { return a + (b - a) * Math.min(1, t); }

// AI step: seek a point at a target speed, slowing for sharp turns and when told to brake.
export function stepAICar(car, tx, tz, targetSpeed, dt, world) {
  const u = car.userData;
  const dx = tx - car.position.x, dz = tz - car.position.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  const diff = angDiff(u.heading, desired);
  const steer = clamp(diff * 1.7, -0.62, 0.62);
  u.steerVis = steer;
  const turnDrag = 1 - Math.min(0.72, Math.abs(diff) * 0.5);
  const goal = targetSpeed * turnDrag;
  if (u.speed < goal) u.speed = Math.min(goal, u.speed + 11 * dt);
  else u.speed = Math.max(goal, u.speed - 22 * dt);
  if (dist < 3) u.speed = Math.min(u.speed, 2);
  if (Math.abs(u.speed) > 0.2) u.heading += steer * clamp(Math.abs(u.speed), 0, 18) * dt * 0.34 * Math.sign(u.speed || 1);
  return integrate(car, dt, world);
}

// Soft pairwise separation for every car on the street; returns impacts involving the player.
export function resolveCarPairs(cars, onPlayerImpact) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i].group, b = cars[j].group;
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz), min = 3.4;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      const rel = Math.abs(a.userData.speed - b.userData.speed);
      a.position.x -= nx * push; a.position.z -= nz * push;
      b.position.x += nx * push; b.position.z += nz * push;
      const avg = (a.userData.speed + b.userData.speed) / 2;
      a.userData.speed = avg * 0.8; b.userData.speed = avg * 0.8;
      if (rel > 9) {
        if (a.userData.driver === 'player' || b.userData.driver === 'player') onPlayerImpact(rel, b === a ? a : (a.userData.driver === 'player' ? b : a));
        else if (a.userData.crashCooldown <= 0 && b.userData.crashCooldown <= 0) { sfxCrash(0.5); a.userData.crashCooldown = 1; }
      }
    }
  }
}

export function randomCarColor(rand) { return PALETTE[Math.floor(rand() * PALETTE.length)]; }
