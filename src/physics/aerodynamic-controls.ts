export interface AeroControlInput {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface AeroControlResult {
  pitchTorque: number;
  yawTorque: number;
  rollTorque: number;
  liftForce: number;
}

export class AerodynamicControlSurfaceModel {
  public static evaluate(
    input: AeroControlInput,
    dynamicPressurePa: number,
    surfaceAreaM2: number,
    momentArmM: number,
    maxDeflectionDeg = 20,
    liftSlopePerRad = 2 * Math.PI
  ): AeroControlResult {
    const deflection = (maxDeflectionDeg * Math.PI) / 180;
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    const forcePerInput = Math.max(0, dynamicPressurePa) * Math.max(0, surfaceAreaM2) * liftSlopePerRad * deflection;
    const pitchForce = forcePerInput * clamp(input.pitch);
    const yawForce = forcePerInput * clamp(input.yaw);
    const rollForce = forcePerInput * clamp(input.roll);
    return {
      pitchTorque: pitchForce * momentArmM,
      yawTorque: yawForce * momentArmM,
      rollTorque: rollForce * momentArmM * 0.65,
      liftForce: Math.hypot(pitchForce, yawForce)
    };
  }
}
