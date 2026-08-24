import * as THREE from 'three';
import { DHParameter } from '../src/robotics/kinematics-solver.js';
import { InverseKinematicsSolver } from '../src/robotics/inverse-kinematics.js';
import { CADAerodynamicAnalyzer } from '../src/cad/aerodynamic-analyzer.js';
import { LatticeBoltzmannFlowField } from '../src/rocketry/flow-field.js';
import { ElectricalPowerBus } from '../src/builder/power-bus.js';
import { AerodynamicControlSurfaceModel } from '../src/physics/aerodynamic-controls.js';

let passed = 0;
const verify = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  passed++;
  console.log(`[PASS] ${message}`);
};

console.log('\n=== ASTRODYNE PHASE 4 CROSS-STUDIO VERIFICATION ===');

const chain: DHParameter[] = [
  { name: 'Base', thetaDeg: 0, dM: 0.2, aM: 0, alphaDeg: 90, jointType: 'revolute', minLimitDeg: -180, maxLimitDeg: 180 },
  { name: 'Shoulder', thetaDeg: 35, dM: 0, aM: 0.4, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -120, maxLimitDeg: 120 },
  { name: 'Elbow', thetaDeg: -45, dM: 0, aM: 0.35, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -150, maxLimitDeg: 150 },
  { name: 'Wrist', thetaDeg: 0, dM: 0.1, aM: 0, alphaDeg: 90, jointType: 'revolute', minLimitDeg: -180, maxLimitDeg: 180 },
  { name: 'Pitch', thetaDeg: 20, dM: 0, aM: 0, alphaDeg: -90, jointType: 'revolute', minLimitDeg: -110, maxLimitDeg: 110 },
  { name: 'Tool', thetaDeg: 0, dM: 0.15, aM: 0, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -360, maxLimitDeg: 360 }
];
for (const algorithm of ['dls', 'jacobian-transpose', 'fabrik'] as const) {
  const ik = InverseKinematicsSolver.solve(chain, [0.48, 0.18, 0.28], { algorithm, toleranceM: 0.01, maxIterations: 400 });
  verify(ik.converged && ik.errorM <= 0.01, `${algorithm} inverse kinematics converged (${(ik.errorM * 1000).toFixed(1)} mm)`);
}

const geometry = new THREE.CylinderGeometry(15, 1, 60, 48);
const aero = CADAerodynamicAnalyzer.analyze(geometry);
verify(aero.frontalAreaMm2 > 0 && aero.estimatedCd >= 0.08 && aero.estimatedCd <= 1.35, `CAD projected-area drag extraction (Cd ${aero.estimatedCd.toFixed(3)})`);

const flow = new LatticeBoltzmannFlowField(64, 32, 0.06);
flow.setRocketObstacle();
const flowStats = flow.step(12);
verify(Number.isFinite(flowStats.averageSpeed) && flowStats.iterations === 12, 'D2Q9 LBM pressure-flow field remained numerically stable');

const motorCurrent = ElectricalPowerBus.motorCurrent(1.8, 0.18);
const solarW = ElectricalPowerBus.solarPower(0.2, 0.24, 30);
const power = ElectricalPowerBus.evaluate(
  { nominalVoltageV: 14.8, capacityAh: 10, internalResistanceOhm: 0.018, stateOfCharge: 0.8 },
  [{ name: 'Drive motor', currentA: motorCurrent }],
  solarW
);
verify(power.busVoltageV > 12 && power.runtimeHours > 0, `Electrical power bus solved (${power.busVoltageV.toFixed(2)} V, ${power.runtimeHours.toFixed(2)} h)`);

const control = AerodynamicControlSurfaceModel.evaluate({ pitch: 0.6, yaw: 0, roll: -0.2 }, 18_000, 0.08, 0.7);
verify(control.pitchTorque > 0 && control.rollTorque < 0, 'Aerodynamic control surfaces generated signed pitch/roll torque');

console.log(`=== PHASE 4: ${passed} PASSED, 0 FAILED ===\n`);
