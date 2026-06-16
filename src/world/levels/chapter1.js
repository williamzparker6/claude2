import * as THREE from 'three';
import { EVIDENCE_BY_ID } from '../../data/evidence.js';

// Chapter 1 — "The Boiler Room Discrepancy".
//
// Greybox decks floating in the void. Everything collidable is an axis-aligned
// box recorded in `colliders`; the CharacterController treats those as the
// navigable set. Named meshes (registry) are the handles GeometryStates uses to
// reshape the world when a deduction resolves.
//
// Traversal:
//   A (spawn) --jump gap--> B  --[geo_fire_first: bridge+wall]--> C (inverted
//   gravity ceiling-walk) --moving platform gap--> D
//   --[geo_coal_path: bridge+rubble]--> E (chapter-end marker)

// ---- shared material palette (reused everywhere; cheap on draw state) -------
function buildPalette() {
  return {
    deck: new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 0.92, metalness: 0.05 }),
    deckCool: new THREE.MeshStandardMaterial({ color: 0x2e3640, roughness: 0.85, metalness: 0.1 }),
    hull: new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.8, metalness: 0.25 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x33291f, roughness: 0.9, metalness: 0.08 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x4a1320, roughness: 1.0, metalness: 0.0 }),
    brass: new THREE.MeshStandardMaterial({
      color: 0x9c7a3c, roughness: 0.35, metalness: 0.85,
      emissive: 0x2a1d08, emissiveIntensity: 0.5,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0b1416, roughness: 0.3, metalness: 0.1,
      emissive: 0x6fd6e6, emissiveIntensity: 1.7,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0x201406, roughness: 0.5, metalness: 0.2,
      emissive: 0xffba66, emissiveIntensity: 2.0,
    }),
    rubble: new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 1.0, metalness: 0.0 }),
    bridge: new THREE.MeshStandardMaterial({
      color: 0x55473a, roughness: 0.6, metalness: 0.3,
      emissive: 0x3a2c12, emissiveIntensity: 0.6,
    }),
    marker: new THREE.MeshStandardMaterial({
      color: 0x0a1820, roughness: 0.2, metalness: 0.1,
      emissive: 0xbfe9ff, emissiveIntensity: 1.6,
    }),
  };
}

const EVIDENCE_COLORS = {
  transcript: 0xffd27a,
  manifest: 0x9ad4ff,
  log: 0xc6a8ff,
};

export function buildChapter1() {
  const group = new THREE.Group();
  group.name = 'chapter1';
  const P = buildPalette();

  const colliders = [];
  const gravityZones = [];
  const movingPlatforms = [];
  const pickups = [];
  const registry = new Map();
  const decor = []; // {mesh, fn} idle animations

  // ---- builders -------------------------------------------------------------
  function box(name, { pos, size, material, isFloor = false, isWall = false, safe = false,
    solid = true, dynamic = false, collide = true, castShadow = true, receiveShadow = true,
    fadeable = false, visible = true }) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = fadeable ? material.clone() : material;
    if (fadeable) { mat.transparent = true; mat.opacity = visible ? 1 : 0; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.visible = visible;
    if (name) mesh.name = name;
    group.add(mesh);

    let collider = null;
    if (collide) {
      collider = {
        name,
        mesh,
        center: new THREE.Vector3(pos[0], pos[1], pos[2]),
        half: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
        solid, isFloor, isWall, safe, dynamic,
        active: visible,
        delta: new THREE.Vector3(),
      };
      colliders.push(collider);
    }
    const entry = { mesh, collider };
    if (name) registry.set(name, entry);
    return entry;
  }

  function porthole(pos, ry = 0) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 10, 20), P.brass);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), P.glass);
    glass.position.z = 0.02;
    g.add(ring, glass);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = ry;
    group.add(g);
    return g;
  }

  function lamp(pos) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 8), P.brass);
    post.position.y = 1.0;
    post.castShadow = true;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), P.lamp);
    globe.position.y = 2.1;
    g.add(post, globe);
    g.position.set(pos[0], pos[1], pos[2]);
    group.add(g);
    // a soft local pool of light (no shadow — cheap)
    const pl = new THREE.PointLight(0xffb775, 8, 9, 2);
    pl.position.set(pos[0], pos[1] + 2.1, pos[2]);
    group.add(pl);
    return g;
  }

  function post(pos, h = 1.0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 8), P.brass);
    m.position.set(pos[0], pos[1] + h / 2, pos[2]);
    m.castShadow = true;
    group.add(m);
    return m;
  }

  function railing(x0, x1, z, y = 0) {
    // a thin decorative top rail + a couple posts (non-collidable)
    const len = Math.abs(x1 - x0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), P.brass);
    rail.position.set((x0 + x1) / 2, y + 0.95, z);
    group.add(rail);
    post([x0, y, z]); post([x1, y, z]); post([(x0 + x1) / 2, y, z]);
  }

  function makePickup(id, pos) {
    const data = EVIDENCE_BY_ID[id];
    const color = EVIDENCE_COLORS[data?.type] || 0xffffff;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0f14, roughness: 0.25, metalness: 0.1,
      emissive: color, emissiveIntensity: 1.7,
    });
    // a slowly turning "document shard"
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), mat);
    shard.castShadow = true;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    halo.rotation.x = Math.PI / 2;
    g.add(shard, halo);
    g.position.set(pos[0], pos[1], pos[2]);
    group.add(g);
    const pickup = {
      id,
      group: g,
      shard,
      basePos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      radius: 1.25,
      collected: false,
    };
    pickups.push(pickup);
    return pickup;
  }

  // ===========================================================================
  // DECKS
  // ===========================================================================
  // Deck A — Boat Deck (spawn)
  box('deck_a', { pos: [0, -0.3, 0], size: [14, 0.6, 12], material: P.deck, isFloor: true, safe: true });
  // Deck B — Grand Staircase landing
  box('deck_b', { pos: [15.5, -0.3, 0], size: [11, 0.6, 12], material: P.deck, isFloor: true, safe: true });
  // Deck C — Cargo Hold (split floor + ceiling walkway; inverted gravity)
  box('deck_c_near', { pos: [15.5, -0.3, 12], size: [12, 0.6, 6], material: P.deckCool, isFloor: true, safe: true });
  box('deck_c_far', { pos: [15.5, -0.3, 21], size: [12, 0.6, 4], material: P.deckCool, isFloor: true, safe: true });
  box('deck_c_ceiling', { pos: [15.5, 8.3, 16], size: [12, 0.6, 14], material: P.hull, isFloor: true, safe: false });
  // Deck D — Wireless Room
  box('deck_d', { pos: [32, -0.3, 21], size: [10, 0.6, 8], material: P.deck, isFloor: true, safe: true });
  // Deck E — final landing (chapter end)
  box('deck_e', { pos: [32, -0.3, 30], size: [8, 0.6, 6], material: P.deckCool, isFloor: true, safe: true });

  // ===========================================================================
  // RESHAPE GEOMETRY  (named for GeometryStates)
  // ===========================================================================
  // -- geo_fire_first ---------------------------------------------------------
  // Wall blocking the route north out of Deck B (present until disabled).
  box('corridor_C_intact_wall', {
    pos: [15.5, 1.5, 6], size: [5, 3, 0.6], material: P.wall,
    isWall: true, safe: false, fadeable: true, visible: true,
  });
  // Bridge B -> C_near (hidden until enabled).
  box('corridor_C_open_path', {
    pos: [15.5, -0.3, 7.5], size: [5, 0.6, 3], material: P.bridge,
    isFloor: true, safe: true, fadeable: true, visible: false,
  });
  // Grand staircase — visual flourish that rotates 90° on reshape.
  const staircase = buildStaircase(P);
  staircase.position.set(19.5, 0, 4);
  staircase.userData.transformStates = {
    default: { rotation: { x: 0, y: 0, z: 0 } },
    rotated_90: { rotation: { x: 0, y: -Math.PI / 2, z: 0 } },
  };
  group.add(staircase);
  registry.set('grand_staircase', { mesh: staircase, collider: null });
  decor.push({ mesh: staircase, fn: null });

  // -- geo_coal_path ----------------------------------------------------------
  // Collapsed rubble blocking the route north out of Deck D.
  box('corridor_D_collapsed_wall', {
    pos: [32, 1.4, 25], size: [4, 2.8, 0.9], material: P.rubble,
    isWall: true, safe: false, fadeable: true, visible: true,
  });
  // Reformed bridge D -> E (hidden until enabled).
  box('corridor_D_reformed_bridge', {
    pos: [32, -0.3, 26], size: [4, 0.6, 4], material: P.bridge,
    isFloor: true, safe: true, fadeable: true, visible: false,
  });
  // Corridor arch that "reforms" — starts sunk in the void, rises into place.
  const segment = buildCorridorArch(P);
  segment.position.set(32, -6, 26);
  segment.userData.transformStates = {
    sunk: { position: { x: 32, y: -6, z: 26 } },
    reformed: { position: { x: 32, y: 2.2, z: 26 } },
  };
  group.add(segment);
  registry.set('corridor_D_segment', { mesh: segment, collider: null });

  // ===========================================================================
  // MOVING PLATFORM  (ship-rocking ferry across the C_far -> D gap)
  // ===========================================================================
  const plat = box('moving_platform', {
    pos: [25, -0.25, 21], size: [3.2, 0.5, 4.2], material: P.brass,
    isFloor: true, safe: false, dynamic: true,
  });
  const platLamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), P.lamp);
  platLamp.position.set(0, 0.5, 0);
  plat.mesh.add(platLamp);
  movingPlatforms.push({
    collider: plat.collider,
    mesh: plat.mesh,
    _prev: new THREE.Vector3(25, -0.25, 21),
    update(t) {
      const x = 25 + 2.6 * Math.sin(t * 0.9);
      const y = -0.25 + 0.12 * Math.sin(t * 1.7); // gentle rocking bob
      this.mesh.position.set(x, y, 21);
      this.collider.center.set(x, y, 21);
      this.collider.delta.set(x - this._prev.x, y - this._prev.y, 21 - this._prev.z);
      this._prev.set(x, y, 21);
    },
  });

  // ===========================================================================
  // GRAVITY ZONE  (Deck C inverted-gravity ceiling crossing)
  // ===========================================================================
  gravityZones.push({
    box: new THREE.Box3(
      new THREE.Vector3(9.5, 0.2, 13.5),
      new THREE.Vector3(21.5, 8.2, 19.5),
    ),
  });

  // ===========================================================================
  // EVIDENCE PICKUPS  (4)
  // ===========================================================================
  makePickup('transcript_boiler_fire', [3, 1.0, 0]);     // Deck A
  makePickup('log_captain_notified', [15.5, 1.0, -2]);   // Deck B
  makePickup('manifest_coal_bunker', [15.5, 6.9, 16.5]); // Deck C ceiling (inverted)
  makePickup('log_wireless_distress', [32, 1.0, 21]);    // Deck D

  // ===========================================================================
  // CHAPTER-END MARKER  (Deck E)
  // ===========================================================================
  const endGroup = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 16), P.marker);
  pillar.position.y = 1.1;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 16), P.marker);
  orb.position.y = 2.5;
  endGroup.add(pillar, orb);
  endGroup.position.set(32, 0, 30);
  group.add(endGroup);
  const endMarker = {
    group: endGroup, orb,
    basePos: new THREE.Vector3(32, 1.6, 30),
    radius: 1.6,
  };

  // ===========================================================================
  // DECORATION  (mood; modest count for the perf budget)
  // ===========================================================================
  lamp([-5, 0, 4]); lamp([6, 0, -4]);
  lamp([15.5, 0, 4.5]); lamp([32, 0, 18]);
  porthole([15.5, 1.6, 6.28], 0);             // on the intact wall face
  porthole([10.1, 1.6, 0], Math.PI / 2);
  porthole([20.9, 1.6, 0], -Math.PI / 2);
  porthole([32, 1.6, 24.6], 0);
  railing(-7, -1, 5.7); railing(1, 7, 5.7);
  railing(27, 37, 16.7, 0);
  // a few velvet "benches" for Edwardian texture (non-collidable)
  for (const p of [[-4, 0.25, -4], [4, 0.25, 4], [32, 0.25, 23]]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.6), P.velvet);
    bench.position.set(p[0], p[1], p[2]);
    bench.castShadow = true; bench.receiveShadow = true;
    group.add(bench);
  }

  // ---- public interface -----------------------------------------------------
  const level = {
    group,
    palette: P,
    spawn: new THREE.Vector3(-4, 0.2, 0),
    spawnYaw: -Math.PI / 2, // face +x (toward the journey)
    killPlaneY: -18,
    registry,
    pickups,
    endMarker,
    movingPlatforms,
    _colliders: colliders,
    _gravityZones: gravityZones,
    _t: 0,
    colliders() { return colliders; },
    gravityZones() { return gravityZones; },
    // Time accumulates from dt so pausing the world (DESK/PAUSED) never causes a
    // phase jump in the moving platform when play resumes.
    update(dt) {
      this._t += dt;
      const t = this._t;
      for (const mp of movingPlatforms) mp.update(t);
      // bob + spin pickups
      for (const pk of pickups) {
        if (pk.collected) continue;
        pk.shard.rotation.y += dt * 1.2;
        pk.group.position.y = pk.basePos.y + Math.sin(t * 1.6) * 0.12;
      }
      // breathe the end marker
      endMarker.orb.position.y = 2.5 + Math.sin(t * 1.2) * 0.1;
      endMarker.group.rotation.y += dt * 0.4;
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
    },
  };
  return level;
}

// ---- procedural props -------------------------------------------------------
function buildStaircase(P) {
  const g = new THREE.Group();
  g.name = 'grand_staircase';
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.5), P.deck);
    step.position.set(0, 0.11 + i * 0.22, -i * 0.5);
    step.castShadow = true; step.receiveShadow = true;
    g.add(step);
  }
  // brass balustrades
  for (const sx of [-1.2, 1.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, steps * 0.55), P.brass);
    rail.position.set(sx, 0.22 * steps * 0.6, -steps * 0.25 + 0.2);
    rail.rotation.x = -Math.atan2(steps * 0.22, steps * 0.5);
    g.add(rail);
  }
  return g;
}

function buildCorridorArch(P) {
  const g = new THREE.Group();
  g.name = 'corridor_D_segment';
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.6), P.hull);
  left.position.set(-2, 2, 0);
  const right = left.clone();
  right.position.set(2, 2, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.6, 0.6), P.hull);
  top.position.set(0, 4, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), P.lamp);
  lamp.position.set(0, 3.7, 0);
  [left, right, top].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  g.add(left, right, top, lamp);
  return g;
}
