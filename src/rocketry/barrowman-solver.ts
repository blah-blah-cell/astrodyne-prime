export interface NoseConeConfig {
  shape: 'ogive' | 'conical' | 'parabolic' | 'von_karman';
  lengthM: number;
  baseDiameterM: number;
  massKg: number;
}

export interface BodyTubeConfig {
  lengthM: number;
  outerDiameterM: number;
  innerDiameterM: number;
  massKg: number;
}

export interface FinSetConfig {
  numFins: number;
  rootChordM: number;
  tipChordM: number;
  spanM: number;
  sweepLengthM: number;
  positionFromNoseM: number;
  massKg: number;
}

export interface RocketAeroConfig {
  name: string;
  noseCone: NoseConeConfig;
  bodyTube: BodyTubeConfig;
  finSet: FinSetConfig;
  motorMassKg: number;
  motorPositionFromNoseM: number;
  motorThrustN: number;
  motorBurnTimeSec: number;
  propellantMassKg: number;
  cadEstimatedCd?: number;
  cadReferenceAreaM2?: number;
}

export interface BarrowmanResult {
  // Center of Pressure
  cNa_Nose: number;
  xCp_Nose: number;
  cNa_Fins: number;
  xCp_Fins: number;
  cNa_Total: number;
  xCp_Total: number; // meters from nose tip

  // Center of Gravity
  totalMassKg: number;
  xCg_Total: number; // meters from nose tip

  // Stability Margin
  bodyDiameterM: number;
  stabilityMarginM: number; // Xcp - Xcg
  stabilityMarginCalibers: number; // (Xcp - Xcg) / D
  stabilityStatus: 'OPTIMAL' | 'OVERSTABLE' | 'MARGINAL' | 'UNSTABLE';
}

export class BarrowmanAerodynamicsSolver {
  /**
   * Implements the exact NASA TR R-58 Barrowman Method for model & high-power rockets.
   */
  public static calculate(rocket: RocketAeroConfig): BarrowmanResult {
    const d = rocket.bodyTube.outerDiameterM;
    const r = d / 2.0;

    // 1. Nose Cone Component
    const cNa_Nose = 2.0; // Conical / Ogive normal force coefficient
    let xCp_Nose = 0.466 * rocket.noseCone.lengthM; // Ogive
    if (rocket.noseCone.shape === 'conical') {
      xCp_Nose = 0.666 * rocket.noseCone.lengthM;
    } else if (rocket.noseCone.shape === 'parabolic') {
      xCp_Nose = 0.5 * rocket.noseCone.lengthM;
    }

    // 2. Fin Set Component (Barrowman Fin Equations)
    const N = rocket.finSet.numFins;
    const cr = rocket.finSet.rootChordM;
    const ct = rocket.finSet.tipChordM;
    const s = rocket.finSet.spanM;
    const m = rocket.finSet.sweepLengthM;
    const xb = rocket.finSet.positionFromNoseM;

    // Mid-chord length
    const lMid = Math.sqrt(Math.pow(m + ct / 2.0 - cr / 2.0, 2) + Math.pow(s, 2));

    // Fin-body interference factor & CNa
    const cNa_Fins = ((4.0 * N * Math.pow(s / d, 2)) / (1.0 + Math.sqrt(1.0 + Math.pow((2.0 * lMid) / (cr + ct), 2)))) * (1.0 + r / (s + r));

    // Fin Center of Pressure
    const xCp_Fins = xb + (m * (cr + 2.0 * ct)) / (3.0 * (cr + ct)) + (1.0 / 6.0) * (cr + ct - (cr * ct) / (cr + ct));

    // 3. Combined Center of Pressure (Xcp)
    const cNa_Total = cNa_Nose + cNa_Fins;
    const xCp_Total = (cNa_Nose * xCp_Nose + cNa_Fins * xCp_Fins) / cNa_Total;

    // 4. Combined Center of Gravity (Xcg)
    const noseCg = rocket.noseCone.lengthM * 0.6;
    const bodyCg = rocket.noseCone.lengthM + rocket.bodyTube.lengthM * 0.5;
    const finCg = xb + (m + cr + ct) / 3.0;
    const motorCg = rocket.motorPositionFromNoseM;

    const totalMass = rocket.noseCone.massKg + rocket.bodyTube.massKg + rocket.finSet.massKg + rocket.motorMassKg;
    const xCg_Total = (
      rocket.noseCone.massKg * noseCg +
      rocket.bodyTube.massKg * bodyCg +
      rocket.finSet.massKg * finCg +
      rocket.motorMassKg * motorCg
    ) / totalMass;

    // 5. Static Stability Margin (Calibers)
    const stabilityMarginM = xCp_Total - xCg_Total;
    const stabilityMarginCalibers = stabilityMarginM / d;

    let stabilityStatus: 'OPTIMAL' | 'OVERSTABLE' | 'MARGINAL' | 'UNSTABLE' = 'OPTIMAL';
    if (stabilityMarginCalibers < 0.0) {
      stabilityStatus = 'UNSTABLE';
    } else if (stabilityMarginCalibers < 1.0) {
      stabilityStatus = 'MARGINAL';
    } else if (stabilityMarginCalibers > 2.5) {
      stabilityStatus = 'OVERSTABLE';
    }

    return {
      cNa_Nose,
      xCp_Nose,
      cNa_Fins,
      xCp_Fins,
      cNa_Total,
      xCp_Total,
      totalMassKg: totalMass,
      xCg_Total,
      bodyDiameterM: d,
      stabilityMarginM,
      stabilityMarginCalibers,
      stabilityStatus
    };
  }
}
