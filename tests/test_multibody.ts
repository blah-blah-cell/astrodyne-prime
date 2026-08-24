import { DrivetrainPhysics } from '../src/builder/drivetrain.js';
import { PartGraph } from '../src/builder/part-graph.js';
import { PART_CATALOG } from '../src/builder/catalog.js';

let passed = 0;
let failed = 0;

function assertClose(actual: number, expected: number, tolerance: number, testName: string) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  [PASS] ${testName} (actual: ${actual.toFixed(4)}, expected: ${expected.toFixed(4)})`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} - actual: ${actual.toFixed(4)}, expected: ${expected.toFixed(4)}, diff: ${diff.toFixed(4)} > tol ${tolerance}`);
    failed++;
  }
}

console.log('===============================================================');
console.log('AXIOM PHASE 2: MULTIBODY & DRIVETRAIN SYSTEM TEST SUITE');
console.log('===============================================================\n');

// ---------------------------------------------------------------------
// TEST GROUP 1: DC MOTOR TORQUE-SPEED CURVES
// ---------------------------------------------------------------------
console.log('--- 1. DC Motor Performance Curves ---');

const testMotor = {
  stallTorqueNm: 4.5,
  freeSpeedRpm: 120,
  voltageV: 12.0
};

const freeSpeedRadS = (120 * 2 * Math.PI) / 60; // 12.5664 rad/s

// Test 1.1: Stall condition (w = 0) -> Torque must equal stallTorque
const stallTorque = DrivetrainPhysics.computeMotorTorque(testMotor, 0, 1.0);
assertClose(stallTorque, 4.5, 0.001, 'Motor stall torque at 0 RPM equals 4.5 Nm');

// Test 1.2: Free speed condition (w = w_free) -> Torque must equal 0
const freeTorque = DrivetrainPhysics.computeMotorTorque(testMotor, freeSpeedRadS, 1.0);
assertClose(freeTorque, 0.0, 0.001, 'Motor torque at free speed equals 0 Nm');

// Test 1.3: 50% speed condition (w = 0.5 * w_free) -> Torque must equal 50% stall torque
const midTorque = DrivetrainPhysics.computeMotorTorque(testMotor, freeSpeedRadS * 0.5, 1.0);
assertClose(midTorque, 2.25, 0.001, 'Motor torque at 50% RPM equals 2.25 Nm (linear back-EMF)');

// Test 1.4: Reverse throttle (-1.0)
const revTorque = DrivetrainPhysics.computeMotorTorque(testMotor, 0, -1.0);
assertClose(revTorque, -4.5, 0.001, 'Reverse throttle yields negative stall torque (-4.5 Nm)');

// ---------------------------------------------------------------------
// TEST GROUP 2: GEAR TRAIN MECHANICAL ADVANTAGE
// ---------------------------------------------------------------------
console.log('\n--- 2. Gear Train & Mechanical Advantage ---');

// 20T Pinion driving 40T Gear (2:1 reduction)
const gearResult = DrivetrainPhysics.computeGearPair(20, 40, 2.0, 10.0, 0.95);

assertClose(gearResult.gearRatio, 2.0, 0.001, '20T -> 40T produces exact 2.0 gear ratio');
assertClose(gearResult.outputSpeedRadS, 5.0, 0.001, 'Output angular speed is halved (10.0 -> 5.0 rad/s)');
assertClose(gearResult.outputTorqueNm, 3.8, 0.001, 'Output torque multiplied by ratio * 95% efficiency (2.0 * 2.0 * 0.95 = 3.8 Nm)');
assertClose(gearResult.powerWatts, 19.0, 0.01, 'Transmitted mechanical power equals 19.0 W (tau * omega)');

// ---------------------------------------------------------------------
// TEST GROUP 3: DIFFERENTIAL TORQUE SPLIT & SLIP BIAS
// ---------------------------------------------------------------------
console.log('\n--- 3. Differential Split & Slip Mechanics ---');

// Open Differential with 3.5:1 final drive
const openDiff = DrivetrainPhysics.computeDifferentialSplit(10.0, 3.5, 20.0, 20.0, false);
const totalCarrierTorque = 10.0 * 3.5 * 0.95; // 33.25 Nm
assertClose(openDiff.torqueLeftNm, totalCarrierTorque * 0.5, 0.001, 'Open diff splits torque 50/50 evenly (16.625 Nm each)');
assertClose(openDiff.torqueRightNm, totalCarrierTorque * 0.5, 0.001, 'Right wheel receives exact 50% torque');
assertClose(openDiff.carrierSpeedRadS, 20.0, 0.001, 'Carrier speed equals average wheel speed (20.0 rad/s)');

// Limited-Slip Differential with left wheel slipping (w_left = 40, w_right = 10, TBR = 3.0)
const lsdDiff = DrivetrainPhysics.computeDifferentialSplit(10.0, 3.5, 40.0, 10.0, true, 3.0);
assertClose(lsdDiff.torqueLeftNm, totalCarrierTorque * 0.25, 0.001, 'LSD shifts torque away from slipping left wheel (25% = 8.3125 Nm)');
assertClose(lsdDiff.torqueRightNm, totalCarrierTorque * 0.75, 0.001, 'LSD transfers 75% torque to gripping right wheel (24.9375 Nm)');

// ---------------------------------------------------------------------
// TEST GROUP 4: SUSPENSION SPRING-DAMPER DYNAMICS
// ---------------------------------------------------------------------
console.log('\n--- 4. Spring-Damper Suspension Forces ---');

const suspForce = DrivetrainPhysics.computeSuspensionForce(5000, 400, 0.05, 0.2);
assertClose(suspForce, -330.0, 0.001, 'Suspension restoring force equals -330.0 N (Spring: -250N, Damper: -80N)');

// ---------------------------------------------------------------------
// TEST GROUP 5: PART GRAPH MASS & CENTER OF MASS ANALYTICAL INVARIANTS
// ---------------------------------------------------------------------
console.log('\n--- 5. Part Graph Invariants & Center of Mass ---');

const graph = new PartGraph('Test Rover Assembly');
graph.registerDefinitions(PART_CATALOG);

graph.addPart({
  instanceId: 'root_cube',
  definitionId: 'block_modular_cube_025m',
  position: [0, 0, 0],
  rotationQuaternion: [0, 0, 0, 1],
  attachedSockets: new Map()
});

graph.addPart({
  instanceId: 'motor_1',
  definitionId: 'motor_dc_high_torque',
  position: [0.5, 0, 0],
  rotationQuaternion: [0, 0, 0, 1],
  attachedSockets: new Map()
});

const totalCalculatedMass = 0.15 + 0.38;
assertClose(graph.assembly.totalMassKg, totalCalculatedMass, 0.001, 'Total assembled mass equals 0.53 kg');

const expectedCmX = (0.15 * 0 + 0.38 * 0.5) / totalCalculatedMass;
assertClose(graph.assembly.centerOfMassWorld[0], expectedCmX, 0.001, `Center of Mass X matches analytical prediction (${expectedCmX.toFixed(4)} m)`);

console.log('\n===============================================================');
console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
}
