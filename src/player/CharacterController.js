import * as THREE from 'three';
import { bus, Events } from '../game/EventBus.js';

// Custom kinematic capsule controller. No physics engine.
//
//  * Vertical: integrate gravity, resolve against `isFloor` colliders (AABBs).
//    Supports inverted gravity (land on the underside of ceilings).
//  * Horizontal: integrate, resolve circle-vs-rect against `isWall` colliders.
//  * Coyote time + jump buffering for forgiving platforming.
//  * Moving-platform carry: inherit the platform's per-frame delta when stood on.
//  * Gravity zones flip `gravitySign`; the camera rolls and look inverts so it
//    reads correctly. Falling past the kill plane respawns at the last safe deck.
//
// `position` is the LOWER corner of the capsule's vertical span (gravity
// agnostic): the capsule occupies [position.y, position.y + height].

const G = 24; // gravity magnitude (units/s^2)
const MOVE_SPEED = 6.2;
const JUMP_SPEED = 9.6; // ~1.9u apex at G=24
const AIR_CONTROL = 0.65;
const COYOTE = 0.10;
const JUMP_BUFFER = 0.12;
const SNAP_DIST = 0.55;
const RADIUS = 0.42;
const HEIGHT = 1.7;
const EYE = 1.5;
const SKIN = 0.06;

export class CharacterController {
  constructor({ camera, spawn, yaw = 0, killPlaneY = -18, world }) {
    this.world = world; // provides colliders / gravity zones / moving platforms
    this.killPlaneY = killPlaneY;

    this.position = spawn.clone();
    this.spawn = spawn.clone();
    this.lastSafe = spawn.clone();
    this.velocity = new THREE.Vector3();

    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.lookSens = 0.0022;

    this.grounded = false;
    this.support = null; // collider currently stood on
    this.gravitySign = 1; // +1 down, -1 up (inverted)
    this._coyote = 0;
    this._jumpBuffer = 0;

    // Scene graph: root(feet) -> yawHolder(eye) -> camera(pitch/roll)
    this.root = new THREE.Group();
    this.root.name = 'player';
    this.yawHolder = new THREE.Group();
    this.yawHolder.position.y = EYE;
    this.root.add(this.yawHolder);
    this.camera = camera;
    this.yawHolder.add(camera);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    this._syncTransform();

    // scratch
    this._v = new THREE.Vector3();
  }

  get object() {
    return this.root;
  }

  get center() {
    return this._v.set(this.position.x, this.position.y + HEIGHT * 0.5, this.position.z);
  }

  // ----------------------------------------------------------------- look
  applyLook(dx, dy) {
    const s = this.gravitySign > 0 ? 1 : -1; // invert feel when upside-down
    this.yaw -= dx * this.lookSens * s;
    this.pitch -= dy * this.lookSens * s;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  // ----------------------------------------------------------------- update
  update(dt, input) {
    // clamp dt so a stutter can't tunnel the player through a deck
    dt = Math.min(dt, 1 / 30);

    this._updateGravityZone();

    // --- carry by moving platform (apply its delta before our own motion) ---
    if (this.support && this.support.dynamic && this.support.delta) {
      this.position.x += this.support.delta.x;
      this.position.y += this.support.delta.y;
      this.position.z += this.support.delta.z;
    }

    // --- intent ---
    const axis = input.moveAxis();
    const fwd = this._v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, axis.forward)
      .addScaledVector(right, axis.right);
    if (wish.lengthSq() > 1e-4) wish.normalize().multiplyScalar(MOVE_SPEED);

    if (this.grounded) {
      this.velocity.x = wish.x;
      this.velocity.z = wish.z;
    } else {
      this.velocity.x += (wish.x - this.velocity.x) * AIR_CONTROL * Math.min(1, dt * 10);
      this.velocity.z += (wish.z - this.velocity.z) * AIR_CONTROL * Math.min(1, dt * 10);
    }

    // --- timers ---
    this._coyote = this.grounded ? COYOTE : Math.max(0, this._coyote - dt);
    if (input.consume('jump')) this._jumpBuffer = JUMP_BUFFER;
    else this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);

    if (this._jumpBuffer > 0 && this._coyote > 0) {
      this.velocity.y = JUMP_SPEED * this.gravitySign; // away from the surface
      this._jumpBuffer = 0;
      this._coyote = 0;
      this.grounded = false;
      this.support = null;
    }

    // --- gravity + vertical ---
    this.velocity.y += -G * this.gravitySign * dt;
    const prevMinY = this.position.y;
    const prevMaxY = this.position.y + HEIGHT;
    this.position.y += this.velocity.y * dt;
    this._resolveVertical(prevMinY, prevMaxY);

    // --- horizontal ---
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._resolveHorizontal();

    // --- snap to keep contact on descents / moving platforms ---
    if (!this.grounded) this._snapToSupport();

    // --- record safe respawn anchor ---
    if (
      this.grounded &&
      this.support &&
      this.support.safe &&
      !this.support.dynamic &&
      this.gravitySign > 0
    ) {
      this.lastSafe.copy(this.position);
    }

    // --- void kill plane ---
    if (this.position.y < this.killPlaneY) this.respawn('void');

    // --- present ---
    this._updateRoll(dt);
    this._syncTransform();
  }

  // --------------------------------------------------------- vertical solve
  _resolveVertical(prevMinY, prevMaxY) {
    const wasGrounded = this.grounded;
    this.grounded = false;
    const minY = this.position.y;
    const maxY = this.position.y + HEIGHT;

    for (const c of this.world.colliders()) {
      if (!c.active || !c.solid || !c.isFloor) continue;
      if (!this._overlapXZ(c)) continue;
      const top = c.center.y + c.half.y;
      const bot = c.center.y - c.half.y;
      // vertical span must intersect the box
      if (minY >= top || maxY <= bot) continue;

      if (this.gravitySign > 0) {
        // normal: land on top when descending from above
        if (this.velocity.y <= 0 && prevMinY >= top - SKIN) {
          this.position.y = top;
          this.velocity.y = 0;
          this.grounded = true;
          this.support = c;
        } else if (this.velocity.y > 0 && prevMaxY <= bot + SKIN) {
          this.position.y = bot - HEIGHT;
          this.velocity.y = 0; // head bonk
        }
      } else {
        // inverted: land on underside (ceiling) when rising from below
        if (this.velocity.y >= 0 && prevMaxY <= bot + SKIN) {
          this.position.y = bot - HEIGHT;
          this.velocity.y = 0;
          this.grounded = true;
          this.support = c;
        } else if (this.velocity.y < 0 && prevMinY >= top - SKIN) {
          this.position.y = top;
          this.velocity.y = 0; // bonk against the floor above
        }
      }
    }

    if (!this.grounded && wasGrounded) {
      // left the ground this frame; support cleared unless snap re-grabs it
      this.support = null;
    }
  }

  // ------------------------------------------------------- horizontal solve
  _resolveHorizontal() {
    const minY = this.position.y;
    const maxY = this.position.y + HEIGHT;
    for (const c of this.world.colliders()) {
      if (!c.active || !c.solid || !c.isWall) continue;
      const top = c.center.y + c.half.y;
      const bot = c.center.y - c.half.y;
      if (minY >= top || maxY <= bot) continue; // no vertical overlap

      // closest point on the box footprint to the capsule centre
      const cx = Math.max(c.center.x - c.half.x, Math.min(this.position.x, c.center.x + c.half.x));
      const cz = Math.max(c.center.z - c.half.z, Math.min(this.position.z, c.center.z + c.half.z));
      let dx = this.position.x - cx;
      let dz = this.position.z - cz;
      let d2 = dx * dx + dz * dz;

      if (d2 > RADIUS * RADIUS) continue;

      if (d2 < 1e-6) {
        // centre inside the rect — push out along the smaller penetration axis
        const penX = c.half.x + RADIUS - Math.abs(this.position.x - c.center.x);
        const penZ = c.half.z + RADIUS - Math.abs(this.position.z - c.center.z);
        if (penX < penZ) {
          this.position.x += Math.sign(this.position.x - c.center.x || 1) * penX;
          this.velocity.x = 0;
        } else {
          this.position.z += Math.sign(this.position.z - c.center.z || 1) * penZ;
          this.velocity.z = 0;
        }
        continue;
      }

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const push = RADIUS - d;
      this.position.x += nx * push;
      this.position.z += nz * push;
      // kill the velocity component heading into the wall
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn < 0) {
        this.velocity.x -= vn * nx;
        this.velocity.z -= vn * nz;
      }
    }
  }

  // ----------------------------------------------------------- ground snap
  _snapToSupport() {
    // Only snap when moving toward the surface (don't cancel a fresh jump).
    if (this.gravitySign > 0 ? this.velocity.y > 0.01 : this.velocity.y < -0.01) return;
    if (this._coyote <= 0 && !this.support) {
      // allow a short snap window even without recent support (stairs/edges)
    }
    let best = null;
    let bestSurface = 0;
    for (const c of this.world.colliders()) {
      if (!c.active || !c.solid || !c.isFloor) continue;
      if (!this._overlapXZ(c)) continue;
      if (this.gravitySign > 0) {
        const top = c.center.y + c.half.y;
        const gap = this.position.y - top;
        if (gap >= -SKIN && gap <= SNAP_DIST) {
          if (!best || top > bestSurface) {
            best = c;
            bestSurface = top;
          }
        }
      } else {
        const bot = c.center.y - c.half.y;
        const gap = bot - (this.position.y + HEIGHT);
        if (gap >= -SKIN && gap <= SNAP_DIST) {
          if (!best || bot < bestSurface || bestSurface === 0) {
            best = c;
            bestSurface = bot;
          }
        }
      }
    }
    if (best) {
      this.position.y = this.gravitySign > 0 ? bestSurface : bestSurface - HEIGHT;
      this.velocity.y = 0;
      this.grounded = true;
      this.support = best;
    }
  }

  _overlapXZ(c) {
    const cx = Math.max(c.center.x - c.half.x, Math.min(this.position.x, c.center.x + c.half.x));
    const cz = Math.max(c.center.z - c.half.z, Math.min(this.position.z, c.center.z + c.half.z));
    const dx = this.position.x - cx;
    const dz = this.position.z - cz;
    return dx * dx + dz * dz <= RADIUS * RADIUS;
  }

  // -------------------------------------------------------- gravity zones
  _updateGravityZone() {
    const center = this.center;
    let inside = false;
    for (const z of this.world.gravityZones()) {
      if (z.box.containsPoint(center)) {
        inside = true;
        break;
      }
    }
    const desired = inside ? -1 : 1;
    if (desired !== this.gravitySign) {
      this.gravitySign = desired;
      this.grounded = false;
      this.support = null;
      bus.emit(Events.PLAYER_GRAVITY, { inverted: desired < 0 });
    }
  }

  _updateRoll(dt) {
    const target = this.gravitySign < 0 ? Math.PI : 0;
    // shortest-path lerp toward target roll
    let diff = target - this.roll;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.roll += diff * Math.min(1, dt * 6);
  }

  _syncTransform() {
    this.root.position.copy(this.position);
    this.yawHolder.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, this.roll);
  }

  respawn(reason = 'reset') {
    this.position.copy(this.lastSafe);
    this.velocity.set(0, 0, 0);
    this.gravitySign = 1;
    this.grounded = false;
    this.support = null;
    this._syncTransform();
    bus.emit(Events.PLAYER_RESPAWN, { reason });
  }

  teleport(pos, yaw) {
    this.position.copy(pos);
    if (yaw !== undefined) this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.gravitySign = 1;
    this.lastSafe.copy(pos);
    this._syncTransform();
  }
}
