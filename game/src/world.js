// Marisol Bay itself: a pastel art-deco street grid on a bay, generated from a seeded RNG
// and merged into a handful of draw calls (buildings share one window texture tinted per
// block by vertex colour; palms, lamps and street furniture are merged the same way).
// Also owns the collision data every mover tests against and the named places missions use.
import { rng } from './state.js';

export const ROADS = [-240, -160, -80, 0, 80, 160, 240];
const ROAD_HALF = 8;
const CITY_EDGE = 276;

export const LOCATIONS = {
  cafe: { x: -138, z: 224, label: "Sol's Café" },
  docks: { x: 200, z: 302, label: 'Marisol Docks' },
  hotel: { x: 22, z: -22, label: 'The Palms Hotel' },
  garage: { x: -22, z: -184, label: "Sol's Garage" },
  beachClub: { x: 84, z: 252, label: 'Club Sirena' },
  northGate: { x: 4, z: -262, label: 'North Gate' },
  pd: { x: 102, z: 22, label: 'Marisol Bay PD' },
  hospital: { x: -102, z: -106, label: 'St. Coral Hospital' },
  marina: { x: 128, z: 252, label: 'Marina Row' },
};

// --- tiny geometry kit: paint every vertex of a geometry one colour, transform, merge ---
function paint(geom, hex) {
  const c = new THREE.Color(hex);
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}
function xform(geom, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4()
    .makeRotationY(ry)
    .premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
  const s = new THREE.Matrix4().makeScale(sx, sy, sz);
  geom.applyMatrix4(s); geom.applyMatrix4(m);
  return geom;
}
function mergeParts(parts) {
  let total = 0;
  const prepped = parts.map((g) => { const ng = g.index ? g.toNonIndexed() : g; total += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o3 = 0, o2 = 0;
  for (const g of prepped) {
    pos.set(g.attributes.position.array, o3);
    nor.set(g.attributes.normal.array, o3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
    if (g.attributes.color) col.set(g.attributes.color.array, o3);
    o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function buildingTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 256, 256);
  // deco bands
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 18, 256, 7); g.fillRect(0, 128, 256, 5);
  g.fillStyle = 'rgba(90,70,50,0.25)'; g.fillRect(0, 244, 256, 12);
  // window grid
  for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) {
    const lit = Math.random() < 0.24;
    g.fillStyle = lit ? '#ffca7a' : '#33455c';
    g.fillRect(14 + x * 40, 34 + y * 30, 24, 18);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(14 + x * 40, 34 + y * 30, 24, 3);
  }
  // flat roof patch sampled by the top face (uv remapped to this corner)
  g.fillStyle = '#7d7268'; g.fillRect(244, 244, 12, 12);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function landmarkTexture(base, band, sign) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = band; g.fillRect(0, 0, 256, 44);
  g.fillStyle = '#ffffff'; g.font = 'bold 30px Georgia'; g.textAlign = 'center';
  g.fillText(sign, 128, 33);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
    g.fillStyle = Math.random() < 0.2 ? '#ffca7a' : '#2c3e50';
    g.fillRect(14 + x * 40, 66 + y * 36, 24, 20);
  }
  g.fillStyle = '#7d7268'; g.fillRect(244, 244, 12, 12);
  return new THREE.CanvasTexture(cv);
}

const PASTELS = [0xf6c9a0, 0xf2a7a2, 0xa8d8c8, 0xf9e29c, 0xc5b3e6, 0x9fd3e8, 0xf7d1cd, 0xb5e0a8, 0xffc48f, 0xd5a6bd];

export function buildWorld(scene, seed) {
  const rand = rng(seed);
  const colliders = [];
  const circles = [];
  const buildingParts = [];
  const flatParts = []; // vertex-coloured, untextured: roads, palms, lamps, pads
  const glowParts = []; // bright basic-material parts: lamp heads, deco trims

  // ---------- sky, lights, sea ----------
  const skyGeo = new THREE.SphereGeometry(1500, 24, 12);
  {
    const posA = skyGeo.attributes.position; const colors = new Float32Array(posA.count * 3);
    const top = new THREE.Color(0x3d7ab8), mid = new THREE.Color(0xf2a56b), low = new THREE.Color(0xffd9a0);
    for (let i = 0; i < posA.count; i++) {
      const y = posA.getY(i) / 1500;
      const c = y > 0.25 ? mid.clone().lerp(top, (y - 0.25) / 0.75) : low.clone().lerp(mid, (y + 0.1) / 0.35);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xf7b06a, 260, 1150);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9a7350, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 1.35);
  sun.position.set(-320, 210, 380);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -420; sun.shadow.camera.right = 420;
  sun.shadow.camera.top = 420; sun.shadow.camera.bottom = -420;
  sun.shadow.camera.far = 1400; sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffe0b8, 0.25));

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 900),
    new THREE.MeshPhongMaterial({ color: 0x17708e, shininess: 140, specular: 0xffcf9e })
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.5, 330 + 450);
  scene.add(sea);

  // ---------- ground, beach, roads ----------
  // The ground sheet stops at the shoreline (z=330) so the bay can actually be water.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1560), new THREE.MeshLambertMaterial({ color: 0x77875c }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, -450); ground.receiveShadow = true;
  scene.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(2400, 90), new THREE.MeshLambertMaterial({ color: 0xeacf9d }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, 322); sand.receiveShadow = true;
  scene.add(sand);

  const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const r of ROADS) {
    // asphalt strips both ways
    flatParts.push(paint(xform(new THREE.PlaneGeometry(16, 640).rotateX(-Math.PI / 2), r, 0.02, 0), 0x35383f));
    flatParts.push(paint(xform(new THREE.PlaneGeometry(640, 16).rotateX(-Math.PI / 2), 0, 0.021, r), 0x35383f));
    // sidewalks
    for (const s of [-1, 1]) {
      flatParts.push(paint(xform(new THREE.PlaneGeometry(3.4, 640).rotateX(-Math.PI / 2), r + s * 9.7, 0.03, 0), 0x9b958a));
      flatParts.push(paint(xform(new THREE.PlaneGeometry(640, 3.4).rotateX(-Math.PI / 2), 0, 0.031, r + s * 9.7), 0x9b958a));
    }
    // centre dashes
    for (let d = -312; d <= 312; d += 12) {
      flatParts.push(paint(xform(new THREE.PlaneGeometry(0.35, 4.4).rotateX(-Math.PI / 2), r, 0.035, d), 0xd8c98a));
      flatParts.push(paint(xform(new THREE.PlaneGeometry(4.4, 0.35).rotateX(-Math.PI / 2), d, 0.036, r), 0xd8c98a));
    }
  }

  // ---------- city blocks ----------
  const blockCenters = [];
  for (let i = 0; i < ROADS.length - 1; i++) for (let j = 0; j < ROADS.length - 1; j++) {
    blockCenters.push({ x: (ROADS[i] + ROADS[i + 1]) / 2, z: (ROADS[j] + ROADS[j + 1]) / 2 });
  }
  const tex = buildingTexture();
  function addBuilding(x, z, w, d, h, tint, parts) {
    const geo = new THREE.BoxGeometry(w, h, d);
    // scale the window texture by the building's size so windows stay window-sized,
    // then remap the top (+y) and bottom face UVs onto the flat roof patch
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 13, uv.getY(i) * h / 13);
    for (let f = 2; f <= 3; f++) for (let v = 0; v < 4; v++) { const idx = f * 4 + v; uv.setXY(idx, 0.965, 0.965); }
    paint(geo, tint);
    xform(geo, x, h / 2, z);
    parts.push(geo);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  for (const b of blockCenters) {
    const roll = rand();
    const isPark = roll > 0.86;
    flatParts.push(paint(xform(new THREE.PlaneGeometry(64, 64).rotateX(-Math.PI / 2), b.x, 0.015, b.z), isPark ? 0x6f9e52 : 0xa39c90));
    if (isPark) continue;
    if (roll < 0.34) {
      // one proud deco tower per block
      const h = 30 + rand() * 46;
      addBuilding(b.x, b.z, 40, 40, h, PASTELS[Math.floor(rand() * PASTELS.length)], buildingParts);
      addBuilding(b.x, b.z, 30, 30, h + 8, PASTELS[Math.floor(rand() * PASTELS.length)], buildingParts);
    } else {
      // four smaller walk-ups around the block
      for (const ox of [-16, 16]) for (const oz of [-16, 16]) {
        if (rand() < 0.14) continue;
        const h = 9 + rand() * 26;
        addBuilding(b.x + ox, b.z + oz, 24 + rand() * 6, 24 + rand() * 6, h, PASTELS[Math.floor(rand() * PASTELS.length)], buildingParts);
      }
    }
  }
  // landmarks with their own faces: PD, hospital, hotel
  const landmarks = [
    { at: LOCATIONS.pd, w: 34, d: 26, h: 17, tex: landmarkTexture('#5a6d84', '#20344d', 'POLICE') },
    { at: LOCATIONS.hospital, w: 36, d: 26, h: 19, tex: landmarkTexture('#eef0ea', '#c33d4e', '+ ST CORAL +') },
    { at: LOCATIONS.hotel, w: 30, d: 30, h: 34, tex: landmarkTexture('#e8c98a', '#7a4a21', 'THE PALMS') },
  ];
  for (const lm of landmarks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lm.w, lm.h, lm.d),
      new THREE.MeshLambertMaterial({ map: lm.tex }));
    // stand the landmark just inland of its street marker
    const x = lm.at.x + (lm.at.x > 0 ? 16 : -16), z = lm.at.z + (lm.at.z > 0 ? 16 : -16);
    m.position.set(x, lm.h / 2, z); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - lm.w / 2, maxX: x + lm.w / 2, minZ: z - lm.d / 2, maxZ: z + lm.d / 2 });
  }

  // ---------- palms and lamps ----------
  const palmSpots = [];
  for (let x = -268; x <= 268; x += 18) { palmSpots.push({ x: x + rand() * 4, z: 262 + rand() * 5 }); palmSpots.push({ x: x + rand() * 4, z: 296 + rand() * 6 }); }
  for (let i = 0; i < 46; i++) {
    const bx = blockCenters[Math.floor(rand() * blockCenters.length)];
    palmSpots.push({ x: bx.x + (rand() - 0.5) * 52, z: bx.z + (rand() - 0.5) * 52 });
  }
  for (const p of palmSpots) {
    const h = 5.2 + rand() * 2.4, lean = (rand() - 0.5) * 0.14;
    const trunk = new THREE.CylinderGeometry(0.13, 0.24, h, 5);
    paint(trunk, 0x8a6844);
    trunk.translate(0, h / 2, 0); // base at the origin so the lean pivots on the ground
    trunk.applyMatrix4(new THREE.Matrix4().makeRotationZ(lean));
    trunk.translate(p.x, 0, p.z);
    flatParts.push(trunk);
    const topX = p.x - Math.sin(lean) * h, topZ = p.z;
    for (let f = 0; f < 6; f++) {
      const frond = new THREE.PlaneGeometry(3.1, 0.6);
      paint(frond, f % 2 ? 0x2f9e5f : 0x37b06a);
      frond.translate(1.35, 0, 0);
      frond.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.55 - rand() * 0.25));
      frond.applyMatrix4(new THREE.Matrix4().makeRotationY((f / 6) * Math.PI * 2 + rand() * 0.4));
      frond.applyMatrix4(new THREE.Matrix4().makeTranslation(topX, h - 0.1, topZ));
      flatParts.push(frond);
    }
    circles.push({ x: p.x, z: p.z, r: 0.55 });
  }
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const r of ROADS) for (let d = -300; d <= 300; d += 60) {
    for (const [lx, lz] of [[r - 9.4, d], [r + 9.4, d + 30], [d, r - 9.4], [d + 30, r + 9.4]]) {
      if (Math.abs(lx) > CITY_EDGE + 8 || Math.abs(lz) > CITY_EDGE + 8) continue;
      const pole = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
      paint(pole, 0x3c4148); xform(pole, lx, 2.7, lz);
      flatParts.push(pole);
      const head = new THREE.SphereGeometry(0.34, 6, 5);
      paint(head, 0xffd9a0); xform(head, lx, 5.5, lz);
      glowParts.push(head);
      circles.push({ x: lx, z: lz, r: 0.3 });
    }
  }
  // docks: a timber pier reaching into the bay by the marina
  for (let i = 0; i < 9; i++) {
    flatParts.push(paint(xform(new THREE.BoxGeometry(10, 0.5, 7), 200, 0.55, 306 + i * 7), i % 2 ? 0x8a6844 : 0x77572f));
  }
  for (const px of [196, 204]) for (let pz = 306; pz <= 362; pz += 14) {
    flatParts.push(paint(xform(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), px, -0.4, pz), 0x5d4630));
  }

  const buildingsMesh = new THREE.Mesh(mergeParts(buildingParts),
    new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
  buildingsMesh.castShadow = true; buildingsMesh.receiveShadow = true;
  scene.add(buildingsMesh);
  const flatMesh = new THREE.Mesh(mergeParts(flatParts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  flatMesh.receiveShadow = true;
  scene.add(flatMesh);
  const glowMesh = new THREE.Mesh(mergeParts(glowParts), lampMat);
  scene.add(glowMesh);

  // Parked-car spots: along street edges, clear of intersections.
  const parkedSpots = [];
  for (const r of ROADS) for (let d = -276; d <= 276; d += 27) {
    if (ROADS.some((o) => Math.abs(d - o) < 15)) continue;
    if (rand() < 0.45) continue;
    const side = rand() < 0.5 ? -6.4 : 6.4;
    if (rand() < 0.5) parkedSpots.push({ x: r + side, z: d, heading: side > 0 ? Math.PI : 0 });
    else parkedSpots.push({ x: d, z: r + side, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  return {
    colliders, circles, parkedSpots, sea,
    update(dt, t) {
      sea.position.y = -0.5 + Math.sin(t * 0.5) * 0.08;
      sea.material.color.setHSL(0.54, 0.72, 0.3 + Math.sin(t * 0.23) * 0.02);
    },
  };
}

// Is a point on asphalt (either street direction)?
export function onRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) < ROAD_HALF + 1.5 || Math.abs(z - r) < ROAD_HALF + 1.5) return true;
  return false;
}
// Push a circle (x,z,radius) out of every building AABB and lamp/palm circle; returns corrected [x,z].
export function collide(world, x, z, radius) {
  for (const c of world.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); x = nx + (dx / d) * radius; z = nz + (dz / d) * radius; }
      else {
        // centre inside the box: push out along the smallest penetration
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - radius; else if (m === pr) x = c.maxX + radius;
        else if (m === pt) z = c.minZ - radius; else z = c.maxZ + radius;
      }
    }
  }
  for (const c of world.circles) {
    const dx = x - c.x, dz = z - c.z, rr = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); x = c.x + (dx / d) * rr; z = c.z + (dz / d) * rr; }
  }
  const lim = CITY_EDGE + 60;
  x = Math.max(-lim, Math.min(x, lim));
  z = Math.max(-lim, Math.min(z, 372));
  return [x, z];
}
