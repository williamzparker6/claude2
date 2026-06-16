import { bus, Events } from '../game/EventBus.js';
import { EVIDENCE_BY_ID } from '../data/evidence.js';

// Thin DOM HUD for EXPLORE: objective line, interaction prompt, collected-
// evidence chips and transient toasts. Pure presentation — it only listens.

const TYPE_GLYPH = { transcript: '✎', manifest: '☰', log: '✦' };

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.objectiveEl = document.getElementById('hud-objective');
    this.promptEl = document.getElementById('hud-prompt');
    this.evidenceEl = document.getElementById('hud-evidence');
    this.toastEl = document.getElementById('hud-toast');
    this._toastTimer = null;

    bus.on(Events.EVIDENCE_COLLECTED, ({ id }) => this._addChip(id));
    bus.on(Events.OBJECTIVE_CHANGED, ({ text }) => this.setObjective(text));
    bus.on(Events.TOAST, ({ text, ms }) => this.toast(text, ms));
    bus.on(Events.PLAYER_RESPAWN, ({ reason }) => {
      if (reason === 'void') this.toast('You slipped into the void… the memory pulls you back.', 2200);
    });
    bus.on(Events.PLAYER_GRAVITY, ({ inverted }) => {
      this.toast(inverted ? 'Gravity inverts. You stand upon the ceiling.' : 'Gravity settles.', 1800);
    });
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }

  setObjective(text) {
    if (this.objectiveEl) this.objectiveEl.textContent = text || '';
  }

  setPrompt(text) {
    if (!this.promptEl) return;
    if (text) {
      this.promptEl.innerHTML = text;
      this.promptEl.classList.add('visible');
    } else {
      this.promptEl.classList.remove('visible');
      this.promptEl.textContent = '';
    }
  }

  toast(text, ms = 2000) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this._toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, 400);
    }, ms);
  }

  _addChip(id) {
    const data = EVIDENCE_BY_ID[id];
    if (!data || !this.evidenceEl) return;
    const chip = document.createElement('div');
    chip.className = `evi-chip evi-${data.type}`;
    chip.innerHTML = `<span class="evi-glyph">${TYPE_GLYPH[data.type] || '•'}</span>` +
      `<span class="evi-title">${escapeHtml(data.title)}</span>`;
    this.evidenceEl.appendChild(chip);
    // brief highlight
    requestAnimationFrame(() => chip.classList.add('in'));
    this.toast(`Collected: ${data.title}`, 1800);
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
