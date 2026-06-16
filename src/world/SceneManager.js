import * as THREE from 'three';

// Owns the renderer, scene, camera and the void fog. Rendering is delegated to
// the post-processing composer (see postfx/composer.js) so this module only
// concerns itself with the WebGL surface and resize handling.

export class SceneManager {
  constructor(mountEl) {
    this.mount = mountEl;

    this.scene = new THREE.Scene();
    // Starless void: near-black with a faint cold tint. Exponential fog dissolves
    // distant geometry so floating decks fade into nothing.
    this.scene.background = new THREE.Color(0x070b12);
    // Brightened for this test build: a touch thinner fog so decks read further.
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.011);

    this.camera = new THREE.PerspectiveCamera(
      68,
      this._aspect(),
      0.05,
      400,
    );
    this.camera.position.set(0, 1.6, 4);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    // Soft contact shadows only — cheap on integrated graphics.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.mount.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('game-canvas');

    this.clock = new THREE.Clock();

    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _aspect() {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  onResize(cb) {
    this._resizeCb = cb;
  }

  _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this._resizeCb) this._resizeCb(w, h);
  }

  add(obj) {
    this.scene.add(obj);
  }

  remove(obj) {
    this.scene.remove(obj);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
