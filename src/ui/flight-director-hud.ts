import { CameraViewMode, SASMode } from '../physics/types';
import { Spacecraft } from '../physics/spacecraft';
import { NBodyEngine } from '../physics/nbody-engine';
import { ParticleRenderer } from '../renderer/renderer';

export class FlightDirectorHUD {
  private container: HTMLElement;
  private engine: NBodyEngine;
  private renderer: ParticleRenderer;
  private onOpenAIDrawer: () => void;

  private navballCanvas!: HTMLCanvasElement;
  private navballCtx!: CanvasRenderingContext2D;

  // HUD DOM element caches
  private altValEl!: HTMLElement;
  private speedValEl!: HTMLElement;
  private apValEl!: HTMLElement;
  private peValEl!: HTMLElement;
  private eccValEl!: HTMLElement;
  private stageNameEl!: HTMLElement;
  private fuelBarEl!: HTMLElement;
  private fuelValEl!: HTMLElement;
  private deltaVEl!: HTMLElement;
  private throttleValEl!: HTMLElement;
  private maxQEl!: HTMLElement;
  private gForceEl!: HTMLElement;
  private thrustEl!: HTMLElement;
  private metTimerEl!: HTMLElement;
  private missionStartTime = Date.now();

  constructor(
    container: HTMLElement,
    engine: NBodyEngine,
    renderer: ParticleRenderer,
    onOpenAIDrawer: () => void
  ) {
    this.container = container;
    this.engine = engine;
    this.renderer = renderer;
    this.onOpenAIDrawer = onOpenAIDrawer;

    this.buildDOM();
    this.initControls();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Top Flight Director Header & Time Warp Controls -->
      <header class="hud-top-bar">
        <div class="hud-brand">
          <div class="logo-badge">
            <svg class="logo-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
              <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(30 12 12)"></ellipse>
              <circle cx="12" cy="12" r="2.2" fill="currentColor"></circle>
            </svg>
          </div>
          <div class="brand-text-col">
            <span class="brand-title">ASTRODYNE <span class="brand-highlight">PRIME</span></span>
            <span class="brand-subtitle">Relativistic Spaceflight & AXIOM Multi-Physics</span>
          </div>
        </div>

        <!-- Center Mode Switcher -->
        <div class="hud-mode-pill-group">
          <button id="btn-nav-spaceflight" class="hud-mode-pill-btn active">🌌 SPACEFLIGHT</button>
          <button id="btn-nav-builder" class="hud-mode-pill-btn">🛠️ AXIOM BUILDER</button>
          <button id="btn-nav-cad" class="hud-mode-pill-btn">📐 OPENSCAD CAD</button>
          <button id="btn-nav-rocketry" class="hud-mode-pill-btn">🎯 OPENROCKET</button>
          <button id="btn-nav-robotics" class="hud-mode-pill-btn">🤖 URDF ROBOTICS</button>
        </div>

        <!-- Center Time Warp / Mission Clock -->
        <div class="time-warp-cluster">
          <div class="met-counter">
            <span class="met-label">MET:</span>
            <span class="met-digits" id="hud-met-timer">00:00:00</span>
          </div>
          <div class="warp-btn-group">
            <button class="warp-btn ${this.engine.params.timeWarp === 1 ? 'active' : ''}" data-warp="1">1×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 5 ? 'active' : ''}" data-warp="5">5×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 10 ? 'active' : ''}" data-warp="10">10×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 50 ? 'active' : ''}" data-warp="50">50×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 100 ? 'active' : ''}" data-warp="100">100×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 1000 ? 'active' : ''}" data-warp="1000">1,000×</button>
            <button class="warp-btn ${this.engine.params.timeWarp === 10000 ? 'active' : ''}" data-warp="10000">10,000×</button>
          </div>
        </div>

        <!-- Right Camera & AI Actions -->
        <div class="hud-top-right">
          <div class="cam-mode-group">
            <button class="cam-btn active" data-cam="${CameraViewMode.ORBIT}">FREE ORBIT</button>
            <button class="cam-btn" data-cam="${CameraViewMode.CHASE_SPACECRAFT}">CHASE CAM</button>
            <button class="cam-btn" data-cam="${CameraViewMode.COCKPIT_POV}">COCKPIT POV</button>
          </div>

          <button id="btn-open-astra" class="btn-astra-ai">
            <span class="astra-pulse"></span>
            <span class="astra-icon">✨</span>
            <span class="astra-title">ASTRA AI</span>
          </button>
        </div>
      </header>

      <!-- Bottom Flight Deck HUD Overlay (Spacecraft Active) -->
      <div id="spacecraft-hud" class="cockpit-flight-deck">
        <!-- Left: 3D NavBall & SAS Guidance Computer -->
        <div class="navball-hud-panel glass-panel">
          <div class="navball-header">
            <span class="panel-tag">ATTITUDE / NAVBALL</span>
            <span class="sas-active-badge" id="hud-sas-mode">SAS: MANUAL</span>
          </div>

          <div class="navball-canvas-wrapper">
            <canvas id="navball-canvas" width="160" height="160"></canvas>
            <div class="navball-reticle"></div>
          </div>

          <!-- SAS Guidance Buttons -->
          <div class="sas-grid">
            <button class="sas-btn active" data-sas="${SASMode.MANUAL}">MAN</button>
            <button class="sas-btn" data-sas="${SASMode.PROGRADE}">PROG</button>
            <button class="sas-btn" data-sas="${SASMode.RETROGRADE}">RETR</button>
            <button class="sas-btn" data-sas="${SASMode.NORMAL}">NORM</button>
            <button class="sas-btn" data-sas="${SASMode.ANTI_NORMAL}">A-NORM</button>
            <button class="sas-btn" data-sas="${SASMode.RADIAL_OUT}">RAD+</button>
            <button class="sas-btn" data-sas="${SASMode.RADIAL_IN}">RAD-</button>
            <button class="sas-btn" data-sas="${SASMode.KILL_ROT}">STAB</button>
          </div>
        </div>

        <!-- Center: Orbital Telemetry & Flight Tapes -->
        <div class="telemetry-flight-tapes glass-panel">
          <div class="tape-col">
            <span class="tape-label">ALTITUDE</span>
            <span class="tape-value text-cyan" id="hud-alt">0.0 <span class="tape-unit">km</span></span>
            <div class="subtape-row">
              <span>Ap: <b id="hud-ap" class="text-emerald">0.0 km</b></span>
              <span>Pe: <b id="hud-pe" class="text-amber">0.0 km</b></span>
            </div>
          </div>

          <div class="tape-col">
            <span class="tape-label">ORBITAL SPEED</span>
            <span class="tape-value text-emerald" id="hud-speed">0.00 <span class="tape-unit">km/s</span></span>
            <div class="subtape-row">
              <span>Eccentricity: <b id="hud-ecc">0.0000</b></span>
              <span>G-Force: <b id="hud-gforce">1.0 G</b></span>
            </div>
          </div>

          <div class="tape-col">
            <span class="tape-label">MAX-Q DYNAMICS</span>
            <span class="tape-value text-amber" id="hud-maxq">0.0 <span class="tape-unit">kPa</span></span>
            <div class="subtape-row">
              <span>Thrust: <b id="hud-thrust">0 kN</b></span>
              <span>ΔV Rem: <b id="hud-deltav" class="text-cyan">0 m/s</b></span>
            </div>
          </div>
        </div>

        <!-- Right: Propulsion Throttle & Multi-Stage Rocket Controls -->
        <div class="propulsion-control-panel glass-panel">
          <div class="stage-info-row">
            <span class="stage-name-text" id="hud-stage-name">STAGE 1: SUPERHEAVY</span>
            <button id="btn-separate-stage" class="btn-stage-action">STAGE [X]</button>
          </div>

          <!-- Propellant Level Bar -->
          <div class="propellant-meter-container">
            <div class="meter-header">
              <span>PROPELLANT MASS</span>
              <span id="hud-fuel-pct" class="text-emerald">100%</span>
            </div>
            <div class="meter-track">
              <div class="meter-fill" id="hud-fuel-fill" style="width: 100%;"></div>
            </div>
          </div>

          <!-- Throttle Slider & Controls -->
          <div class="throttle-control-row">
            <span class="throttle-label">THROTTLE:</span>
            <input type="range" id="hud-throttle-slider" min="0" max="1" step="0.01" value="0">
            <span class="throttle-pct" id="hud-throttle-val">0%</span>
            <button id="btn-full-throttle" class="btn-quick-throttle">MAX [Z]</button>
            <button id="btn-cut-throttle" class="btn-quick-throttle">CUT [X]</button>
          </div>
        </div>
      </div>
    `;

    this.altValEl = this.container.querySelector('#hud-alt')!;
    this.speedValEl = this.container.querySelector('#hud-speed')!;
    this.apValEl = this.container.querySelector('#hud-ap')!;
    this.peValEl = this.container.querySelector('#hud-pe')!;
    this.eccValEl = this.container.querySelector('#hud-ecc')!;
    this.stageNameEl = this.container.querySelector('#hud-stage-name')!;
    this.fuelBarEl = this.container.querySelector('#hud-fuel-fill')!;
    this.fuelValEl = this.container.querySelector('#hud-fuel-pct')!;
    this.deltaVEl = this.container.querySelector('#hud-deltav')!;
    this.throttleValEl = this.container.querySelector('#hud-throttle-val')!;
    this.maxQEl = this.container.querySelector('#hud-maxq')!;
    this.gForceEl = this.container.querySelector('#hud-gforce')!;
    this.thrustEl = this.container.querySelector('#hud-thrust')!;
    this.metTimerEl = this.container.querySelector('#hud-met-timer')!;

    this.navballCanvas = this.container.querySelector('#navball-canvas') as HTMLCanvasElement;
    this.navballCtx = this.navballCanvas.getContext('2d')!;
  }

  private initControls(): void {
    // Time Warp Buttons
    const warpBtns = this.container.querySelectorAll('.warp-btn');
    warpBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const warp = parseInt(btn.getAttribute('data-warp') || '1', 10);
        this.engine.params.timeWarp = warp;
        warpBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Camera Mode Buttons
    const camBtns = this.container.querySelectorAll('.cam-btn');
    camBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-cam') as CameraViewMode;
        this.renderer.params.cameraMode = mode;
        camBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // ASTRA AI Open Button
    const astraBtn = this.container.querySelector('#btn-open-astra');
    astraBtn?.addEventListener('click', () => {
      this.onOpenAIDrawer();
    });

    // SAS Guidance Buttons
    const sasBtns = this.container.querySelectorAll('.sas-btn');
    sasBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-sas') as SASMode;
        this.engine.spacecraft.setSASMode(mode);
        sasBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Throttle Slider
    const throttleSlider = this.container.querySelector('#hud-throttle-slider') as HTMLInputElement;
    throttleSlider?.addEventListener('input', () => {
      const val = parseFloat(throttleSlider.value);
      this.engine.spacecraft.throttle = val;
    });

    // Quick Throttle Buttons
    const btnMax = this.container.querySelector('#btn-full-throttle');
    btnMax?.addEventListener('click', () => {
      this.engine.spacecraft.throttle = 1.0;
      if (throttleSlider) throttleSlider.value = '1';
    });

    const btnCut = this.container.querySelector('#btn-cut-throttle');
    btnCut?.addEventListener('click', () => {
      this.engine.spacecraft.throttle = 0.0;
      if (throttleSlider) throttleSlider.value = '0';
    });

    // Stage Separation
    const btnStage = this.container.querySelector('#btn-separate-stage');
    btnStage?.addEventListener('click', () => {
      this.engine.spacecraft.separateStage();
    });
  }

  public update(): void {
    const sc = this.engine.spacecraft;
    if (!sc) return;

    const telem = sc.getTelemetry();

    // 1. Mission Clock MET
    const elapsedSec = Math.floor((Date.now() - this.missionStartTime) / 1000);
    const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    this.metTimerEl.textContent = `${hrs}:${mins}:${secs}`;

    // 2. Flight Telemetry
    this.altValEl.innerHTML = `${telem.altitude.toFixed(1)} <span class="tape-unit">km</span>`;
    this.speedValEl.innerHTML = `${telem.speed.toFixed(2)} <span class="tape-unit">km/s</span>`;

    const apText = telem.apoapsis > 1e5 ? '∞ (Hyperbolic)' : `${telem.apoapsis.toFixed(1)} km`;
    const peText = `${telem.periapsis.toFixed(1)} km`;
    this.apValEl.textContent = apText;
    this.peValEl.textContent = peText;

    this.eccValEl.textContent = telem.eccentricity.toFixed(4);
    this.gForceEl.textContent = `${telem.gForce.toFixed(1)} G`;
    this.maxQEl.innerHTML = `${telem.dynamicPressure.toFixed(1)} <span class="tape-unit">kPa</span>`;
    this.thrustEl.textContent = `${telem.thrustKN.toFixed(0)} kN`;
    this.deltaVEl.textContent = `${telem.deltaVRemaining.toFixed(0)} m/s`;

    // 3. Propulsion Staging
    if (telem.currentStage) {
      this.stageNameEl.textContent = `${telem.currentStage.name.toUpperCase()}`;
      this.fuelValEl.textContent = `${telem.fuelPercent.toFixed(1)}%`;
      this.fuelBarEl.style.width = `${Math.max(telem.fuelPercent, 0)}%`;

      if (telem.fuelPercent < 15) {
        this.fuelBarEl.style.background = 'linear-gradient(90deg, #ef4444, #f59e0b)';
      } else {
        this.fuelBarEl.style.background = 'linear-gradient(90deg, #06b6d4, #10b981)';
      }
    }

    this.throttleValEl.textContent = `${(telem.throttle * 100).toFixed(0)}%`;

    // 4. Draw 3D NavBall
    this.renderNavball(sc);
  }

  private renderNavball(sc: Spacecraft): void {
    const c = this.navballCtx;
    const w = this.navballCanvas.width;
    const h = this.navballCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w * 0.44;

    c.clearRect(0, 0, w, h);

    // NavBall Circle Background (Upper Sky Blue / Lower Ground Brown)
    c.save();
    c.beginPath();
    c.arc(cx, cy, radius, 0, 2 * Math.PI);
    c.clip();

    // Pitch & Heading transformation
    const fwd = sc.forward;
    const up = sc.up;
    const right = sc.right;

    // Pitch: angle between forward vector and horizontal plane (Y-up)
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd[1])));
    // Roll: angle of up vector relative to local vertical
    const roll = Math.atan2(right[1], up[1]);

    c.translate(cx, cy);
    c.rotate(-roll);

    const pitchOffset = pitch * (radius * 0.9);

    // Sky gradient (Top)
    const skyGrad = c.createLinearGradient(0, -radius, 0, pitchOffset);
    skyGrad.addColorStop(0, '#1e3a8a');
    skyGrad.addColorStop(1, '#0284c7');
    c.fillStyle = skyGrad;
    c.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 1.5 + pitchOffset);

    // Ground gradient (Bottom)
    const groundGrad = c.createLinearGradient(0, pitchOffset, 0, radius);
    groundGrad.addColorStop(0, '#78350f');
    groundGrad.addColorStop(1, '#451a03');
    c.fillStyle = groundGrad;
    c.fillRect(-radius * 1.5, pitchOffset, radius * 3, radius * 1.5);

    // Horizon line
    c.strokeStyle = '#f8fafc';
    c.lineWidth = 2.0;
    c.beginPath();
    c.moveTo(-radius, pitchOffset);
    c.lineTo(radius, pitchOffset);
    c.stroke();

    // Pitch Ladder rungs (+30, +60, -30, -60)
    c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    c.fillStyle = 'rgba(255, 255, 255, 0.8)';
    c.font = '9px JetBrains Mono, monospace';
    c.textAlign = 'center';

    const ladderSteps = [30, 60, -30, -60];
    for (const deg of ladderSteps) {
      const radDeg = (deg * Math.PI) / 180;
      const rungY = pitchOffset - radDeg * (radius * 0.9);
      if (Math.abs(rungY) < radius * 0.9) {
        c.beginPath();
        c.moveTo(-18, rungY);
        c.lineTo(18, rungY);
        c.stroke();
        c.fillText(`${Math.abs(deg)}°`, 28, rungY + 3);
      }
    }

    c.restore();

    // NavBall Bezel Glass Ring
    c.beginPath();
    c.arc(cx, cy, radius, 0, 2 * Math.PI);
    c.lineWidth = 3.5;
    c.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    c.stroke();

    // Crosshair in center
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 2.5;
    c.beginPath();
    // Center dot
    c.arc(cx, cy, 3, 0, 2 * Math.PI);
    c.fillStyle = '#f59e0b';
    c.fill();
    // Wings
    c.moveTo(cx - 16, cy);
    c.lineTo(cx - 6, cy);
    c.moveTo(cx + 6, cy);
    c.lineTo(cx + 16, cy);
    c.moveTo(cx, cy - 10);
    c.lineTo(cx, cy - 4);
    c.stroke();
  }
}
