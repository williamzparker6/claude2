// Minimal tween manager — no dependencies. Enough for reshape animations and
// fade in/out. Each tween lerps a numeric getter/setter or an object's keys.

const easings = {
  linear: (t) => t,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

export class TweenManager {
  constructor() {
    this._tweens = new Set();
  }

  /**
   * @param {object} opts
   *  - durationMs
   *  - onUpdate(t)   t in [0,1] (eased)
   *  - onComplete()
   *  - easing        name in `easings`
   *  - reducedMotion if true, snaps to the end on the first tick
   */
  add({ durationMs = 1000, onUpdate, onComplete, easing = 'easeInOut', reducedMotion = false }) {
    const ease = easings[easing] || easings.linear;
    const tween = {
      elapsed: 0,
      duration: Math.max(1, durationMs),
      onUpdate,
      onComplete,
      ease,
      reducedMotion,
      done: false,
    };
    this._tweens.add(tween);
    return tween;
  }

  update(dtMs) {
    for (const tw of this._tweens) {
      if (tw.done) continue;
      tw.elapsed += tw.reducedMotion ? tw.duration : dtMs;
      const raw = Math.min(1, tw.elapsed / tw.duration);
      const t = tw.ease(raw);
      if (tw.onUpdate) tw.onUpdate(t, raw);
      if (raw >= 1) {
        tw.done = true;
        this._tweens.delete(tw);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  get activeCount() {
    return this._tweens.size;
  }

  clear() {
    this._tweens.clear();
  }
}

// A reusable lerp helper for Vector3-like objects.
export function lerpVec(out, from, to, t) {
  out.x = from.x + (to.x - from.x) * t;
  out.y = from.y + (to.y - from.y) * t;
  out.z = from.z + (to.z - from.z) * t;
  return out;
}
