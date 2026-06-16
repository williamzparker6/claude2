// Single source of truth for player progress.
// Holds collected evidence, solved deductions, active geometry states and the
// current desk placements. Emits events on mutation. Optional localStorage
// persistence (stretch goal) is opt-in via save()/load().

import { bus, Events } from './EventBus.js';
import { DEDUCTIONS } from '../data/deductions.js';

const SAVE_KEY = 'rms-meridian.save.v1';

export class GameState {
  constructor() {
    /** @type {Set<string>} */
    this.collectedEvidence = new Set();
    /** @type {Set<string>} */
    this.solvedDeductions = new Set();
    /** @type {Set<string>} */
    this.activeGeometryStates = new Set();
    /** evidenceId -> locationId */
    this.placements = new Map();
  }

  // --- evidence ---------------------------------------------------------
  isCollected(id) {
    return this.collectedEvidence.has(id);
  }

  collect(id) {
    if (this.collectedEvidence.has(id)) return false;
    this.collectedEvidence.add(id);
    bus.emit(Events.EVIDENCE_COLLECTED, { id });
    return true;
  }

  // --- desk placements --------------------------------------------------
  placeEvidence(evidenceId, locationId) {
    // An evidence chip lives at exactly one location at a time.
    this.placements.set(evidenceId, locationId);
    bus.emit(Events.EVIDENCE_PLACED, { evidenceId, locationId });
  }

  removeEvidence(evidenceId) {
    if (this.placements.delete(evidenceId)) {
      bus.emit(Events.EVIDENCE_REMOVED, { evidenceId });
    }
  }

  placementOf(evidenceId) {
    return this.placements.get(evidenceId) ?? null;
  }

  // --- deductions -------------------------------------------------------
  isSolved(id) {
    return this.solvedDeductions.has(id);
  }

  /**
   * Returns the first newly-satisfied, not-yet-solved deduction given the
   * current placements, or null. Pure read — does not mutate.
   */
  findNewlySatisfiedDeduction() {
    for (const d of DEDUCTIONS) {
      if (this.solvedDeductions.has(d.id)) continue;
      const ok = d.requires.every(
        (r) => this.placements.get(r.evidenceId) === r.placedOn,
      );
      if (ok) return d;
    }
    return null;
  }

  solveDeduction(id) {
    if (this.solvedDeductions.has(id)) return false;
    this.solvedDeductions.add(id);
    return true;
  }

  // --- geometry ---------------------------------------------------------
  markGeometryActive(id) {
    this.activeGeometryStates.add(id);
  }

  // --- persistence (stretch) -------------------------------------------
  save() {
    try {
      const data = {
        collectedEvidence: [...this.collectedEvidence],
        solvedDeductions: [...this.solvedDeductions],
        activeGeometryStates: [...this.activeGeometryStates],
        placements: [...this.placements.entries()],
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      this.collectedEvidence = new Set(data.collectedEvidence ?? []);
      this.solvedDeductions = new Set(data.solvedDeductions ?? []);
      this.activeGeometryStates = new Set(data.activeGeometryStates ?? []);
      this.placements = new Map(data.placements ?? []);
      return data;
    } catch {
      return null;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}
