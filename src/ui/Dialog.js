import { escapeHtml } from './Hud.js';

// Full-screen modal overlays: intro (premise + controls), pause menu,
// reshape banner, and the chapter-end card. Keyboard accessible — focus moves
// into the panel and the primary action is auto-focused.

export class Dialog {
  constructor() {
    this.root = document.getElementById('dialog-root');
    this._escClose = null;
  }

  _open(html, { dim = true } = {}) {
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.root.classList.toggle('dim', dim);
    // focus the primary action for keyboard users
    const focusable = this.root.querySelector('[data-autofocus], button, [href], input, select');
    if (focusable) focusable.focus();
  }

  hide() {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  get isOpen() {
    return !this.root.hidden;
  }

  // ---- intro ---------------------------------------------------------------
  showIntro(onBegin) {
    this._open(`
      <div class="panel panel-intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <p class="kicker">RMS Meridian — Chapter One</p>
        <h1 id="intro-title">The Boiler Room Discrepancy</h1>
        <p class="lede">
          The ship never sank. It was lost to time. Her decks, her grand
          staircases and her cargo holds drift now in a starless deep — a memory
          palace at the bottom of the sea.
        </p>
        <p class="body">
          You are a researcher. Gather the primary sources scattered through these
          fragments and pin them to your desk. When a deduction holds true, the
          ship itself remembers — and rewrites its shape to match the history you
          have proven, opening the way onward.
        </p>
        <div class="controls-grid" aria-label="Controls">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Move</span></div>
          <div><kbd>Space</kbd><span>Jump</span></div>
          <div><kbd>Mouse</kbd><span>Look</span></div>
          <div><kbd>E</kbd><span>Collect / Interact</span></div>
          <div><kbd>Tab</kbd><span>Researcher's Desk</span></div>
          <div><kbd>Esc</kbd><span>Pause</span></div>
        </div>
        <button class="btn btn-primary" id="begin-btn" data-autofocus>Begin the descent</button>
        <p class="fineprint">Headphones recommended. Click the world to look around.</p>
      </div>
    `);
    this.root.querySelector('#begin-btn').addEventListener('click', () => {
      this.hide();
      onBegin?.();
    });
  }

  // ---- pause ---------------------------------------------------------------
  showPause(opts) {
    const { onResume, onRestart, toggles } = opts;
    this._open(`
      <div class="panel panel-pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Paused</h2>
        <div class="menu">
          <button class="btn btn-primary" id="resume-btn" data-autofocus>Resume</button>
          <button class="btn" id="restart-btn">Restart chapter</button>
        </div>
        <fieldset class="toggles">
          <legend>Comfort &amp; visuals</legend>
          <label><input type="checkbox" id="t-bloom" ${toggles.bloom ? 'checked' : ''}/> Bloom glow</label>
          <label><input type="checkbox" id="t-ssao" ${toggles.ssao ? 'checked' : ''}/> Ambient occlusion (SSAO)</label>
          <label><input type="checkbox" id="t-motion" ${toggles.reducedMotion ? 'checked' : ''}/> Reduced motion (instant reshapes)</label>
          <label><input type="checkbox" id="t-audio" ${toggles.audio ? 'checked' : ''}/> Ambient audio</label>
        </fieldset>
        <div class="controls-grid small" aria-label="Controls">
          <div><kbd>WASD</kbd><span>Move</span></div>
          <div><kbd>Space</kbd><span>Jump</span></div>
          <div><kbd>E</kbd><span>Interact</span></div>
          <div><kbd>Tab</kbd><span>Desk</span></div>
        </div>
      </div>
    `);
    this.root.querySelector('#resume-btn').addEventListener('click', () => onResume?.());
    this.root.querySelector('#restart-btn').addEventListener('click', () => onRestart?.());
    const bind = (id, key) =>
      this.root.querySelector(id).addEventListener('change', (e) =>
        toggles.onChange?.(key, e.target.checked),
      );
    bind('#t-bloom', 'bloom');
    bind('#t-ssao', 'ssao');
    bind('#t-motion', 'reducedMotion');
    bind('#t-audio', 'audio');
  }

  // ---- reshape banner ------------------------------------------------------
  showReshapeBanner(text) {
    this._open(
      `<div class="reshape-banner" role="status">
         <p class="kicker">The ship remembers…</p>
         <p class="reveal">${escapeHtml(text)}</p>
       </div>`,
      { dim: false },
    );
  }

  // ---- chapter end ---------------------------------------------------------
  showChapterEnd({ text, onRestart }) {
    this._open(`
      <div class="panel panel-end" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <p class="kicker">Chapter One complete</p>
        <h1 id="end-title">The Boiler Room Discrepancy</h1>
        <p class="lede">${escapeHtml(text)}</p>
        <p class="body">
          The fire was no accident of the sea. It sailed with her from
          Southampton, written into the manifest and wired away as comfort. The
          Meridian remembers what the living chose to forget.
        </p>
        <button class="btn btn-primary" id="end-restart" data-autofocus>Begin again</button>
      </div>
    `);
    this.root.querySelector('#end-restart').addEventListener('click', () => onRestart?.());
  }
}
