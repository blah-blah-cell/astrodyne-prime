import { RocketAeroConfig } from './barrowman-solver.js';
import { RocketTrajectoryPredictor, FlightSimulationSummary } from './trajectory-predictor.js';
import { MeshAerodynamicResult } from '../cad/aerodynamic-analyzer.js';
import { LatticeBoltzmannFlowField } from './flow-field.js';
import { RocketEvolutionaryOptimizer } from './evolutionary-optimizer.js';
import { EngineeringMeasurements } from '../engineering/measurements.js';
import { EngineeringProjectSession } from '../engineering/project-session.js';
import { ToolchainRegistry } from '../engineering/toolchain-registry.js';
import { JSBSimRocketBackend } from './jsbsim-backend.js';
import { OpenRocketCoreBackend } from './openrocket-backend.js';

export class RocketryStudioView {
  private container: HTMLElement;
  private currentConfig: RocketAeroConfig;
  private lastFlightSummary: FlightSimulationSummary | null = null;
  private onLaunchInSpaceflight?: (config: RocketAeroConfig, summary: FlightSimulationSummary) => void;
  private flowField = new LatticeBoltzmannFlowField();

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
            <div class="rocketry-title">Aerodynamics and Stability</div>
            <div class="rocketry-badge">Barrowman · RK4 · D2Q9 LBM · JSBSim 1.2.4 WASM · OpenRocket Core 24.12 · CAD coupled</div>
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
            <div class="aero-grid-2 aero-grid-secondary">
              <div><label class="form-label">Base Diameter (m)</label><input type="number" id="aero-nose-dia" class="form-input" value="0.075" step="0.001" min="0.001"></div>
              <div><label class="form-label">Mass (kg)</label><input type="number" id="aero-nose-mass" class="form-input" value="0.18" step="0.01" min="0.001"></div>
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
            <div class="aero-grid-2 aero-grid-secondary">
              <div><label class="form-label">Inner Diameter (m)</label><input type="number" id="aero-body-inner-dia" class="form-input" value="0.072" step="0.001" min="0"></div>
              <div><label class="form-label">Mass (kg)</label><input type="number" id="aero-body-mass" class="form-input" value="0.32" step="0.01" min="0.001"></div>
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
            <div class="aero-grid-2 aero-grid-secondary">
              <div><label class="form-label">Position from Nose (m)</label><input type="number" id="aero-fin-position" class="form-input" value="1.05" step="0.01" min="0"></div>
              <div><label class="form-label">Fin Set Mass (kg)</label><input type="number" id="aero-fin-mass" class="form-input" value="0.11" step="0.01" min="0.001"></div>
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
            <div class="aero-grid-2 aero-grid-secondary">
              <div><label class="form-label">Loaded Motor Mass (kg)</label><input type="number" id="aero-motor-mass" class="form-input" value="0.45" step="0.01" min="0.001"></div>
              <div><label class="form-label">Motor CG from Nose (m)</label><input type="number" id="aero-motor-position" class="form-input" value="1.15" step="0.01" min="0"></div>
            </div>
          </div>

          <button id="btn-run-aero-sim" class="btn-rocketry-run">Run Coupled Analysis</button>
          <div id="aero-validation" class="systems-status ok">CONFIGURATION VALID</div>
          <button id="btn-export-aero" class="secondary-btn">Export Analysis JSON</button>

          <div class="aero-section-card optimizer-card">
            <div class="aero-card-title">Airframe Optimization</div>
            <div class="aero-grid-2">
              <div><label class="form-label">Target Apogee (m)</label><input id="optimizer-apogee" class="form-input" type="number" value="3000" step="100"></div>
              <div><label class="form-label">Min Stability</label><input id="optimizer-stability" class="form-input" type="number" value="1.5" step="0.1"></div>
            </div>
            <button id="btn-optimize-rocket" class="btn-rocketry-run">Optimize Airframe</button>
            <div class="cad-telem-row"><span>Optimization:</span><b id="optimizer-status">READY</b></div>
          </div>
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

          <div class="aero-diagram-card flow-field-card">
            <div class="aero-card-title">D2Q9 Lattice-Boltzmann Pressure Flow</div>
            <canvas id="aero-flow-canvas" class="aero-flow-canvas"></canvas>
            <div class="aero-center-row"><span>Flow solution:</span><b id="flow-stats">INITIALIZING</b></div>
            <div class="aero-center-row"><span>CAD mesh coupling:</span><b id="cad-aero-status">PARAMETRIC AIRFRAME</b></div>
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
            <canvas id="trajectory-chart" class="trajectory-chart" width="900" height="220" aria-label="Altitude and velocity trajectory chart"></canvas>
            <div class="aero-center-row"><span>Burnout:</span><b id="traj-burnout">—</b></div>
            <div class="aero-center-row"><span>Launch check:</span><b id="traj-launch-status">—</b></div>
          </div>

          <div class="aero-diagram-card jsbsim-validation-card">
            <div class="aero-card-title">Independent JSBSim Flight-Dynamics Validation</div>
            <p class="engineering-note">Runs the same mass, inertia, reference area, drag, thrust, and burn configuration through the JSBSim nonlinear FDM kernel.</p>
            <button id="btn-run-jsbsim" class="secondary-btn">Run JSBSim Validation</button>
            <div class="aero-center-row"><span>Kernel:</span><b id="jsbsim-kernel-status">NOT LOADED</b></div>
            <div class="aero-center-row"><span>JSBSim apogee:</span><b id="jsbsim-apogee">—</b></div>
            <div class="aero-center-row"><span>RK4 difference:</span><b id="jsbsim-delta">—</b></div>
            <div class="aero-center-row"><span>Time to apogee:</span><b id="jsbsim-time-apogee">—</b></div>
          </div>

          <div class="aero-diagram-card openrocket-validation-card">
            <div class="aero-card-title">OpenRocket Core 24.12 Validation</div>
            <p class="engineering-note">Builds a real OpenRocket vehicle from the active nose, tube, fin, mass, motor-mount, and generated thrust-curve inputs, then runs the official JVM simulation core.</p>
            <button id="btn-run-openrocket" class="secondary-btn">Run OpenRocket Core</button>
            <div class="aero-center-row"><span>Core:</span><b id="openrocket-kernel-status">NOT STARTED</b></div>
            <div class="aero-center-row"><span>OpenRocket apogee:</span><b id="openrocket-apogee">—</b></div>
            <div class="aero-center-row"><span>RK4 difference:</span><b id="openrocket-delta">—</b></div>
            <div class="aero-center-row"><span>Time to apogee:</span><b id="openrocket-time-apogee">—</b></div>
            <div class="aero-center-row"><span>Solver output:</span><b id="openrocket-output">—</b></div>
          </div>

          <button id="btn-launch-aero-sim" class="btn-rocketry-launch">Transfer Configuration to Flight</button>
        </div>
      </div>
    `;

    this.attachEvents();
    this.runSimulation();
  }

  public applyCADAeroAnalysis(analysis: MeshAerodynamicResult): void {
    this.currentConfig.cadEstimatedCd = analysis.estimatedCd;
    this.currentConfig.cadReferenceAreaM2 = analysis.referenceAreaM2;
    const status = this.container.querySelector('#cad-aero-status');
    if (status) status.textContent = `${analysis.frontalAreaMm2.toFixed(0)} mm² · Cd ${analysis.estimatedCd.toFixed(3)}`;
    this.flowField.setRocketObstacle(Math.min(0.4, 0.16 + analysis.finenessRatio * 0.02), 0.11);
    this.runSimulation();
  }

  public render(): void {
    const stats = this.flowField.step(2);
    const canvas = this.container.querySelector('#aero-flow-canvas') as HTMLCanvasElement | null;
    if (canvas) this.flowField.render(canvas);
    const label = this.container.querySelector('#flow-stats');
    if (label) label.textContent = `ū ${stats.averageSpeed.toFixed(3)} · Δp ${stats.pressureDelta.toExponential(1)} · ${stats.iterations} it`;
  }

  private attachEvents(): void {
    const btnRun = this.container.querySelector('#btn-run-aero-sim');
    const btnLaunch = this.container.querySelector('#btn-launch-aero-sim');
    const btnOptimize = this.container.querySelector('#btn-optimize-rocket');
    const btnExport = this.container.querySelector('#btn-export-aero');
    const btnJSBSim = this.container.querySelector('#btn-run-jsbsim') as HTMLButtonElement | null;
    const btnOpenRocket = this.container.querySelector('#btn-run-openrocket') as HTMLButtonElement | null;

    btnRun?.addEventListener('click', () => {
      this.readInputsToConfig();
      this.runSimulation();
    });

    btnLaunch?.addEventListener('click', () => {
      this.readInputsToConfig();
      this.runSimulation();
      if (this.validateConfig().length) return;
      if (this.lastFlightSummary && this.onLaunchInSpaceflight) {
        this.onLaunchInSpaceflight(this.currentConfig, this.lastFlightSummary);
      }
    });
    btnOptimize?.addEventListener('click', () => this.optimizeRocket());
    btnExport?.addEventListener('click', () => {
      this.readInputsToConfig();
      this.runSimulation();
      if (!this.validateConfig().length) this.exportAnalysis();
    });
    btnJSBSim?.addEventListener('click', () => void this.runJSBSimValidation(btnJSBSim));
    btnOpenRocket?.addEventListener('click', () => void this.runOpenRocketValidation(btnOpenRocket));
  }

  private async runOpenRocketValidation(button: HTMLButtonElement): Promise<void> {
    this.readInputsToConfig();
    this.runSimulation();
    if (this.validateConfig().length || !this.lastFlightSummary) return;
    const status = this.container.querySelector('#openrocket-kernel-status');
    const setText = (selector: string, value: string) => {
      const element = this.container.querySelector(selector);
      if (element) element.textContent = value;
    };
    button.disabled = true;
    button.textContent = 'Running OpenRocket Core…';
    if (status) status.textContent = 'STARTING JVM CORE';
    ToolchainRegistry.setState('openrocket', 'loading');
    try {
      const health = await OpenRocketCoreBackend.health();
      if (!health.available) throw new Error('Bridge is not built. Run npm run openrocket:build.');
      const result = await OpenRocketCoreBackend.simulate(this.currentConfig);
      const delta = result.apogeeAltitudeM - this.lastFlightSummary.apogeeAltitudeM;
      const percent = Math.abs(delta) / Math.max(1, this.lastFlightSummary.apogeeAltitudeM) * 100;
      setText('#openrocket-kernel-status', `READY · ${result.backend} ${result.version}`);
      setText('#openrocket-apogee', EngineeringMeasurements.scalar(result.apogeeAltitudeM, 'm'));
      setText('#openrocket-delta', `${delta >= 0 ? '+' : ''}${EngineeringMeasurements.scalar(delta, 'm')} · ${percent.toFixed(1)}%`);
      setText('#openrocket-time-apogee', EngineeringMeasurements.scalar(result.timeToApogeeSec, 's'));
      setText('#openrocket-output', `${result.samples.toLocaleString()} samples · ${result.warnings} warning${result.warnings === 1 ? '' : 's'} · ${EngineeringMeasurements.scalar(result.maxVelocityMs, 'm/s')} max`);
      EngineeringProjectSession.setArtifact('openrocket-validation', `${EngineeringMeasurements.scalar(result.apogeeAltitudeM, 'm')} apogee · ${percent.toFixed(1)}% RK4 delta`, result);
    } catch (error) {
      ToolchainRegistry.setState('openrocket', 'unavailable');
      if (status) status.textContent = `FAILED · ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Run OpenRocket Core';
    }
  }

  private async runJSBSimValidation(button: HTMLButtonElement): Promise<void> {
    this.readInputsToConfig();
    this.runSimulation();
    if (this.validateConfig().length || !this.lastFlightSummary) return;
    const status = this.container.querySelector('#jsbsim-kernel-status');
    button.disabled = true;
    button.textContent = 'Loading JSBSim kernel…';
    if (status) status.textContent = 'LOADING WASM';
    ToolchainRegistry.setState('jsbsim', 'loading');
    try {
      const result = await JSBSimRocketBackend.simulate(this.currentConfig);
      ToolchainRegistry.setState('jsbsim', 'ready');
      const delta = result.apogeeAltitudeM - this.lastFlightSummary.apogeeAltitudeM;
      const percent = Math.abs(delta) / Math.max(1, this.lastFlightSummary.apogeeAltitudeM) * 100;
      const setText = (selector: string, value: string) => {
        const element = this.container.querySelector(selector);
        if (element) element.textContent = value;
      };
      setText('#jsbsim-kernel-status', `READY · ${result.samples} samples`);
      setText('#jsbsim-apogee', EngineeringMeasurements.scalar(result.apogeeAltitudeM, 'm'));
      setText('#jsbsim-delta', `${delta >= 0 ? '+' : ''}${EngineeringMeasurements.scalar(delta, 'm')} · ${percent.toFixed(1)}%`);
      setText('#jsbsim-time-apogee', EngineeringMeasurements.scalar(result.timeToApogeeSec, 's'));
      EngineeringProjectSession.setArtifact('jsbsim-validation', `${EngineeringMeasurements.scalar(result.apogeeAltitudeM, 'm')} apogee · ${percent.toFixed(1)}% model delta`, result);
    } catch (error) {
      ToolchainRegistry.setState('jsbsim', 'unavailable');
      if (status) status.textContent = `FAILED · ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Run JSBSim Validation';
    }
  }

  private exportAnalysis(): void {
    if (!this.lastFlightSummary) return;
    const payload = JSON.stringify({ format: 'astrodyne-aerodynamics', version: 1, units: 'SI', config: this.currentConfig, summary: this.lastFlightSummary }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aerodynamics-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  public optimizeRocket(): void {
    this.readInputsToConfig();
    const target = Number((this.container.querySelector('#optimizer-apogee') as HTMLInputElement | null)?.value) || 3000;
    const minimumStability = Number((this.container.querySelector('#optimizer-stability') as HTMLInputElement | null)?.value) || 1.5;
    const status = this.container.querySelector('#optimizer-status');
    if (this.validateConfig().length) {
      if (status) status.textContent = 'INVALID CONFIGURATION';
      return;
    }
    if (status) status.textContent = 'EVOLVING…';
    const result = RocketEvolutionaryOptimizer.optimize(this.currentConfig, {
      targetApogeeM: target,
      minimumStabilityCalibers: minimumStability,
      population: 10,
      generations: 6
    });
    this.currentConfig = result.config;
    const setValue = (selector: string, value: number) => {
      const input = this.container.querySelector(selector) as HTMLInputElement | null;
      if (input) input.value = value.toFixed(3);
    };
    setValue('#aero-nose-len', this.currentConfig.noseCone.lengthM);
    setValue('#aero-fin-root', this.currentConfig.finSet.rootChordM);
    setValue('#aero-fin-tip', this.currentConfig.finSet.tipChordM);
    setValue('#aero-fin-span', this.currentConfig.finSet.spanM);
    if (status) status.textContent = `${result.apogeeM.toFixed(0)} m · ${result.stabilityCalibers.toFixed(2)} cal · ${result.evaluations} eval`;
    this.runSimulation();
  }

  private readInputsToConfig(): void {
    const getVal = (id: string, def: number) => {
      const el = this.container.querySelector(id) as HTMLInputElement;
      const parsed = el ? Number(el.value) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : def;
    };
    const getShape = (id: string) => {
      const el = this.container.querySelector(id) as HTMLSelectElement;
      return (el?.value || 'ogive') as 'ogive' | 'conical' | 'parabolic';
    };

    this.currentConfig.noseCone.shape = getShape('#aero-nose-shape');
    this.currentConfig.noseCone.lengthM = getVal('#aero-nose-len', 0.35);
    this.currentConfig.noseCone.baseDiameterM = getVal('#aero-nose-dia', 0.075);
    this.currentConfig.noseCone.massKg = getVal('#aero-nose-mass', 0.18);
    this.currentConfig.bodyTube.lengthM = getVal('#aero-body-len', 0.85);
    this.currentConfig.bodyTube.outerDiameterM = getVal('#aero-body-dia', 0.075);
    this.currentConfig.bodyTube.innerDiameterM = getVal('#aero-body-inner-dia', 0.072);
    this.currentConfig.bodyTube.massKg = getVal('#aero-body-mass', 0.32);
    this.currentConfig.finSet.numFins = parseInt((this.container.querySelector('#aero-fin-count') as HTMLSelectElement)?.value || '4');
    this.currentConfig.finSet.rootChordM = getVal('#aero-fin-root', 0.12);
    this.currentConfig.finSet.tipChordM = getVal('#aero-fin-tip', 0.05);
    this.currentConfig.finSet.spanM = getVal('#aero-fin-span', 0.08);
    this.currentConfig.finSet.sweepLengthM = getVal('#aero-fin-sweep', 0.06);
    this.currentConfig.finSet.positionFromNoseM = getVal('#aero-fin-position', 1.05);
    this.currentConfig.finSet.massKg = getVal('#aero-fin-mass', 0.11);

    this.currentConfig.motorMassKg = getVal('#aero-motor-mass', 0.45);
    this.currentConfig.motorPositionFromNoseM = getVal('#aero-motor-position', 1.15);
    this.currentConfig.motorThrustN = getVal('#aero-motor-thrust', 480);
    this.currentConfig.motorBurnTimeSec = getVal('#aero-motor-burn', 2.8);
    this.currentConfig.propellantMassKg = getVal('#aero-motor-prop', 0.22);
  }

  private validateConfig(): string[] {
    const c = this.currentConfig;
    const errors: string[] = [];
    if (c.noseCone.lengthM <= 0 || c.noseCone.baseDiameterM <= 0) errors.push('Nose dimensions must be positive');
    if (c.bodyTube.lengthM <= 0 || c.bodyTube.outerDiameterM <= 0) errors.push('Body dimensions must be positive');
    if (c.bodyTube.innerDiameterM < 0 || c.bodyTube.innerDiameterM >= c.bodyTube.outerDiameterM) errors.push('Inner diameter must be smaller than outer diameter');
    if (Math.abs(c.noseCone.baseDiameterM - c.bodyTube.outerDiameterM) > 0.001) errors.push('Nose and body diameters must match within 1 mm');
    if (c.finSet.rootChordM <= 0 || c.finSet.tipChordM <= 0 || c.finSet.spanM <= 0) errors.push('Fin dimensions must be positive');
    if (c.finSet.tipChordM > c.finSet.rootChordM) errors.push('Fin tip chord cannot exceed root chord');
    if (c.finSet.positionFromNoseM < c.noseCone.lengthM || c.finSet.positionFromNoseM > c.noseCone.lengthM + c.bodyTube.lengthM) errors.push('Fin position must lie on the body');
    if (c.motorPositionFromNoseM < c.noseCone.lengthM || c.motorPositionFromNoseM > c.noseCone.lengthM + c.bodyTube.lengthM) errors.push('Motor CG must lie inside the airframe');
    if ([c.noseCone.massKg, c.bodyTube.massKg, c.finSet.massKg, c.motorMassKg, c.motorThrustN, c.motorBurnTimeSec, c.propellantMassKg].some(value => value <= 0)) errors.push('Mass, thrust, burn time, and propellant must be positive');
    if (c.propellantMassKg >= c.motorMassKg) errors.push('Propellant mass must be less than loaded motor mass');
    const status = this.container.querySelector('#aero-validation');
    if (status) {
      status.textContent = errors.length ? `INVALID · ${errors.join(' · ')}` : 'CONFIGURATION VALID';
      status.className = `systems-status ${errors.length ? 'error' : 'ok'}`;
    }
    return errors;
  }

  public runSimulation(): void {
    if (this.validateConfig().length) return;
    const summary = RocketTrajectoryPredictor.simulateFlight(this.currentConfig);
    this.lastFlightSummary = summary;
    EngineeringProjectSession.setArtifact('aerodynamics', `${EngineeringMeasurements.scalar(summary.apogeeAltitudeM, 'm')} apogee · ${EngineeringMeasurements.scalar(summary.stability.stabilityMarginCalibers)} cal`, {
      config: this.currentConfig,
      summary
    });

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

    setT('#traj-apogee', EngineeringMeasurements.scalar(summary.apogeeAltitudeM, 'm'));
    setT('#traj-time-apogee', EngineeringMeasurements.scalar(summary.timeToApogeeSec, 's'));
    setT('#traj-max-vel', `${EngineeringMeasurements.scalar(summary.maxVelocityMs, 'm/s')} · Mach ${EngineeringMeasurements.scalar(summary.maxMachNumber)}`);
    setT('#traj-max-acc', EngineeringMeasurements.scalar(summary.maxAccelerationG, 'g'));
    setT('#traj-max-q', EngineeringMeasurements.scalar(summary.maxDynamicPressureKpa, 'kPa'));
    setT('#traj-opt-delay', EngineeringMeasurements.scalar(summary.optimalEjectionDelaySec, 's'));
    setT('#traj-burnout', `${EngineeringMeasurements.scalar(summary.burnoutAltitudeM, 'm')} at ${EngineeringMeasurements.scalar(summary.burnoutTimeSec, 's')}`);
    const thrustToWeight = this.currentConfig.motorThrustN / Math.max(0.001, summary.stability.totalMassKg * 9.80665);
    setT('#traj-launch-status', thrustToWeight > 1 ? `PASS · T/W ${EngineeringMeasurements.scalar(thrustToWeight)}` : `NO LIFTOFF · T/W ${EngineeringMeasurements.scalar(thrustToWeight)}`);
    this.drawTrajectoryChart(summary);
  }

  private drawTrajectoryChart(summary: FlightSimulationSummary): void {
    const canvas = this.container.querySelector('#trajectory-chart') as HTMLCanvasElement | null;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || summary.trajectory.length < 2) return;
    const width = canvas.width;
    const height = canvas.height;
    const pad = { left: 52, right: 52, top: 18, bottom: 30 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const points = summary.trajectory;
    const maxTime = Math.max(1, points[points.length - 1].timeSec);
    const maxAltitude = Math.max(1, summary.apogeeAltitudeM);
    const maxVelocity = Math.max(1, summary.maxVelocityMs);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#e1e6eb';
    context.lineWidth = 1;
    context.font = '11px ui-monospace, monospace';
    context.fillStyle = '#687586';
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + plotHeight * i / 5;
      context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
      context.fillText((maxAltitude * (1 - i / 5)).toFixed(0), 6, y + 4);
    }
    const draw = (color: string, value: (point: typeof points[number]) => number, max: number) => {
      context.strokeStyle = color; context.lineWidth = 2.5; context.beginPath();
      points.forEach((point, index) => {
        const x = pad.left + point.timeSec / maxTime * plotWidth;
        const y = pad.top + (1 - Math.max(0, value(point)) / max) * plotHeight;
        if (!index) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    };
    draw('#1769aa', point => point.altitudeM, maxAltitude);
    draw('#b45f25', point => point.velocityMs, maxVelocity);
    context.fillStyle = '#1769aa'; context.fillText('Altitude (m)', pad.left, height - 8);
    context.fillStyle = '#b45f25'; context.fillText('Velocity (m/s)', pad.left + 110, height - 8);
    context.fillStyle = '#687586'; context.fillText(`Time 0–${maxTime.toFixed(1)} s`, width - 160, height - 8);
  }
}
