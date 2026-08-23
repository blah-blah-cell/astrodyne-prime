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
  DEBRIS = 5,
  SPACECRAFT = 6,
  EXHAUST_PLUME = 7,
  PLANET = 8,
  MOON = 9
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
  ELECTRIC_CYAN = 'electric',
  SPACEFLIGHT_TELEMETRY = 'spaceflight'
}

export enum MouseTool {
  ORBIT_CAMERA = 'orbit',
  GRAVITY_WELL = 'attractor',
  REPULSOR = 'repulsor',
  BLACK_HOLE_SPAWN = 'black_hole',
  ORBITAL_STREAM = 'stream',
  PARTICLE_BRUSH = 'brush'
}

export enum SASMode {
  MANUAL = 'manual',
  PROGRADE = 'prograde',
  RETROGRADE = 'retrograde',
  NORMAL = 'normal',
  ANTI_NORMAL = 'anti_normal',
  RADIAL_IN = 'radial_in',
  RADIAL_OUT = 'radial_out',
  TARGET = 'target',
  MANEUVER = 'maneuver',
  KILL_ROT = 'kill_rot'
}

export enum CameraViewMode {
  ORBIT = 'orbit',
  CHASE_SPACECRAFT = 'chase',
  COCKPIT_POV = 'cockpit',
  TRACK_BODY = 'track'
}

export interface RocketStage {
  id: number;
  name: string;
  dryMass: number; // in kg (or simulation mass units)
  fuelMass: number;
  maxFuelMass: number;
  maxThrust: number; // in kN (or simulation force units)
  isp: number; // specific impulse in seconds
  burnRate: number; // fuel mass consumed per sec at 100% throttle
  ignited: boolean;
  separated: boolean;
}

export interface ManeuverNode {
  id: string;
  timeToNode: number; // seconds until scheduled burn
  deltaVPrograde: number;
  deltaVNormal: number;
  deltaVRadial: number;
  totalDeltaV: number;
  duration: number;
  armed: boolean;
  executed: boolean;
  description: string;
}

export interface KeplerianElements {
  semiMajorAxis: number; // a
  eccentricity: number; // e
  inclination: number; // i (rad)
  raan: number; // Longitude of ascending node Ω (rad)
  argOfPeriapsis: number; // Argument of periapsis ω (rad)
  trueAnomaly: number; // ν (rad)
  orbitalPeriod: number; // T (sec)
  apoapsis: number; // r_a
  periapsis: number; // r_p
  specificEnergy: number; // ε = -μ / 2a
  specificAngularMomentum: number; // h = sqrt(μ p)
  eccentricityVector: [number, number, number];
  angularMomentumVector: [number, number, number];
  primaryBodyIndex: number;
  primaryBodyMass: number;
  primaryBodyName: string;
}

export interface SpacecraftTelemetry {
  active: boolean;
  name: string;
  position: [number, number, number];
  velocity: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
  right: [number, number, number];
  altitude: number;
  speed: number;
  apoapsis: number;
  periapsis: number;
  period: number;
  eccentricity: number;
  semiMajorAxis: number;
  inclination: number;
  currentStageIndex: number;
  totalStages: number;
  currentStage: RocketStage | null;
  totalMass: number;
  dryMass: number;
  fuelMass: number;
  fuelPercent: number;
  deltaVRemaining: number;
  thrustKN: number;
  throttle: number; // 0.0 to 1.0
  twr: number;
  isp: number;
  gForce: number;
  dynamicPressure: number; // Q = 0.5 * rho * v^2
  maxQ: number;
  atmosphereDensity: number;
  reentryHeat: number;
  sasMode: SASMode;
  primaryBodyName: string;
  activeManeuverNode: ManeuverNode | null;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  z: number;
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
  timeWarp: number; // 1x, 5x, 10x, 50x, 100x, 500x, 1000x, 10000x
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
  showOrbits: boolean;
  showGuidanceVectors: boolean;
  brightnessScale: number;
  cameraMode: CameraViewMode;
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

export interface CelestialBodyInfo {
  index: number;
  name: string;
  radius: number;
  mass: number;
  color: [number, number, number];
  hasAtmosphere?: boolean;
  atmosphereHeight?: number;
  atmosphereDensity0?: number;
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
  cameraMode?: CameraViewMode;
  hasSpacecraft?: boolean;
  bodies?: CelestialBodyInfo[];
  generate: (count: number) => {
    data: ParticleData;
    spacecraftInit?: {
      position: [number, number, number];
      velocity: [number, number, number];
      stages: RocketStage[];
      primaryBodyIndex: number;
      name?: string;
      isLaunchPad?: boolean;
    };
    trajectoryPredictorTargetIndex?: number;
  };
}

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature: number;
}

export interface AIManeuverAction {
  action: 'set_maneuver_node' | 'execute_burn' | 'set_sas_mode' | 'generate_scenario' | 'stage_separation';
  prograde?: number;
  normal?: number;
  radial?: number;
  timeToNode?: number;
  duration?: number;
  throttle?: number;
  mode?: SASMode;
  description?: string;
  scenarioName?: string;
  scenarioCode?: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  action?: AIManeuverAction;
}
