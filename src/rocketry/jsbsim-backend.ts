import { RocketAeroConfig, BarrowmanAerodynamicsSolver } from './barrowman-solver.js';

const N_TO_LBF = 0.2248089431;
const KG_TO_LB = 2.2046226218;
const M2_TO_FT2 = 10.763910417;
const KGM2_TO_SLUGFT2 = 0.737562149;
const FT_TO_M = 0.3048;
const FPS_TO_MS = 0.3048;

export interface JSBSimTrajectoryPoint {
  timeSec: number;
  altitudeM: number;
}

export interface JSBSimValidationResult {
  backend: 'JSBSim';
  version: '1.2.4';
  apogeeAltitudeM: number;
  timeToApogeeSec: number;
  trajectory: JSBSimTrajectoryPoint[];
  samples: number;
}

/** Runs the configured rocket through the independent JSBSim nonlinear FDM kernel. */
export class JSBSimRocketBackend {
  static buildScenario(rocket: RocketAeroConfig): { model: string; initialConditions: string; script: string } {
    const stability = BarrowmanAerodynamicsSolver.calculate(rocket);
    const lengthM = rocket.noseCone.lengthM + rocket.bodyTube.lengthM;
    const radiusM = rocket.bodyTube.outerDiameterM / 2;
    const areaM2 = rocket.cadReferenceAreaM2 ?? Math.PI * radiusM * radiusM;
    const cd = rocket.cadEstimatedCd ?? 0.45;
    const axialInertia = 0.5 * stability.totalMassKg * radiusM * radiusM * KGM2_TO_SLUGFT2;
    const transverseInertia = stability.totalMassKg * (3 * radiusM * radiusM + lengthM * lengthM) / 12 * KGM2_TO_SLUGFT2;
    const model = `<?xml version="1.0"?>
<fdm_config name="Astrodyne JSBSim Rocket" version="2.0" release="PRODUCTION">
  <fileheader><author>Astrodyne</author><version>1.0</version><description>Generated JSBSim validation model.</description></fileheader>
  <metrics>
    <wingarea unit="FT2">${(areaM2 * M2_TO_FT2).toPrecision(12)}</wingarea>
    <wingspan unit="FT">${(rocket.bodyTube.outerDiameterM / FT_TO_M).toPrecision(12)}</wingspan>
    <chord unit="FT">${(lengthM / FT_TO_M).toPrecision(12)}</chord>
    <htailarea unit="FT2">0</htailarea><htailarm unit="FT">0</htailarm><vtailarea unit="FT2">0</vtailarea><vtailarm unit="FT">0</vtailarm>
    <location name="AERORP" unit="IN"><x>0</x><y>0</y><z>0</z></location>
    <location name="EYEPOINT" unit="IN"><x>0</x><y>0</y><z>0</z></location>
    <location name="VRP" unit="IN"><x>0</x><y>0</y><z>0</z></location>
  </metrics>
  <mass_balance>
    <ixx unit="SLUG*FT2">${Math.max(1e-6, axialInertia).toPrecision(12)}</ixx>
    <iyy unit="SLUG*FT2">${Math.max(1e-6, transverseInertia).toPrecision(12)}</iyy>
    <izz unit="SLUG*FT2">${Math.max(1e-6, transverseInertia).toPrecision(12)}</izz>
    <emptywt unit="LBS">${(stability.totalMassKg * KG_TO_LB).toPrecision(12)}</emptywt>
    <location name="CG" unit="IN"><x>0</x><y>0</y><z>0</z></location>
  </mass_balance>
  <ground_reactions>
    <contact type="BOGEY" name="LAUNCH_POINT"><location unit="IN"><x>0</x><y>0</y><z>0</z></location><static_friction>0</static_friction><dynamic_friction>0</dynamic_friction><rolling_friction>0</rolling_friction><spring_coeff unit="LBS/FT">900</spring_coeff><damping_coeff unit="LBS/FT/SEC">240</damping_coeff><max_steer unit="DEG">0</max_steer><brake_group>NONE</brake_group><retractable>0</retractable></contact>
  </ground_reactions>
  <external_reactions>
    <property>propulsion/rocket-thrust-lbf</property>
    <force name="rocket" frame="INERTIAL"><function><property>propulsion/rocket-thrust-lbf</property></function><location unit="FT"><x>0</x><y>0</y><z>0</z></location><direction><x>0</x><y>0</y><z>-1</z></direction></force>
  </external_reactions>
  <propulsion/>
  <aerodynamics><axis name="DRAG"><function name="aero/coefficient/CD"><product><property>aero/qbar-psf</property><property>metrics/Sw-sqft</property><value>${cd.toPrecision(12)}</value></product></function></axis></aerodynamics>
</fdm_config>`;
    const initialConditions = `<?xml version="1.0"?><initialize name="launchpad"><ubody unit="FT/SEC">0</ubody><vbody unit="FT/SEC">0</vbody><wbody unit="FT/SEC">0</wbody><latitude unit="DEG">28.5729</latitude><longitude unit="DEG">-80.6490</longitude><phi unit="DEG">0</phi><theta unit="DEG">0</theta><psi unit="DEG">0</psi><altitude unit="FT">4</altitude></initialize>`;
    const script = `<?xml version="1.0" encoding="UTF-8"?><runscript name="Astrodyne validation"><description>Generated vertical launch verification.</description><use aircraft="astrodyne_rocket" initialize="launchpad"/><run start="0" end="90" dt="0.02"/></runscript>`;
    return { model, initialConditions, script };
  }

  static async simulate(rocket: RocketAeroConfig): Promise<JSBSimValidationResult> {
    const [{ JSBSimSdk }, { wasmBinaryUrl, wasmModuleUrl }] = await Promise.all([
      import('@0x62/jsbsim-wasm'),
      import('@0x62/jsbsim-wasm/wasm')
    ]);
    const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false, stripAnsi: true } });
    try {
      sdk.configurePaths({ rootDir: '/runtime', aircraftPath: 'aircraft', enginePath: 'engine', systemsPath: 'systems', outputPath: 'output' });
      const scenario = this.buildScenario(rocket);
      sdk.writeDataFile('aircraft/astrodyne_rocket/astrodyne_rocket.xml', scenario.model);
      sdk.writeDataFile('aircraft/astrodyne_rocket/launchpad.xml', scenario.initialConditions);
      sdk.writeDataFile('scripts/astrodyne-validation.xml', scenario.script);
      if (!sdk.loadScript('scripts/astrodyne-validation.xml') || !sdk.runIc()) throw new Error('JSBSim rejected the generated rocket scenario');
      const baselineFt = sdk.getPropertyValue('position/h-sl-ft');
      const thrustLbf = rocket.motorThrustN * N_TO_LBF;
      const trajectory: JSBSimTrajectoryPoint[] = [];
      let apogeeAltitudeM = 0;
      let timeToApogeeSec = 0;
      let previousVelocity = 0;
      for (let step = 0; step < 4500; step++) {
        const time = sdk.getSimTime();
        sdk.setPropertyValue('propulsion/rocket-thrust-lbf', time <= rocket.motorBurnTimeSec ? thrustLbf : 0);
        if (!sdk.run()) break;
        const sampleTime = sdk.getSimTime();
        const altitudeM = Math.max(0, (sdk.getPropertyValue('position/h-sl-ft') - baselineFt) * FT_TO_M);
        const verticalVelocityMs = sdk.getPropertyValue('velocities/h-dot-fps') * FPS_TO_MS;
        if (!Number.isFinite(altitudeM) || !Number.isFinite(verticalVelocityMs)) throw new Error(`JSBSim produced non-finite trajectory state at ${sampleTime.toFixed(2)} s`);
        if (altitudeM > apogeeAltitudeM) {
          apogeeAltitudeM = altitudeM;
          timeToApogeeSec = sampleTime;
        }
        if (step % 5 === 0) trajectory.push({ timeSec: sampleTime, altitudeM });
        if (time > rocket.motorBurnTimeSec && previousVelocity > 0 && verticalVelocityMs <= 0) break;
        previousVelocity = verticalVelocityMs;
      }
      return { backend: 'JSBSim', version: '1.2.4', apogeeAltitudeM, timeToApogeeSec, trajectory, samples: trajectory.length };
    } finally {
      sdk.destroy();
    }
  }
}
