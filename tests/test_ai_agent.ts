import { AstraAICopilot } from '../src/ai/ai-copilot.js';
import { Spacecraft } from '../src/physics/spacecraft.js';
import { NBodyEngine } from '../src/physics/nbody-engine.js';
import { PartGraph } from '../src/builder/part-graph.js';
import { PART_CATALOG } from '../src/builder/catalog.js';
import { AIManeuverAction } from '../src/physics/types.js';

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

console.log('===============================================================');
console.log('ASTRA: CONTEXT AWARENESS & DIRECT ACTION TEST SUITE');
console.log('===============================================================\n');

// 1. Setup Mock Engine, Spacecraft, PartGraph
const spacecraft = new Spacecraft('ASTRA-TEST-1');
const engine = {
  telemetry: {
    data: {
      activeParticles: 50000,
      energyDrift: 0.00012
    }
  },
  params: {
    timeStep: 0.016,
    gravityConstant: 1.0
  },
  celestialBodies: [
    { index: 0, name: 'Earth', radius: 50, mass: 10000, color: [0.2, 0.5, 0.9] as [number, number, number] }
  ]
} as unknown as NBodyEngine;

const partGraph = new PartGraph('Test Rocket Assembly');
partGraph.registerDefinitions(PART_CATALOG);

let lastExecutedAction: AIManeuverAction | null = null;
const copilot = new AstraAICopilot(
  engine,
  spacecraft,
  (action) => {
    lastExecutedAction = action;
  },
  {
    getCurrentMode: () => 'BUILDER',
    getPartGraph: () => partGraph
  }
);

// ---------------------------------------------------------------------
// TEST 1: Live System Prompt Context Verification
// ---------------------------------------------------------------------
console.log('--- 1. Context Awareness Verification ---');
const prompt = copilot.buildSystemPrompt();

assert(prompt.includes('Active UI Mode: BUILDER'), 'AI knows current active UI mode (BUILDER)');
assert(prompt.includes('Earth (Mass: 10000, Radius: 50km)'), 'AI knows active celestial bodies and primary parent');
assert(prompt.includes('beam_aluminum_2020_05m'), 'AI knows available part catalog IDs');
assert(prompt.includes('Active WebGPU Particle Count: 50,000 bodies'), 'AI knows live N-body simulation particle count');
assert(prompt.includes('Apoapsis'), 'AI knows live spacecraft orbital elements');

// ---------------------------------------------------------------------
// TEST 2: Direct Rocket Machine Synthesis & Launch
// ---------------------------------------------------------------------
console.log('\n--- 2. Direct Rocket Machine Synthesis & Launch ---');
copilot.sendMessage('Build a high-thrust 2-stage rocket with solid booster and launch it').then((msg) => {
  assert(!!msg.action, 'AI generated structured executable action');
  assert(msg.action?.action === 'build_machine', 'AI selected "build_machine" action');
  assert((msg.action?.parts?.length || 0) >= 4, `AI assembled ${(msg.action?.parts?.length || 0)} modular parts in DAG`);
  assert(msg.action?.launchAfterBuild === true, 'AI flagged launchAfterBuild = true for auto-liftoff');
  assert(lastExecutedAction?.action === 'build_machine', 'Action callback was dispatched to execution bridge');

  // ---------------------------------------------------------------------
  // TEST 3: Direct 4WD Rover Machine Synthesis
  // ---------------------------------------------------------------------
  console.log('\n--- 3. Direct 4WD Rover Machine Synthesis ---');
  copilot.sendMessage('Build a 4-wheel drive exploration rover').then((roverMsg) => {
    assert(roverMsg.action?.action === 'build_machine', 'AI selected "build_machine" for rover request');
    const motorParts = roverMsg.action?.parts?.filter(p => p.definitionId.includes('motor')) || [];
    const wheelParts = roverMsg.action?.parts?.filter(p => p.definitionId.includes('wheel')) || [];
    assert(motorParts.length === 4, `AI configured 4 drive motors (found ${motorParts.length})`);
    assert(wheelParts.length === 4, `AI configured 4 all-terrain wheels (found ${wheelParts.length})`);

    // ---------------------------------------------------------------------
    // TEST 4: Direct Celestial Body & Black Hole Injection
    // ---------------------------------------------------------------------
    console.log('\n--- 4. Direct Celestial Black Hole Injection ---');
    copilot.sendMessage('Spawn a supermassive black hole at the center').then((bhMsg) => {
      assert(bhMsg.action?.action === 'spawn_celestial_body', 'AI selected "spawn_celestial_body" action');
      assert((bhMsg.action?.body?.mass || 0) >= 10000, `AI configured high-mass gravitational sink (${bhMsg.action?.body?.mass})`);

      // ---------------------------------------------------------------------
      // TEST 5: Direct Throttle & SAS Controls
      // ---------------------------------------------------------------------
      console.log('\n--- 5. Direct Throttle & SAS Guidance Controls ---');
      copilot.sendMessage('Full throttle 100% and align prograde').then((throtMsg) => {
        assert(throtMsg.action?.action === 'set_throttle', 'AI executed direct engine throttle control');
        assert(throtMsg.action?.throttle === 1.0, 'AI commanded 100% full throttle');

        console.log('\n===============================================================');
        console.log(`AI AGENT TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
        console.log('===============================================================\n');

        if (failed > 0) process.exit(1);
      });
    });
  });
});
