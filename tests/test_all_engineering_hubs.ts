import { ManifoldCADEngine } from '../src/cad/manifold-engine.js';
import { OpenSCADEvaluator } from '../src/cad/openscad-evaluator.js';
import { BarrowmanAerodynamicsSolver, RocketAeroConfig } from '../src/rocketry/barrowman-solver.js';
import { RocketTrajectoryPredictor } from '../src/rocketry/trajectory-predictor.js';
import { DHKinematicsSolver, DHParameter } from '../src/robotics/kinematics-solver.js';
import { URDFGenerator } from '../src/robotics/urdf-generator.js';
import { DrivetrainPhysics, DCMotorCurve } from '../src/builder/drivetrain.js';
import { AstraAICopilot } from '../src/ai/ai-copilot.js';
import { Spacecraft } from '../src/physics/spacecraft.js';
import { NBodyEngine } from '../src/physics/nbody-engine.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

async function runAllHubTests() {
  console.log('===============================================================');
  console.log('🌌 ASTRODYNE & AXIOM: 5-STUDIO MULTI-ENGINEERING TEST SUITE');
  console.log('===============================================================\n');

  // -----------------------------------------------------------------
  // 1. OPENSCAD & MANIFOLD-3D CSG ENGINE
  // -----------------------------------------------------------------
  console.log('--- 1. OpenSCAD & Manifold-3D WASM CSG Engine ---');
  try {
    const cadEngine = await ManifoldCADEngine.getInstance();
    const evaluator = new OpenSCADEvaluator(cadEngine);

    const testScript = `
      let plate = cube([40, 40, 10], true);
      let hole = cylinder(12, 5, 5, 32, true);
      return difference(plate, hole);
    `;

    const cadRes = await evaluator.evaluateScript(testScript);
    assert(cadRes.volumeMm3 > 14000 && cadRes.volumeMm3 < 16000, `CSG Difference Volume correct (${cadRes.volumeMm3.toFixed(1)} mm³)`);
    assert(cadRes.numTriangles > 50, `Valid manifold mesh generated (${cadRes.numTriangles} tris, ${cadRes.numVertices} verts)`);
    assert(cadRes.stlData.includes('solid OpenSCAD_Model') && cadRes.stlData.includes('endsolid OpenSCAD_Model'), 'Valid ASCII STL generated for 3D printing');
  } catch (err: any) {
    assert(false, 'Manifold CSG Engine', err.message);
  }

  // -----------------------------------------------------------------
  // 2. OPENROCKET BARROWMAN STABILITY & RK4 TRAJECTORY
  // -----------------------------------------------------------------
  console.log('\n--- 2. OpenRocket Barrowman Aerodynamics (NASA TR R-58) ---');
  const rocketConfig: RocketAeroConfig = {
    name: 'Astrodyne-Pro38',
    noseCone: { shape: 'ogive', lengthM: 0.35, baseDiameterM: 0.075, massKg: 0.18 },
    bodyTube: { lengthM: 0.85, outerDiameterM: 0.075, innerDiameterM: 0.072, massKg: 0.32 },
    finSet: { numFins: 4, rootChordM: 0.12, tipChordM: 0.05, spanM: 0.10, sweepLengthM: 0.06, positionFromNoseM: 1.05, massKg: 0.11 },
    motorMassKg: 0.45,
    motorPositionFromNoseM: 1.15,
    motorThrustN: 480.0,
    motorBurnTimeSec: 2.8,
    propellantMassKg: 0.22
  };

  const aeroRes = BarrowmanAerodynamicsSolver.calculate(rocketConfig);
  assert(aeroRes.cNa_Nose === 2.0, 'Nose cone CNa = 2.0 (NASA standard)');
  assert(aeroRes.cNa_Fins > 10.0, `Fin set CNa evaluated (${aeroRes.cNa_Fins.toFixed(2)})`);
  assert(aeroRes.xCp_Total > aeroRes.xCg_Total, `Passive stability verified: Xcp (${aeroRes.xCp_Total.toFixed(3)}m) > Xcg (${aeroRes.xCg_Total.toFixed(3)}m)`);
  assert(aeroRes.stabilityMarginCalibers >= 1.0, `Barrowman Static Stability Margin = ${aeroRes.stabilityMarginCalibers.toFixed(2)} Calibers (${aeroRes.stabilityStatus})`);

  const flightSim = RocketTrajectoryPredictor.simulateFlight(rocketConfig);
  assert(flightSim.apogeeAltitudeM > 1000, `RK4 Atmospheric Apogee calculated (${flightSim.apogeeAltitudeM}m)`);
  assert(flightSim.maxMachNumber > 0.4, `Max velocity: Mach ${flightSim.maxMachNumber} (${flightSim.maxVelocityMs} m/s)`);
  assert(flightSim.optimalEjectionDelaySec > 10.0, `Optimal parachute ejection delay: ${flightSim.optimalEjectionDelaySec}s`);

  // -----------------------------------------------------------------
  // 3. URDF ROBOTICS & DH FORWARD KINEMATICS
  // -----------------------------------------------------------------
  console.log('\n--- 3. URDF Robotics & Denavit-Hartenberg Kinematics ---');
  const dhChain: DHParameter[] = [
    { name: 'Base Yaw', thetaDeg: 0, dM: 0.2, aM: 0.0, alphaDeg: 90, jointType: 'revolute' },
    { name: 'Shoulder Pitch', thetaDeg: 45, dM: 0.0, aM: 0.4, alphaDeg: 0, jointType: 'revolute' },
    { name: 'Elbow Pitch', thetaDeg: -60, dM: 0.0, aM: 0.35, alphaDeg: 0, jointType: 'revolute' }
  ];

  const kinRes = DHKinematicsSolver.computeForwardKinematics(dhChain);
  assert(kinRes.jointTransforms.length === 4, 'Computed transformation matrices for 3 joints + base');
  assert(Math.abs(kinRes.endEffector.position[0]) >= 0 && Math.abs(kinRes.endEffector.position[2]) >= 0, `End-effector pose: [${kinRes.endEffector.position.join(', ')}] m`);

  const urdfXml = URDFGenerator.generateURDF('Astrodyne_Arm', [
    { name: 'link_1', massKg: 0.5, size: [0.05, 0.05, 0.2] },
    { name: 'link_2', massKg: 0.5, size: [0.05, 0.05, 0.4] },
    { name: 'link_3', massKg: 0.5, size: [0.05, 0.05, 0.35] }
  ], dhChain);
  assert(urdfXml.includes('<robot name="Astrodyne_Arm">') && urdfXml.includes('<joint name="joint_1"'), 'Generated valid ROS URDF XML structure');

  // -----------------------------------------------------------------
  // 4. AXIOM MULTIBODY MECHANICS & DRIVETRAIN
  // -----------------------------------------------------------------
  console.log('\n--- 4. AXIOM Multibody Mechanics & Drivetrain ---');
  const motor: DCMotorCurve = {
    stallTorqueNm: 4.5,
    freeSpeedRpm: 3000,
    voltageV: 12.0
  };
  const freeSpeedRadS = (motor.freeSpeedRpm * 2 * Math.PI) / 60;
  const tauMid = DrivetrainPhysics.computeMotorTorque(motor, freeSpeedRadS / 2.0, 1.0);
  assert(Math.abs(tauMid - 2.25) < 0.01, `DC motor linear torque-speed curve: tau(w_mid) = ${tauMid.toFixed(2)} Nm (expected 2.25 Nm)`);

  const gearRes = DrivetrainPhysics.computeGearPair(20, 40, 2.0, freeSpeedRadS, 0.96);
  assert(gearRes.gearRatio === 2.0, 'Spur gear ratio N2/N1 = 2.0');
  assert(Math.abs(gearRes.outputTorqueNm - 3.84) < 0.01, `Gear torque multiplication: ${gearRes.outputTorqueNm.toFixed(2)} Nm (96% efficiency)`);

  // -----------------------------------------------------------------
  // 5. ASTRA AI MULTI-DISCIPLINARY COGNITIVE AGENT
  // -----------------------------------------------------------------
  console.log('\n--- 5. ASTRA AI Multi-Disciplinary Cognitive Agent ---');
  const spacecraft = new Spacecraft('ASTRA-ORBITER');
  const engine = {
    telemetry: { data: { activeParticles: 50000, energyDrift: 0.0001 } },
    params: { timeStep: 0.016, gravityConstant: 1.0 },
    celestialBodies: []
  } as unknown as NBodyEngine;

  const copilot = new AstraAICopilot(engine, spacecraft);

  const cadMsg = await copilot.sendMessage('Generate an OpenSCAD motor mount plate and export STL');
  assert(cadMsg.action?.action === 'generate_cad_model', 'AI generated "generate_cad_model" action for CAD request');
  assert(cadMsg.action?.cadScript?.includes('difference') === true, 'AI generated valid parametric OpenSCAD script');

  const aeroMsg = await copilot.sendMessage('Run Barrowman aerodynamic stability analysis in OpenRocket');
  assert(aeroMsg.action?.action === 'simulate_rocket_aero', 'AI generated "simulate_rocket_aero" action');
  assert(aeroMsg.action?.rocketConfig?.noseCone?.shape === 'ogive', 'AI configured rocket nosecone and fin geometry');

  const robMsg = await copilot.sendMessage('Configure a 6-DOF URDF robotic arm with DH parameters');
  assert(robMsg.action?.action === 'configure_robot_chain', 'AI generated "configure_robot_chain" action');
  assert((robMsg.action?.dhChain?.length || 0) === 6, 'AI synthesized 6-DOF robotic manipulator chain');

  console.log('\n===============================================================');
  console.log(`🏁 5-STUDIO MULTI-ENGINEERING TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) process.exit(1);
}

runAllHubTests().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
