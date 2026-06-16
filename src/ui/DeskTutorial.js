// A polished, guided walkthrough of the Researcher's Desk. Shows once on first
// open (remembered via localStorage) and can be replayed from the desk's "?"
// button. Spotlights each panel in turn with a tooltip card, progress dots and
// Back/Next/Skip — keyboard navigable (←/→/Esc).

const SEEN_KEY = 'rms-meridian.desk-tutorial.seen.v1';

const STEPS = [
  {
    target: null,
    kicker: "The Researcher's Desk",
    title: 'Cross-reference the evidence',
    body:
      "Here you piece together the Meridian's final voyage. Pin a source to the " +
      'place it speaks of, and prove what truly happened aboard her.',
  },
  {
    target: '.desk-inventory',
    kicker: 'Step 1 — Sources',
    title: 'Pick up a source',
    body:
      'Everything you collect gathers here. Click a source to pick it up — or ' +
      'drag it straight onto the plan.',
  },
  {
    target: '.desk-blueprint .blueprint',
    kicker: 'Step 2 — The deck plan',
    title: 'Pin it to a place',
    body:
      'Place the source on the location it concerns: click a numbered berth, or ' +
      'press its number (1–4). A source that does not belong is gently refused.',
  },
  {
    target: '.desk-reader',
    kicker: 'Step 3 — Read & deduce',
    title: 'Prove the connection',
    body:
      'The reader shows each document in full. When your pins prove a deduction, ' +
      'it resolves — and the ship reshapes to match the history you have proven.',
  },
  {
    target: null,
    kicker: 'Ready',
    title: 'Begin the work',
    body: 'Two deductions wait in these memories. Pin your first source to start.',
  },
];

export class DeskTutorial {
  constructor(root) {
    this.root = root; // the #desk element
    this.el = null;
    this.step = 0;
    this._onResize = () => this._position();
    this._onKey = (e) => this._key(e);
  }

  static seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  static markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  get active() {
    return !!this.el;
  }

  start() {
    if (this.el) this.stop();
    this.step = 0;
    this._build();
    DeskTutorial.markSeen();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKey, true);
    // measure after the desk has laid out
    requestAnimationFrame(() => this._render());
  }

  stop() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey, true);
    if (this.el) {
      this.el.classList.add('leaving');
      const el = this.el;
      this.el = null;
      setTimeout(() => el.remove(), 220);
    }
  }

  _build() {
    const el = document.createElement('div');
    el.className = 'desk-tutorial';
    el.innerHTML = `
      <div class="tut-spotlight" aria-hidden="true"></div>
      <div class="tut-card" role="dialog" aria-modal="true" aria-label="How the desk works">
        <button class="tut-skip" aria-label="Skip tutorial">Skip ✕</button>
        <p class="tut-kicker"></p>
        <h3 class="tut-title"></h3>
        <p class="tut-body"></p>
        <div class="tut-foot">
          <div class="tut-dots" aria-hidden="true">
            ${STEPS.map((_, i) => `<span class="tut-dot" data-i="${i}"></span>`).join('')}
          </div>
          <div class="tut-actions">
            <button class="tut-back">Back</button>
            <button class="tut-next btn btn-primary">Next</button>
          </div>
        </div>
      </div>`;
    this.root.appendChild(el);
    this.el = el;
    this.spot = el.querySelector('.tut-spotlight');
    this.card = el.querySelector('.tut-card');
    el.querySelector('.tut-skip').addEventListener('click', () => this.stop());
    el.querySelector('.tut-back').addEventListener('click', () => this._go(-1));
    el.querySelector('.tut-next').addEventListener('click', () => this._go(1));
  }

  _go(dir) {
    const n = this.step + dir;
    if (n < 0) return;
    if (n >= STEPS.length) {
      this.stop();
      return;
    }
    this.step = n;
    this._render();
  }

  _key(e) {
    if (!this.el) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.stop();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._go(-1);
    }
  }

  _render() {
    if (!this.el) return;
    const s = STEPS[this.step];
    this.card.querySelector('.tut-kicker').textContent = s.kicker;
    this.card.querySelector('.tut-title').textContent = s.title;
    this.card.querySelector('.tut-body').textContent = s.body;
    this.card.querySelector('.tut-back').disabled = this.step === 0;
    const next = this.card.querySelector('.tut-next');
    next.textContent = this.step === STEPS.length - 1 ? 'Got it' : 'Next';
    this.el.querySelectorAll('.tut-dot').forEach((d, i) =>
      d.classList.toggle('on', i === this.step),
    );
    this._position();
    next.focus();
  }

  _position() {
    if (!this.el) return;
    const s = STEPS[this.step];
    const target = s.target ? this.root.querySelector(s.target) : null;
    if (target) {
      const r = target.getBoundingClientRect();
      const pad = 8;
      this.spot.style.left = `${r.left - pad}px`;
      this.spot.style.top = `${r.top - pad}px`;
      this.spot.style.width = `${r.width + pad * 2}px`;
      this.spot.style.height = `${r.height + pad * 2}px`;
      this.el.classList.remove('centered');
      this._placeCard(r);
    } else {
      // zero-size spotlight => full dim, card centred
      this.spot.style.left = '50%';
      this.spot.style.top = '50%';
      this.spot.style.width = '0px';
      this.spot.style.height = '0px';
      this.el.classList.add('centered');
      this.card.style.left = '';
      this.card.style.top = '';
    }
  }

  _placeCard(r) {
    const card = this.card;
    const cw = card.offsetWidth || 330;
    const ch = card.offsetHeight || 190;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + margin;
    if (top + ch > vh - 8) top = r.top - ch - margin; // not enough room below -> above
    top = Math.max(8, Math.min(vh - ch - 8, top));
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(12, Math.min(vw - cw - 12, left));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }
}
