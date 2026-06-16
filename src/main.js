import './styles/main.css';
import './styles/desk.css';

import { bus, Events } from './game/EventBus.js';
import { GameState } from './game/GameState.js';
import { ModeManager, Mode } from './game/ModeManager.js';
import { SceneManager } from './world/SceneManager.js';
import { buildLighting } from './world/Lighting.js';
import { createComposer } from './postfx/composer.js';
import { buildChapter1 } from './world/levels/chapter1.js';
import { GeometryStates } from './world/GeometryStates.js';
import { TweenManager } from './world/Tween.js';
import { CharacterController } from './player/CharacterController.js';
import { InputManager } from './player/InputManager.js';
import { Hud } from './ui/Hud.js';
import { Dialog } from './ui/Dialog.js';
import { Desk } from './ui/Desk.js';
import { Ambient } from './audio/Ambient.js';
import { EVIDENCE_BY_ID } from './data/evidence.js';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const canvasRoot = document.getElementById('canvas-root');
const lockHintEl = document.getElementById('lock-hint');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const settings = {
  bloom: true,
  ssao: false,
  reducedMotion: prefersReducedMotion,
  audio: false,
};

const sceneMgr = new SceneManager(canvasRoot);
const lighting = buildLighting(sceneMgr.scene);
const fx = createComposer(sceneMgr.renderer, sceneMgr.scene, sceneMgr.camera, { ssao: settings.ssao });
sceneMgr.onResize((w, h) => fx.setSize(w, h));

const level = buildChapter1();
sceneMgr.add(level.group);

const controller = new CharacterController({
  camera: sceneMgr.camera,
  spawn: level.spawn,
  yaw: level.spawnYaw,
  killPlaneY: level.killPlaneY,
  world: level,
});
sceneMgr.add(controller.object);

const input = new InputManager(sceneMgr.renderer.domElement);
const tweens = new TweenManager();
const geo = new GeometryStates(level, tweens, { reducedMotion: settings.reducedMotion });
const gameState = new GameState();
const hud = new Hud();
const dialog = new Dialog();
const desk = new Desk(gameState, { onSolve });
const ambient = new Ambient();
const modes = new ModeManager(Mode.INTRO);

let finished = false; // chapter complete — gameplay halts
let pauseGuardUntil = 0; // debounces the Esc that both exits pointer-lock and pauses

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------
bus.on(Events.MODE_CHANGED, ({ from, to }) => onModeChange(from, to));

function onModeChange(from, to) {
  if (to !== Mode.EXPLORE) input.exitPointerLock();
  if (to === Mode.EXPLORE) hud.show();
  else hud.hide();

  if (from === Mode.DESK && to !== Mode.DESK) desk.close();
  if (to === Mode.DESK) desk.open();
  if (to === Mode.PAUSED) {
    // Esc may arrive as both a pointer-lock exit and a keydown; ignore pause
    // edges briefly so we don't immediately resume.
    pauseGuardUntil = performance.now() + 300;
    input.clearEdges();
    openPauseMenu();
  }
  if (from === Mode.PAUSED && to !== Mode.PAUSED) dialog.hide();

  if (to === Mode.EXPLORE && !finished) {
    dialog.hide();
    updateObjective();
    // Re-lock the pointer. Succeeds when this transition was driven by a user
    // gesture (Begin / Tab / Resume); otherwise the lock hint invites a click.
    input.requestPointerLock();
    lockHintEl.hidden = false;
  } else {
    lockHintEl.hidden = true;
  }
}

input.onLockChange((locked) => {
  if (locked) lockHintEl.hidden = true;
  else if (modes.is(Mode.EXPLORE) && !finished) {
    // Pointer lock was lost during play (user pressed Esc) — pause.
    modes.pause();
  }
});

// click the world to (re)acquire pointer lock
sceneMgr.renderer.domElement.addEventListener('click', () => {
  if (modes.is(Mode.EXPLORE) && !finished && !input.pointerLocked) input.requestPointerLock();
});

// desk Close button
bus.on('desk:requestClose', () => {
  if (modes.is(Mode.DESK)) modes.set(Mode.EXPLORE);
});

// ---------------------------------------------------------------------------
// Reshape flow: a solved deduction rewrites the world, then returns to EXPLORE
// ---------------------------------------------------------------------------
function onSolve(deduction) {
  if (modes.is(Mode.DESK)) modes.set(Mode.RESHAPING);
  desk.close();
  input.exitPointerLock();
  hud.hide();
  dialog.showReshapeBanner(deduction.revealText);
  bus.emit(Events.TOAST, { text: 'A deduction holds true…', ms: 1600 });

  geo.apply(deduction.unlocks).then(() => {
    gameState.markGeometryActive(deduction.unlocks);
    dialog.hide();
    updateObjective();
    modes.set(Mode.EXPLORE);
  });
}

// ---------------------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------------------
function openPauseMenu() {
  dialog.showPause({
    onResume: () => modes.resume(),
    onRestart: () => window.location.reload(),
    toggles: {
      ...settings,
      onChange: applySetting,
    },
  });
}

function applySetting(key, value) {
  settings[key] = value;
  if (key === 'bloom') fx.setBloom(value ? 0.85 : 0.0);
  if (key === 'ssao') fx.setSSAO(value);
  if (key === 'reducedMotion') geo.setReducedMotion(value);
  if (key === 'audio') ambient.setEnabled(value);
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------
function deriveObjective() {
  const gs = gameState;
  if (!gs.isSolved('fire_before_notice')) {
    const have =
      gs.isCollected('transcript_boiler_fire') && gs.isCollected('log_captain_notified');
    return have
      ? "Open the Desk (Tab). Pin the Stoker's interview to the Boiler Room and the Bridge Log to the Bridge."
      : 'Gather the sources drifting across the decks. Walk up and press E.';
  }
  if (!gs.isSolved('coal_loaded_burning')) {
    const have =
      gs.isCollected('manifest_coal_bunker') && gs.isCollected('log_wireless_distress');
    return have
      ? 'Open the Desk (Tab). Pin the Cargo Manifest to the Cargo Hold and the Wireless Log to the Wireless Room.'
      : 'Cross to the cargo hold and the wireless room. Recover the last two sources.';
  }
  return "The way north has reformed. Seek the chapter's end.";
}

function updateObjective() {
  hud.setObjective(deriveObjective());
}

bus.on(Events.EVIDENCE_COLLECTED, updateObjective);
bus.on(Events.GEOMETRY_DONE, updateObjective);
bus.on(Events.PLAYER_RESPAWN, updateObjective);

// ---------------------------------------------------------------------------
// Interaction (collect fragments / conclude chapter)
// ---------------------------------------------------------------------------
function handleInteractions() {
  const p = controller.center.clone();
  let prompt = '';

  let near = null;
  for (const pk of level.pickups) {
    if (pk.collected) continue;
    if (p.distanceTo(pk.basePos) <= pk.radius) {
      near = pk;
      break;
    }
  }

  if (near) {
    const data = EVIDENCE_BY_ID[near.id];
    prompt = `Press <kbd>E</kbd> — collect “${data.title}”`;
    if (input.consume('interact')) {
      collectPickup(near);
      prompt = '';
    }
  } else if (p.distanceTo(level.endMarker.basePos) <= level.endMarker.radius) {
    prompt = 'Press <kbd>E</kbd> — conclude the chapter';
    if (input.consume('interact')) concludeChapter();
  }

  hud.setPrompt(prompt);
  input.consume('interact'); // drain if unused this frame
}

function collectPickup(pk) {
  pk.collected = true;
  gameState.collect(pk.id);
  tweens.add({
    durationMs: 380,
    easing: 'easeOut',
    onUpdate: (t) => pk.group.scale.setScalar(1 - t),
    onComplete: () => { pk.group.visible = false; },
  });
}

function concludeChapter() {
  if (finished) return;
  finished = true;
  hud.setPrompt('');
  input.exitPointerLock();
  const text = 'The Meridian holds her course through the dark — her fire, at last, laid bare.';
  bus.emit(Events.CHAPTER_COMPLETE, { text });
  dialog.showChapterEnd({ text, onRestart: () => window.location.reload() });
}

// ---------------------------------------------------------------------------
// Global keys (work across several modes)
// ---------------------------------------------------------------------------
function handleGlobalKeys() {
  if (input.consume('pause')) {
    if (modes.is(Mode.EXPLORE) || modes.is(Mode.DESK)) modes.pause();
    else if (modes.is(Mode.PAUSED) && performance.now() > pauseGuardUntil) modes.resume();
  }
  if (input.consume('desk')) {
    if (modes.is(Mode.EXPLORE)) modes.set(Mode.DESK);
    else if (modes.is(Mode.DESK)) modes.set(Mode.EXPLORE);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(sceneMgr.clock.getDelta(), 0.05);
  tweens.update(dt * 1000);

  handleGlobalKeys();
  const mode = modes.mode;

  if (mode === Mode.EXPLORE && !finished) {
    const md = input.readMouseDelta();
    if (input.pointerLocked) controller.applyLook(md.dx, md.dy);
    controller.update(dt, input);
    level.update(dt);
    handleInteractions();
  } else if (mode === Mode.RESHAPING) {
    level.update(dt);
    input.readMouseDelta();
  } else {
    input.readMouseDelta();
  }

  fx.render(dt);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
applySetting('reducedMotion', settings.reducedMotion);
dialog.showIntro(() => {
  if (settings.audio) ambient.start();
  modes.set(Mode.EXPLORE);
});
tick();

// expose a tiny debug handle (handy in the console; harmless in prod)
window.__meridian = { gameState, modes, level, controller, settings, fx, tweens, Mode };
