import { TelemetryTracker } from '../physics/telemetry';

export class TelemetryPanel {
  private container: HTMLElement;
  private tracker: TelemetryTracker;

  private fpsEl!: HTMLElement;
  private computeTimeEl!: HTMLElement;
  private gflopsEl!: HTMLElement;
  private activeBodiesEl!: HTMLElement;
  private energyDriftEl!: HTMLElement;
  private angularDriftEl!: HTMLElement;
  private totalEnergyEl!: HTMLElement;
  private kePeRatioEl!: HTMLElement;
  private comEl!: HTMLElement;

  private sparklineCanvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private energyHistory: number[] = [];
  private readonly maxHistory = 80;

  constructor(container: HTMLElement, tracker: TelemetryTracker) {
    this.container = container;
    this.tracker = tracker;
    this.buildDOM();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div class="telemetry-header">
        <div class="telemetry-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>PHYSICS TELEMETRY</span>
        </div>
        <div class="badge-live"><span class="pulse-dot"></span> LIVE GPU</div>
      </div>

      <div class="telemetry-grid">
        <div class="metric-card">
          <div class="metric-label">BODIES</div>
          <div class="metric-value text-cyan" id="telem-bodies">0</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">FPS / FRAME</div>
          <div class="metric-value text-emerald" id="telem-fps">60 <span class="metric-unit">fps</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">GPU COMPUTE</div>
          <div class="metric-value text-amber" id="telem-compute">0.0 <span class="metric-unit">ms</span></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">PERFORMANCE</div>
          <div class="metric-value text-purple" id="telem-gflops">0 <span class="metric-unit">GFLOPS</span></div>
        </div>
      </div>

      <div class="telemetry-section-title">CONSERVATION DIAGNOSTICS</div>

      <div class="conservation-rows">
        <div class="conservation-row">
          <div class="c-label">
            <span>Energy Drift (ΔE / E₀)</span>
            <span class="c-val" id="telem-energy-drift">+0.000%</span>
          </div>
          <div class="c-bar-bg">
            <div class="c-bar-fill" id="energy-bar" style="width: 2%;"></div>
          </div>
        </div>

        <div class="conservation-row">
          <div class="c-label">
            <span>Angular Momentum (ΔL / L₀)</span>
            <span class="c-val" id="telem-angular-drift">+0.000%</span>
          </div>
          <div class="c-bar-bg">
            <div class="c-bar-fill" id="angular-bar" style="width: 2%;"></div>
          </div>
        </div>
      </div>

      <div class="sparkline-container">
        <div class="sparkline-header">
          <span>HAMILTONIAN ENERGY STABILITY</span>
          <span id="telem-total-energy" class="text-dim">E = 0.00e+0</span>
        </div>
        <canvas id="energy-sparkline" width="280" height="48"></canvas>
      </div>

      <div class="metric-subgrid">
        <div class="submetric">
          <span class="sub-label">Virial (2K / |V|):</span>
          <span class="sub-val" id="telem-virial">0.00</span>
        </div>
        <div class="submetric">
          <span class="sub-label">Center of Mass:</span>
          <span class="sub-val" id="telem-com">(0, 0, 0)</span>
        </div>
      </div>
    `;

    this.fpsEl = this.container.querySelector('#telem-fps')!;
    this.computeTimeEl = this.container.querySelector('#telem-compute')!;
    this.gflopsEl = this.container.querySelector('#telem-gflops')!;
    this.activeBodiesEl = this.container.querySelector('#telem-bodies')!;
    this.energyDriftEl = this.container.querySelector('#telem-energy-drift')!;
    this.angularDriftEl = this.container.querySelector('#telem-angular-drift')!;
    this.totalEnergyEl = this.container.querySelector('#telem-total-energy')!;
    this.kePeRatioEl = this.container.querySelector('#telem-virial')!;
    this.comEl = this.container.querySelector('#telem-com')!;

    this.sparklineCanvas = this.container.querySelector('#energy-sparkline') as HTMLCanvasElement;
    this.ctx = this.sparklineCanvas.getContext('2d')!;
  }

  public update(): void {
    const d = this.tracker.data;

    this.activeBodiesEl.textContent = d.activeParticles ? d.activeParticles.toLocaleString() : (d.activeParticles === 0 ? '0' : '—');
    this.fpsEl.innerHTML = `${d.fps} <span class="metric-unit">fps</span>`;
    this.computeTimeEl.innerHTML = `${d.computeTimeMs.toFixed(1)} <span class="metric-unit">ms</span>`;
    this.gflopsEl.innerHTML = `${d.gflops.toFixed(0)} <span class="metric-unit">GFLOPS</span>`;

    // Energy Drift
    const eDriftPct = d.energyDrift * 100;
    const eSign = eDriftPct >= 0 ? '+' : '';
    this.energyDriftEl.textContent = `${eSign}${eDriftPct.toFixed(4)}%`;
    this.energyDriftEl.className = Math.abs(eDriftPct) < 0.5 ? 'c-val text-emerald' : Math.abs(eDriftPct) < 2.0 ? 'c-val text-amber' : 'c-val text-red';

    // Angular Momentum Drift
    const lDriftPct = d.angularMomentumDrift * 100;
    const lSign = lDriftPct >= 0 ? '+' : '';
    this.angularDriftEl.textContent = `${lSign}${lDriftPct.toFixed(4)}%`;
    this.angularDriftEl.className = Math.abs(lDriftPct) < 0.5 ? 'c-val text-emerald' : Math.abs(lDriftPct) < 2.0 ? 'c-val text-amber' : 'c-val text-red';

    // Virial ratio: 2 * T / |V| (Virial equilibrium = 1.0)
    const virial = Math.abs(d.potentialEnergy) > 1e-4 ? (2 * d.kineticEnergy) / Math.abs(d.potentialEnergy) : 0;
    this.kePeRatioEl.textContent = virial.toFixed(3);

    // Total Energy scientific format
    this.totalEnergyEl.textContent = `E = ${d.totalEnergy.toExponential(3)}`;

    // Center of Mass
    this.comEl.textContent = `(${d.centerOfMass[0].toFixed(1)}, ${d.centerOfMass[1].toFixed(1)}, ${d.centerOfMass[2].toFixed(1)})`;

    // Update Sparkline
    this.updateSparkline(d.totalEnergy);
  }

  private updateSparkline(energy: number): void {
    if (isNaN(energy) || Math.abs(energy) < 1e-12) return;
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.maxHistory) {
      this.energyHistory.shift();
    }

    const c = this.ctx;
    const w = this.sparklineCanvas.width;
    const h = this.sparklineCanvas.height;

    c.clearRect(0, 0, w, h);

    if (this.energyHistory.length < 2) return;

    let minE = Infinity;
    let maxE = -Infinity;
    for (const val of this.energyHistory) {
      if (val < minE) minE = val;
      if (val > maxE) maxE = val;
    }

    const range = Math.max(maxE - minE, Math.abs(minE) * 0.001, 1e-4);

    c.beginPath();
    c.strokeStyle = '#06b6d4';
    c.lineWidth = 1.5;

    for (let i = 0; i < this.energyHistory.length; i++) {
      const x = (i / (this.maxHistory - 1)) * w;
      const normY = (this.energyHistory[i] - minE) / range;
      const y = h - 6 - normY * (h - 12);

      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();

    // Baseline reference center line
    c.beginPath();
    c.setLineDash([2, 4]);
    c.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
    c.setLineDash([]);
  }
}
