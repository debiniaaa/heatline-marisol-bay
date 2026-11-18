// Rio Calloway, the player: a box-built wheelman with a walk cycle, a third-person
// camera that swings behind him on foot and behind the car on the road, and the
// all-important E key — any car in Marisol Bay is his, if nobody is watching.
import { S, clamp, angDiff } from './state.js';
import { collide } from './world.js';
import { witnessesNear, scarePeds } from './pedestrians.js';
import { sfxDoor } from './audio.js';

export function makePlayer(scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68642 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x12b5a5 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x27324a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.55, 0.21), pants); legL.position.set(-0.12, 0.28, 0);
  const legR = legL.clone(); legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.25), shirt); torso.position.y = 0.87; torso.castShadow = true;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.15), shirt); armL.position.set(-0.31, 0.86, 0);
  const armR = armL.clone(); armR.position.x = 0.31;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 8), skin); head.position.y = 1.38; head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.36), new THREE.MeshLambertMaterial({ color: 0xff5347 }));
  cap.position.y = 1.52;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.22), cap.material);
  brim.position.set(0, 1.49, 0.26);
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x14181d }));
  pistol.position.set(0.31, 0.52, 0.14); pistol.visible = false;
  g.add(legL, legR, torso, armL, armR, head, cap, brim, pistol);
  scene.add(g);

  const player = {
    group: g,
    yaw: Math.PI, // facing the city, away from the sea
    pitch: 0.24,
    phase: 0,
    parts: { legL, legR, armL, armR, pistol },
    camPos: new THREE.Vector3(20, 8, 290),
    teleport(x, z) { g.position.set(x, 0, z); },
    update(dt) { updatePlayer(dt, player); },
  };
  g.position.set(26, 0, 258);
  return player;
}

function updatePlayer(dt, player) {
  const g = player.group;
  if (S.driving) {
    g.visible = false;
    g.position.copy(S.driving.group.position);
    player.yaw = S.driving.userData.heading;
    // chase camera
    const car = S.driving.group;
    const f = { x: Math.sin(player.yaw), z: Math.cos(player.yaw) };
    const want = new THREE.Vector3(car.position.x - f.x * 10.5, 3.6, car.position.z - f.z * 10.5);
    player.camPos.lerp(want, 1 - Math.exp(-dt * 3.6));
    S.camera.position.copy(player.camPos);
    S.camera.lookAt(car.position.x + f.x * 9, 1.3, car.position.z + f.z * 9);
    return;
  }
  g.visible = true;

  // look
  player.yaw -= S.mouseDX * 0.0026;
  player.pitch = clamp(player.pitch + S.mouseDY * 0.0022, -0.08, 1.05);

  // move relative to the camera yaw
  const k = S.keys;
  const f = { x: Math.sin(player.yaw), z: Math.cos(player.yaw) };
  // right of the view direction is (-f.z, f.x); the strafe keys below use it inline
  let mx = 0, mz = 0;
  if (k['KeyW'] || k['ArrowUp']) { mx += f.x; mz += f.z; }
  if (k['KeyS'] || k['ArrowDown']) { mx -= f.x; mz -= f.z; }
  if (k['KeyD'] || k['ArrowRight']) { mx += -f.z; mz += f.x; }
  if (k['KeyA'] || k['ArrowLeft']) { mx -= -f.z; mz -= f.x; }
  const moving = Math.hypot(mx, mz) > 0.01;
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  const speed = sprint ? 8.6 : 5.1;
  if (moving) {
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    let nx = g.position.x + mx * speed * dt;
    let nz = g.position.z + mz * speed * dt;
    [nx, nz] = collide(S.world, nx, nz, 0.45);
    g.position.x = nx; g.position.z = nz;
    const targetRot = Math.atan2(mx, mz);
    g.rotation.y += angDiff(g.rotation.y, targetRot) * Math.min(1, dt * 12);
    player.phase += dt * speed * 1.9;
    if (sprint && Math.random() < dt * 2) scarePeds(g.position.x, g.position.z, 3);
  }
  const swing = moving ? Math.sin(player.phase) * 0.55 : 0;
  player.parts.legL.rotation.x = swing;
  player.parts.legR.rotation.x = -swing;
  player.parts.armL.rotation.x = -swing * 0.7;
  player.parts.armR.rotation.x = S.pistolDrawn ? -1.25 : swing * 0.7;
  player.parts.pistol.visible = S.pistolDrawn;
  g.position.y = moving ? Math.abs(Math.sin(player.phase)) * 0.04 : 0;

  // third-person camera: behind and above, looking past the shoulder
  const eye = new THREE.Vector3(g.position.x, 1.6, g.position.z);
  const back = new THREE.Vector3(
    eye.x - f.x * Math.cos(player.pitch) * 6.4,
    eye.y + Math.sin(player.pitch) * 6.4,
    eye.z - f.z * Math.cos(player.pitch) * 6.4
  );
  back.y = Math.max(0.7, back.y);
  player.camPos.lerp(back, 1 - Math.exp(-dt * 14));
  S.camera.position.copy(player.camPos);
  S.camera.lookAt(eye.x + f.x * 5, eye.y + 0.35, eye.z + f.z * 5);
}

export function nearestCar(maxDist) {
  const p = S.player.group.position;
  let best = null, bestD = maxDist;
  for (const car of S.cars) {
    const cp = car.group.position;
    const d = Math.hypot(cp.x - p.x, cp.z - p.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function tryInteract() {
  if (S.mode !== 'play') return;
  if (S.driving) {
    const car = S.driving;
    const f = { x: Math.sin(car.userData.heading), z: Math.cos(car.userData.heading) };
    const side = { x: -f.z, z: f.x };
    let nx = car.group.position.x + side.x * 2.4;
    let nz = car.group.position.z + side.z * 2.4;
    [nx, nz] = collide(S.world, nx, nz, 0.45);
    S.player.teleport(nx, nz);
    car.userData.driver = null;
    S.driving = null;
    sfxDoor();
    return;
  }
  const car = nearestCar(3.6);
  if (!car) return;
  if (car.userData.driver === 'traffic' && Math.abs(car.userData.speed) > 3.5) {
    S.hooks.toast('Too fast to jack — wait for it to stop.');
    return;
  }
  const cp = car.group.position;
  if (!car.userData.owned) {
    car.userData.owned = true;
    if (car.userData.police) {
      S.hooks.addHeat(52, cp.x, cp.z, 90);
      S.hooks.toast('<b>Bold.</b> That cruiser had a driver-shaped hole in it. The whole PD knows.');
    } else if (witnessesNear(cp.x, cp.z, 30) || S.police.length > 0) {
      S.hooks.addHeat(34, cp.x, cp.z, 999);
      S.hooks.toast('<b>Seen.</b> Someone on the sidewalk just dialled the PD.');
    } else {
      S.hooks.toast('Clean lift. Nobody saw a thing.');
    }
    scarePeds(cp.x, cp.z, 9);
  }
  if (car.userData.driver === 'traffic') {
    // the previous owner bails out and runs
    car.userData.driver = null;
    scarePeds(cp.x, cp.z, 12);
  }
  car.userData.driver = 'player';
  S.driving = car;
  sfxDoor();
}
