import { bus, Events } from '../game/EventBus.js';
import { EVIDENCE_BY_ID } from '../data/evidence.js';
import { LOCATIONS, LOCATION_BY_ID } from '../data/locations.js';
import { DEDUCTIONS } from '../data/deductions.js';
import { escapeHtml } from './Hud.js';
import { DeskTutorial } from './DeskTutorial.js';

// The researcher's desk (DESK mode): a 2D pinboard overlay.
//  * Inventory of collected fragments (left).
//  * A ship blueprint with location nodes you pin fragments onto (centre).
//  * A reader pane + deduction tray (right).
// Drag with the mouse OR select-then-place with click/keyboard (accessible).
// Pinning is validated by tag intersection; a satisfied deduction calls onSolve.

const TYPE_GLYPH = { transcript: '✎', manifest: '☰', log: '✦' };
const DRAG_THRESHOLD = 6; // px before a press becomes a drag

export class Desk {
  constructor(gameState, { onSolve } = {}) {
    this.gameState = gameState;
    this.onSolve = onSolve;
    this.root = document.getElementById('desk');
    this.selected = null; // evidenceId currently "picked up"
    this._drag = null;
    this._built = false;
    this._open = false;
    this.tutorial = new DeskTutorial(this.root);
  }

  get isOpen() {
    return this._open;
  }

  open() {
    this._build();
    this._render();
    this.root.hidden = false;
    this._open = true;
    // focus first interactive element for keyboard users
    const first = this.root.querySelector('.chip, .node, .desk-close');
    if (first) first.focus();
    // First time at the desk: run the guided walkthrough.
    if (!DeskTutorial.seen()) this.tutorial.start();
  }

  close() {
    this.tutorial.stop();
    this.root.hidden = true;
    this._open = false;
    this.selected = null;
    this._endDrag();
  }

  // ---- DOM scaffold (built once) ------------------------------------------
  _build() {
    if (this._built) return;
    this.root.innerHTML = `
      <div class="desk-grid" role="dialog" aria-modal="true" aria-label="Researcher's desk">
        <header class="desk-head">
          <h2>Researcher's Desk</h2>
          <p class="desk-hint">Pin a source to the place it speaks of. Prove a connection and the ship will answer.</p>
          <button class="desk-help" aria-label="Show the desk tutorial">? &nbsp;Tutorial</button>
          <button class="desk-close" aria-label="Close desk (Tab)">Close ⟵ Tab</button>
        </header>
        <section class="desk-inventory" aria-label="Collected evidence">
          <h3>Sources</h3>
          <div class="chip-tray" id="chip-tray"></div>
          <p class="empty-note" id="inv-empty" hidden>No sources gathered yet. Explore the decks and press <kbd>E</kbd>.</p>
        </section>
        <section class="desk-blueprint" aria-label="Ship blueprint">
          <div class="blueprint" id="blueprint">
            <div class="blueprint-grid" aria-hidden="true"></div>
            <p class="blueprint-title" aria-hidden="true">RMS MERIDIAN — DECK PLAN</p>
          </div>
          <p class="feedback" id="desk-feedback" role="status" aria-live="polite"></p>
        </section>
        <aside class="desk-reader" aria-label="Reader and deductions">
          <h3>Reader</h3>
          <div class="reader-pane" id="reader-pane">
            <p class="reader-empty">Select a source to read it.</p>
          </div>
          <h3>Deductions</h3>
          <ul class="deduction-tray" id="deduction-tray"></ul>
        </aside>
      </div>
    `;

    // location nodes (numbered for keyboard placement: select a chip, press 1-N)
    const blueprint = this.root.querySelector('#blueprint');
    LOCATIONS.forEach((loc, i) => {
      const node = document.createElement('button');
      node.className = 'node';
      node.dataset.nodeId = loc.id;
      node.dataset.index = String(i + 1);
      node.style.left = `${loc.blueprintPos.x * 100}%`;
      node.style.top = `${loc.blueprintPos.y * 100}%`;
      node.setAttribute('aria-label', `${loc.label} — pin a source here (key ${i + 1})`);
      node.innerHTML =
        `<span class="node-dot"></span>` +
        `<span class="node-label"><b>${i + 1}</b> ${escapeHtml(loc.label)}</span>` +
        `<span class="node-slot"></span>`;
      node.addEventListener('click', () => this._onNodeClick(loc.id));
      blueprint.appendChild(node);
    });

    this.root.querySelector('.desk-close').addEventListener('click', () => {
      bus.emit('desk:requestClose');
    });
    this.root.querySelector('.desk-help').addEventListener('click', () => {
      this.tutorial.start();
    });

    // pointer drag handlers (delegated)
    this._onPointerMove = (e) => this._pointerMove(e);
    this._onPointerUp = (e) => this._pointerUp(e);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // keyboard placement: with a chip selected, press 1..N to pin to location N;
    // Backspace/Delete unpins the selected source.
    this._onKeyDown = (e) => {
      if (!this._open) return;
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        const loc = LOCATIONS[n - 1];
        if (loc && this.selected) {
          e.preventDefault();
          this._attemptPlace(this.selected, loc.id);
        }
      } else if ((e.code === 'Backspace' || e.code === 'Delete') && this.selected) {
        e.preventDefault();
        this._removePlacement(this.selected);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    this._built = true;
  }

  // ---- rendering -----------------------------------------------------------
  _render() {
    this._renderInventory();
    this._renderNodes();
    this._renderDeductions();
  }

  _renderInventory() {
    const tray = this.root.querySelector('#chip-tray');
    tray.innerHTML = '';
    let count = 0;
    for (const id of this.gameState.collectedEvidence) {
      if (this.gameState.placementOf(id)) continue; // placed chips live on nodes
      tray.appendChild(this._makeChip(id));
      count++;
    }
    this.root.querySelector('#inv-empty').hidden = count > 0;
  }

  _renderNodes() {
    for (const loc of LOCATIONS) {
      const node = this.root.querySelector(`.node[data-node-id="${loc.id}"]`);
      const slot = node.querySelector('.node-slot');
      slot.innerHTML = '';
      node.classList.remove('has-chip');
    }
    for (const [evId, locId] of this.gameState.placements) {
      const node = this.root.querySelector(`.node[data-node-id="${locId}"]`);
      if (!node) continue;
      node.classList.add('has-chip');
      node.querySelector('.node-slot').appendChild(this._makeChip(evId, true));
    }
  }

  _renderDeductions() {
    const tray = this.root.querySelector('#deduction-tray');
    tray.innerHTML = '';
    for (const d of DEDUCTIONS) {
      const solved = this.gameState.isSolved(d.id);
      const have = d.requires.filter(
        (r) => this.gameState.placementOf(r.evidenceId) === r.placedOn,
      ).length;
      const li = document.createElement('li');
      li.className = 'deduction' + (solved ? ' solved' : '');
      li.innerHTML = `
        <span class="ded-mark" aria-hidden="true">${solved ? '✓' : `${have}/${d.requires.length}`}</span>
        <span class="ded-body">
          <span class="ded-title">${escapeHtml(d.title)}</span>
          ${solved ? `<span class="ded-reveal">${escapeHtml(d.revealText)}</span>` : ''}
        </span>`;
      tray.appendChild(li);
    }
  }

  _makeChip(id, placed = false) {
    const data = EVIDENCE_BY_ID[id];
    const chip = document.createElement('button');
    chip.className = `chip chip-${data.type}` + (placed ? ' placed' : '');
    chip.dataset.evidenceId = id;
    chip.draggable = false;
    chip.innerHTML =
      `<span class="chip-glyph">${TYPE_GLYPH[data.type] || '•'}</span>` +
      `<span class="chip-title">${escapeHtml(data.title)}</span>`;
    chip.setAttribute('aria-label',
      `${data.title}. ${placed ? 'Pinned — activate to unpin.' : 'Source — activate to pick up, then choose a location.'}`);

    chip.addEventListener('pointerdown', (e) => this._pointerDown(e, id, placed));
    chip.addEventListener('click', (e) => {
      // suppress the click that ends a real drag
      if (this._suppressClick) { this._suppressClick = false; return; }
      if (placed) this._removePlacement(id);
      else this._toggleSelect(id);
    });
    chip.addEventListener('focus', () => this._showReader(id));
    chip.addEventListener('mouseenter', () => this._showReader(id));
    if (this.selected === id && !placed) chip.classList.add('selected');
    return chip;
  }

  // ---- selection (click / keyboard) ---------------------------------------
  _toggleSelect(id) {
    this.selected = this.selected === id ? null : id;
    this._showReader(id);
    this._render();
    this._feedback(this.selected ? 'Picked up — choose a place on the blueprint.' : '');
  }

  _onNodeClick(locId) {
    if (!this.selected) {
      this._feedback('Pick up a source first.');
      return;
    }
    this._attemptPlace(this.selected, locId);
  }

  // ---- pointer drag --------------------------------------------------------
  _pointerDown(e, id, placed) {
    if (e.button !== undefined && e.button !== 0) return;
    this._drag = {
      id, placed,
      startX: e.clientX, startY: e.clientY,
      active: false, ghost: null,
    };
  }

  _pointerMove(e) {
    const d = this._drag;
    if (!d) return;
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (dist < DRAG_THRESHOLD) return;
      d.active = true;
      d.ghost = this._makeGhost(d.id);
      if (d.placed) {
        // dragging a pinned chip off its node unpins it first
        this._removePlacement(d.id, true);
      }
    }
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
    }
    const node = this._nodeUnder(e.clientX, e.clientY);
    this._highlightNode(node);
  }

  _pointerUp(e) {
    const d = this._drag;
    if (!d) return;
    if (d.active) {
      this._suppressClick = true;
      const node = this._nodeUnder(e.clientX, e.clientY);
      if (node) this._attemptPlace(d.id, node.dataset.nodeId);
      else { this._render(); this._feedback(''); }
      this._highlightNode(null);
    }
    this._endDrag();
  }

  _endDrag() {
    if (this._drag?.ghost) this._drag.ghost.remove();
    this._drag = null;
  }

  _makeGhost(id) {
    const ghost = this._makeChip(id);
    ghost.classList.add('chip-ghost');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    return ghost;
  }

  _nodeUnder(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.node') : null;
  }

  _highlightNode(node) {
    this.root.querySelectorAll('.node.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    if (node) node.classList.add('drop-hover');
  }

  // ---- placement + validation ---------------------------------------------
  _attemptPlace(evidenceId, locationId) {
    const data = EVIDENCE_BY_ID[evidenceId];
    const loc = LOCATION_BY_ID[locationId];
    const accepted = data.tags.some((t) => loc.acceptsTags.includes(t));

    if (!accepted) {
      this._render();
      this._feedback(`“${data.title}” has no bearing on the ${loc.label}.`, 'bad');
      this._flashNode(locationId, 'bad');
      return;
    }

    this.gameState.placeEvidence(evidenceId, locationId);
    this.selected = null;
    this._render();
    this._feedback(`Pinned to the ${loc.label}.`, 'good');
    this._flashNode(locationId, 'good');

    // did this complete a deduction?
    const deduction = this.gameState.findNewlySatisfiedDeduction();
    if (deduction) {
      this.gameState.solveDeduction(deduction.id);
      this._renderDeductions();
      this._feedback(deduction.revealText, 'reveal');
      this.onSolve?.(deduction);
    }
  }

  _removePlacement(evidenceId, silent = false) {
    this.gameState.removeEvidence(evidenceId);
    if (!silent) {
      this._render();
      this._feedback('Unpinned.');
    }
  }

  // ---- reader + feedback ---------------------------------------------------
  _showReader(id) {
    const data = EVIDENCE_BY_ID[id];
    if (!data) return;
    const pane = this.root.querySelector('#reader-pane');
    pane.innerHTML = `
      <article class="reader-doc reader-${data.type}">
        <p class="reader-type">${escapeHtml(data.type)}</p>
        <h4>${escapeHtml(data.title)}</h4>
        <p class="reader-source">${escapeHtml(data.source)}</p>
        <p class="reader-text">${escapeHtml(data.text)}</p>
        <p class="reader-tags">${data.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join(' ')}</p>
      </article>`;
  }

  _feedback(text, kind = '') {
    const el = this.root.querySelector('#desk-feedback');
    el.textContent = text || '';
    el.className = 'feedback' + (kind ? ` ${kind}` : '');
  }

  _flashNode(locId, kind) {
    const node = this.root.querySelector(`.node[data-node-id="${locId}"]`);
    if (!node) return;
    node.classList.remove('flash-good', 'flash-bad');
    void node.offsetWidth; // restart animation
    node.classList.add(kind === 'good' ? 'flash-good' : 'flash-bad');
  }

  dispose() {
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
