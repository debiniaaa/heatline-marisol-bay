// Marisol Bay PD: cruisers spawn in proportion to your stars, hunt by predicting where
// you are going, and win not by out-driving you but by pinning you — stay slow or on
// foot near a cruiser and the bust meter fills. Break their attention and heat cools.
import { S, stars, clamp } from './state.js';
import { ROADS } from './world.js';
import { makeCar, stepAICar } from './vehicles.js';
import { sfxCrash } from './audio.js';

let spawnCooldown = 0;

function playerPos() {
  return S.driving ? S.driving.group.position : S.player.group.position;
}
function playerSpeed() {
  return S.driving ? Math.abs(S.driving.userData.speed) : 0;
}

function spawnCop(scene) {
  const p = playerPos();
  let best = null, bestD = 1e9;
  for (const rx of ROADS) for (const rz of ROADS) {
    for (const [x, z] of [[rx, rz + 40], [rx + 40, rz], [rx, rz - 40], [rx - 40, rz]]) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 95 && d < 170 && d < bestD) { bestD = d; best = { x, z }; }
    }
  }
  if (!best) best = { x: p.x + 130, z: p.z };
  const made = makeCar(0xffffff, {
    x: best.x, z: best.z, police: true, name: 'MBPD Interceptor',
    heading: Math.atan2(p.x - best.x, p.z - best.z),
  });
  made.userData.driver = 'police';
  made.userData.ramCooldown = 0;
  scene.add(made.group);
  S.police.push(made);
  S.cars.push(made);
}

export function updatePolice(dt) {
  const want = stars();
  spawnCooldown -= dt;
  if (S.police.length < want && spawnCooldown <= 0 && S.mode === 'play') {
    spawnCop(S.scene);
    spawnCooldown = 2.2;
  }
  const p = playerPos();
  const pSpeed = playerSpeed();
  let nearest = 1e9;
  let seen = false;

  for (let i = S.police.length - 1; i >= 0; i--) {
    const cop = S.police[i];
    const u = cop.userData;
    const pos = cop.group.position;
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d < nearest) nearest = d;
    if (d < 78) seen = true;

    // light bar strobes
    if (u.lightMats) {
      const phase = Math.floor(S.time * 2.6 + u.id) % 2;
      u.lightMats[0].color.setHex(phase ? 0xff2222 : 0x571010);
      u.lightMats[1].color.setHex(phase ? 0x101a57 : 0x2a5cff);
    }
    u.ramCooldown = Math.max(0, u.ramCooldown - dt);

    if (want === 0) {
      // Case closed: cruise away and melt back into traffic flow.
      stepAICar(cop.group, pos.x + Math.sin(u.heading) * 60, pos.z + Math.cos(u.heading) * 60, 16, dt, S.world);
      if (d > 190) {
        S.scene.remove(cop.group);
        S.cars.splice(S.cars.indexOf(cop), 1);
        S.police.splice(i, 1);
      }
      continue;
    }
    // Predict a whisker ahead of the target and drive at it, hard.
    const lead = S.driving ? 0.45 : 0.15;
    const pv = S.driving
      ? { x: Math.sin(S.driving.userData.heading) * S.driving.userData.speed, z: Math.cos(S.driving.userData.heading) * S.driving.userData.speed }
      : { x: 0, z: 0 };
    const tx = p.x + pv.x * lead, tz = p.z + pv.z * lead;
    const impact = stepAICar(cop.group, tx, tz, 44, dt, S.world);
    if (impact > 12 && u.ramCooldown <= 0) { sfxCrash(0.8); u.ramCooldown = 0.7; }

    // Ramming a pedestrian suspect hurts, and they remember it.
    if (!S.driving && d < 3.0 && Math.abs(u.speed) > 5 && u.ramCooldown <= 0) {
      S.hooks.damagePlayer(11);
      u.ramCooldown = 0.9;
      const push = 6;
      S.player.group.position.x += (p.x - pos.x) / (d || 1) * push * 0.14;
      S.player.group.position.z += (p.z - pos.z) / (d || 1) * push * 0.14;
    }
  }

  // Being watched keeps the heat on; hiding bleeds it away.
  const pedWitness = S.peds.some((ped) => !ped.userData.dead &&
    Math.hypot(ped.group.position.x - p.x, ped.group.position.z - p.z) < 26);
  if (seen || (pedWitness && S.heat > 0)) S.hiddenFor = 0;
  else S.hiddenFor += dt;
  if (S.hiddenFor > 5 && S.heat > 0) S.heat = Math.max(0, S.heat - 6.5 * dt);

  // The bust meter: slow or on foot + a close cruiser = handcuffs.
  const vulnerable = !S.driving || pSpeed < 2.6;
  if (vulnerable && nearest < 8.5 && want > 0 && S.mode === 'play') {
    S.bust = clamp(S.bust + dt / 2.4, 0, 1);
    if (S.bust >= 1) S.hooks.onBusted();
  } else {
    S.bust = clamp(S.bust - dt / 1.3, 0, 1);
  }
}
