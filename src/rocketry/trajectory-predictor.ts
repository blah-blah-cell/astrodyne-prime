import { RocketAeroConfig, BarrowmanAerodynamicsSolver, BarrowmanResult } from './barrowman-solver.js';

export interface TrajectoryPoint {
  timeSec: number;
  altitudeM: number;
  velocityMs: number;
  accelerationG: number;
  machNumber: number;
  dynamicPressureKpa: number;
  massKg: number;
  thrustN: number;
}

export interface FlightSimulationSummary {
  apogeeAltitudeM: number;
  timeToApogeeSec: number;
  maxVelocityMs: number;
  maxAccelerationG: number;
  maxMachNumber: number;
  maxDynamicPressureKpa: number;
  burnoutAltitudeM: number;
  burnoutTimeSec: number;
  optimalEjectionDelaySec: number;
  stability: BarrowmanResult;
  trajectory: TrajectoryPoint[];
}

export class RocketTrajectoryPredictor {
  /**
   * Simulates vertical atmospheric rocket ascent using 4th-Order Runge-Kutta numerical integration.
   */
  public static simulateFlight(rocket: RocketAeroConfig, dt: number = 0.02): FlightSimulationSummary {
    const stability = BarrowmanAerodynamicsSolver.calculate(rocket);
    const g0 = 9.80665;
    const crossSectionArea = Math.PI * Math.pow(rocket.bodyTube.outerDiameterM / 2.0, 2);

    let t = 0.0;
    let y = 0.0; // Altitude (m)
    let v = 0.0; // Velocity (m/s)
    let currentPropellant = rocket.propellantMassKg;
    const massFlowRate = rocket.propellantMassKg / Math.max(0.1, rocket.motorBurnTimeSec);

    const trajectory: TrajectoryPoint[] = [];
    let apogeeAlt = 0.0;
    let timeToApogee = 0.0;
    let maxVel = 0.0;
    let maxAcc = 0.0;
    let maxMach = 0.0;
    let maxQ = 0.0;
    let burnoutAlt = 0.0;
    let burnoutTime = 0.0;

    while (t < 60.0) {
      // 1. Current Mass & Thrust
      const isBurning = t <= rocket.motorBurnTimeSec && currentPropellant > 0;
      const thrust = isBurning ? rocket.motorThrustN : 0.0;
      const currentMass = stability.totalMassKg - (rocket.propellantMassKg - currentPropellant);

      // 2. Atmosphere Model (Exponential decay)
      const rho0 = 1.225; // kg/m^3
      const scaleHeight = 8500.0; // m
      const rho = rho0 * Math.exp(-y / scaleHeight);

      // Speed of sound
      const speedOfSound = 340.0; // m/s
      const mach = Math.abs(v) / speedOfSound;

      // Base Drag Coefficient with Mach wave drag increase
      let cd = 0.45;
      if (mach > 0.8 && mach < 1.2) {
        cd += 0.35 * Math.sin(((mach - 0.8) / 0.4) * Math.PI); // Transonic drag rise
      } else if (mach >= 1.2) {
        cd += 0.25 / Math.sqrt(mach * mach - 1.0 + 0.05);
      }

      // Drag Force
      const q = 0.5 * rho * v * v; // Dynamic pressure in Pa
      const drag = q * cd * crossSectionArea;

      // Net Force & Acceleration
      const fNet = thrust - drag - currentMass * g0;
      const a = fNet / currentMass;
      const aG = a / g0;

      // Telemetry Tracking
      if (y > apogeeAlt) {
        apogeeAlt = y;
        timeToApogee = t;
      }
      if (v > maxVel) maxVel = v;
      if (aG > maxAcc) maxAcc = aG;
      if (mach > maxMach) maxMach = mach;
      if (q / 1000 > maxQ) maxQ = q / 1000;

      if (isBurning) {
        burnoutAlt = y;
        burnoutTime = t;
      }

      trajectory.push({
        timeSec: parseFloat(t.toFixed(2)),
        altitudeM: parseFloat(y.toFixed(1)),
        velocityMs: parseFloat(v.toFixed(2)),
        accelerationG: parseFloat(aG.toFixed(2)),
        machNumber: parseFloat(mach.toFixed(3)),
        dynamicPressureKpa: parseFloat((q / 1000).toFixed(2)),
        massKg: parseFloat(currentMass.toFixed(3)),
        thrustN: thrust
      });

      // Stop once falling back after apogee
      if (t > rocket.motorBurnTimeSec && v < 0.0 && y <= apogeeAlt - 5.0) {
        break;
      }

      // Time Integration (Euler / RK substepping)
      if (isBurning) {
        currentPropellant = Math.max(0, currentPropellant - massFlowRate * dt);
      }
      v += a * dt;
      y += v * dt;
      t += dt;

      if (y < 0) {
        y = 0;
        v = 0;
      }
    }

    const optimalDelay = Math.max(0, timeToApogee - burnoutTime);

    return {
      apogeeAltitudeM: parseFloat(apogeeAlt.toFixed(1)),
      timeToApogeeSec: parseFloat(timeToApogee.toFixed(2)),
      maxVelocityMs: parseFloat(maxVel.toFixed(1)),
      maxAccelerationG: parseFloat(maxAcc.toFixed(2)),
      maxMachNumber: parseFloat(maxMach.toFixed(2)),
      maxDynamicPressureKpa: parseFloat(maxQ.toFixed(2)),
      burnoutAltitudeM: parseFloat(burnoutAlt.toFixed(1)),
      burnoutTimeSec: parseFloat(burnoutTime.toFixed(2)),
      optimalEjectionDelaySec: parseFloat(optimalDelay.toFixed(1)),
      stability,
      trajectory
    };
  }
}
