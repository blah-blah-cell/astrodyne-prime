import { TelemetryData } from './types';

export class TelemetryTracker {
  public data: TelemetryData = {
    fps: 60,
    frameTimeMs: 16.6,
    computeTimeMs: 0,
    renderTimeMs: 0,
    treeBuildTimeMs: 0,
    forceComputeTimeMs: 0,
    gflops: 0,
    activeParticles: 0,
    totalMass: 0,
    kineticEnergy: 0,
    potentialEnergy: 0,
    totalEnergy: 0,
    energyDrift: 0,
    initialEnergy: 0,
    angularMomentum: [0, 0, 0],
    angularMomentumMag: 0,
    angularMomentumDrift: 0,
    initialAngularMomentumMag: 0,
    centerOfMass: [0, 0, 0]
  };

  private frameCount = 0;
  private lastFpsTime = performance.now();
  private isInitialized = false;

  public updateFrame(_dtMs?: number): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsTime;

    if (elapsed >= 500) {
      this.data.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.data.frameTimeMs = parseFloat((elapsed / this.frameCount).toFixed(2));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  public resetBaseline(): void {
    this.isInitialized = false;
  }

  public setPhysicsMetrics(
    totalMass: number,
    ke: number,
    pe: number,
    L: [number, number, number],
    com: [number, number, number],
    activeCount: number
  ): void {
    const totalE = ke + pe;
    const Lmag = Math.hypot(L[0], L[1], L[2]);

    this.data.totalMass = totalMass;
    this.data.kineticEnergy = ke;
    this.data.potentialEnergy = pe;
    this.data.totalEnergy = totalE;
    this.data.angularMomentum = L;
    this.data.angularMomentumMag = Lmag;
    this.data.centerOfMass = com;
    this.data.activeParticles = activeCount;

    if (!this.isInitialized && Math.abs(totalE) > 1e-5) {
      this.data.initialEnergy = totalE;
      this.data.initialAngularMomentumMag = Lmag;
      this.isInitialized = true;
    }

    if (this.isInitialized && Math.abs(this.data.initialEnergy) > 1e-5) {
      this.data.energyDrift = (totalE - this.data.initialEnergy) / Math.abs(this.data.initialEnergy);
    } else {
      this.data.energyDrift = 0;
    }

    if (this.isInitialized && this.data.initialAngularMomentumMag > 1e-5) {
      this.data.angularMomentumDrift = (Lmag - this.data.initialAngularMomentumMag) / this.data.initialAngularMomentumMag;
    } else {
      this.data.angularMomentumDrift = 0;
    }
  }

  public calculateGFLOPS(particleCount: number, isBarnesHut: boolean, computeMs: number): void {
    if (computeMs <= 0.01) {
      this.data.gflops = 0;
      return;
    }

    let totalFlops = 0;
    if (isBarnesHut) {
      const avgNodeInteractions = Math.min(particleCount, 40 * Math.log2(Math.max(particleCount, 2)));
      totalFlops = particleCount * avgNodeInteractions * 25;
    } else {
      totalFlops = particleCount * particleCount * 22;
    }

    const gflops = (totalFlops / (computeMs * 1e-3)) / 1e9;
    this.data.gflops = parseFloat(gflops.toFixed(2));
  }
}
