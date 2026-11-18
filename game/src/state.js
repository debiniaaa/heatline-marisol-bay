// Shared mutable game state. main.js fills this in at boot; every other module reads
// and writes through it, which keeps the module graph free of import cycles.
export const S = {
  mode: 'menu', // menu | play | pause | over
  shot: null, // photo-mode scene name when booted with ?shot=
  seed: 7,
  time: 0,
  scene: null,
  camera: null,
  renderer: null,
  world: null, // result of buildWorld: colliders, roads, spawns
  player: null, // on-foot avatar controller
  cars: [], // every vehicle in the world (player-driven one included)
  traffic: [],
  police: [],
  peds: [],
  driving: null, // the car the player is driving, or null on foot
  cash: 250,
  health: 100,
  lastDamageAt: -99,
  heat: 0, // wanted heat 0..100, stars derived from it
  hiddenFor: 0, // seconds since any witness last saw the player
  bust: 0, // 0..1 bust meter
  hasPistol: false,
  pistolDrawn: false,
  storyIndex: 0, // next story mission to offer
  storyDone: false,
  keys: {},
  mouseDX: 0,
  mouseDY: 0,
  pointerLocked: false,
  // hooks wired by main.js so modules can ask for cross-cutting effects
  hooks: {
    addHeat: () => {},
    damagePlayer: () => {},
    banner: () => {},
    toast: () => {},
    onBusted: () => {},
    onWasted: () => {},
    cashChanged: () => {},
  },
};

export function stars() {
  if (S.heat <= 0.5) return 0;
  return Math.min(5, Math.ceil(S.heat / 20));
}

// Deterministic RNG (mulberry32) so the city is the same on every visit and in every screenshot.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
// Shortest signed angular difference from a to b.
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
