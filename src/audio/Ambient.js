// Procedural ambient bed — no audio files, no network. A low detuned drone
// (the deep hull) under slow filtered noise (distant ocean), with occasional
// creaks. Must be started from a user gesture (the Begin button). Entirely
// optional; toggled from the pause menu.

export class Ambient {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this._nodes = [];
    this._creakTimer = null;
  }

  _ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  }

  async start() {
    this._ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this._nodes.length) {
      this.enabled = true;
      this.master.gain.setTargetAtTime(0.5, this.ctx.now ?? this.ctx.currentTime, 0.8);
      return;
    }

    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.master = master;

    // --- drone: two detuned saws through a soft lowpass ---
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.6;
    lp.connect(droneGain).connect(master);
    for (const freq of [55, 55.4, 82.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(lp);
      osc.start();
      this._nodes.push(osc);
    }
    // slow LFO swelling the drone like distant tides
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start();
    this._nodes.push(lfo);

    // --- ocean: filtered noise ---
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.5;
    noise.buffer = buffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 600;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(master);
    noise.start();
    this._nodes.push(noise);

    this.enabled = true;
    master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
    this._scheduleCreak();
  }

  _scheduleCreak() {
    clearTimeout(this._creakTimer);
    const delay = 6000 + Math.random() * 9000;
    this._creakTimer = setTimeout(() => {
      if (this.enabled && this.ctx) this._creak();
      this._scheduleCreak();
    }, delay);
  }

  _creak() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const base = 90 + Math.random() * 120;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.5);
  }

  setEnabled(on) {
    if (on) {
      this.start();
    } else {
      this.enabled = false;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
      }
      clearTimeout(this._creakTimer);
    }
  }
}
