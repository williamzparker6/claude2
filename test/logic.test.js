// Pure-logic tests (no DOM / WebGL). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EventBus } from '../src/game/EventBus.js';
import { ModeManager, Mode } from '../src/game/ModeManager.js';
import { GameState } from '../src/game/GameState.js';
import { EVIDENCE, EVIDENCE_BY_ID } from '../src/data/evidence.js';
import { LOCATION_BY_ID } from '../src/data/locations.js';
import { DEDUCTIONS } from '../src/data/deductions.js';
import { GEOMETRY_STATE_BY_ID } from '../src/data/geometryStates.js';

test('EventBus: subscribe, emit, unsubscribe, once', () => {
  const bus = new EventBus();
  let n = 0;
  const off = bus.on('x', (p) => (n += p));
  bus.emit('x', 2);
  assert.equal(n, 2);
  off();
  bus.emit('x', 2);
  assert.equal(n, 2); // no longer listening

  let once = 0;
  bus.once('y', () => (once += 1));
  bus.emit('y');
  bus.emit('y');
  assert.equal(once, 1);
});

test('ModeManager: legal core-loop transitions + pause/resume', () => {
  const m = new ModeManager(Mode.INTRO);
  assert.ok(m.set(Mode.EXPLORE));
  assert.ok(m.set(Mode.DESK));
  assert.ok(m.set(Mode.RESHAPING));
  assert.ok(m.set(Mode.EXPLORE));

  m.pause();
  assert.equal(m.mode, Mode.PAUSED);
  m.resume();
  assert.equal(m.mode, Mode.EXPLORE);

  // illegal jump is refused and leaves the mode unchanged
  assert.equal(m.set(Mode.INTRO), false);
  assert.equal(m.mode, Mode.EXPLORE);
});

test('ModeManager: resume from a desk-pause never lands in RESHAPING', () => {
  const m = new ModeManager(Mode.EXPLORE);
  m.set(Mode.RESHAPING);
  m.pause(); // paused while reshaping
  m.resume();
  assert.notEqual(m.mode, Mode.RESHAPING);
  assert.equal(m.mode, Mode.EXPLORE);
});

test('GameState: collecting evidence is idempotent + queryable', () => {
  const gs = new GameState();
  assert.equal(gs.isCollected('transcript_boiler_fire'), false);
  assert.equal(gs.collect('transcript_boiler_fire'), true);
  assert.equal(gs.collect('transcript_boiler_fire'), false);
  assert.equal(gs.isCollected('transcript_boiler_fire'), true);
});

test('GameState: deduction one resolves only with the exact correct placements', () => {
  const gs = new GameState();
  // wrong place — no deduction
  gs.placeEvidence('transcript_boiler_fire', 'bridge');
  gs.placeEvidence('log_captain_notified', 'bridge');
  assert.equal(gs.findNewlySatisfiedDeduction(), null);

  // correct places
  gs.placeEvidence('transcript_boiler_fire', 'boiler_room');
  const d = gs.findNewlySatisfiedDeduction();
  assert.ok(d);
  assert.equal(d.id, 'fire_before_notice');
  assert.equal(d.unlocks, 'geo_fire_first');

  // once solved it is no longer "newly satisfied"
  gs.solveDeduction(d.id);
  assert.equal(gs.findNewlySatisfiedDeduction(), null);
});

test('GameState: second deduction resolves independently', () => {
  const gs = new GameState();
  gs.solveDeduction('fire_before_notice'); // pretend the first is done
  gs.placeEvidence('manifest_coal_bunker', 'cargo_hold');
  gs.placeEvidence('log_wireless_distress', 'wireless_room');
  const d = gs.findNewlySatisfiedDeduction();
  assert.ok(d);
  assert.equal(d.id, 'coal_loaded_burning');
  assert.equal(d.unlocks, 'geo_coal_path');
});

test('data integrity: deductions reference real evidence, locations + geometry', () => {
  for (const d of DEDUCTIONS) {
    for (const r of d.requires) {
      assert.ok(EVIDENCE_BY_ID[r.evidenceId], `evidence ${r.evidenceId} exists`);
      assert.ok(LOCATION_BY_ID[r.placedOn], `location ${r.placedOn} exists`);
    }
    assert.ok(GEOMETRY_STATE_BY_ID[d.unlocks], `geometry ${d.unlocks} exists`);
  }
});

test('data integrity: every fragment can be pinned to its own foundAt location', () => {
  for (const e of EVIDENCE) {
    const loc = LOCATION_BY_ID[e.foundAt];
    assert.ok(loc, `foundAt ${e.foundAt} is a real location`);
    const accepted = e.tags.some((t) => loc.acceptsTags.includes(t));
    assert.ok(accepted, `${e.id} shares a tag with ${e.foundAt}`);
  }
});

test('data integrity: each required (evidence, location) pair is tag-compatible', () => {
  for (const d of DEDUCTIONS) {
    for (const r of d.requires) {
      const e = EVIDENCE_BY_ID[r.evidenceId];
      const loc = LOCATION_BY_ID[r.placedOn];
      const ok = e.tags.some((t) => loc.acceptsTags.includes(t));
      assert.ok(ok, `${r.evidenceId} is accepted by ${r.placedOn}`);
    }
  }
});
