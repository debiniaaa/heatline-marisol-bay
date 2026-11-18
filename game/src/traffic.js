// Civilian traffic: cars that pick a street, take the correct lane, cruise, and choose a
// new direction at each intersection — plus the parked cars that line the kerbs waiting
// for a less honest driver.
import { S, rng } from './state.js';
import { ROADS } from './world.js';
import { makeCar, stepAICar, randomCarColor } from './vehicles.js';

const LANE = 3.4;
const NAMES = ['Runabout', 'Palmera', 'Sirena Coupe', 'Doral Sedan', 'Bayside Wagon', 'Coral GT', 'Tropicana', 'Marlin Pickup'];

function lanePoint(car) {
  // The car's current target: the next intersection along its street, offset to its lane.
  const u = car.userData;
  const pos = car.group.position;
  if (u.route.axis === 'z') {
    const next = nextCross(pos.z, u.route.dir);
    return { x: u.route.road - u.route.dir * LANE, z: next, cross: next };
  }
  const next = nextCross(pos.x, u.route.dir);
  return { x: next, z: u.route.road + u.route.dir * LANE, cross: next };
}
function nextCross(v, dir) {
  let best = dir > 0 ? 1e9 : -1e9;
  for (const r of ROADS) {
    if (dir > 0 && r > v + 3 && r < best) best = r;
    if (dir < 0 && r < v - 3 && r > best) best = r;
  }
  return best === 1e9 || best === -1e9 ? v + dir * 300 : best;
}

export function spawnTraffic(scene, rand, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const axis = rand() < 0.5 ? 'z' : 'x';
    const road = ROADS[Math.floor(rand() * ROADS.length)];
    const dir = rand() < 0.5 ? 1 : -1;
    const along = -260 + rand() * 520;
    const x = axis === 'z' ? road - dir * LANE : along;
    const z = axis === 'z' ? along : road + dir * LANE;
    const made = makeCar(randomCarColor(rand), {
      x, z, heading: axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      name: NAMES[Math.floor(rand() * NAMES.length)],
      convertible: rand() < 0.22,
    });
    made.userData.driver = 'traffic';
    made.userData.route = { axis, road, dir };
    made.userData.cruise = 9.5 + rand() * 4.5;
    scene.add(made.group);
    cars.push(made);
    S.cars.push(made);
  }
  return cars;
}

export function spawnParked(scene, world, rand) {
  const cars = [];
  const spots = world.parkedSpots.slice();
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (const spot of spots.slice(0, 17)) {
    const made = makeCar(randomCarColor(rand), {
      x: spot.x, z: spot.z, heading: spot.heading,
      name: NAMES[Math.floor(rand() * NAMES.length)],
      convertible: rand() < 0.2,
    });
    made.userData.driver = null;
    scene.add(made.group);
    cars.push(made);
    S.cars.push(made);
  }
  return cars;
}

export function updateTraffic(dt) {
  for (const car of S.traffic) {
    const u = car.userData;
    if (u.driver !== 'traffic') continue;
    const target = lanePoint(car);
    const pos = car.group.position;
    const distToCross = Math.hypot(target.x - pos.x, target.z - pos.z);
    if (distToCross < 9) {
      // At the junction: mostly go straight, sometimes turn onto the cross street.
      const roll = Math.random();
      const crossRoad = u.route.axis === 'z' ? target.z : target.x;
      if (roll < 0.42) {
        const newDir = Math.random() < 0.5 ? 1 : -1;
        if (u.route.axis === 'z') u.route = { axis: 'x', road: crossRoad, dir: newDir };
        else u.route = { axis: 'z', road: crossRoad, dir: newDir };
      } else if (crossRoad >= 268 || crossRoad <= -268) {
        u.route.dir *= -1; // city edge: turn around
      }
    }
    // Keep a polite gap to whatever is ahead.
    let speed = u.cruise;
    const f = { x: Math.sin(u.heading), z: Math.cos(u.heading) };
    for (const other of S.cars) {
      if (other === car) continue;
      const o = other.group.position;
      const dx = o.x - pos.x, dz = o.z - pos.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 10 && side < 2.2) speed = Math.min(speed, Math.max(0, (ahead - 5) * 1.6));
    }
    const p = S.driving ? S.driving.group.position : S.player.group.position;
    const dp = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (dp < 7 && !S.driving) speed = 0; // don't run the pedestrian down (usually)
    stepAICar(car.group, target.x, target.z, speed, dt, S.world);
  }
}
