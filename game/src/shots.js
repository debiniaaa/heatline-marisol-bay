// Photo mode: ?shot=cover|street|drive|chase boots straight into a posed, seeded scene
// so the entry's screenshots are real, reproducible renders of the game itself —
// the hero skyline, a sidewalk moment, a drive, and a police chase with the HUD lit.
import { S } from './state.js';
import { makeCar, stepAICar } from './vehicles.js';

let coverT = 0;

export function setupShot(name) {
  const scene = S.scene;
  if (name === 'cover') {
    const car = makeCar(0xff6b4a, { x: 33, z: 253, heading: 2.5, name: 'Coral GT', convertible: true });
    scene.add(car.group); S.cars.push(car);
    S.player.group.position.set(27, 0, 257);
    S.player.group.rotation.y = 2.7;
    S.camera.position.set(178, 52, 486);
    S.camera.lookAt(-16, 10, 30);
  }
  if (name === 'street') {
    // On the east sidewalk of the central avenue, over-the-shoulder toward downtown.
    S.player.teleport(10.6, -30);
    S.player.group.rotation.y = -Math.PI / 2 + 0.35;
    if (S.peds[0]) S.peds[0].group.position.set(10.6, 0, -15);
    if (S.peds[1]) S.peds[1].group.position.set(-10.6, 0, -44);
    const car = makeCar(0xfdcb6e, { x: -3.4, z: -52, heading: 0, name: 'Tropicana' });
    car.userData.driver = 'traffic'; car.userData.speed = 6;
    car.userData.route = { axis: 'z', road: 0, dir: 1 }; car.userData.cruise = 8;
    scene.add(car.group); S.cars.push(car); S.traffic.push(car);
    S.camera.position.set(14.8, 2.5, -36.5);
    S.camera.lookAt(2, 1.3, -25);
  }
  if (name === 'drive' || name === 'chase') {
    const isChase = name === 'chase';
    const car = makeCar(isChase ? 0x2e6ff2 : 0xe74c3c, {
      x: 83.4, z: isChase ? 60 : 120, heading: Math.PI,
      name: isChase ? 'Palmera GT' : 'Coral GT', convertible: !isChase,
    });
    car.userData.driver = 'player';
    car.userData.speed = isChase ? 25 : 17;
    car.userData.owned = true;
    scene.add(car.group); S.cars.push(car);
    S.driving = car;
    S.player.yaw = Math.PI;
    S.player.camPos.set(83.4, 3.6, (isChase ? 60 : 120) + 11);
    if (isChase) {
      S.heat = 64;
      // Cruisers flank the hero car close behind, inside the chase camera's frame.
      for (const [cx, cz, sp] of [[78.6, 68.5, 27], [88.6, 69.5, 26.5]]) {
        const cop = makeCar(0xffffff, { x: cx, z: cz, heading: Math.PI, police: true, name: 'MBPD Interceptor' });
        cop.userData.driver = 'police';
        cop.userData.speed = sp;
        cop.userData.ramCooldown = 0;
        scene.add(cop.group);
        S.police.push(cop); S.cars.push(cop);
      }
    }
  }
}

export function updateShot(dt) {
  coverT += dt;
  if (S.shot === 'cover') {
    // a slow, proud push-in over the water toward the skyline
    const t = Math.min(1, coverT / 14);
    S.camera.position.set(178 - 34 * t, 52 - 15 * t, 486 - 66 * t);
    S.camera.lookAt(-16, 10, 30);
  }
  if (S.shot === 'street') {
    S.camera.position.set(14.8 + Math.sin(coverT * 0.4) * 0.4, 2.5, -36.5);
    S.camera.lookAt(2, 1.3, -25);
  }
  if ((S.shot === 'drive' || S.shot === 'chase') && S.driving) {
    // keep the hero car rolling straight up the boulevard for the camera
    stepAICar(S.driving.group, 83.4, -420, S.shot === 'chase' ? 25 : 17, dt, S.world);
    S.player.update(0); // position the avatar state without moving the camera logic
    const car = S.driving.group;
    const f = { x: Math.sin(Math.PI), z: Math.cos(Math.PI) };
    const back = S.shot === 'chase' ? 13.5 : 10.5;
    const height = S.shot === 'chase' ? 4.6 : 3.6;
    S.camera.position.set(car.position.x - f.x * back, height, car.position.z - f.z * back);
    S.camera.lookAt(car.position.x + f.x * 9, 1.3, car.position.z + f.z * 9);
  }
}
