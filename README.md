# RMS Meridian — *The Boiler Room Discrepancy*

A playable browser **vertical slice** of a narrative puzzle‑platformer. A
historical researcher explores the surreal, fragmented memories of a lost
Edwardian ocean liner — the fictional **RMS Meridian**. Decks, grand staircases
and cargo holds float disconnected in a starless void. You gather primary
sources, cross‑reference them at your desk, and **correct deductions literally
reshape the ship's geometry** to match the history you prove, opening new paths.

Built with **Three.js** + **vanilla ES modules** + **Vite**. No frameworks, no
backend, no runtime network calls. Greybox geometry with material atmosphere:
hemisphere + soft point lights, emissive portholes/lamps, exponential void fog,
and an `UnrealBloomPass` (+ optional SSAO) post chain.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/ (deploy to any static host)
npm run preview  # serve the production build
npm test         # pure-logic unit tests (no browser needed)
```

> Static hosting only. `vite.config.js` sets `base: './'`, so the `dist/` build
> runs from any sub‑path (e.g. GitHub Pages) with no server config.

---

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / Arrows | Move |
| `Space` | Jump (coyote‑time + jump‑buffered) |
| Mouse | Look (click the world for pointer‑lock) |
| `E` | Collect / interact |
| `Tab` | Open / close the Researcher's Desk |
| `Esc` | Pause |

At the desk you can drag sources with the mouse **or** select a source (click /
`Enter`) and press a number key **1–4** to pin it to that location — fully
keyboard operable. Keys are remappable in `src/player/InputManager.js` (`KEYMAP`).

---

## The core loop

An explicit mode state machine (`src/game/ModeManager.js`) drives everything:

```
INTRO → EXPLORE ⇄ DESK → RESHAPING → EXPLORE          (+ PAUSED at any time)
```

1. **EXPLORE (3D).** Platform across floating decks. Walk into a fragment and
   press `E` to collect it → `evidence:collected`.
2. **DESK (2D pinboard).** `Tab` opens the desk. Drag/pin sources onto blueprint
   locations. Placements are validated; completing a deduction emits
   `deduction:solved`.
3. **RESHAPING (3D).** The named geometry state animates in — a wall fades, a
   staircase rotates, a collapsed corridor reforms — and the **collision set
   updates**, opening a new route. Control returns to EXPLORE.
4. Reach the next fragment / the **chapter‑end marker**.

Everything is decoupled through a tiny pub/sub **EventBus**
(`src/game/EventBus.js`). **GameState** (`src/game/GameState.js`) holds
`collectedEvidence`, `solvedDeductions`, `activeGeometryStates` and the current
desk `placements`.

### Chapter 1 traversal

```
Deck A (spawn) ──jump gap──▶ Deck B
   collect: Stoker's interview        collect: Bridge log
                                          │
            [DESK] pin interview→Boiler Room, log→Bridge
            ⇒ deduction "fire_before_notice" ⇒ geo_fire_first
              (intact wall fades · bridge appears · staircase rotates 90°)
                                          ▼
Deck C — Cargo Hold ── inverted‑gravity ceiling‑walk · collect: Cargo manifest
   └─ ship‑rocking moving platform ferries you across the void ─▶ Deck D
                                                      collect: Wireless log
            [DESK] pin manifest→Cargo Hold, log→Wireless Room
            ⇒ deduction "coal_loaded_burning" ⇒ geo_coal_path
              (rubble clears · corridor reforms · bridge appears)
                                          ▼
                              Deck E — chapter‑end marker
```

Falling into the void respawns you at the last safe deck.

---

## Data model (everything is data‑driven)

Four data files in `src/data/` describe the whole chapter. No puzzle logic is
hardcoded — the engine reads these.

**`evidence.js`** — collectible primary sources.
```js
{ id:'transcript_boiler_fire', type:'transcript', // transcript | manifest | log
  title:"Stoker's Interview — Fragment 3",
  source:'J. Hartley, Junior Stoker',
  text:'…the fire was already roaring when I went to wake the officers…',
  foundAt:'boiler_room', tags:['fire','boiler_room','timeline'] }
```

**`locations.js`** — nodes on the 2D blueprint.
```js
{ id:'boiler_room', label:'Boiler Room',
  blueprintPos:{ x:0.30, y:0.72 },          // normalised 0..1 on the blueprint
  acceptsTags:['fire','boiler_room','coal'] } // a source may pin here if a tag matches
```

**`deductions.js`** — the player‑made connections.
```js
{ id:'fire_before_notice',
  title:'The fire came first',
  requires:[ { evidenceId:'transcript_boiler_fire', placedOn:'boiler_room' },
             { evidenceId:'log_captain_notified',   placedOn:'bridge' } ],
  revealText:'The fire broke out before the captain was ever notified.',
  unlocks:'geo_fire_first' }
```
A deduction resolves the instant **every** `requires` pair matches the current
placements.

**`geometryStates.js`** — how the world rewrites itself.
```js
{ id:'geo_fire_first',
  enable:['corridor_C_open_path'],     // show + make collidable (fades in)
  disable:['corridor_C_intact_wall'],  // hide + stop colliding (fades out)
  transform:[ { target:'grand_staircase', to:'rotated_90', durationMs:1800 } ] }
```
`world/GeometryStates.js` resolves these names against the level's mesh
**registry**, performs the show/hide/tween, and toggles `collider.active` — which
is all the "re‑bake" the controller needs, since it reads the active collider
set every frame.

---

## Adding a new evidence → deduction → geometry chain

No engine code required — touch data + the level, in four small steps:

1. **Evidence** — add an object to `src/data/evidence.js` with a unique `id`,
   a `type`, readable `text`, and `tags`.
2. **Pickup** — in `src/world/levels/chapter1.js`, drop it into the world:
   `makePickup('your_evidence_id', [x, y, z]);`
3. **Location** (if you need a new pin target) — add to `src/data/locations.js`
   with a `blueprintPos` and `acceptsTags` that intersect your evidence `tags`.
4. **Deduction + geometry** — add a deduction to `src/data/deductions.js` whose
   `requires` reference your evidence/locations and whose `unlocks` points at a
   new entry in `src/data/geometryStates.js`. Make sure the `enable` / `disable`
   / `transform.target` **names exist in the level registry**: build them with
   `box('your_mesh_name', { … })` (collidable walls/bridges) or register a decor
   mesh with `registry.set('name', { mesh, collider:null })`. For `transform`,
   give the mesh `userData.transformStates = { yourStateName: { position?, rotation?, scale? } }`.

The unit tests in `test/logic.test.js` assert that every deduction references
real evidence / locations / geometry and that each required pin is
tag‑compatible — a quick guard against typos when authoring new chains.

---

## Project structure

```
index.html
vite.config.js
src/
  main.js                     # wiring, game loop, mode handling, interactions
  game/
    EventBus.js               # pub/sub + canonical event names
    GameState.js              # progress + placements (+ localStorage save)
    ModeManager.js            # EXPLORE/DESK/RESHAPING/PAUSED state machine
  world/
    SceneManager.js           # renderer, scene, camera, void fog, resize
    Lighting.js               # hemisphere + soft point lights
    GeometryStates.js         # apply enable/disable/transform + re-bake collision
    Tween.js                  # tiny dependency-free tween manager
    levels/chapter1.js        # the whole level: decks, gaps, zone, platform, props
  player/
    CharacterController.js     # kinematic capsule: ground/coyote/jump-buffer,
                               # inverted gravity, moving-platform carry, respawn
    InputManager.js           # keyboard + pointer-lock, remappable KEYMAP
  ui/
    Hud.js                     # objective, prompt, evidence chips, toasts
    Dialog.js                  # intro / pause / reshape banner / chapter end
    Desk.js                    # drag-drop pinboard, validation, reader pane
  postfx/composer.js           # EffectComposer: Render → SSAO? → Bloom → Output
  data/                        # evidence, locations, deductions, geometryStates
  audio/Ambient.js             # procedural drone + creaks (WebAudio, optional)
  styles/                      # main.css, desk.css
  assets/                      # models / textures / fonts / audio (procedural MVP)
test/logic.test.js             # node:test unit tests for the pure logic
```

---

## The character controller

A custom kinematic capsule (`src/player/CharacterController.js`) — no physics
engine:

- **Collision** against axis‑aligned boxes. Vertical: integrate gravity and
  resolve against `isFloor` colliders (lands on tops; **inverted gravity** lands
  on undersides). Horizontal: circle‑vs‑rect push‑out against `isWall` colliders.
- **Coyote time** (0.1 s) + **jump buffering** (0.12 s) for forgiving platforming.
- **Ground snap** keeps contact on descents and **moving platforms**, whose
  per‑frame delta is inherited when you stand on them.
- **Gravity zones** flip `gravitySign`; the camera rolls and the look inverts so
  it reads as standing on the ceiling. Falling past the kill plane respawns you
  at the last safe deck.

`position` is the lower corner of the capsule's vertical span, so the same code
serves both upright and inverted gravity.

---

## Performance

Targets ~60 fps at 1080p on integrated graphics: greybox primitives, a shared
material palette (low draw‑state churn), one shadow‑casting light, modest pixel
ratio cap (1.75×), bloom on / SSAO off by default. Geometry/materials are
disposed on scene swap (`level.dispose()`).

---

## Accessibility & comfort (pause menu)

- **Reduced motion** — instant reshapes (also auto‑detected from
  `prefers-reduced-motion`).
- **Bloom** and **SSAO** toggles.
- **Ambient audio** toggle (procedural, off by default).
- Pin colours are paired with glyphs (✎ transcript, ☰ manifest, ✦ log) so they
  don't rely on colour alone; the desk is keyboard operable (select + number key).

---

## Acceptance criteria — status

- ✅ Loads from a static build with zero runtime network calls; no console errors.
- ✅ Player traverses ≥2 gaps and survives a fall (respawn at last safe deck).
- ✅ Inverted‑gravity zone reorients the player; the moving platform carries them.
- ✅ All 4 fragments are collectible and appear in the desk inventory.
- ✅ Correct pins solve a deduction; wrong combos give clear, non‑destructive feedback.
- ✅ Each `deduction:solved` reshapes geometry **and** updates collision so a
  blocked route becomes traversable.
- ✅ Completing both deductions opens the path to the chapter‑end marker.
- ✅ Budgeted for ~60 fps at 1080p on integrated graphics.

## Stretch goals included

Bloom/SSAO toggles · `localStorage` save/load scaffolding in `GameState` ·
procedural ambient audio · reduced‑motion + keyboard‑operable desk +
colourblind‑safe pin glyphs.

## Non‑goals (per the brief)

No multiplayer, procedural generation, combat, accounts/cloud saves, full physics
engine, or large asset libraries — greybox + material atmosphere throughout.
