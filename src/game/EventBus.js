// Tiny synchronous pub/sub bus. Decouples collection, deduction and
// world-reshaping so no system reaches directly into another.

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /** Subscribe. Returns an unsubscribe function. */
  on(type, handler) {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  /** Subscribe for a single emission. */
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }

  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return;
    // Copy so handlers may safely unsubscribe during dispatch.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${type}" threw:`, err);
      }
    }
  }
}

// Canonical event names — import these instead of typing strings.
export const Events = Object.freeze({
  EVIDENCE_COLLECTED: 'evidence:collected', // { id }
  EVIDENCE_PLACED: 'evidence:placed',       // { evidenceId, locationId }
  EVIDENCE_REMOVED: 'evidence:removed',     // { evidenceId }
  DEDUCTION_SOLVED: 'deduction:solved',     // { id, deduction }
  GEOMETRY_APPLIED: 'geometry:applied',     // { id }
  GEOMETRY_DONE: 'geometry:done',           // { id }  (after tweens settle)
  MODE_CHANGED: 'mode:changed',             // { from, to }
  PLAYER_RESPAWN: 'player:respawn',         // { reason }
  PLAYER_GRAVITY: 'player:gravity',         // { inverted }
  CHAPTER_COMPLETE: 'chapter:complete',     // { text }
  OBJECTIVE_CHANGED: 'objective:changed',   // { text }
  TOAST: 'ui:toast',                        // { text, ms }
});

// One shared bus for the whole game.
export const bus = new EventBus();
