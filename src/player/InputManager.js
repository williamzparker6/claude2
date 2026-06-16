// Keyboard + pointer-lock mouse input. Keys are mapped through KEYMAP so they
// are trivially remappable in code (a settings UI is a stretch goal). Movement
// is polled (held state); discrete actions (jump/interact/desk/pause) are edge
// triggered and consumed by the reader.

export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  desk: ['Tab'],
  pause: ['Escape'],
};

function actionFor(code) {
  for (const [action, codes] of Object.entries(KEYMAP)) {
    if (codes.includes(code)) return action;
  }
  return null;
}

export class InputManager {
  constructor(lockElement) {
    this.lockElement = lockElement;
    this.held = new Set(); // currently-held action names
    this._edges = new Set(); // actions pressed since last consume
    this.mouse = { dx: 0, dy: 0 };
    this.pointerLocked = false;
    this.enabled = true;

    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      const action = actionFor(e.code);
      if (!action) return;
      const ae = document.activeElement;
      const inForm =
        !!ae &&
        (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(ae.tagName) || ae.isContentEditable);

      // Tab (focus move) and Space (scroll / button activate) have native side
      // effects we only suppress during actual play — i.e. when focus is NOT in
      // a UI control. This lets the pause menu and desk stay keyboard-operable.
      if ((action === 'desk' || action === 'jump') && !inForm) e.preventDefault();

      if (!e.repeat) {
        if (action === 'desk' || action === 'jump') {
          if (!inForm) this._edges.add(action); // only own the key during play
        } else {
          this._edges.add(action); // pause / interact / movement always register
        }
      }
      if (['forward', 'back', 'left', 'right', 'jump'].includes(action) && !inForm) {
        this.held.add(action);
      }
    };
    this._onKeyUp = (e) => {
      const action = actionFor(e.code);
      if (!action) return;
      this.held.delete(action);
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.lockElement;
      if (this._lockChangeCb) this._lockChangeCb(this.pointerLocked);
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  onLockChange(cb) {
    this._lockChangeCb = cb;
  }

  requestPointerLock() {
    if (!this.pointerLocked && this.lockElement.requestPointerLock) {
      this.lockElement.requestPointerLock();
    }
  }

  exitPointerLock() {
    if (this.pointerLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  // --- polled movement ---------------------------------------------------
  /** forward: W=+1/S=-1 ; right: D=+1/A=-1 */
  moveAxis() {
    let forward = 0;
    let right = 0;
    if (this.held.has('forward')) forward += 1;
    if (this.held.has('back')) forward -= 1;
    if (this.held.has('right')) right += 1;
    if (this.held.has('left')) right -= 1;
    return { forward, right };
  }

  isHeld(action) {
    return this.held.has(action);
  }

  // --- edge-triggered actions -------------------------------------------
  consume(action) {
    if (this._edges.has(action)) {
      this._edges.delete(action);
      return true;
    }
    return false;
  }

  /** Peek without consuming. */
  pressed(action) {
    return this._edges.has(action);
  }

  clearEdges() {
    this._edges.clear();
  }

  // --- mouse -------------------------------------------------------------
  readMouseDelta() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return d;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
