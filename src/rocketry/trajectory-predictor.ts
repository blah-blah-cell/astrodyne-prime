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
    const crossSectionArea = rocket.cadReferenceAreaM2 ?? Math.PI * Math.pow(rocket.bodyTube.outerDiameterM / 2.0, 2);

    let t = 0.0;
    let y = 0.0; // Altitude (m)
    let v = 0.0; // Velocity (m/s)
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
    let liftedOff = false;

    const sampleDynamics = (time: number, altitude: number, velocity: number) => {
      const propellantRemaining = Math.max(0, rocket.propellantMassKg - massFlowRate * Math.min(time, rocket.motorBurnTimeSec));
      const mass = Math.max(0.001, stability.totalMassKg - (rocket.propellantMassKg - propellantRemaining));
      const burning = time < rocket.motorBurnTimeSec && propellantRemaining > 0;
      const thrust = burning ? rocket.motorThrustN : 0;
      const rho = 1.225 * Math.exp(-Math.max(0, altitude) / 8500);
      const speedOfSound = Math.max(295, 340.3 - 0.003 * Math.max(0, altitude));
      const mach = Math.abs(velocity) / speedOfSound;
      let cd = rocket.cadEstimatedCd ?? 0.45;
      if (mach > 0.8 && mach < 1.2) cd += 0.35 * Math.sin(((mach - 0.8) / 0.4) * Math.PI);
      else if (mach >= 1.2) cd += 0.25 / Math.sqrt(mach * mach - 1 + 0.05);
      const q = 0.5 * rho * velocity * velocity;
      const dragSigned = Math.sign(velocity) * q * cd * crossSectionArea;
      let acceleration = (thrust - mass * g0 - dragSigned) / mass;
      if (altitude <= 0 && velocity <= 0 && acceleration <= 0) acceleration = 0;
      return { acceleration, mass, thrust, mach, q, burning };
    };

    while (t < 60.0) {
      const dynamics = sampleDynamics(t, y, v);
      const { acceleration: a, mass: currentMass, thrust, mach, q, burning: isBurning } = dynamics;
      const aG = a / g0;
      if (y > 0.001 || v > 0.001) liftedOff = true;

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

      // Coupled fourth-order Runge-Kutta integration for altitude and velocity.
      const k1y = v;
      const k1v = a;
      const k2y = v + k1v * dt / 2;
      const k2v = sampleDynamics(t + dt / 2, y + k1y * dt / 2, v + k1v * dt / 2).acceleration;
      const k3y = v + k2v * dt / 2;
      const k3v = sampleDynamics(t + dt / 2, y + k2y * dt / 2, v + k2v * dt / 2).acceleration;
      const k4y = v + k3v * dt;
      const k4v = sampleDynamics(t + dt, y + k3y * dt, v + k3v * dt).acceleration;
      y += dt * (k1y + 2 * k2y + 2 * k3y + k4y) / 6;
      v += dt * (k1v + 2 * k2v + 2 * k3v + k4v) / 6;
      t += dt;

      if (y < 0) {
        y = 0;
        v = 0;
      }
      if (!liftedOff && t > rocket.motorBurnTimeSec + 0.5) break;
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
