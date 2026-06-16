import { bus, Events } from '../game/EventBus.js';
import { GEOMETRY_STATE_BY_ID } from '../data/geometryStates.js';

// Maps a geometryStates id to concrete mesh show/hide/tween operations against
// the level's named registry. Toggling `collider.active` is all that's needed to
// "re-bake" the navigable set — the controller reads active colliders every
// frame, so a disabled wall stops colliding the instant it's switched off and an
// enabled bridge becomes walkable as it fades in.

export class GeometryStates {
  constructor(level, tweens, { reducedMotion = false } = {}) {
    this.level = level;
    this.tweens = tweens;
    this.reducedMotion = reducedMotion;
  }

  setReducedMotion(v) {
    this.reducedMotion = v;
  }

  /**
   * Apply a geometry state. Returns a Promise that resolves when every
   * animation has settled (so RESHAPING can hand control back to EXPLORE).
   */
  apply(stateId) {
    const state = GEOMETRY_STATE_BY_ID[stateId];
    if (!state) {
      console.warn(`[GeometryStates] unknown state "${stateId}"`);
      return Promise.resolve();
    }

    bus.emit(Events.GEOMETRY_APPLIED, { id: stateId });

    const jobs = [];

    for (const name of state.enable || []) jobs.push(this._fade(name, true));
    for (const name of state.disable || []) jobs.push(this._fade(name, false));
    for (const t of state.transform || []) jobs.push(this._transform(t));

    return Promise.all(jobs).then(() => {
      bus.emit(Events.GEOMETRY_DONE, { id: stateId });
    });
  }

  _entry(name) {
    const e = this.level.registry.get(name);
    if (!e) console.warn(`[GeometryStates] no mesh named "${name}"`);
    return e;
  }

  _fade(name, enable) {
    const entry = this._entry(name);
    if (!entry) return Promise.resolve();
    const { mesh, collider } = entry;

    if (enable) {
      mesh.visible = true;
      if (collider) collider.active = true; // collidable immediately
    }
    // Ensure the material can fade.
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && !mat.transparent) mat.transparent = true;
    const from = enable ? 0 : 1;
    const to = enable ? 1 : 0;
    if (mat) mat.opacity = from;

    return new Promise((resolve) => {
      this.tweens.add({
        durationMs: 900,
        easing: 'easeOut',
        reducedMotion: this.reducedMotion,
        onUpdate: (t) => {
          if (mat) mat.opacity = from + (to - from) * t;
        },
        onComplete: () => {
          if (!enable) {
            mesh.visible = false;
            if (collider) collider.active = false; // stop colliding once gone
          }
          resolve();
        },
      });
    });
  }

  _transform({ target, to, durationMs = 1500 }) {
    const entry = this._entry(target);
    if (!entry) return Promise.resolve();
    const mesh = entry.mesh;
    const preset = mesh.userData.transformStates?.[to];
    if (!preset) {
      console.warn(`[GeometryStates] "${target}" has no transform state "${to}"`);
      return Promise.resolve();
    }

    const start = {
      position: mesh.position.clone(),
      rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      scale: mesh.scale.clone(),
    };

    return new Promise((resolve) => {
      this.tweens.add({
        durationMs,
        easing: 'easeInOutBack',
        reducedMotion: this.reducedMotion,
        onUpdate: (t) => {
          if (preset.position) {
            mesh.position.set(
              lerp(start.position.x, preset.position.x ?? start.position.x, t),
              lerp(start.position.y, preset.position.y ?? start.position.y, t),
              lerp(start.position.z, preset.position.z ?? start.position.z, t),
            );
          }
          if (preset.rotation) {
            mesh.rotation.set(
              lerp(start.rotation.x, preset.rotation.x ?? start.rotation.x, t),
              lerp(start.rotation.y, preset.rotation.y ?? start.rotation.y, t),
              lerp(start.rotation.z, preset.rotation.z ?? start.rotation.z, t),
            );
          }
          if (preset.scale) {
            mesh.scale.set(
              lerp(start.scale.x, preset.scale.x ?? start.scale.x, t),
              lerp(start.scale.y, preset.scale.y ?? start.scale.y, t),
              lerp(start.scale.z, preset.scale.z ?? start.scale.z, t),
            );
          }
          // If a transformed mesh is also a collider, keep its AABB in sync.
          if (entry.collider) entry.collider.center.copy(mesh.position);
        },
        onComplete: resolve,
      });
    });
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
