import {
  AlgorithmType,
  ColorPalette,
  IntegratorType,
  MouseTool,
  RenderParams,
  SimulationParams
} from '../physics/types';

export class ControlsPanel {
  private container: HTMLElement;
  private simParams: SimulationParams;
  private renderParams: RenderParams;
  private onParamChange: () => void;
  private onReset: () => void;
  private onToolChange: (tool: MouseTool) => void;

  public currentTool = MouseTool.ORBIT_CAMERA;

  constructor(
    container: HTMLElement,
    simParams: SimulationParams,
    renderParams: RenderParams,
    onParamChange: () => void,
    onReset: () => void,
    onToolChange: (tool: MouseTool) => void
  ) {
    this.container = container;
    this.simParams = simParams;
    this.renderParams = renderParams;
    this.onParamChange = onParamChange;
    this.onReset = onReset;
    this.onToolChange = onToolChange;
    this.render();
  }

  public render(): void {
    this.container.innerHTML = `
      <!-- Simulation Playback Bar -->
      <div class="playback-bar">
        <button id="btn-play-pause" class="btn-primary">
          <span class="btn-icon">${this.simParams.paused ? '▶' : '⏸'}</span>
          <span>${this.simParams.paused ? 'RESUME' : 'PAUSE'}</span>
        </button>
        <button id="btn-step" class="btn-secondary" ${!this.simParams.paused ? 'disabled' : ''}>
          <span>STEP</span>
        </button>
        <button id="btn-reset" class="btn-secondary">
          <span>RESTART</span>
        </button>
      </div>

      <!-- Mouse Tools Selector -->
      <div class="panel-section">
        <div class="panel-section-title">INTERACTIVE MOUSE TOOLS</div>
        <div class="tools-grid">
          <button class="tool-btn ${this.currentTool === MouseTool.ORBIT_CAMERA ? 'active' : ''}" data-tool="${MouseTool.ORBIT_CAMERA}">
            <span class="tool-icon">01</span>
            <span class="tool-name">Orbit Cam</span>
          </button>
          <button class="tool-btn ${this.currentTool === MouseTool.GRAVITY_WELL ? 'active' : ''}" data-tool="${MouseTool.GRAVITY_WELL}">
            <span class="tool-icon">02</span>
            <span class="tool-name">Gravity Well</span>
          </button>
          <button class="tool-btn ${this.currentTool === MouseTool.REPULSOR ? 'active' : ''}" data-tool="${MouseTool.REPULSOR}">
            <span class="tool-icon">03</span>
            <span class="tool-name">Repulsor</span>
          </button>
          <button class="tool-btn ${this.currentTool === MouseTool.BLACK_HOLE_SPAWN ? 'active' : ''}" data-tool="${MouseTool.BLACK_HOLE_SPAWN}">
            <span class="tool-icon">04</span>
            <span class="tool-name">Spawn BH</span>
          </button>
        </div>
      </div>

      <!-- Physics Solver Engine Settings -->
      <div class="panel-section">
        <div class="panel-section-title">ASTRODYNAMICS SOLVER CONFIG</div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Algorithm</span>
            <select id="select-algo" class="ctrl-select">
              <option value="${AlgorithmType.BARNES_HUT}" ${this.simParams.algorithm === AlgorithmType.BARNES_HUT ? 'selected' : ''}>Barnes-Hut BVH Octree O(N log N)</option>
              <option value="${AlgorithmType.DIRECT_N2}" ${this.simParams.algorithm === AlgorithmType.DIRECT_N2 ? 'selected' : ''}>Direct Tiled O(N²) Exact</option>
            </select>
          </div>
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Integrator</span>
            <select id="select-integrator" class="ctrl-select">
              <option value="${IntegratorType.VELOCITY_VERLET}" ${this.simParams.integrator === IntegratorType.VELOCITY_VERLET ? 'selected' : ''}>Symplectic Velocity Verlet (2nd)</option>
              <option value="${IntegratorType.YOSHIDA_4TH}" ${this.simParams.integrator === IntegratorType.YOSHIDA_4TH ? 'selected' : ''}>Yoshida Symplectic (4th-Order)</option>
            </select>
          </div>
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Time Step (Δt)</span>
            <span class="control-val" id="val-dt">${this.simParams.timeStep.toFixed(3)}</span>
          </div>
          <input type="range" id="range-dt" min="0.005" max="0.2" step="0.005" value="${this.simParams.timeStep}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Time Warp Multiplier</span>
            <span class="control-val" id="val-timewarp">${this.simParams.timeWarp}×</span>
          </div>
          <input type="range" id="range-timewarp" min="1" max="1000" step="1" value="${this.simParams.timeWarp}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Substeps / Frame</span>
            <span class="control-val" id="val-substeps">${this.simParams.substeps}</span>
          </div>
          <input type="range" id="range-substeps" min="1" max="12" step="1" value="${this.simParams.substeps}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Opening Angle (θ)</span>
            <span class="control-val" id="val-theta">${this.simParams.theta.toFixed(2)}</span>
          </div>
          <input type="range" id="range-theta" min="0.2" max="1.4" step="0.05" value="${this.simParams.theta}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Softening Factor (ε)</span>
            <span class="control-val" id="val-softening">${this.simParams.softening.toFixed(1)}</span>
          </div>
          <input type="range" id="range-softening" min="0.5" max="25.0" step="0.5" value="${this.simParams.softening}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Gravitational Constant (G)</span>
            <span class="control-val" id="val-g">${this.simParams.gravityConstant.toFixed(2)}</span>
          </div>
          <input type="range" id="range-g" min="0.1" max="10.0" step="0.1" value="${this.simParams.gravityConstant}">
        </div>

        <div class="control-toggle-row">
          <label class="toggle-container">
            <input type="checkbox" id="chk-collision" ${this.simParams.enableCollisions ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Celestial Inelastic Merge</span>
          </label>
        </div>

        <div class="control-toggle-row">
          <label class="toggle-container">
            <input type="checkbox" id="chk-relativity" ${this.simParams.enableRelativisticPrecession ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Post-Newtonian Precession</span>
          </label>
        </div>
      </div>

      <!-- Visual & Rendering Engine Settings -->
      <div class="panel-section">
        <div class="panel-section-title">VISUALS & HDR POST-PROCESSING</div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Color Palette</span>
            <select id="select-palette" class="ctrl-select">
              <option value="${ColorPalette.BLACKBODY_PLANCK}" ${this.renderParams.colorPalette === ColorPalette.BLACKBODY_PLANCK ? 'selected' : ''}>Planck Blackbody Radiation</option>
              <option value="${ColorPalette.COSMIC_NEBULA}" ${this.renderParams.colorPalette === ColorPalette.COSMIC_NEBULA ? 'selected' : ''}>Cosmic Nebula (Cyan-Magenta)</option>
              <option value="${ColorPalette.VELOCITY_HEATMAP}" ${this.renderParams.colorPalette === ColorPalette.VELOCITY_HEATMAP ? 'selected' : ''}>Velocity Heatmap</option>
              <option value="${ColorPalette.GRAVITATIONAL_POTENTIAL}" ${this.renderParams.colorPalette === ColorPalette.GRAVITATIONAL_POTENTIAL ? 'selected' : ''}>Gravitational Potential Well</option>
              <option value="${ColorPalette.PARTICLE_TYPE}" ${this.renderParams.colorPalette === ColorPalette.PARTICLE_TYPE ? 'selected' : ''}>Celestial Body Classification</option>
              <option value="${ColorPalette.ELECTRIC_CYAN}" ${this.renderParams.colorPalette === ColorPalette.ELECTRIC_CYAN ? 'selected' : ''}>Electric Cyan-Violet</option>
            </select>
          </div>
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Point Size</span>
            <span class="control-val" id="val-point-size">${this.renderParams.pointSize.toFixed(1)}</span>
          </div>
          <input type="range" id="range-point-size" min="0.5" max="8.0" step="0.2" value="${this.renderParams.pointSize}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">Exposure & Brightness</span>
            <span class="control-val" id="val-exposure">${this.renderParams.exposure.toFixed(2)}</span>
          </div>
          <input type="range" id="range-exposure" min="0.2" max="3.0" step="0.1" value="${this.renderParams.exposure}">
        </div>

        <div class="control-group">
          <div class="control-row">
            <span class="control-label">HDR Bloom Intensity</span>
            <span class="control-val" id="val-bloom">${this.renderParams.bloomIntensity.toFixed(2)}</span>
          </div>
          <input type="range" id="range-bloom" min="0.0" max="3.0" step="0.1" value="${this.renderParams.bloomIntensity}">
        </div>

        <div class="control-toggle-row">
          <label class="toggle-container">
            <input type="checkbox" id="chk-grid" ${this.renderParams.showGrid ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Galactic Reference Grid</span>
          </label>
        </div>

        <div class="control-toggle-row">
          <label class="toggle-container">
            <input type="checkbox" id="chk-orbits" ${this.renderParams.showOrbits ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Keplerian Orbital Splines</span>
          </label>
        </div>

        <div class="control-toggle-row">
          <label class="toggle-container">
            <input type="checkbox" id="chk-guidance" ${this.renderParams.showGuidanceVectors ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Flight Guidance Vectors (Prograde)</span>
          </label>
        </div>
      </div>

      <!-- Flight Controls Cheat Sheet -->
      <div class="panel-section">
        <div class="panel-section-title">FLIGHT DECK KEYBOARD CONTROLS</div>
        <div class="controls-cheat-sheet">
          <div class="cheat-row"><span>Pitch Down / Up</span><kbd>W</kbd> / <kbd>S</kbd></div>
          <div class="cheat-row"><span>Yaw Left / Right</span><kbd>A</kbd> / <kbd>D</kbd></div>
          <div class="cheat-row"><span>Roll CCW / CW</span><kbd>Q</kbd> / <kbd>E</kbd></div>
          <div class="cheat-row"><span>Throttle Max / Cut</span><kbd>Z</kbd> / <kbd>X</kbd></div>
          <div class="cheat-row"><span>Throttle Up / Down</span><kbd>Shift</kbd> / <kbd>Ctrl</kbd></div>
          <div class="cheat-row"><span>Stage Separation</span><kbd>X</kbd> (or Button)</div>
          <div class="cheat-row"><span>Toggle Pause</span><kbd>Space</kbd></div>
          <div class="cheat-row"><span>Toggle Grid</span><kbd>G</kbd></div>
          <div class="cheat-row"><span>Restart Scenario</span><kbd>R</kbd></div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Play / Pause
    const playPauseBtn = this.container.querySelector('#btn-play-pause')!;
    playPauseBtn.addEventListener('click', () => {
      this.simParams.paused = !this.simParams.paused;
      this.render();
    });

    // Reset
    const resetBtn = this.container.querySelector('#btn-reset')!;
    resetBtn.addEventListener('click', () => this.onReset());

    // Tools
    const toolBtns = this.container.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool') as MouseTool;
        this.currentTool = tool;
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.onToolChange(tool);
      });
    });

    // Selects
    const selectAlgo = this.container.querySelector('#select-algo') as HTMLSelectElement;
    selectAlgo.addEventListener('change', () => {
      this.simParams.algorithm = selectAlgo.value as AlgorithmType;
      this.onParamChange();
    });

    const selectIntegrator = this.container.querySelector('#select-integrator') as HTMLSelectElement;
    selectIntegrator.addEventListener('change', () => {
      this.simParams.integrator = selectIntegrator.value as IntegratorType;
      this.onParamChange();
    });

    const selectPalette = this.container.querySelector('#select-palette') as HTMLSelectElement;
    selectPalette.addEventListener('change', () => {
      this.renderParams.colorPalette = selectPalette.value as ColorPalette;
      this.onParamChange();
    });

    // Sliders
    this.bindSlider('#range-dt', '#val-dt', (val) => {
      this.simParams.timeStep = val;
    }, 3);

    this.bindSlider('#range-timewarp', '#val-timewarp', (val) => {
      this.simParams.timeWarp = Math.round(val);
    }, 0);

    this.bindSlider('#range-substeps', '#val-substeps', (val) => {
      this.simParams.substeps = Math.round(val);
    }, 0);

    this.bindSlider('#range-theta', '#val-theta', (val) => {
      this.simParams.theta = val;
    }, 2);

    this.bindSlider('#range-softening', '#val-softening', (val) => {
      this.simParams.softening = val;
    }, 1);

    this.bindSlider('#range-g', '#val-g', (val) => {
      this.simParams.gravityConstant = val;
    }, 2);

    this.bindSlider('#range-point-size', '#val-point-size', (val) => {
      this.renderParams.pointSize = val;
    }, 1);

    this.bindSlider('#range-exposure', '#val-exposure', (val) => {
      this.renderParams.exposure = val;
    }, 2);

    this.bindSlider('#range-bloom', '#val-bloom', (val) => {
      this.renderParams.bloomIntensity = val;
    }, 2);

    // Toggles
    const chkCollision = this.container.querySelector('#chk-collision') as HTMLInputElement;
    chkCollision.addEventListener('change', () => {
      this.simParams.enableCollisions = chkCollision.checked;
      this.onParamChange();
    });

    const chkRelativity = this.container.querySelector('#chk-relativity') as HTMLInputElement;
    chkRelativity.addEventListener('change', () => {
      this.simParams.enableRelativisticPrecession = chkRelativity.checked;
      this.onParamChange();
    });

    const chkGrid = this.container.querySelector('#chk-grid') as HTMLInputElement;
    chkGrid.addEventListener('change', () => {
      this.renderParams.showGrid = chkGrid.checked;
      this.onParamChange();
    });

    const chkOrbits = this.container.querySelector('#chk-orbits') as HTMLInputElement;
    chkOrbits.addEventListener('change', () => {
      this.renderParams.showOrbits = chkOrbits.checked;
      this.onParamChange();
    });

    const chkGuidance = this.container.querySelector('#chk-guidance') as HTMLInputElement;
    chkGuidance.addEventListener('change', () => {
      this.renderParams.showGuidanceVectors = chkGuidance.checked;
      this.onParamChange();
    });
  }

  private bindSlider(
    sliderSelector: string,
    valSelector: string,
    onValue: (val: number) => void,
    decimals = 2
  ): void {
    const slider = this.container.querySelector(sliderSelector) as HTMLInputElement;
    const valEl = this.container.querySelector(valSelector) as HTMLElement;
    if (!slider || !valEl) return;

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valEl.textContent = decimals === 0 ? `${Math.round(val)}×` : val.toFixed(decimals);
      onValue(val);
      this.onParamChange();
    });
  }
}
