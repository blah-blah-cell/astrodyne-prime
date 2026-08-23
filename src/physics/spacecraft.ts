import {
  CelestialBodyInfo,
  KeplerianElements,
  ManeuverNode,
  RocketStage,
  SASMode,
  SpacecraftTelemetry,
  TrajectoryPoint
} from './types';

export interface PlumeParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export class Spacecraft {
  public name = 'ASTRA-1 ORBITER';
  public active = true;

  // State Vectors (3D)
  public position: [number, number, number] = [0, 0, 0];
  public velocity: [number, number, number] = [0, 0, 0];
  public acceleration: [number, number, number] = [0, 0, 0];

  // 3D Attitude Vectors (Orthogonal unit frame)
  public forward: [number, number, number] = [0, 1, 0]; // Nose direction
  public up: [number, number, number] = [0, 0, 1];
  public right: [number, number, number] = [1, 0, 0];

  // Angular Dynamics
  public angularVelocity: [number, number, number] = [0, 0, 0]; // Pitch, Yaw, Roll rates

  // Throttle & Controls
  public throttle = 0.0; // 0.0 to 1.0
  public rcsTranslation: [number, number, number] = [0, 0, 0];
  public rcsTorque: [number, number, number] = [0, 0, 0];
  public sasMode: SASMode = SASMode.MANUAL;

  // Multi-Stage Configuration
  public stages: RocketStage[] = [];
  public currentStageIndex = 0;

  // Maneuver Nodes
  public maneuverNodes: ManeuverNode[] = [];
  public activeManeuverNode: ManeuverNode | null = null;

  // Guidance & Launch Program
  public isLaunchPad = false;
  public launchPadPlanetRadius = 50.0;
  public launchPadLocation: [number, number, number] = [0, 50, 0];
  public autoGravityTurn = false;
  public gravityTurnStartAlt = 4.0;
  public gravityTurnEndAlt = 80.0;

  // Environment & Dynamics Metrics
  public primaryBodyIndex = 0;
  public primaryBodyName = 'Earth';
  public primaryBodyMass = 10000.0;
  public primaryBodyRadius = 50.0;
  public primaryBodyPos: [number, number, number] = [0, 0, 0];
  public primaryBodyVel: [number, number, number] = [0, 0, 0];

  public hasAtmosphere = false;
  public atmosphereHeight = 60.0;
  public atmosphereDensity0 = 1.2;
  public atmosphereScaleHeight = 8.0;

  // Dynamic Telemetry
  public dynamicPressure = 0; // Max-Q
  public maxQ = 0;
  public reentryHeat = 0;
  public currentGForce = 1.0;
  public currentThrustKN = 0;
  public deltaVRemaining = 0;

  // Orbital Elements
  public keplerian: KeplerianElements = {
    semiMajorAxis: 0,
    eccentricity: 0,
    inclination: 0,
    raan: 0,
    argOfPeriapsis: 0,
    trueAnomaly: 0,
    orbitalPeriod: 0,
    apoapsis: 0,
    periapsis: 0,
    specificEnergy: 0,
    specificAngularMomentum: 0,
    eccentricityVector: [0, 0, 0],
    angularMomentumVector: [0, 0, 0],
    primaryBodyIndex: 0,
    primaryBodyMass: 10000,
    primaryBodyName: 'Central'
  };

  public trajectoryPoints: TrajectoryPoint[] = [];

  // Visual Exhaust Plume Particles
  public plumeParticles: PlumeParticle[] = [];
  private readonly maxPlumeParticles = 300;

  constructor() {
    this.initDefaultRocket();
  }

  public initDefaultRocket(): void {
    this.stages = [
      {
        id: 1,
        name: 'Stage 1 (Booster)',
        dryMass: 25.0,
        fuelMass: 180.0,
        maxFuelMass: 180.0,
        maxThrust: 850.0,
        isp: 310.0,
        burnRate: 1.2,
        ignited: true,
        separated: false
      },
      {
        id: 2,
        name: 'Stage 2 (Orbital Insertion)',
        dryMass: 8.0,
        fuelMass: 45.0,
        maxFuelMass: 45.0,
        maxThrust: 160.0,
        isp: 360.0,
        burnRate: 0.35,
        ignited: false,
        separated: false
      },
      {
        id: 3,
        name: 'Stage 3 (Payload / Interplanetary)',
        dryMass: 3.5,
        fuelMass: 15.0,
        maxFuelMass: 15.0,
        maxThrust: 40.0,
        isp: 390.0,
        burnRate: 0.08,
        ignited: false,
        separated: false
      }
    ];
    this.currentStageIndex = 0;
    this.calculateDeltaV();
  }

  public getTotalMass(): number {
    let mass = 0;
    for (let i = this.currentStageIndex; i < this.stages.length; i++) {
      const s = this.stages[i];
      mass += s.dryMass + s.fuelMass;
    }
    return Math.max(mass, 0.1);
  }

  public getDryMass(): number {
    let mass = 0;
    for (let i = this.currentStageIndex; i < this.stages.length; i++) {
      mass += this.stages[i].dryMass;
    }
    return Math.max(mass, 0.1);
  }

  public getFuelMass(): number {
    let fuel = 0;
    for (let i = this.currentStageIndex; i < this.stages.length; i++) {
      fuel += this.stages[i].fuelMass;
    }
    return fuel;
  }

  public getMaxFuelMass(): number {
    let maxFuel = 0;
    for (let i = this.currentStageIndex; i < this.stages.length; i++) {
      maxFuel += this.stages[i].maxFuelMass;
    }
    return Math.max(maxFuel, 1.0);
  }

  public getCurrentStage(): RocketStage | null {
    if (this.currentStageIndex < this.stages.length) {
      return this.stages[this.currentStageIndex];
    }
    return null;
  }

  public separateStage(): boolean {
    if (this.currentStageIndex < this.stages.length - 1) {
      this.stages[this.currentStageIndex].separated = true;
      this.currentStageIndex++;
      this.stages[this.currentStageIndex].ignited = true;
      this.calculateDeltaV();

      // Spawn staging separation blast particles
      for (let k = 0; k < 30; k++) {
        const spreadX = (Math.random() - 0.5) * 4.0;
        const spreadY = (Math.random() - 0.5) * 4.0;
        const spreadZ = (Math.random() - 0.5) * 4.0;
        this.plumeParticles.push({
          x: this.position[0],
          y: this.position[1],
          z: this.position[2],
          vx: this.velocity[0] - this.forward[0] * 3.0 + spreadX,
          vy: this.velocity[1] - this.forward[1] * 3.0 + spreadY,
          vz: this.velocity[2] - this.forward[2] * 3.0 + spreadZ,
          life: 0.8 + Math.random() * 0.4,
          maxLife: 1.2,
          size: 2.5 + Math.random() * 2.0,
          r: 1.0,
          g: 0.7,
          b: 0.3,
          alpha: 1.0
        });
      }
      return true;
    }
    return false;
  }

  public calculateDeltaV(): number {
    let totalDV = 0;
    const g0 = 9.80665;
    let runningMass = this.getTotalMass();

    for (let i = this.currentStageIndex; i < this.stages.length; i++) {
      const s = this.stages[i];
      if (s.fuelMass > 0) {
        const stageInitial = runningMass;
        const stageFinal = stageInitial - s.fuelMass;
        if (stageFinal > 0) {
          const stageDV = s.isp * g0 * Math.log(stageInitial / stageFinal) * 0.1; // scaled for sim units
          totalDV += stageDV;
        }
        runningMass -= (s.dryMass + s.fuelMass);
      }
    }
    this.deltaVRemaining = totalDV;
    return totalDV;
  }

  // Set flight computer SAS direction
  public setSASMode(mode: SASMode): void {
    this.sasMode = mode;
  }

  // Arm or add maneuver node
  public addManeuverNode(
    timeToNode: number,
    prograde: number,
    normal = 0,
    radial = 0,
    desc = 'Orbital Maneuver'
  ): ManeuverNode {
    const totalDV = Math.sqrt(prograde * prograde + normal * normal + radial * radial);
    const stage = this.getCurrentStage();
    const mass = this.getTotalMass();
    const thrust = stage ? stage.maxThrust : 100;
    const duration = thrust > 0 ? (totalDV * mass) / (thrust * 0.1) : 5.0;

    const node: ManeuverNode = {
      id: `node-${Date.now()}`,
      timeToNode,
      deltaVPrograde: prograde,
      deltaVNormal: normal,
      deltaVRadial: radial,
      totalDeltaV: totalDV,
      duration: Math.max(duration, 0.5),
      armed: true,
      executed: false,
      description: desc
    };

    this.maneuverNodes.push(node);
    this.activeManeuverNode = node;
    return node;
  }

  public executeActiveManeuver(): void {
    if (!this.activeManeuverNode) return;
    this.sasMode = SASMode.MANEUVER;
    this.throttle = 1.0;
  }

  // Physics Integration Step (Called every frame/substep)
  public update(
    dt: number,
    gravityAccel: [number, number, number],
    celestialBodies: CelestialBodyInfo[]
  ): void {
    if (!this.active) return;

    // Update primary parent celestial body
    this.updatePrimaryBody(celestialBodies);

    // Launch Pad status
    if (this.isLaunchPad) {
      if (this.throttle > 0.01) {
        this.isLaunchPad = false; // Liftoff!
      } else {
        // Sit stationary on rotating body surface
        this.position = [...this.launchPadLocation];
        this.velocity = [0, 0, 0];
        this.acceleration = [0, 0, 0];
        this.currentGForce = 1.0;
        this.updateKeplerianElements();
        return;
      }
    }

    const totalMass = this.getTotalMass();
    const stage = this.getCurrentStage();

    // 1. Propulsion & Fuel Consumption
    let thrustForce = 0;
    this.currentThrustKN = 0;

    if (stage && stage.fuelMass > 0 && this.throttle > 0) {
      const burn = stage.burnRate * this.throttle * dt;
      const actualBurn = Math.min(stage.fuelMass, burn);
      stage.fuelMass -= actualBurn;

      const effectiveThrottle = burn > 0 ? (actualBurn / burn) * this.throttle : 0;
      thrustForce = stage.maxThrust * effectiveThrottle;
      this.currentThrustKN = thrustForce;

      if (stage.fuelMass <= 0) {
        stage.fuelMass = 0;
      }
      this.calculateDeltaV();

      // Emit rocket exhaust particles
      this.spawnPlumeParticles(effectiveThrottle);
    }

    // 2. SAS Guidance & Attitude Alignment
    this.updateAttitudeGuidance(dt);

    // 3. Aerodynamic Drag & Atmospheric Physics
    const dragAccel: [number, number, number] = [0, 0, 0];
    this.updateAtmosphericDrag(dragAccel);

    // 4. Net Acceleration = Gravity + Thrust + Drag + RCS
    const thrustAccel: [number, number, number] = [
      (this.forward[0] * thrustForce) / totalMass,
      (this.forward[1] * thrustForce) / totalMass,
      (this.forward[2] * thrustForce) / totalMass
    ];

    const rcsForceMag = 15.0;
    const rcsAccel: [number, number, number] = [
      (this.right[0] * this.rcsTranslation[0] + this.up[0] * this.rcsTranslation[1] + this.forward[0] * this.rcsTranslation[2]) * (rcsForceMag / totalMass),
      (this.right[1] * this.rcsTranslation[0] + this.up[1] * this.rcsTranslation[1] + this.forward[1] * this.rcsTranslation[2]) * (rcsForceMag / totalMass),
      (this.right[2] * this.rcsTranslation[0] + this.up[2] * this.rcsTranslation[1] + this.forward[2] * this.rcsTranslation[2]) * (rcsForceMag / totalMass)
    ];

    this.acceleration = [
      gravityAccel[0] + thrustAccel[0] + dragAccel[0] + rcsAccel[0],
      gravityAccel[1] + thrustAccel[1] + dragAccel[1] + rcsAccel[1],
      gravityAccel[2] + thrustAccel[2] + dragAccel[2] + rcsAccel[2]
    ];

    // G-Force (felt acceleration magnitude, excluding pure gravity in free-fall)
    const feltAccel = Math.hypot(
      thrustAccel[0] + dragAccel[0] + rcsAccel[0],
      thrustAccel[1] + dragAccel[1] + rcsAccel[1],
      thrustAccel[2] + dragAccel[2] + rcsAccel[2]
    );
    this.currentGForce = feltAccel / 9.80665 + 1.0;

    // 5. Integrate Velocity and Position (Symplectic Verlet step)
    this.velocity[0] += this.acceleration[0] * dt;
    this.velocity[1] += this.acceleration[1] * dt;
    this.velocity[2] += this.acceleration[2] * dt;

    this.position[0] += this.velocity[0] * dt;
    this.position[1] += this.velocity[1] * dt;
    this.position[2] += this.velocity[2] * dt;

    // 6. Maneuver Node Countdown & Auto-execution
    this.updateManeuverNodes(dt);

    // 7. Update Keplerian Orbital Elements & Trajectory Predictor Spline
    this.updateKeplerianElements();

    // 8. Update Visual Plume Particles
    this.updatePlumeParticles(dt);
  }

  private updatePrimaryBody(celestialBodies: CelestialBodyInfo[]): void {
    if (!celestialBodies || celestialBodies.length === 0) return;

    let dominantIdx = 0;
    let maxDominance = -1;

    for (let i = 0; i < celestialBodies.length; i++) {
      const b = celestialBodies[i];
      const dx = this.position[0] - 0;
      const dy = this.position[1] - 0;
      const dz = this.position[2] - 0;
      const dist = Math.max(Math.hypot(dx, dy, dz), 1.0);
      const dominance = b.mass / (dist * dist);

      if (dominance > maxDominance) {
        maxDominance = dominance;
        dominantIdx = i;
      }
    }

    const domBody = celestialBodies[dominantIdx];
    if (domBody) {
      this.primaryBodyIndex = dominantIdx;
      this.primaryBodyName = domBody.name;
      this.primaryBodyMass = domBody.mass;
      this.primaryBodyRadius = domBody.radius;
      this.hasAtmosphere = !!domBody.hasAtmosphere;
      this.atmosphereHeight = domBody.atmosphereHeight || 60.0;
      this.atmosphereDensity0 = domBody.atmosphereDensity0 || 1.2;
    }
  }

  private updateAtmosphericDrag(outDragAccel: [number, number, number]): void {
    const rx = this.position[0] - this.primaryBodyPos[0];
    const ry = this.position[1] - this.primaryBodyPos[1];
    const rz = this.position[2] - this.primaryBodyPos[2];
    const r = Math.hypot(rx, ry, rz);
    const altitude = r - this.primaryBodyRadius;

    if (!this.hasAtmosphere || altitude > this.atmosphereHeight || altitude < 0) {
      this.dynamicPressure = 0;
      this.reentryHeat = 0;
      return;
    }

    // Barometric exponential density model: rho(h) = rho_0 * exp(-h / H_s)
    const rho = this.atmosphereDensity0 * Math.exp(-Math.max(altitude, 0) / this.atmosphereScaleHeight);
    const vx = this.velocity[0] - this.primaryBodyVel[0];
    const vy = this.velocity[1] - this.primaryBodyVel[1];
    const vz = this.velocity[2] - this.primaryBodyVel[2];
    const speed = Math.hypot(vx, vy, vz);

    if (speed < 1e-4) return;

    // Dynamic pressure Q = 0.5 * rho * v^2
    const Q = 0.5 * rho * speed * speed;
    this.dynamicPressure = Q;
    if (Q > this.maxQ) this.maxQ = Q;

    // Aerodynamic Drag: F_drag = -0.5 * rho * v^2 * Cd * A * v_hat
    const Cd = 0.45;
    const A = 1.8;
    const dragForceMag = Q * Cd * A * 0.05;
    const totalMass = this.getTotalMass();

    outDragAccel[0] = -(vx / speed) * (dragForceMag / totalMass);
    outDragAccel[1] = -(vy / speed) * (dragForceMag / totalMass);
    outDragAccel[2] = -(vz / speed) * (dragForceMag / totalMass);

    // Reentry heating index
    this.reentryHeat = Math.min(1.0, (rho * speed * speed * speed * 0.00008));
  }

  private updateAttitudeGuidance(dt: number): void {
    // Manual manual torque inputs
    const torqueRate = 2.5;
    let targetPitchRate = this.rcsTorque[0] * torqueRate;
    let targetYawRate = this.rcsTorque[1] * torqueRate;
    let targetRollRate = this.rcsTorque[2] * torqueRate;

    // Automatic SAS Guidance
    if (this.sasMode !== SASMode.MANUAL) {
      let desiredVector: [number, number, number] | null = null;

      const vx = this.velocity[0] - this.primaryBodyVel[0];
      const vy = this.velocity[1] - this.primaryBodyVel[1];
      const vz = this.velocity[2] - this.primaryBodyVel[2];
      const speed = Math.hypot(vx, vy, vz);

      const rx = this.position[0] - this.primaryBodyPos[0];
      const ry = this.position[1] - this.primaryBodyPos[1];
      const rz = this.position[2] - this.primaryBodyPos[2];
      const r = Math.hypot(rx, ry, rz);

      // Orbital angular momentum vector h = r x v
      const hx = ry * vz - rz * vy;
      const hy = rz * vx - rx * vz;
      const hz = rx * vy - ry * vx;
      const hMag = Math.hypot(hx, hy, hz);

      switch (this.sasMode) {
        case SASMode.PROGRADE:
          if (speed > 1e-3) desiredVector = [vx / speed, vy / speed, vz / speed];
          break;
        case SASMode.RETROGRADE:
          if (speed > 1e-3) desiredVector = [-vx / speed, -vy / speed, -vz / speed];
          break;
        case SASMode.NORMAL:
          if (hMag > 1e-3) desiredVector = [hx / hMag, hy / hMag, hz / hMag];
          break;
        case SASMode.ANTI_NORMAL:
          if (hMag > 1e-3) desiredVector = [-hx / hMag, -hy / hMag, -hz / hMag];
          break;
        case SASMode.RADIAL_OUT:
          if (r > 1e-3) desiredVector = [rx / r, ry / r, rz / r];
          break;
        case SASMode.RADIAL_IN:
          if (r > 1e-3) desiredVector = [-rx / r, -ry / r, -rz / r];
          break;
        case SASMode.MANEUVER:
          if (this.activeManeuverNode && speed > 1e-3 && hMag > 1e-3) {
            const vHat = [vx / speed, vy / speed, vz / speed];
            const nHat = [hx / hMag, hy / hMag, hz / hMag];
            const rHat = [
              nHat[1] * vHat[2] - nHat[2] * vHat[1],
              nHat[2] * vHat[0] - nHat[0] * vHat[2],
              nHat[0] * vHat[1] - nHat[1] * vHat[0]
            ];
            const mvX = vHat[0] * this.activeManeuverNode.deltaVPrograde + nHat[0] * this.activeManeuverNode.deltaVNormal + rHat[0] * this.activeManeuverNode.deltaVRadial;
            const mvY = vHat[1] * this.activeManeuverNode.deltaVPrograde + nHat[1] * this.activeManeuverNode.deltaVNormal + rHat[1] * this.activeManeuverNode.deltaVRadial;
            const mvZ = vHat[2] * this.activeManeuverNode.deltaVPrograde + nHat[2] * this.activeManeuverNode.deltaVNormal + rHat[2] * this.activeManeuverNode.deltaVRadial;
            const mvMag = Math.hypot(mvX, mvY, mvZ);
            if (mvMag > 1e-3) desiredVector = [mvX / mvMag, mvY / mvMag, mvZ / mvMag];
          }
          break;
        case SASMode.KILL_ROT:
          targetPitchRate = -this.angularVelocity[0] * 4.0;
          targetYawRate = -this.angularVelocity[1] * 4.0;
          targetRollRate = -this.angularVelocity[2] * 4.0;
          break;
      }

      // Smooth PD steering towards desired vector
      if (desiredVector) {
        const errX = this.forward[1] * desiredVector[2] - this.forward[2] * desiredVector[1];
        const errY = this.forward[2] * desiredVector[0] - this.forward[0] * desiredVector[2];
        const errZ = this.forward[0] * desiredVector[1] - this.forward[1] * desiredVector[0];

        const kP = 5.5;
        const kD = 3.0;

        const pitchErr = errX * this.right[0] + errY * this.right[1] + errZ * this.right[2];
        const yawErr = errX * this.up[0] + errY * this.up[1] + errZ * this.up[2];

        targetPitchRate = pitchErr * kP - this.angularVelocity[0] * kD;
        targetYawRate = yawErr * kP - this.angularVelocity[1] * kD;
      }
    }

    this.angularVelocity[0] += (targetPitchRate - this.angularVelocity[0]) * Math.min(dt * 8.0, 1.0);
    this.angularVelocity[1] += (targetYawRate - this.angularVelocity[1]) * Math.min(dt * 8.0, 1.0);
    this.angularVelocity[2] += (targetRollRate - this.angularVelocity[2]) * Math.min(dt * 8.0, 1.0);

    const pitchDelta = this.angularVelocity[0] * dt;
    const yawDelta = this.angularVelocity[1] * dt;
    const rollDelta = this.angularVelocity[2] * dt;

    if (Math.abs(pitchDelta) > 1e-6 || Math.abs(yawDelta) > 1e-6 || Math.abs(rollDelta) > 1e-6) {
      this.rotateFrame(pitchDelta, yawDelta, rollDelta);
    }
  }

  private rotateFrame(pitch: number, yaw: number, roll: number): void {
    if (Math.abs(pitch) > 1e-6) {
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const newFwd: [number, number, number] = [
        this.forward[0] * cosP + this.up[0] * sinP,
        this.forward[1] * cosP + this.up[1] * sinP,
        this.forward[2] * cosP + this.up[2] * sinP
      ];
      const newUp: [number, number, number] = [
        -this.forward[0] * sinP + this.up[0] * cosP,
        -this.forward[1] * sinP + this.up[1] * cosP,
        -this.forward[2] * sinP + this.up[2] * cosP
      ];
      this.forward = this.normalize(newFwd);
      this.up = this.normalize(newUp);
    }

    if (Math.abs(yaw) > 1e-6) {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const newFwd: [number, number, number] = [
        this.forward[0] * cosY - this.right[0] * sinY,
        this.forward[1] * cosY - this.right[1] * sinY,
        this.forward[2] * cosY - this.right[2] * sinY
      ];
      const newRight: [number, number, number] = [
        this.forward[0] * sinY + this.right[0] * cosY,
        this.forward[1] * sinY + this.right[1] * cosY,
        this.forward[2] * sinY + this.right[2] * cosY
      ];
      this.forward = this.normalize(newFwd);
      this.right = this.normalize(newRight);
    }

    if (Math.abs(roll) > 1e-6) {
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);
      const newRight: [number, number, number] = [
        this.right[0] * cosR + this.up[0] * sinR,
        this.right[1] * cosR + this.up[1] * sinR,
        this.right[2] * cosR + this.up[2] * sinR
      ];
      const newUp: [number, number, number] = [
        -this.right[0] * sinR + this.up[0] * cosR,
        -this.right[1] * sinR + this.up[1] * cosR,
        -this.right[2] * sinR + this.up[2] * cosR
      ];
      this.right = this.normalize(newRight);
      this.up = this.normalize(newUp);
    }
  }

  private normalize(v: [number, number, number]): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len === 0) return [0, 1, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  private updateManeuverNodes(dt: number): void {
    if (!this.activeManeuverNode || this.activeManeuverNode.executed) return;

    this.activeManeuverNode.timeToNode -= dt;
    if (this.activeManeuverNode.armed && this.activeManeuverNode.timeToNode <= 0) {
      this.activeManeuverNode.duration -= dt;
      this.throttle = 1.0;
      this.sasMode = SASMode.MANEUVER;

      if (this.activeManeuverNode.duration <= 0) {
        this.throttle = 0.0;
        this.activeManeuverNode.executed = true;
        this.activeManeuverNode = null;
        this.sasMode = SASMode.PROGRADE;
      }
    }
  }

  // Analytical Keplerian Elements calculation
  public updateKeplerianElements(): void {
    const G = 1.0;
    const mu = G * this.primaryBodyMass;

    const rx = this.position[0] - this.primaryBodyPos[0];
    const ry = this.position[1] - this.primaryBodyPos[1];
    const rz = this.position[2] - this.primaryBodyPos[2];
    const r = Math.max(Math.hypot(rx, ry, rz), 1e-4);

    const vx = this.velocity[0] - this.primaryBodyVel[0];
    const vy = this.velocity[1] - this.primaryBodyVel[1];
    const vz = this.velocity[2] - this.primaryBodyVel[2];
    const v2 = vx * vx + vy * vy + vz * vz;

    // Specific orbital energy epsilon = v^2/2 - mu/r
    const specificEnergy = v2 * 0.5 - mu / r;

    // Semi-major axis a = -mu / (2 * epsilon)
    const a = Math.abs(specificEnergy) > 1e-6 ? -mu / (2.0 * specificEnergy) : 1e6;

    // Angular momentum h = r x v
    const hx = ry * vz - rz * vy;
    const hy = rz * vx - rx * vz;
    const hz = rx * vy - ry * vx;
    const h2 = hx * hx + hy * hy + hz * hz;
    const h = Math.sqrt(h2);

    // Eccentricity vector e = ((v^2 - mu/r)*r - (r.v)*v) / mu
    const rdotv = rx * vx + ry * vy + rz * vz;
    const ex = ((v2 - mu / r) * rx - rdotv * vx) / mu;
    const ey = ((v2 - mu / r) * ry - rdotv * vy) / mu;
    const ez = ((v2 - mu / r) * rz - rdotv * vz) / mu;
    const e = Math.hypot(ex, ey, ez);

    // Inclination i = acos(hz / h)
    const inclination = h > 1e-6 ? Math.acos(Math.max(-1, Math.min(1, hz / h))) : 0;

    // Line of nodes n = (-hy, hx, 0)
    const nx = -hy;
    const ny = hx;
    const nMag = Math.hypot(nx, ny);

    let raan = 0;
    if (nMag > 1e-6) {
      raan = Math.acos(Math.max(-1, Math.min(1, nx / nMag)));
      if (ny < 0) raan = 2 * Math.PI - raan;
    }

    let argOfPeriapsis = 0;
    if (nMag > 1e-6 && e > 1e-6) {
      const ndote = nx * ex + ny * ey;
      argOfPeriapsis = Math.acos(Math.max(-1, Math.min(1, ndote / (nMag * e))));
      if (ez < 0) argOfPeriapsis = 2 * Math.PI - argOfPeriapsis;
    }

    let trueAnomaly = 0;
    if (e > 1e-6) {
      const edotr = ex * rx + ey * ry + ez * rz;
      trueAnomaly = Math.acos(Math.max(-1, Math.min(1, edotr / (e * r))));
      if (rdotv < 0) trueAnomaly = 2 * Math.PI - trueAnomaly;
    }

    const periapsis = a > 0 ? a * (1 - e) : (h2 / mu) / (1 + e);
    const apoapsis = e < 1.0 && a > 0 ? a * (1 + e) : Infinity;
    const period = e < 1.0 && a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;

    this.keplerian = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination,
      raan,
      argOfPeriapsis,
      trueAnomaly,
      orbitalPeriod: period,
      apoapsis,
      periapsis,
      specificEnergy,
      specificAngularMomentum: h,
      eccentricityVector: [ex, ey, ez],
      angularMomentumVector: [hx, hy, hz],
      primaryBodyIndex: this.primaryBodyIndex,
      primaryBodyMass: this.primaryBodyMass,
      primaryBodyName: this.primaryBodyName
    };

    this.generateTrajectorySpline(e, inclination, raan, argOfPeriapsis, h, mu);
  }

  private generateTrajectorySpline(
    e: number,
    inc: number,
    raan: number,
    omega: number,
    h: number,
    mu: number
  ): void {
    const points: TrajectoryPoint[] = [];
    const numSamples = 128;

    const p = (h * h) / mu;

    const cosO = Math.cos(raan);
    const sinO = Math.sin(raan);
    const cosw = Math.cos(omega);
    const sinw = Math.sin(omega);
    const cosi = Math.cos(inc);
    const sini = Math.sin(inc);

    const Px = cosO * cosw - sinO * sinw * cosi;
    const Py = sinO * cosw + cosO * sinw * cosi;
    const Pz = sinw * sini;

    const Qx = -cosO * sinw - sinO * cosw * cosi;
    const Qy = -sinO * sinw + cosO * cosw * cosi;
    const Qz = cosw * sini;

    if (e < 1.0) {
      for (let i = 0; i < numSamples; i++) {
        const nu = (i / numSamples) * 2 * Math.PI;
        const r = p / (1.0 + e * Math.cos(nu));
        const xOrb = r * Math.cos(nu);
        const yOrb = r * Math.sin(nu);

        const x = this.primaryBodyPos[0] + (Px * xOrb + Qx * yOrb);
        const y = this.primaryBodyPos[1] + (Py * xOrb + Qy * yOrb);
        const z = this.primaryBodyPos[2] + (Pz * xOrb + Qz * yOrb);

        points.push({ x, y, z });
      }
    } else {
      const nuMax = Math.min(Math.acos(-1.0 / e) - 0.08, Math.PI * 0.85);
      for (let i = 0; i < numSamples; i++) {
        const t = (i / (numSamples - 1)) * 2 - 1;
        const nu = t * nuMax;
        const r = p / (1.0 + e * Math.cos(nu));
        const xOrb = r * Math.cos(nu);
        const yOrb = r * Math.sin(nu);

        const x = this.primaryBodyPos[0] + (Px * xOrb + Qx * yOrb);
        const y = this.primaryBodyPos[1] + (Py * xOrb + Qy * yOrb);
        const z = this.primaryBodyPos[2] + (Pz * xOrb + Qz * yOrb);

        points.push({ x, y, z });
      }
    }

    this.trajectoryPoints = points;
  }

  // Visual Exhaust Plume Generation
  private spawnPlumeParticles(throttleFrac: number): void {
    const count = Math.ceil(throttleFrac * 4);
    for (let k = 0; k < count; k++) {
      if (this.plumeParticles.length >= this.maxPlumeParticles) {
        this.plumeParticles.shift();
      }

      const nozzleOffset = -2.0;
      const nozzleX = this.position[0] + this.forward[0] * nozzleOffset;
      const nozzleY = this.position[1] + this.forward[1] * nozzleOffset;
      const nozzleZ = this.position[2] + this.forward[2] * nozzleOffset;

      const plumeSpeed = 45.0 + Math.random() * 25.0;
      const spread = (Math.random() - 0.5) * 4.0;

      const vx = this.velocity[0] - this.forward[0] * plumeSpeed + (this.right[0] + this.up[0]) * spread;
      const vy = this.velocity[1] - this.forward[1] * plumeSpeed + (this.right[1] + this.up[1]) * spread;
      const vz = this.velocity[2] - this.forward[2] * plumeSpeed + (this.right[2] + this.up[2]) * spread;

      this.plumeParticles.push({
        x: nozzleX,
        y: nozzleY,
        z: nozzleZ,
        vx,
        vy,
        vz,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        size: 1.8 + Math.random() * 1.5,
        r: 1.0,
        g: 0.55 + Math.random() * 0.4,
        b: 0.15,
        alpha: 1.0
      });
    }
  }

  private updatePlumeParticles(dt: number): void {
    for (let i = this.plumeParticles.length - 1; i >= 0; i--) {
      const p = this.plumeParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.plumeParticles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += dt * 4.0;
      p.alpha = Math.max(p.life / p.maxLife, 0.0);
    }
  }

  public getTelemetry(): SpacecraftTelemetry {
    const stage = this.getCurrentStage();
    const altitude = Math.hypot(
      this.position[0] - this.primaryBodyPos[0],
      this.position[1] - this.primaryBodyPos[1],
      this.position[2] - this.primaryBodyPos[2]
    ) - this.primaryBodyRadius;

    const speed = Math.hypot(
      this.velocity[0] - this.primaryBodyVel[0],
      this.velocity[1] - this.primaryBodyVel[1],
      this.velocity[2] - this.primaryBodyVel[2]
    );

    const totalMass = this.getTotalMass();
    const dryMass = this.getDryMass();
    const fuelMass = this.getFuelMass();
    const maxFuel = this.getMaxFuelMass();
    const fuelPct = maxFuel > 0 ? (fuelMass / maxFuel) * 100 : 0;

    const g0 = 9.80665;
    const twr = totalMass > 0 ? this.currentThrustKN / (totalMass * g0 * 0.1) : 0;

    return {
      active: this.active,
      name: this.name,
      position: [...this.position],
      velocity: [...this.velocity],
      forward: [...this.forward],
      up: [...this.up],
      right: [...this.right],
      altitude: Math.max(altitude, 0),
      speed,
      apoapsis: this.keplerian.apoapsis - this.primaryBodyRadius,
      periapsis: this.keplerian.periapsis - this.primaryBodyRadius,
      period: this.keplerian.orbitalPeriod,
      eccentricity: this.keplerian.eccentricity,
      semiMajorAxis: this.keplerian.semiMajorAxis,
      inclination: (this.keplerian.inclination * 180) / Math.PI,
      currentStageIndex: this.currentStageIndex,
      totalStages: this.stages.length,
      currentStage: stage,
      totalMass,
      dryMass,
      fuelMass,
      fuelPercent: fuelPct,
      deltaVRemaining: this.deltaVRemaining,
      thrustKN: this.currentThrustKN,
      throttle: this.throttle,
      twr,
      isp: stage ? stage.isp : 0,
      gForce: this.currentGForce,
      dynamicPressure: this.dynamicPressure,
      maxQ: this.maxQ,
      atmosphereDensity: this.hasAtmosphere ? this.atmosphereDensity0 * Math.exp(-Math.max(altitude, 0) / this.atmosphereScaleHeight) : 0,
      reentryHeat: this.reentryHeat,
      sasMode: this.sasMode,
      primaryBodyName: this.primaryBodyName,
      activeManeuverNode: this.activeManeuverNode
    };
  }
}
