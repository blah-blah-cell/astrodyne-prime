export interface FlowFieldStats {
  averageSpeed: number;
  maxSpeed: number;
  pressureDelta: number;
  iterations: number;
}

/** Compact D2Q9 Lattice-Boltzmann flow field for interactive aerodynamic visualization. */
export class LatticeBoltzmannFlowField {
  private readonly directions = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  private readonly weights = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  private populations: Float32Array;
  private next: Float32Array;
  private obstacles: Uint8Array;
  private iterationCount = 0;

  constructor(public readonly width = 120, public readonly height = 56, private inletSpeed = 0.075) {
    this.populations = new Float32Array(width * height * 9);
    this.next = new Float32Array(width * height * 9);
    this.obstacles = new Uint8Array(width * height);
    this.initialize();
  }

  public setRocketObstacle(noseLengthRatio = 0.28, bodyRadiusRatio = 0.12): void {
    this.obstacles.fill(0);
    const startX = Math.floor(this.width * 0.33);
    const centerY = Math.floor(this.height / 2);
    const noseLength = Math.max(4, Math.floor(this.width * noseLengthRatio));
    const bodyRadius = Math.max(2, Math.floor(this.height * bodyRadiusRatio));
    const bodyEnd = Math.min(this.width - 4, startX + noseLength + Math.floor(this.width * 0.22));
    for (let x = startX; x < bodyEnd; x++) {
      const progress = Math.min(1, (x - startX) / noseLength);
      const radius = Math.max(1, Math.floor(bodyRadius * Math.sin(progress * Math.PI / 2)));
      for (let y = centerY - radius; y <= centerY + radius; y++) this.obstacles[this.cell(x, y)] = 1;
    }
  }

  public reset(inletSpeed = this.inletSpeed): void {
    this.inletSpeed = Math.max(0.01, Math.min(0.14, inletSpeed));
    this.iterationCount = 0;
    this.initialize();
  }

  public step(iterations = 2): FlowFieldStats {
    for (let pass = 0; pass < iterations; pass++) {
      this.collideAndStream();
      this.iterationCount++;
    }
    return this.getStats();
  }

  public render(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    if (!context) return;
    if (canvas.width !== this.width || canvas.height !== this.height) {
      canvas.width = this.width;
      canvas.height = this.height;
    }
    const image = context.createImageData(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cell(x, y);
        const pixel = cell * 4;
        if (this.obstacles[cell]) {
          image.data[pixel] = 235; image.data[pixel + 1] = 241; image.data[pixel + 2] = 255; image.data[pixel + 3] = 255;
          continue;
        }
        const macro = this.macroscopic(cell);
        const speed = Math.hypot(macro.ux, macro.uy);
        const normalized = Math.max(0, Math.min(1, speed / 0.16));
        image.data[pixel] = Math.floor(20 + 235 * normalized);
        image.data[pixel + 1] = Math.floor(30 + 180 * (1 - Math.abs(normalized - 0.55) * 1.8));
        image.data[pixel + 2] = Math.floor(90 + 165 * (1 - normalized));
        image.data[pixel + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  public getStats(): FlowFieldStats {
    let speedSum = 0;
    let maxSpeed = 0;
    let densityMin = Number.POSITIVE_INFINITY;
    let densityMax = 0;
    let count = 0;
    for (let cell = 0; cell < this.width * this.height; cell++) {
      if (this.obstacles[cell]) continue;
      const macro = this.macroscopic(cell);
      const speed = Math.hypot(macro.ux, macro.uy);
      speedSum += speed;
      maxSpeed = Math.max(maxSpeed, speed);
      densityMin = Math.min(densityMin, macro.rho);
      densityMax = Math.max(densityMax, macro.rho);
      count++;
    }
    return {
      averageSpeed: count ? speedSum / count : 0,
      maxSpeed,
      pressureDelta: (densityMax - densityMin) / 3,
      iterations: this.iterationCount
    };
  }

  private initialize(): void {
    for (let cell = 0; cell < this.width * this.height; cell++) {
      for (let q = 0; q < 9; q++) this.populations[cell * 9 + q] = this.equilibrium(q, 1, this.inletSpeed, 0);
    }
    this.setRocketObstacle();
  }

  private collideAndStream(): void {
    this.next.fill(0);
    const omega = 1 / 0.62;
    const opposite = [0, 3, 4, 1, 2, 7, 8, 5, 6];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cell(x, y);
        const macro = this.macroscopic(cell);
        for (let q = 0; q < 9; q++) {
          const source = this.populations[cell * 9 + q];
          const relaxed = source + omega * (this.equilibrium(q, macro.rho, macro.ux, macro.uy) - source);
          const nx = x + this.directions[q][0];
          const ny = y + this.directions[q][1];
          if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || this.obstacles[this.cell(nx, ny)]) {
            this.next[cell * 9 + opposite[q]] += relaxed;
          } else {
            this.next[this.cell(nx, ny) * 9 + q] += relaxed;
          }
        }
      }
    }
    // Zou/He-like equilibrium inlet and stable copy outlet.
    for (let y = 0; y < this.height; y++) {
      for (let q = 0; q < 9; q++) {
        this.next[this.cell(0, y) * 9 + q] = this.equilibrium(q, 1, this.inletSpeed, 0);
        this.next[this.cell(this.width - 1, y) * 9 + q] = this.next[this.cell(this.width - 2, y) * 9 + q];
      }
    }
    [this.populations, this.next] = [this.next, this.populations];
  }

  private macroscopic(cell: number): { rho: number; ux: number; uy: number } {
    let rho = 0;
    let ux = 0;
    let uy = 0;
    for (let q = 0; q < 9; q++) {
      const value = this.populations[cell * 9 + q];
      rho += value;
      ux += value * this.directions[q][0];
      uy += value * this.directions[q][1];
    }
    const safeDensity = Math.max(rho, 1e-8);
    return { rho: safeDensity, ux: ux / safeDensity, uy: uy / safeDensity };
  }

  private equilibrium(q: number, rho: number, ux: number, uy: number): number {
    const dot = this.directions[q][0] * ux + this.directions[q][1] * uy;
    const speed2 = ux * ux + uy * uy;
    return this.weights[q] * rho * (1 + 3 * dot + 4.5 * dot * dot - 1.5 * speed2);
  }

  private cell(x: number, y: number): number {
    return y * this.width + x;
  }
}
