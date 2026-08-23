export interface DCMotorCurve {
  stallTorqueNm: number;
  freeSpeedRpm: number;
  voltageV: number;
}

export class DrivetrainPhysics {
  /**
   * Compute actual output torque of a DC motor at angular velocity w (rad/s)
   * T(w) = T_stall * (1 - w / w_free)
   */
  public static computeMotorTorque(motor: DCMotorCurve, currentAngularSpeedRadS: number, throttle: number = 1.0): number {
    const freeSpeedRadS = (motor.freeSpeedRpm * 2 * Math.PI) / 60;
    const clampedThrottle = Math.max(-1.0, Math.min(1.0, throttle));

    if (freeSpeedRadS <= 0) return 0;

    const normalizedSpeed = Math.abs(currentAngularSpeedRadS) / freeSpeedRadS;
    const availableTorque = Math.max(0, motor.stallTorqueNm * (1.0 - normalizedSpeed));

    return availableTorque * clampedThrottle;
  }

  /**
   * Compute mechanical advantage and output parameters through a Gear Pair
   * Gear ratio: i = N2 / N1 = w1 / w2 = T2 / (T1 * eta)
   */
  public static computeGearPair(
    driverTeeth: number,
    drivenTeeth: number,
    inputTorqueNm: number,
    inputSpeedRadS: number,
    efficiency: number = 0.96
  ): { gearRatio: number; outputTorqueNm: number; outputSpeedRadS: number; powerWatts: number } {
    if (driverTeeth <= 0 || drivenTeeth <= 0) {
      throw new Error('Gear teeth counts must be positive integers');
    }

    const gearRatio = drivenTeeth / driverTeeth;
    const outputSpeedRadS = inputSpeedRadS / gearRatio;
    const outputTorqueNm = inputTorqueNm * gearRatio * efficiency;
    const powerWatts = outputTorqueNm * outputSpeedRadS;

    return {
      gearRatio,
      outputTorqueNm,
      outputSpeedRadS,
      powerWatts
    };
  }

  /**
   * Distribute drive torque through an Open or Limited-Slip Differential
   * Open Differential: T_left = T_right = 0.5 * T_in
   * Kinematic constraint: w_left + w_right = 2 * (w_in / i_diff)
   */
  public static computeDifferentialSplit(
    inputTorqueNm: number,
    diffRatio: number,
    wheelSpeedLeftRadS: number,
    wheelSpeedRightRadS: number,
    isLimitedSlip: boolean = false,
    biasRatio: number = 3.0
  ): { torqueLeftNm: number; torqueRightNm: number; carrierSpeedRadS: number } {
    const carrierTorque = inputTorqueNm * diffRatio * 0.95;
    const carrierSpeedRadS = (wheelSpeedLeftRadS + wheelSpeedRightRadS) / 2.0;

    if (!isLimitedSlip) {
      // Open Differential (50/50 torque split)
      return {
        torqueLeftNm: carrierTorque * 0.5,
        torqueRightNm: carrierTorque * 0.5,
        carrierSpeedRadS
      };
    } else {
      // Limited Slip Differential (TBR = Torque Bias Ratio)
      // If one wheel spins faster (slipping), transfer up to biasRatio to the slower wheel
      const deltaW = wheelSpeedLeftRadS - wheelSpeedRightRadS;
      let splitLeft = 0.5;
      let splitRight = 0.5;

      if (Math.abs(deltaW) > 0.5) {
        if (deltaW > 0) {
          // Left wheel slipping -> send more torque to Right
          splitLeft = 1.0 / (1.0 + biasRatio);
          splitRight = biasRatio / (1.0 + biasRatio);
        } else {
          // Right wheel slipping -> send more torque to Left
          splitLeft = biasRatio / (1.0 + biasRatio);
          splitRight = 1.0 / (1.0 + biasRatio);
        }
      }

      return {
        torqueLeftNm: carrierTorque * splitLeft,
        torqueRightNm: carrierTorque * splitRight,
        carrierSpeedRadS
      };
    }
  }

  /**
   * Compute spring-damper suspension force
   * F_susp = -k * (x - x0) - c * v
   */
  public static computeSuspensionForce(
    stiffnessNm: number,
    dampingNsm: number,
    displacementM: number,
    velocityMs: number
  ): number {
    const springForce = -stiffnessNm * displacementM;
    const dampingForce = -dampingNsm * velocityMs;
    return springForce + dampingForce;
  }
}
