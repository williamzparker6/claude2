import * as THREE from 'three';

// The dreamy, baked-feeling look: a hemisphere fill for soft ambient gradient,
// a key point light to give decks form, and a couple of warm accent lights for
// the Edwardian brass mood. Emissive materials (portholes, lamps) plus bloom do
// most of the heavy lifting — see postfx/composer.js.

export function buildLighting(scene) {
  const group = new THREE.Group();
  group.name = 'lighting';

  // Cold sky / warm-ish ground bounce. Lifts the decks enough to read the
  // platforming gaps while keeping the void dark and dreamlike.
  // (Brightened for this test build for easier visibility.)
  const hemi = new THREE.HemisphereLight(0x7c9ec2, 0x2c2010, 1.25);
  group.add(hemi);

  // Key light, slightly warm, casts the only real shadows.
  const key = new THREE.PointLight(0xffd9a0, 60, 60, 2);
  key.position.set(6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 50;
  key.shadow.bias = -0.0015;
  group.add(key);

  // Cool rim from the void below, no shadows — cheap mood.
  const rim = new THREE.PointLight(0x3f6fae, 26, 70, 2);
  rim.position.set(-10, -6, -6);
  group.add(rim);

  // A second warm accent further along the level so distant decks aren't black.
  const accent = new THREE.PointLight(0xffb066, 30, 50, 2);
  accent.position.set(24, 10, 18);
  group.add(accent);

  scene.add(group);

  return {
    group,
    hemi,
    key,
    rim,
    accent,
    dispose() {
      scene.remove(group);
    },
  };
}
