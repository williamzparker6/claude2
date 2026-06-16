// Explicit mode state machine for the core loop:
//   EXPLORE -> DESK -> RESHAPING -> EXPLORE   (+ PAUSED at any time)
//
// The manager only owns *which mode is active* and notifies listeners. The
// actual behaviour per mode (input routing, what updates, pointer lock) lives
// in main.js which subscribes to mode:changed. Keeping it dumb makes the
// transitions trivial to reason about and test.

import { bus, Events } from './EventBus.js';

export const Mode = Object.freeze({
  INTRO: 'INTRO',
  EXPLORE: 'EXPLORE',
  DESK: 'DESK',
  RESHAPING: 'RESHAPING',
  PAUSED: 'PAUSED',
});

// Allowed transitions. INTRO bootstraps into EXPLORE.
const ALLOWED = {
  INTRO: ['EXPLORE'],
  EXPLORE: ['DESK', 'RESHAPING', 'PAUSED'],
  DESK: ['EXPLORE', 'RESHAPING', 'PAUSED'],
  RESHAPING: ['EXPLORE', 'PAUSED'],
  PAUSED: ['EXPLORE', 'DESK', 'RESHAPING'],
};

export class ModeManager {
  constructor(initial = Mode.INTRO) {
    this._mode = initial;
    /** Mode to return to when leaving PAUSED. */
    this._resumeMode = Mode.EXPLORE;
  }

  get mode() {
    return this._mode;
  }

  is(mode) {
    return this._mode === mode;
  }

  /**
   * Transition. `force` bypasses the allow-list (used for hard resets).
   */
  set(mode, { force = false } = {}) {
    if (mode === this._mode) return false;
    if (!force && !(ALLOWED[this._mode] || []).includes(mode)) {
      console.warn(`[ModeManager] illegal transition ${this._mode} -> ${mode}`);
      return false;
    }
    const from = this._mode;
    if (mode === Mode.PAUSED) this._resumeMode = from;
    this._mode = mode;
    bus.emit(Events.MODE_CHANGED, { from, to: mode });
    return true;
  }

  pause() {
    if (this._mode === Mode.PAUSED) return;
    this.set(Mode.PAUSED);
  }

  resume() {
    if (this._mode !== Mode.PAUSED) return;
    // Never resume back into a transient reshape; settle in EXPLORE instead.
    const target = this._resumeMode === Mode.RESHAPING ? Mode.EXPLORE : this._resumeMode;
    this.set(target, { force: true });
  }
}
