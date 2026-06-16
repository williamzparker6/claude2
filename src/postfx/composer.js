import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';

// Post FX chain: Render -> (optional SSAO) -> UnrealBloom -> Output.
// Bloom carries the dreamy underwater glow on the emissive portholes & lamps.
// SSAO is OFF by default to keep the 60fps-on-integrated-graphics budget; it
// can be toggled at runtime (pause menu) on capable machines.

export function createComposer(renderer, scene, camera, { ssao = false } = {}) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, size.x, size.y);
  ssaoPass.kernelRadius = 0.6;
  ssaoPass.minDistance = 0.002;
  ssaoPass.maxDistance = 0.08;
  ssaoPass.enabled = ssao;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.85, // strength
    0.7, // radius
    0.22, // threshold — only the bright emissives bloom
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  function setSize(w, h) {
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    ssaoPass.setSize(w, h);
  }

  return {
    composer,
    bloomPass,
    ssaoPass,
    setSize,
    setBloom(strength) {
      bloomPass.strength = strength;
    },
    setSSAO(on) {
      ssaoPass.enabled = on;
    },
    render(dt) {
      composer.render(dt);
    },
  };
}
