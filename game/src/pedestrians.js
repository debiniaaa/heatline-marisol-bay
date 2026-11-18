// The citizens of Marisol Bay: they stroll the sidewalks in resort colours, flee from
// gunfire and fast metal, and — importantly for the wanted system — they see things.
import { S, clamp } from './state.js';
import { ROADS, collide } from './world.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xff6b81, 0xfeca57, 0x48dbfb, 0x1dd1a1, 0xf368e0, 0xff9f43, 0x54a0ff, 0x5f27cd, 0xffd32a, 0x7bed9f];

export function makePed(rand) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[Math.floor(rand() * SKIN.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rand() * SHIRTS.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: [0x2f3542, 0x57606f, 0xdfe4ea, 0x747d8c][Math.floor(rand() * 4)] });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.2), pants); legL.position.set(-0.11, 0.26, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.24), shirt); torso.position.y = 0.82; torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.14), shirt); armL.position.set(-0.29, 0.8, 0);
  const armR = armL.clone(); armR.position.x = 0.29;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), skin); head.position.y = 1.3; head.castShadow = true;
  g.add(legL, legR, torso, armL, armR, head);
  g.userData = {
    isPed: true, health: 100, dead: false, deadFor: 0,
    legL, legR, armL, armR, phase: rand() * 6,
    state: 'walk', fleeFrom: null, fleeFor: 0,
    axis: 'z', dir: 1, road: 0, side: 1, speed: 1.1 + rand() * 0.7,
  };
  return { group: g, userData: g.userData };
}

export function spawnPeds(scene, rand, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = makePed(rand);
    const u = ped.userData;
    u.axis = rand() < 0.5 ? 'z' : 'x';
    u.road = ROADS[Math.floor(rand() * ROADS.length)];
    u.dir = rand() < 0.5 ? 1 : -1;
    u.side = rand() < 0.5 ? -1 : 1;
    const along = -250 + rand() * 500;
    placeOnSidewalk(ped, along);
    scene.add(ped.group);
    peds.push(ped);
    S.peds.push(ped);
  }
  return peds;
}

function placeOnSidewalk(ped, along) {
  const u = ped.userData;
  const off = u.side * 10.6;
  if (u.axis === 'z') ped.group.position.set(u.road + off, 0, along);
  else ped.group.position.set(along, 0, u.road + off);
  ped.group.rotation.y = u.axis === 'z' ? (u.dir > 0 ? 0 : Math.PI) : (u.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
}

export function scarePeds(x, z, radius) {
  for (const ped of S.peds) {
    if (ped.userData.dead) continue;
    const p = ped.group.position;
    if (Math.hypot(p.x - x, p.z - z) < radius) {
      ped.userData.state = 'flee';
      ped.userData.fleeFrom = { x, z };
      ped.userData.fleeFor = 2.5 + Math.random() * 1.5;
    }
  }
}

export function witnessesNear(x, z, radius) {
  for (const ped of S.peds) {
    if (ped.userData.dead) continue;
    const p = ped.group.position;
    if (Math.hypot(p.x - x, p.z - z) < radius) return true;
  }
  return false;
}

export function updatePeds(dt) {
  for (const ped of S.peds) {
    const u = ped.userData;
    const pos = ped.group.position;
    if (u.dead) {
      u.deadFor += dt;
      if (u.deadFor > 9) {
        // Quietly recycle: the bay forgets, and a fresh citizen takes the stroll.
        u.dead = false; u.health = 100; u.deadFor = 0;
        ped.group.rotation.set(0, 0, 0);
        placeOnSidewalk(ped, -250 + Math.random() * 500);
      }
      continue;
    }
    let vx = 0, vz = 0, speed = u.speed;
    if (u.state === 'flee' && u.fleeFrom) {
      const dx = pos.x - u.fleeFrom.x, dz = pos.z - u.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      vx = (dx / d) * 5.6; vz = (dz / d) * 5.6; speed = 5.6;
      u.fleeFor -= dt;
      if (u.fleeFor <= 0) u.state = 'walk';
    } else {
      if (u.axis === 'z') { vz = u.dir * u.speed; if (Math.abs(pos.z) > 262) u.dir *= -1; }
      else { vx = u.dir * u.speed; if (Math.abs(pos.x) > 262) u.dir *= -1; }
      // turn at intersections sometimes
      const cross = u.axis === 'z' ? pos.z : pos.x;
      for (const r of ROADS) {
        if (Math.abs(cross - r) < 0.6 && Math.random() < 0.012) {
          const oldRoad = u.road;
          u.axis = u.axis === 'z' ? 'x' : 'z';
          u.road = r; u.dir = Math.random() < 0.5 ? 1 : -1;
          if (u.axis === 'x') pos.z = r + u.side * 10.6, pos.x = oldRoad + u.side * 10.6;
          else pos.x = r + u.side * 10.6, pos.z = oldRoad + u.side * 10.6;
          break;
        }
      }
      speed = u.speed;
    }
    let nx = pos.x + vx * dt, nz = pos.z + vz * dt;
    [nx, nz] = collide(S.world, nx, nz, 0.42);
    pos.x = nx; pos.z = nz;
    if (vx || vz) ped.group.rotation.y = Math.atan2(vx, vz);
    // limb swing
    u.phase += dt * (2.2 + speed * 2.4);
    const swing = Math.sin(u.phase) * (u.state === 'flee' ? 0.75 : 0.45);
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    pos.y = Math.abs(Math.sin(u.phase)) * 0.03;
  }
}

export function knockDown(ped) {
  const u = ped.userData;
  if (u.dead) return;
  u.dead = true; u.deadFor = 0;
  ped.group.rotation.x = -Math.PI / 2;
  ped.group.position.y = 0.25;
  u.legL.rotation.x = 0.3; u.legR.rotation.x = -0.2;
  u.armL.rotation.x = 0; u.armR.rotation.x = 0;
}
