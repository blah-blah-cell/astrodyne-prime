import { CollaborativeDesignSession } from '../src/collaboration/crdt-session.js';
import { MAVLinkParser } from '../src/hardware/mavlink-bridge.js';
import { SimulationExporter } from '../src/builder/simulation-exporters.js';
import { EngineeringCouncil } from '../src/ai/engineering-council.js';
import { EngineeringSketchIngestion } from '../src/ai/sketch-ingestion.js';
import { RocketEvolutionaryOptimizer } from '../src/rocketry/evolutionary-optimizer.js';
import { PartGraph } from '../src/builder/part-graph.js';
import { PART_CATALOG } from '../src/builder/catalog.js';
import { RocketAeroConfig } from '../src/rocketry/barrowman-solver.js';

let passed = 0;
const verify = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  passed++;
  console.log(`[PASS] ${message}`);
};

console.log('\n=== ASTRODYNE PHASE 5/6 VERIFICATION ===');

const session = new CollaborativeDesignSession('test-room', 'client-a');
session.apply({ key: 'assembly', value: 'old', clock: 1, clientId: 'client-b' });
session.apply({ key: 'assembly', value: 'new', clock: 2, clientId: 'client-c' });
session.apply({ key: 'assembly', value: 'stale', clock: 1, clientId: 'client-z' });
verify(session.snapshot().values.assembly === 'new', 'LWW CRDT rejected stale collaborative state');

const attitudePayload = new Uint8Array(28);
const attitudeView = new DataView(attitudePayload.buffer);
attitudeView.setFloat32(4, Math.PI / 6, true);
attitudeView.setFloat32(8, -Math.PI / 12, true);
attitudeView.setFloat32(12, Math.PI / 2, true);
const mavFrame = new Uint8Array(36);
mavFrame.set([0xfe, 28, 0, 1, 1, 30], 0);
mavFrame.set(attitudePayload, 6);
const decoded = new MAVLinkParser().push(mavFrame)[0];
verify(Math.abs((decoded.rollDeg ?? 0) - 30) < 0.01 && Math.abs((decoded.yawDeg ?? 0) - 90) < 0.01, 'MAVLink ATTITUDE telemetry decoded');

const graph = new PartGraph('Phase56 Test Vehicle');
graph.registerDefinitions(PART_CATALOG);
for (const [index, definitionId] of ['block_modular_cube_025m', 'rocket_motor_solid_pro38', 'fin_trapezoidal_aero', 'battery_lipo_4s_10ah'].entries()) {
  graph.addPart({ instanceId: `part-${index}`, definitionId, position: [0, index * 0.2, 0], rotationQuaternion: [0, 0, 0, 1], attachedSockets: new Map() });
}
const gazebo = SimulationExporter.export(graph, 'gazebo');
const moveit = SimulationExporter.export(graph, 'moveit');
const isaac = SimulationExporter.export(graph, 'isaac');
verify(gazebo.data.includes('<sdf') && moveit.data.includes('planning_group') && isaac.data.includes('#usda'), 'Gazebo, MoveIt, and Isaac Sim exporters generated native payloads');

const council = EngineeringCouncil.review(graph);
verify(council.findings.length === 4 && council.score >= 0 && council.score <= 100, `Four-agent engineering council issued scored review (${council.score}/100)`);

const pixels = new Uint8ClampedArray(40 * 80 * 4);
for (let i = 0; i < pixels.length; i += 4) { pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = 255; }
const sketch = EngineeringSketchIngestion.analyze({ width: 40, height: 80, data: pixels, colorSpace: 'srgb' } as ImageData);
verify(sketch.classification === 'ROCKET' && sketch.cadScript.includes('cylinder'), 'Engineering sketch classified and converted to parametric CAD');

const rocket: RocketAeroConfig = {
  name: 'Optimizer Test', noseCone: { shape: 'ogive', lengthM: 0.35, baseDiameterM: 0.075, massKg: 0.18 },
  bodyTube: { lengthM: 0.85, outerDiameterM: 0.075, innerDiameterM: 0.072, massKg: 0.32 },
  finSet: { numFins: 4, rootChordM: 0.12, tipChordM: 0.05, spanM: 0.08, sweepLengthM: 0.06, positionFromNoseM: 1.05, massKg: 0.11 },
  motorMassKg: 0.45, motorPositionFromNoseM: 1.15, motorThrustN: 480, motorBurnTimeSec: 2.8, propellantMassKg: 0.22
};
const optimized = RocketEvolutionaryOptimizer.optimize(rocket, { targetApogeeM: 2600, minimumStabilityCalibers: 1.2, population: 6, generations: 3 });
verify(optimized.evaluations === 18 && Number.isFinite(optimized.fitness), `Evolutionary airframe optimization completed ${optimized.evaluations} evaluations`);

console.log(`=== PHASE 5/6: ${passed} PASSED, 0 FAILED ===\n`);
