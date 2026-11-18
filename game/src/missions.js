// Work for a wheelman: Sol Vega's three-job story (an errand, a theft, a getaway),
// then an endless string of courier runs. A golden beacon marks the way, the HUD
// states the job, and the bay pays in cash and consequences.
import { S } from './state.js';
import { LOCATIONS } from './world.js';
import { makeCar } from './vehicles.js';
import { banner, toast, setObjective } from './hud.js';
import { sfxCash, sfxChime, sfxFail } from './audio.js';

let beacon = null, beaconRing = null;
let active = null; // {kind:'story'|'courier', idx, step, steps, reward, timeLeft, car}
let coupe = null;

const COURIER_SPOTS = ['cafe', 'docks', 'hotel', 'garage', 'beachClub', 'northGate', 'marina'];

export function initMissions(scene) {
  const geo = new THREE.CylinderGeometry(2.3, 2.3, 36, 18, 1, true);
  beacon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffc46b, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false,
  }));
  beacon.position.y = 18;
  beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.12;
  scene.add(beacon); scene.add(beaconRing);
}

export function resetMissions() {
  active = null;
  if (coupe) {
    S.scene.remove(coupe.group);
    const i = S.cars.indexOf(coupe);
    if (i >= 0) S.cars.splice(i, 1);
    coupe = null;
  }
}

export function getMissionTarget() {
  if (active) { const s = active.steps[active.step]; return s.dynamic ? s.dynamic() : s.at; }
  if (S.storyIndex < 3 && !S.storyDone) return LOCATIONS.cafe;
  return null;
}

function playerAt(x, z, radius) {
  const p = S.driving ? S.driving.group.position : S.player.group.position;
  return Math.hypot(p.x - x, p.z - z) < radius;
}

function startStory(idx) {
  if (idx === 0) {
    active = {
      kind: 'story', idx, step: 0, reward: 400,
      title: 'JOB 1 · FIRST ERRAND',
      steps: [
        { at: LOCATIONS.docks, label: 'Pick up the package at Marisol Docks', radius: 9 },
        { at: LOCATIONS.hotel, label: 'Deliver it to The Palms Hotel — clock is running', radius: 10, time: 150 },
      ],
    };
    banner('FIRST ERRAND', 'Sol: "No questions. That is the whole job."');
    toast('<b>Sol Vega:</b> A package is sweating on the docks. Fetch it, drop it at The Palms. Drive like you mean it.');
  } else if (idx === 1) {
    coupe = makeCar(0x12d6c3, { x: 122, z: 250, heading: -Math.PI / 2, name: 'Sirena Coupe', convertible: true });
    coupe.userData.driver = null;
    S.scene.add(coupe.group);
    S.cars.push(coupe);
    active = {
      kind: 'story', idx, step: 0, reward: 750,
      title: 'JOB 2 · BORROWED WHEELS',
      steps: [
        { dynamic: () => coupe.group.position, label: 'Steal the turquoise Sirena Coupe on Marina Row', radius: 6, needCar: coupe },
        { at: LOCATIONS.garage, label: "Deliver the coupe to Sol's Garage", radius: 10, time: 200, needCar: coupe },
      ],
    };
    banner('BORROWED WHEELS', 'Sol: "The Fontaine crew will not miss it. Much."');
    toast('<b>Sol Vega:</b> A turquoise coupe is parked on Marina Row with the keys of destiny in it. Bring it to my garage.');
  } else if (idx === 2) {
    active = {
      kind: 'story', idx, step: 0, reward: 1500,
      title: 'JOB 3 · THE HEATLINE RUN',
      steps: [
        { at: LOCATIONS.beachClub, label: 'Pick up Sol at Club Sirena — bring a car', radius: 10, needAnyCar: true },
        { at: LOCATIONS.northGate, label: 'Reach the North Gate. Shake the heat, or outrun it', radius: 12 },
      ],
    };
    banner('THE HEATLINE RUN', 'Sol: "Tonight we make the front page."');
    toast('<b>Sol Vega:</b> Pick me up at Club Sirena. Half the bay will object. That is rather the point.');
  }
  sfxChime();
}

export function startCourier() {
  if (active || S.mode !== 'play') return;
  const a = COURIER_SPOTS[Math.floor(Math.random() * COURIER_SPOTS.length)];
  let b = a;
  while (b === a) b = COURIER_SPOTS[Math.floor(Math.random() * COURIER_SPOTS.length)];
  const from = LOCATIONS[a], to = LOCATIONS[b];
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  active = {
    kind: 'courier', idx: -1, step: 0,
    reward: Math.round(110 + dist * 0.55),
    title: 'COURIER RUN',
    steps: [
      { at: from, label: `Pick up at ${from.label}`, radius: 9 },
      { at: to, label: `Deliver to ${to.label}`, radius: 10, time: Math.round(dist / 13 + 80) },
    ],
  };
  banner('COURIER RUN', `$${active.reward} for a clean delivery`);
  sfxChime();
}

function completeMission() {
  const wasStory = active.kind === 'story';
  S.cash += active.reward;
  sfxCash();
  if (wasStory) {
    if (active.idx === 0 && !S.hasPistol) {
      S.hasPistol = true;
      toast('<b>Sol left a pistol in the glovebox.</b> Press <b>X</b> to draw it. The bay just got louder.');
    }
    S.storyIndex = active.idx + 1;
    if (active.idx === 2) {
      S.storyDone = true;
      banner('HEADLINE MADE', `Story complete · +$${active.reward} · Marisol Bay is yours`);
    } else {
      banner('JOB DONE', `+$${active.reward} · Sol has more work — meet at the café`);
    }
  } else {
    banner('DELIVERED', `+$${active.reward} · press Q for another run`);
  }
  active = null;
  S.hooks.cashChanged();
}

function failMission(reason) {
  sfxFail();
  banner('JOB BLOWN', reason);
  if (active.kind === 'story' && active.idx === 1 && coupe) {
    // leave the coupe where it lies; a fresh one is not coming
  }
  active = null;
}

export function updateMissions(dt) {
  const target = getMissionTarget();
  if (target) {
    beacon.visible = true; beaconRing.visible = true;
    beacon.position.x = target.x; beacon.position.z = target.z;
    beaconRing.position.x = target.x; beaconRing.position.z = target.z;
    beaconRing.rotation.z = S.time * 0.8;
    beacon.material.opacity = 0.26 + Math.sin(S.time * 2.4) * 0.08;
  } else { beacon.visible = false; beaconRing.visible = false; }

  if (!active) {
    if (S.mode === 'play' && S.storyIndex < 3 && !S.storyDone) {
      const c = LOCATIONS.cafe;
      const p = S.driving ? S.driving.group.position : S.player.group.position;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      setObjective('STORY', `Meet Sol Vega at ${c.label}`, d);
      if (d < 7.5) startStory(S.storyIndex);
    } else if (S.mode === 'play') {
      setObjective(null);
    }
    return;
  }

  const step = active.steps[active.step];
  const at = step.dynamic ? step.dynamic() : step.at;
  const p = S.driving ? S.driving.group.position : S.player.group.position;
  const d = Math.hypot(p.x - at.x, p.z - at.z);

  if (step.time != null) {
    if (active.timeLeft == null) active.timeLeft = step.time;
    active.timeLeft -= dt;
    if (active.timeLeft <= 0) { failMission('Out of time. The bay does not wait.'); return; }
  }
  const timeNote = step.time != null && active.timeLeft != null ? ` · ${Math.ceil(active.timeLeft)}s` : '';
  setObjective(active.title, step.label + timeNote, d);

  let done = false;
  if (step.needCar) done = S.driving === step.needCar && (active.step > 0 || true) && (active.step === 0 ? true : d < step.radius);
  if (step.needCar && active.step === 0) done = S.driving === step.needCar;
  if (step.needAnyCar) done = !!S.driving && d < step.radius;
  if (!step.needCar && !step.needAnyCar) done = d < step.radius;

  if (done) {
    if (active.kind === 'story' && active.idx === 1 && active.step === 0) {
      S.hooks.addHeat(46, at.x, at.z, 999);
      toast('<b>Tripwire alarm.</b> The Fontaine crew would like their coupe back. Move!');
      sfxChime();
    }
    if (active.kind === 'story' && active.idx === 2 && active.step === 0) {
      S.heat = Math.max(S.heat, 62);
      toast('<b>Sol, from the passenger seat:</b> "Friends of mine. Drive."');
      sfxChime();
    }
    if (active.step === 0 && active.steps.length > 1) sfxChime();
    active.step++;
    active.timeLeft = null;
    if (active.step >= active.steps.length) completeMission();
  }
}
