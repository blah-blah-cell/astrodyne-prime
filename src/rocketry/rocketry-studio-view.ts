import { RocketAeroConfig } from './barrowman-solver.js';
import { RocketTrajectoryPredictor, FlightSimulationSummary } from './trajectory-predictor.js';

export class RocketryStudioView {
  private container: HTMLElement;
  private currentConfig: RocketAeroConfig;
  private lastFlightSummary: FlightSimulationSummary | null = null;
  private onLaunchInSpaceflight?: (config: RocketAeroConfig, summary: FlightSimulationSummary) => void;

  constructor(
    container: HTMLElement,
    onLaunchInSpaceflight?: (config: RocketAeroConfig, summary: FlightSimulationSummary) => void
  ) {
    this.container = container;
    this.onLaunchInSpaceflight = onLaunchInSpaceflight;

    // Default Pro-38 Model Rocket Configuration
    this.currentConfig = {
      name: 'Astrodyne Horizon-1',
      noseCone: {
        shape: 'ogive',
        lengthM: 0.35,
        baseDiameterM: 0.075,
        massKg: 0.18
      },
      bodyTube: {
        lengthM: 0.85,
        outerDiameterM: 0.075,
        innerDiameterM: 0.072,
        massKg: 0.32
      },
      finSet: {
        numFins: 4,
        rootChordM: 0.12,
        tipChordM: 0.05,
        spanM: 0.08,
        sweepLengthM: 0.06,
        positionFromNoseM: 1.05,
        massKg: 0.11
      },
      motorMassKg: 0.45,
      motorPositionFromNoseM: 1.15,
      motorThrustN: 480.0,
      motorBurnTimeSec: 2.8,
      propellantMassKg: 0.22
    };

    this.renderUI();
  }

  private renderUI(): void {
    this.container.innerHTML = `
      <div class="rocketry-studio-layout">
        <!-- Configuration Controls -->
        <div class="rocketry-config-panel">
          <div class="rocketry-header">
            <div class="rocketry-title">🚀 OpenRocket Aerodynamics & Stability Suite</div>
            <div class="rocketry-badge">NASA TR R-58 Barrowman Engine</div>
          </div>

          <!-- Section 1: Nose Cone -->
          <div class="aero-section-card">
            <div class="aero-card-title">1. Supersonic Nose Cone</div>
            <div class="aero-grid-2">
              <div>
                <label class="form-label">Profile</label>
                <select id="aero-nose-shape" class="form-select">
                  <option value="ogive" selected>Ogive (Von Kármán)</option>
                  <option value="conical">Conical</option>
                  <option value="parabolic">Parabolic</option>
                </select>
              </div>
              <div>
                <label class="form-label">Length (m)</label>
                <input type="number" id="aero-nose-len" class="form-input" value="0.35" step="0.05">
              </div>
            </div>
          </div>

          <!-- Section 2: Airframe Body Tube -->
          <div class="aero-section-card">
            <div class="aero-card-title">2. Airframe Body Tube</div>
            <div class="aero-grid-2">
              <div>
                <label class="form-label">Body Length (m)</label>
                <input type="number" id="aero-body-len" class="form-input" value="0.85" step="0.05">
              </div>
              <div>
                <label class="form-label">Diameter (m)</label>
                <input type="number" id="aero-body-dia" class="form-input" value="0.075" step="0.005">
              </div>
            </div>
          </div>

          <!-- Section 3: Fin Geometry -->
          <div class="aero-section-card">
            <div class="aero-card-title">3. Trapezoidal Fin Set</div>
            <div class="aero-grid-3">
              <div>
                <label class="form-label">Fins Count</label>
                <select id="aero-fin-count" class="form-select">
                  <option value="3">3 Fins (120°)</option>
                  <option value="4" selected>4 Fins (90°)</option>
                </select>
              </div>
              <div>
                <label class="form-label">Root Chord (m)</label>
                <input type="number" id="aero-fin-root" class="form-input" value="0.12" step="0.01">
              </div>
              <div>
                <label class="form-label">Tip Chord (m)</label>
                <input type="number" id="aero-fin-tip" class="form-input" value="0.05" step="0.01">
              </div>
            </div>
            <div class="aero-grid-2" style="margin-top: 8px;">
              <div>
                <label class="form-label">Span / Height (m)</label>
                <input type="number" id="aero-fin-span" class="form-input" value="0.08" step="0.01">
              </div>
              <div>
                <label class="form-label">Sweep (m)</label>
                <input type="number" id="aero-fin-sweep" class="form-input" value="0.06" step="0.01">
              </div>
            </div>
          </div>

          <!-- Section 4: Propulsion Motor -->
          <div class="aero-section-card">
            <div class="aero-card-title">4. Composite Solid Motor</div>
            <div class="aero-grid-3">
              <div>
                <label class="form-label">Thrust (N)</label>
                <input type="number" id="aero-motor-thrust" class="form-input" value="480" step="20">
              </div>
              <div>
                <label class="form-label">Burn Time (s)</label>
                <input type="number" id="aero-motor-burn" class="form-input" value="2.8" step="0.1">
              </div>
              <div>
                <label class="form-label">Propellant (kg)</label>
                <input type="number" id="aero-motor-prop" class="form-input" value="0.22" step="0.02">
              </div>
            </div>
          </div>

          <button id="btn-run-aero-sim" class="btn-rocketry-run">⚡ Run Barrowman & Trajectory Sim</button>
        </div>

        <!-- Right Barrowman Stability & Trajectory Dashboard -->
        <div class="rocketry-dashboard-panel">
          <!-- Stability Status Banner -->
          <div id="stability-banner" class="stability-banner optimal">
            <div class="stability-badge-title">BARROWMAN STATIC STABILITY MARGIN</div>
            <div class="stability-calibers" id="stability-calibers-val">1.45 CALIBERS (OPTIMAL)</div>
            <div class="stability-desc" id="stability-desc-text">Center of Pressure is situated behind Center of Gravity. Excellent passive aerodynamic restoring torque.</div>
          </div>

          <!-- Stability Center Diagram -->
          <div class="aero-diagram-card">
            <div class="aero-card-title">Barrowman Aerodynamic Center Locations</div>
            <div class="aero-center-row">
              <span>Center of Gravity (Xcg):</span>
              <b id="val-xcg">0.72 m from nose</b>
            </div>
            <div class="aero-center-row">
              <span>Center of Pressure (Xcp):</span>
              <b id="val-xcp">0.83 m from nose</b>
            </div>
            <div class="aero-center-row">
              <span>Normal Force Coefficient (CNa):</span>
              <b id="val-cna">14.8</b>
            </div>
          </div>

          <!-- 4th-Order RK4 Trajectory Summary -->
          <div class="aero-diagram-card">
            <div class="aero-card-title">RK4 Atmospheric Ascent Trajectory Prediction</div>
            <div class="traj-metrics-grid">
              <div class="traj-card">
                <span class="traj-label">Predicted Apogee:</span>
                <span class="traj-val" id="traj-apogee">1,482 m</span>
              </div>
              <div class="traj-card">
                <span class="traj-label">Time to Apogee:</span>
                <span class="traj-val" id="traj-time-apogee">17.2 s</span>
              </div>
              <div class="traj-card">
                <span class="traj-label">Max Velocity:</span>
                <span class="traj-val" id="traj-max-vel">184 m/s (Mach 0.54)</span>
              </div>
              <div class="traj-card">
                <span class="traj-label">Max Acceleration:</span>
                <span class="traj-val" id="traj-max-acc">14.2 G</span>
              </div>
              <div class="traj-card">
                <span class="traj-label">Max Dynamic Pressure:</span>
                <span class="traj-val" id="traj-max-q">20.8 kPa</span>
              </div>
              <div class="traj-card">
                <span class="traj-label">Optimal Chute Delay:</span>
                <span class="traj-val" id="traj-opt-delay">14.4 s</span>
              </div>
            </div>
          </div>

          <button id="btn-launch-aero-sim" class="btn-rocketry-launch">🚀 Launch into WebGPU Spaceflight Simulation</button>
        </div>
      </div>
    `;

    this.attachEvents();
    this.runSimulation();
  }

  private attachEvents(): void {
    const btnRun = this.container.querySelector('#btn-run-aero-sim');
    const btnLaunch = this.container.querySelector('#btn-launch-aero-sim');

    btnRun?.addEventListener('click', () => {
      this.readInputsToConfig();
      this.runSimulation();
    });

    btnLaunch?.addEventListener('click', () => {
      if (this.lastFlightSummary && this.onLaunchInSpaceflight) {
        this.onLaunchInSpaceflight(this.currentConfig, this.lastFlightSummary);
      }
    });
  }

  private readInputsToConfig(): void {
    const getVal = (id: string, def: number) => {
      const el = this.container.querySelector(id) as HTMLInputElement;
      return el ? parseFloat(el.value) || def : def;
    };
    const getShape = (id: string) => {
      const el = this.container.querySelector(id) as HTMLSelectElement;
      return (el?.value || 'ogive') as 'ogive' | 'conical' | 'parabolic';
    };

    this.currentConfig.noseCone.shape = getShape('#aero-nose-shape');
    this.currentConfig.noseCone.lengthM = getVal('#aero-nose-len', 0.35);
    this.currentConfig.bodyTube.lengthM = getVal('#aero-body-len', 0.85);
    this.currentConfig.bodyTube.outerDiameterM = getVal('#aero-body-dia', 0.075);
    this.currentConfig.finSet.numFins = parseInt((this.container.querySelector('#aero-fin-count') as HTMLSelectElement)?.value || '4');
    this.currentConfig.finSet.rootChordM = getVal('#aero-fin-root', 0.12);
    this.currentConfig.finSet.tipChordM = getVal('#aero-fin-tip', 0.05);
    this.currentConfig.finSet.spanM = getVal('#aero-fin-span', 0.08);
    this.currentConfig.finSet.sweepLengthM = getVal('#aero-fin-sweep', 0.06);
    this.currentConfig.finSet.positionFromNoseM = this.currentConfig.noseCone.lengthM + this.currentConfig.bodyTube.lengthM - this.currentConfig.finSet.rootChordM;

    this.currentConfig.motorThrustN = getVal('#aero-motor-thrust', 480);
    this.currentConfig.motorBurnTimeSec = getVal('#aero-motor-burn', 2.8);
    this.currentConfig.propellantMassKg = getVal('#aero-motor-prop', 0.22);
  }

  public runSimulation(): void {
    const summary = RocketTrajectoryPredictor.simulateFlight(this.currentConfig);
    this.lastFlightSummary = summary;

    const banner = this.container.querySelector('#stability-banner') as HTMLElement;
    const calibersEl = this.container.querySelector('#stability-calibers-val');
    const descEl = this.container.querySelector('#stability-desc-text');
    const xcgEl = this.container.querySelector('#val-xcg');
    const xcpEl = this.container.querySelector('#val-xcp');
    const cnaEl = this.container.querySelector('#val-cna');

    const s = summary.stability;
    if (banner) {
      banner.className = `stability-banner ${s.stabilityStatus.toLowerCase()}`;
    }
    if (calibersEl) {
      calibersEl.textContent = `${s.stabilityMarginCalibers.toFixed(2)} CALIBERS (${s.stabilityStatus})`;
    }
    if (descEl) {
      descEl.textContent = s.stabilityStatus === 'OPTIMAL'
        ? 'Center of Pressure is situated behind Center of Gravity. Excellent passive aerodynamic restoring torque.'
        : s.stabilityStatus === 'UNSTABLE'
        ? 'WARNING: Center of Pressure is in FRONT of Center of Gravity! Rocket will tumble and flip.'
        : s.stabilityStatus === 'OVERSTABLE'
        ? 'Rocket is over-stabilized (>2.5 calibers). High sensitivity to crosswinds / weathercocking.'
        : 'Marginally stable (<1.0 caliber). Safe in calm winds only.';
    }

    if (xcgEl) xcgEl.textContent = `${s.xCg_Total.toFixed(3)} m from nose (${(s.totalMassKg * 1000).toFixed(0)}g total mass)`;
    if (xcpEl) xcpEl.textContent = `${s.xCp_Total.toFixed(3)} m from nose`;
    if (cnaEl) cnaEl.textContent = s.cNa_Total.toFixed(2);

    // Trajectory Metrics
    const setT = (id: string, text: string) => {
      const el = this.container.querySelector(id);
      if (el) el.textContent = text;
    };

    setT('#traj-apogee', `${summary.apogeeAltitudeM.toLocaleString()} m`);
    setT('#traj-time-apogee', `${summary.timeToApogeeSec} s`);
    setT('#traj-max-vel', `${summary.maxVelocityMs} m/s (Mach ${summary.maxMachNumber})`);
    setT('#traj-max-acc', `${summary.maxAccelerationG} G`);
    setT('#traj-max-q', `${summary.maxDynamicPressureKpa} kPa`);
    setT('#traj-opt-delay', `${summary.optimalEjectionDelaySec} s`);
  }
}
