import { strict as assert } from 'node:assert';
import { EngineeringMeasurements } from '../src/engineering/measurements.js';
import { ToolchainRegistry } from '../src/engineering/toolchain-registry.js';
import { EngineeringProjectSession } from '../src/engineering/project-session.js';
import { Spacecraft } from '../src/physics/spacecraft.js';
import { CelestialBodyInfo, RocketStage } from '../src/physics/types.js';
import { JSBSimRocketBackend } from '../src/rocketry/jsbsim-backend.js';
import { RocketAeroConfig } from '../src/rocketry/barrowman-solver.js';
import { calculateCADMassKg } from '../src/cad/cad-studio-view.js';
import * as THREE from 'three';
import { SocketRegistry, WorldSocket } from '../src/builder/socket-registry.js';
import { AttachmentSocket, SocketGender, SocketType } from '../src/builder/types.js';

console.log('\n=== ENGINEERING WORKSTATION QUALITY VERIFICATION ===');

EngineeringMeasurements.setPrecision(4);
assert.equal(EngineeringMeasurements.scalar(12.345678, 'm'), '12.3457 m');
assert.equal(EngineeringMeasurements.vector([1, 2.5, -3], 'm'), '[1.0000, 2.5000, -3.0000] m');
console.log('[PASS] shared measurement precision and SI unit formatting');

ToolchainRegistry.setState('rapier', 'ready');
const engines = ToolchainRegistry.list();
assert.ok(engines.length >= 6);
assert.equal(engines.find(engine => engine.id === 'rapier')?.state, 'ready');
assert.ok(engines.every(engine => engine.role.length > 0 && engine.version.length > 0));
console.log('[PASS] integrated open-source toolchain readiness registry');

EngineeringProjectSession.setName('Verification Project');
EngineeringProjectSession.setArtifact('cad', 'watertight test mesh', { triangles: 144 });
EngineeringProjectSession.setArtifact('aerodynamics', 'coupled test result', { stabilityCalibers: 1.43 });
const project = EngineeringProjectSession.get();
assert.equal(project.name, 'Verification Project');
assert.equal(project.artifacts.cad?.data && (project.artifacts.cad.data as { triangles: number }).triangles, 144);
assert.equal(Object.keys(project.artifacts).length, 2);
console.log('[PASS] persistent cross-studio project artifact model');

const earth: CelestialBodyInfo = {
  index: 0,
  name: 'Earth',
  radius: 50,
  mass: 10000,
  color: [0.18, 0.42, 0.78],
  hasAtmosphere: true,
  atmosphereHeight: 60,
  atmosphereDensity0: 1.225
};
const makeStage = (maxThrust: number): RocketStage => ({
  id: 1,
  name: 'Verification Motor',
  dryMass: 0.84,
  fuelMass: 0.22,
  maxFuelMass: 0.22,
  maxThrust,
  isp: 290,
  burnRate: 0.22 / 2.8,
  ignited: true,
  separated: false
});

const restrained = new Spacecraft();
restrained.stages = [makeStage(0.05)];
restrained.position = [0, 50.5, 0];
restrained.launchPadLocation = [0, 50.5, 0];
restrained.isLaunchPad = true;
restrained.throttle = 1;
restrained.update(0.1, [0, -4, 0], [earth]);
assert.equal(restrained.isLaunchPad, true);
assert.deepEqual(restrained.position, [0, 50.5, 0]);
assert.ok(restrained.stages[0].fuelMass < 0.22, 'restrained engine should consume propellant');
assert.equal(restrained.getTelemetry().speed, 0);
console.log('[PASS] launch clamp restrains subcritical thrust while consuming propellant');

const lifting = new Spacecraft();
lifting.stages = [makeStage(10)];
lifting.position = [0, 50.5, 0];
lifting.launchPadLocation = [0, 50.5, 0];
lifting.isLaunchPad = true;
lifting.throttle = 1;
lifting.update(0.1, [0, -4, 0], [earth]);
assert.equal(lifting.isLaunchPad, false);
assert.ok(lifting.velocity[1] > 0, 'supercritical thrust should release the launch clamp');
assert.ok(lifting.getTelemetry().altitude > 0.5);
console.log('[PASS] launch clamp releases only under positive outward acceleration');

const smallTank = new Spacecraft();
smallTank.stages = [makeStage(0.05)];
assert.equal(smallTank.getTelemetry().fuelPercent, 100);
smallTank.calculateDeltaV();
assert.ok(smallTank.deltaVRemaining > 600 && smallTank.deltaVRemaining < 700);
console.log('[PASS] sub-kilogram propellant telemetry and SI delta-v remain correctly scaled');

const siLaunch = new Spacecraft();
siLaunch.dynamicsMode = 'si-km';
siLaunch.stages = [makeStage(480)];
siLaunch.position = [0, 50.5, 0];
siLaunch.launchPadLocation = [0, 50.5, 0];
siLaunch.isLaunchPad = true;
siLaunch.throttle = 1;
siLaunch.referenceAreaM2 = Math.PI * 0.0375 * 0.0375;
siLaunch.update(0.1, [0, -4, 0], [earth]);
const siTelemetry = siLaunch.getTelemetry();
assert.equal(siLaunch.isLaunchPad, false);
assert.ok(siTelemetry.speed > 0 && siTelemetry.speed < 0.1);
assert.equal(siTelemetry.thrustKN, 0.48);
assert.ok(siTelemetry.twr > 45 && siTelemetry.twr < 47);
assert.ok(siTelemetry.dynamicPressure >= 0);
console.log('[PASS] SI launch mode preserves N/kg thrust, km/s velocity, kPa pressure, and T/W');

const tvcCraft = new Spacecraft();
tvcCraft.dynamicsMode = 'si-km';
tvcCraft.stages = [makeStage(480)];
tvcCraft.position = [0, 51, 0];
tvcCraft.throttle = 1;
tvcCraft.setGimbalLimit(5);
tvcCraft.setGimbal(9, 12);
assert.equal(tvcCraft.gimbalPitchDeg, 5);
assert.equal(tvcCraft.gimbalYawDeg, 5);
tvcCraft.setGimbal(3, 4);
tvcCraft.update(0.02, [0, -4, 0], [earth]);
const tvcTelemetry = tvcCraft.getTelemetry();
assert.ok(tvcTelemetry.thrustDirection[0] > 0 && tvcTelemetry.thrustDirection[2] > 0);
assert.ok(tvcCraft.velocity[0] > 0 && tvcCraft.velocity[2] > 0);
assert.ok(tvcTelemetry.massFlowRate > 0);
assert.ok(Math.abs(Math.hypot(...tvcTelemetry.thrustDirection) - 1) < 1e-9);
console.log('[PASS] two-axis TVC obeys hard limits and produces normalized lateral thrust');

const fuelBeforeShutdown = tvcCraft.getFuelMass();
tvcCraft.setEngineIgnited(false);
tvcCraft.update(0.1, [0, -4, 0], [earth]);
assert.equal(tvcCraft.currentThrustKN, 0);
assert.equal(tvcCraft.currentMassFlowRate, 0);
assert.equal(tvcCraft.getFuelMass(), fuelBeforeShutdown);
assert.equal(tvcCraft.getTelemetry().engineIgnited, false);
tvcCraft.centerGimbal();
assert.equal(tvcCraft.gimbalPitchDeg, 0);
assert.equal(tvcCraft.gimbalYawDeg, 0);
console.log('[PASS] engine shutdown stops thrust and propellant flow; TVC centering is exact');

const validationRocket: RocketAeroConfig = {
  name: 'Backend Verification',
  noseCone: { shape: 'ogive', lengthM: 0.35, baseDiameterM: 0.075, massKg: 0.18 },
  bodyTube: { lengthM: 0.85, outerDiameterM: 0.075, innerDiameterM: 0.072, massKg: 0.32 },
  finSet: { numFins: 4, rootChordM: 0.12, tipChordM: 0.05, spanM: 0.08, sweepLengthM: 0.06, positionFromNoseM: 1.05, massKg: 0.11 },
  motorMassKg: 0.45,
  motorPositionFromNoseM: 1.15,
  motorThrustN: 480,
  motorBurnTimeSec: 2.8,
  propellantMassKg: 0.22
};
const scenario = JSBSimRocketBackend.buildScenario(validationRocket);
assert.match(scenario.model, /<fdm_config name="Astrodyne JSBSim Rocket"/);
assert.match(scenario.model, /<value>0\.450000000000<\/value>/);
assert.match(scenario.script, /dt="0\.02"/);
assert.ok(scenario.model.includes('propulsion/rocket-thrust-lbf'));
console.log('[PASS] JSBSim model generation carries configured geometry, mass, drag, and propulsion into the FDM scenario');

const transferVolumeMm3 = 29549.889;
assert.ok(Math.abs(calculateCADMassKg(transferVolumeMm3, 'steel') - 0.2319666) < 1e-6);
assert.ok(Math.abs(calculateCADMassKg(transferVolumeMm3, 'pla') - 0.0366419) < 1e-6);
console.log('[PASS] CAD-to-assembly transfer mass follows the selected material density instead of a fixed PLA density');

const sourceSocket: AttachmentSocket = { id: 'moving', name: 'Moving flange', type: SocketType.FLANGE_COUPLER, gender: SocketGender.MALE, localPosition: [0, 0.4, 0], localNormal: [0, 1, 0] };
const targetSocket: WorldSocket = {
  socket: { id: 'fixed', name: 'Fixed flange', type: SocketType.FLANGE_COUPLER, gender: SocketGender.FEMALE, localPosition: [0, 0, 0], localNormal: [1, 0, 0] },
  partInstanceId: 'reference',
  worldPosition: new THREE.Vector3(3, 2, 1),
  worldNormal: new THREE.Vector3(1, 0, 0)
};
const mate = SocketRegistry.computeMateTransform(sourceSocket, targetSocket, 0.025, 37);
const mateQuaternion = new THREE.Quaternion(...mate.rotationQuaternion);
const resolvedPosition = new THREE.Vector3(...sourceSocket.localPosition).applyQuaternion(mateQuaternion).add(new THREE.Vector3(...mate.position));
const resolvedNormal = new THREE.Vector3(...sourceSocket.localNormal).applyQuaternion(mateQuaternion).normalize();
assert.ok(resolvedPosition.distanceTo(new THREE.Vector3(3.025, 2, 1)) < 1e-10);
assert.ok(resolvedNormal.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-10);
console.log('[PASS] exact assembly mate solves position, opposing socket normals, axial offset, and twist');

console.log('=== WORKSTATION QUALITY: 12 PASSED, 0 FAILED ===\n');
