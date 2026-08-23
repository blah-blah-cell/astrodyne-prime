export interface ParticleData {
  positions: Float32Array; // [x, y, z, mass] per particle
  velocities: Float32Array; // [vx, vy, vz, type] per particle
  accelerations: Float32Array; // [ax, ay, az, potential] per particle
  count: number;
}

export enum ParticleType {
  STAR = 0,
  DARK_MATTER = 1,
  GAS_DISC = 2,
  BLACK_HOLE = 3,
  TRACER_TROJAN = 4,
  DEBRIS = 5
}

export enum AlgorithmType {
  BARNES_HUT = 'barnes_hut',
  DIRECT_N2 = 'direct_n2'
}

export enum IntegratorType {
  VELOCITY_VERLET = 'velocity_verlet',
  YOSHIDA_4TH = 'yoshida_4th',
  LEAPFROG = 'leapfrog'
}

export enum ColorPalette {
  BLACKBODY_PLANCK = 'blackbody',
  COSMIC_NEBULA = 'cosmic',
  VELOCITY_HEATMAP = 'velocity',
  GRAVITATIONAL_POTENTIAL = 'potential',
  PARTICLE_TYPE = 'type',
  ELECTRIC_CYAN = 'electric'
}

export enum MouseTool {
  ORBIT_CAMERA = 'orbit',
  GRAVITY_WELL = 'attractor',
  REPULSOR = 'repulsor',
  BLACK_HOLE_SPAWN = 'black_hole',
  ORBITAL_STREAM = 'stream',
  PARTICLE_BRUSH = 'brush'
}

export interface SimulationParams {
  numParticles: number;
  timeStep: number; // dt
  substeps: number;
  gravityConstant: number; // G
  softening: number; // epsilon
  theta: number; // Barnes-Hut opening angle
  algorithm: AlgorithmType;
  integrator: IntegratorType;
  enableCollisions: boolean;
  collisionRadius: number;
  enableRelativisticPrecession: boolean;
  damping: number; // velocity damping / drag (0 = none)
  paused: boolean;
}

export interface RenderParams {
  pointSize: number;
  exposure: number;
  bloomIntensity: number;
  bloomThreshold: number;
  colorPalette: ColorPalette;
  trailPersistence: number;
  showGrid: boolean;
  showAxes: boolean;
  showBVHBounds: boolean;
  brightnessScale: number;
}

export interface TelemetryData {
  fps: number;
  frameTimeMs: number;
  computeTimeMs: number;
  renderTimeMs: number;
  treeBuildTimeMs: number;
  forceComputeTimeMs: number;
  gflops: number;
  activeParticles: number;
  totalMass: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  energyDrift: number; // (E - E0) / |E0|
  initialEnergy: number;
  angularMomentum: [number, number, number];
  angularMomentumMag: number;
  angularMomentumDrift: number; // (|L| - |L0|) / |L0|
  initialAngularMomentumMag: number;
  centerOfMass: [number, number, number];
}

export interface PresetConfig {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultParticles: number;
  recommendedTheta: number;
  defaultG: number;
  defaultDt: number;
  cameraDistance: number;
  generate: (count: number) => ParticleData;
}
