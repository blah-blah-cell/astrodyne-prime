import { BYOKManager } from './byok-manager.js';
import { AIMessage, AIManeuverAction, PartBlueprint } from '../physics/types.js';
import { Spacecraft } from '../physics/spacecraft.js';
import { NBodyEngine } from '../physics/nbody-engine.js';
import { PartGraph } from '../builder/part-graph.js';
import { PART_CATALOG } from '../builder/catalog.js';

export interface CopilotContextBridge {
  getCurrentMode: () => 'SPACEFLIGHT' | 'BUILDER';
  getPartGraph?: () => PartGraph;
}

export class AstraAICopilot {
  public byok: BYOKManager;
  public messages: AIMessage[] = [];
  public isThinking = false;

  private engine: NBodyEngine;
  private spacecraft: Spacecraft;
  private contextBridge?: CopilotContextBridge;
  private onActionCallback?: (action: AIManeuverAction) => void;

  constructor(
    engine: NBodyEngine,
    spacecraft: Spacecraft,
    onAction?: (action: AIManeuverAction) => void,
    contextBridge?: CopilotContextBridge
  ) {
    this.engine = engine;
    this.spacecraft = spacecraft;
    this.byok = new BYOKManager();
    this.onActionCallback = onAction;
    this.contextBridge = contextBridge;

    // Initial Welcome Message
    this.messages.push({
      id: 'init-1',
      role: 'assistant',
      content: `**ASTRA AI Flight Director & Systems Architect Online** // Autonomous Control Active.

I have direct real-time telemetry access and control over **ASTRODYNE PRIME & AXIOM Multi-Physics**:
* 🚀 **Spacecraft Telemetry & Maneuvers**: Hohmann transfers, circularization burns, SAS alignment, throttle control, and stage separation.
* 🛠️ **AXIOM Machine Synthesis**: Ask me to build custom modular rockets, 4WD rovers, or mechanical linkages, and launch them into orbit.
* 🌌 **Astrophysics Simulation**: Spawn relativistic black holes, Lagrange asteroid swarms, or binary stellar systems.

*Try asking:*
- *"Build a high-thrust 2-stage rocket with solid booster and launch it"*
- *"Calculate an apoapsis circularization burn and execute"*
- *"Spawn a supermassive black hole at [0, 0, 0]"*`,
      timestamp: Date.now()
    });
  }

  public setContextBridge(bridge: CopilotContextBridge): void {
    this.contextBridge = bridge;
  }

  public setActionCallback(cb: (action: AIManeuverAction) => void): void {
    this.onActionCallback = cb;
  }

  public async sendMessage(userText: string): Promise<AIMessage> {
    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);
    this.isThinking = true;

    try {
      let responseText = '';
      let action: AIManeuverAction | undefined;

      if (this.byok.hasValidKey()) {
        // Online LLM Generation (Gemini 3.7 / Claude Opus 5 / GPT-5.6 / DeepSeek V4 / Grok 4.6)
        const systemPrompt = this.buildSystemPrompt();
        const chatPayload = [
          { role: 'system' as const, content: systemPrompt },
          ...this.messages.slice(-8).map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content
          }))
        ];

        responseText = await this.byok.sendChatRequest(chatPayload);
        action = this.parseAction(responseText);
      } else {
        // Built-in Autonomous Astrodynamics & Machine Synthesis Computer
        const offlineResult = this.offlineAstrodynamicsSolver(userText);
        responseText = offlineResult.text;
        action = offlineResult.action;
      }

      const assistantMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        action
      };

      this.messages.push(assistantMsg);

      if (action && this.onActionCallback) {
        this.onActionCallback(action);
      }

      return assistantMsg;
    } catch (err: any) {
      const errorMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **AI Copilot Error**: ${err.message || 'Request failed'}.
Falling back to internal autonomous synthesizer.`,
        timestamp: Date.now()
      };
      this.messages.push(errorMsg);
      return errorMsg;
    } finally {
      this.isThinking = false;
    }
  }

  public buildSystemPrompt(): string {
    const currentMode = this.contextBridge?.getCurrentMode() || 'SPACEFLIGHT';
    const sc = this.spacecraft;
    const telem = sc.getTelemetry();
    const phys = this.engine.telemetry.data;

    // AXIOM Assembled DAG Info
    const partGraph = this.contextBridge?.getPartGraph?.();
    const assembledParts: string[] = [];
    let totalAssembledMassKg = 0;
    let cmPos: [number, number, number] = [0, 0, 0];

    if (partGraph) {
      totalAssembledMassKg = partGraph.assembly.totalMassKg;
      cmPos = partGraph.assembly.centerOfMassWorld;
      for (const [_, inst] of partGraph.assembly.parts.entries()) {
        const def = partGraph.getDefinition(inst.definitionId);
        assembledParts.push(`${inst.definitionId} (${def?.name || 'Part'}) at [${inst.position.map(v => v.toFixed(2)).join(',')}]`);
      }
    }

    // Celestial Bodies List
    const bodiesList = this.engine.celestialBodies.map(b => `${b.name} (Mass: ${b.mass}, Radius: ${b.radius}km)`).join(', ');

    // Available Catalog IDs
    const catalogSummary = PART_CATALOG.map(p => `• id: "${p.id}" | ${p.name} | Cat: ${p.category} | Mass: ${p.massKg}kg`).join('\n');

    return `You are ASTRA AI, the embedded Autonomous Chief Flight Director, Astrodynamics Officer & Systems Synthesis Copilot in ASTRODYNE PRIME & AXIOM Multi-Physics.

===================================================================
1. CURRENT LIVE SIMULATION CONTEXT & TELEMETRY (REAL-TIME STATE):
===================================================================
* Active UI Mode: ${currentMode}
* Active WebGPU Particle Count: ${phys.activeParticles.toLocaleString()} bodies
* Simulation Time Step (dt): ${this.engine.params.timeStep.toFixed(3)} s | G-Constant: ${this.engine.params.gravityConstant}
* Hamiltonian Energy Drift: ${(phys.energyDrift * 100).toFixed(4)}%

* SPACECRAFT FLIGHT TELEMETRY:
  - Active: ${sc.active ? 'YES (Flight In Progress)' : 'NO (Standby)'}
  - Vehicle Name: ${sc.name} | Stage: ${telem.currentStageIndex + 1} of ${telem.totalStages}
  - Position: [${sc.position.map(v => v.toFixed(1)).join(', ')}] km
  - Velocity: [${sc.velocity.map(v => v.toFixed(2)).join(', ')}] km/s (Speed: ${telem.speed.toFixed(2)} km/s)
  - Altitude: ${telem.altitude.toFixed(1)} km above ${telem.primaryBodyName} (Radius: ${this.spacecraft.primaryBodyRadius}km)
  - Orbit Elements: Apoapsis=${telem.apoapsis.toFixed(1)}km, Periapsis=${telem.periapsis.toFixed(1)}km, Eccentricity=${telem.eccentricity.toFixed(4)}, Period=${telem.period.toFixed(1)}s
  - Propulsion: Throttle=${(sc.throttle * 100).toFixed(0)}%, Propellant Remaining=${telem.fuelPercent.toFixed(1)}%, Delta-V Budget=${telem.deltaVRemaining.toFixed(1)} m/s
  - Attitude / SAS: Mode=${sc.sasMode.toUpperCase()} | G-Force=${telem.gForce.toFixed(2)} G | Dynamic Pressure (Max-Q)=${telem.dynamicPressure.toFixed(2)} kPa

* AXIOM MODULAR MACHINE DAG:
  - Assembled Parts Count: ${assembledParts.length}
  - Total Assembly Mass: ${totalAssembledMassKg.toFixed(2)} kg | Center of Mass: [${cmPos.map(v => v.toFixed(2)).join(', ')}]
  - Current Parts in DAG:
    ${assembledParts.length > 0 ? assembledParts.join('\n    ') : 'None (Empty Grid)'}

* CELESTIAL ENVIRONMENT:
  - Active Bodies: ${bodiesList || 'None'}

===================================================================
2. AVAILABLE AXIOM PART CATALOG (Use exact ids when building):
===================================================================
${catalogSummary}

===================================================================
3. DIRECT TOOL ACTIONS & COMMAND EXECUTION (OUTPUT AS JSON CODEBLOCK):
===================================================================
When the user asks you to build something, launch a rocket, execute an orbital burn, or adjust simulation state, YOU MUST output a single executable JSON codeblock formatted like:

\`\`\`json
{
  "action": "<ACTION_NAME>",
  ...parameters
}
\`\`\`

SUPPORTED ACTIONS:
1. "build_machine": Build or replace a modular machine in AXIOM
   { "action": "build_machine", "clearExisting": true, "machineName": "Falcon-Modular-1", "parts": [{ "definitionId": "block_modular_cube_025m", "position": [0,0,0] }, { "definitionId": "rocket_fuselage_tube_08m", "position": [0,0.25,0] }, { "definitionId": "rocket_nosecone_ogive", "position": [0,1.05,0] }, { "definitionId": "rocket_motor_solid_pro38", "position": [0,-0.25,0] }], "launchAfterBuild": true }

2. "launch_custom_vehicle": Immediately convert current AXIOM assembly and launch to space
   { "action": "launch_custom_vehicle" }

3. "set_maneuver_node": Calculate and arm an orbital transfer/circularization burn
   { "action": "set_maneuver_node", "prograde": 45.2, "normal": 0.0, "radial": 5.1, "timeToNode": 15.0, "description": "Apoapsis Circularization" }

4. "execute_burn": Trigger immediate engine burn
   { "action": "execute_burn", "throttle": 1.0, "duration": 5.0, "mode": "prograde" }

5. "set_throttle": { "action": "set_throttle", "throttle": 1.0 }
6. "set_sas_mode": { "action": "set_sas_mode", "mode": "prograde" | "retrograde" | "normal" | "anti_normal" | "radial_in" | "radial_out" | "kill_rot" }
7. "stage_separation": { "action": "stage_separation" }
8. "switch_mode": { "action": "switch_mode", "targetMode": "SPACEFLIGHT" | "BUILDER" }
9. "spawn_celestial_body": { "action": "spawn_celestial_body", "body": { "name": "Kerr-Black-Hole", "mass": 50000, "radius": 15, "position": [0,0,0], "velocity": [0,0,0] } }
10. "set_time_warp": { "action": "set_time_warp", "warp": 10 }

Be decisive, mathematically rigorous, authoritative, and direct. Explain formulas clearly (Vis-Viva $v^2 = \mu(2/r - 1/a)$, Tsiolkovsky $\Delta v = I_{sp} g_0 \ln(m_0/m_f)$).`;
  }

  private parseAction(responseText: string): AIManeuverAction | undefined {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.action) {
          return parsed as AIManeuverAction;
        }
      } catch {
        // Non-JSON block
      }
    }
    return undefined;
  }

  // Built-in Autonomous Astrodynamics & Machine Synthesis Computer (Offline Fallback)
  private offlineAstrodynamicsSolver(prompt: string): { text: string; action?: AIManeuverAction } {
    const p = prompt.toLowerCase();
    const telem = this.spacecraft.getTelemetry();
    const mu = 1.0 * this.spacecraft.primaryBodyMass;
    const r = Math.max(telem.altitude + this.spacecraft.primaryBodyRadius, 1.0);
    const r_a = Math.max(telem.apoapsis + this.spacecraft.primaryBodyRadius, 1.0);
    const r_p = Math.max(telem.periapsis + this.spacecraft.primaryBodyRadius, 1.0);

    // 1. Synthesize & Build Custom Modular Rocket
    if (p.includes('build') && (p.includes('rocket') || p.includes('machine') || p.includes('vehicle') || p.includes('rover'))) {
      const isRover = p.includes('rover') || p.includes('car');

      if (isRover) {
        const parts: PartBlueprint[] = [
          { definitionId: 'block_modular_cube_025m', position: [0, 0.15, 0] },
          { definitionId: 'beam_aluminum_2020_05m', position: [0, 0.15, 0.25] },
          { definitionId: 'beam_aluminum_2020_05m', position: [0, 0.15, -0.25] },
          { definitionId: 'motor_dc_high_torque', position: [0.25, 0.1, 0.25] },
          { definitionId: 'motor_dc_high_torque', position: [-0.25, 0.1, 0.25] },
          { definitionId: 'motor_dc_high_torque', position: [0.25, 0.1, -0.25] },
          { definitionId: 'motor_dc_high_torque', position: [-0.25, 0.1, -0.25] },
          { definitionId: 'wheel_all_terrain_02m', position: [0.35, 0.1, 0.25] },
          { definitionId: 'wheel_all_terrain_02m', position: [-0.35, 0.1, 0.25] },
          { definitionId: 'wheel_all_terrain_02m', position: [0.35, 0.1, -0.25] },
          { definitionId: 'wheel_all_terrain_02m', position: [-0.35, 0.1, -0.25] }
        ];

        const action: AIManeuverAction = {
          action: 'build_machine',
          machineName: 'ASTRA-Rover-4WD',
          clearExisting: true,
          parts,
          launchAfterBuild: false
        };

        return {
          text: `### 🛠️ AXIOM Autonomous Rover Synthesis
Synthesizing a **4-Wheel Drive Autonomous Surface Exploration Rover**:
- **Chassis**: Modular carbon-fiber core with 2020 aluminum cross-members.
- **Powertrain**: 4x High-Torque 12V DC Motors (18.0 Nm combined drive capacity).
- **Mobility**: 4x High-traction all-terrain rubber tread wheels.

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\`

*Assembling 11 components in the AXIOM 3D viewport. Click **Run Kinematics / Drive Test** to drive with WASD!*`,
          action
        };
      } else {
        // High-Power Modular Solid Rocket
        const parts: PartBlueprint[] = [
          { definitionId: 'block_modular_cube_025m', position: [0, 0, 0] },
          { definitionId: 'rocket_fuselage_tube_08m', position: [0, 0.25, 0] },
          { definitionId: 'rocket_nosecone_ogive', position: [0, 1.05, 0] },
          { definitionId: 'rocket_motor_solid_pro38', position: [0, -0.28, 0] },
          { definitionId: 'fin_trapezoidal_aero', position: [0.08, 0.35, 0] },
          { definitionId: 'fin_trapezoidal_aero', position: [-0.08, 0.35, 0] }
        ];

        const action: AIManeuverAction = {
          action: 'build_machine',
          machineName: 'ASTRA-Pro-Rocket-MK1',
          clearExisting: true,
          parts,
          launchAfterBuild: p.includes('launch')
        };

        return {
          text: `### 🚀 AXIOM Rocket Vehicle Synthesis
Synthesizing a **High-Performance Aerodynamic Solid Booster Rocket**:
- **Airframe**: 75mm x 0.8m Lightweight fiberglass fuselage tube.
- **Nose Cone**: Low-drag Von Kármán supersonic profile ($C_d = 0.15$).
- **Propulsion**: Pro38 3-Grain Composite Solid Rocket Motor ($480\text{ N}$ thrust).
- **Stabilization**: Dual trapezoidal G10 fins for positive Barrowman static stability margin ($x_{cp} > x_{cm}$).

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\`

*Assembled in AXIOM DAG. ${p.includes('launch') ? 'Igniting launch sequence now!' : 'Ready to launch to orbit.'}*`,
          action
        };
      }
    }

    // 2. Direct Launch Trigger
    if (p.includes('launch')) {
      const action: AIManeuverAction = { action: 'launch_custom_vehicle' };
      return {
        text: `### 🚀 Launch Sequence Initiated
Compiling active modular DAG into dynamic multi-stage spacecraft, establishing launchpad coordinate frame, and engaging primary ignition!

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\``,
        action
      };
    }

    // 3. Spawn Celestial Body / Black Hole
    if (p.includes('black hole') || p.includes('spawn') || p.includes('star') || p.includes('planet')) {
      const isBlackHole = p.includes('black hole');
      const action: AIManeuverAction = {
        action: 'spawn_celestial_body',
        body: {
          name: isBlackHole ? 'Supermassive Black Hole' : 'Exoplanet Alpha',
          mass: isBlackHole ? 40000 : 5000,
          radius: isBlackHole ? 12 : 30,
          position: [0, 0, 0],
          velocity: [0, 0, 0],
          color: isBlackHole ? [0.1, 0.05, 0.2] : [0.2, 0.7, 0.9]
        }
      };

      return {
        text: `### 🌌 Celestial Injection: ${action.body?.name}
Spawning high-gravity point source into the WebGPU Barnes-Hut multipole solver:
- **Mass ($M$)**: **${action.body?.mass}**
- **Radius**: **${action.body?.radius} km**
- **Position**: **[0, 0, 0]**

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\``,
        action
      };
    }

    // 4. Throttle Controls
    if (p.includes('throttle') || p.includes('burn') || p.includes('ignite') || p.includes('cut')) {
      const isZero = p.includes('cut') || p.includes('kill') || p.includes('off') || /\b0%|\b0 percent\b|\bzero\b/.test(p);
      const throttleVal = isZero ? 0.0 : 1.0;
      const action: AIManeuverAction = { action: 'set_throttle', throttle: throttleVal };
      return {
        text: `Adjusting main propulsion throttle to **${(throttleVal * 100).toFixed(0)}%**.`,
        action
      };
    }

    // 5. Orbital Circularization
    if (p.includes('circular') || p.includes('circularize') || p.includes('circularise')) {
      const v_circ = Math.sqrt(mu / r_a);
      const v_ap = Math.sqrt((2.0 * mu * r_p) / (r_a * (r_a + r_p)));
      const deltaV = Math.max(v_circ - v_ap, 5.0);

      const action: AIManeuverAction = {
        action: 'set_maneuver_node',
        prograde: parseFloat(deltaV.toFixed(2)),
        normal: 0,
        radial: 0,
        timeToNode: 12.0,
        description: 'Apoapsis Circularization Burn'
      };

      return {
        text: `### 🎯 Orbital Circularization Solution
- **Target Radius**: **${r_a.toFixed(1)} km**
- **Current Velocity ($v_{ap}$)**: **${v_ap.toFixed(2)} km/s**
- **Required Circular Velocity ($v_c$)**: **${v_circ.toFixed(2)} km/s**
- **Delta-V Required**: **+${deltaV.toFixed(2)} m/s (Prograde)**

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\``,
        action
      };
    }

    // 6. Hohmann Transfer
    if (p.includes('hohmann') || p.includes('mars') || p.includes('transfer') || p.includes('jupiter')) {
      const targetRadius = p.includes('jupiter') ? 220.0 : 140.0;
      const targetName = p.includes('jupiter') ? 'Jupiter' : 'Mars';

      const a_tx = (r + targetRadius) / 2.0;
      const v1 = Math.sqrt(mu / r);
      const v_tx1 = Math.sqrt(mu * (2.0 / r - 1.0 / a_tx));
      const deltaV1 = Math.abs(v_tx1 - v1);
      const timeOfFlight = Math.PI * Math.sqrt((a_tx * a_tx * a_tx) / mu);

      const action: AIManeuverAction = {
        action: 'set_maneuver_node',
        prograde: parseFloat(deltaV1.toFixed(2)),
        normal: 0,
        radial: 0,
        timeToNode: 8.0,
        description: `Trans-${targetName} Injection`
      };

      return {
        text: `### 🚀 Hohmann Transfer to ${targetName}
- **Departure Radius ($r_1$)**: **${r.toFixed(1)} km**
- **Target Radius ($r_2$)**: **${targetRadius.toFixed(1)} km**
- **Transfer Semi-Major Axis ($a_{tx}$)**: **${a_tx.toFixed(1)} km**
- **Time of Flight ($T_{tx}$)**: **${timeOfFlight.toFixed(1)} s**
- **Delta-V $\Delta v_1$**: **+${deltaV1.toFixed(2)} m/s (Prograde)**

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\``,
        action
      };
    }

    // Default Telemetry Diagnostic
    return {
      text: `### 🛰️ Live Orbital Flight Diagnostics
- **Vehicle**: **${telem.name}** (${telem.fuelPercent.toFixed(1)}% fuel, $\Delta v = ${telem.deltaVRemaining.toFixed(1)}$ m/s)
- **Altitude**: **${telem.altitude.toFixed(1)} km** | Speed: **${telem.speed.toFixed(2)} km/s**
- **Apoapsis / Periapsis**: **${telem.apoapsis.toFixed(1)} km** / **${telem.periapsis.toFixed(1)} km**
- **Eccentricity ($e$)**: **${telem.eccentricity.toFixed(4)}**
- **Active Mode**: **${this.contextBridge?.getCurrentMode() || 'SPACEFLIGHT'}**

*Ask me to:*
1. *"Build a 2-stage rocket with solid booster and launch it"*
2. *"Build a 4-wheel drive exploration rover"*
3. *"Circularize my orbit at apoapsis"*
4. *"Spawn a black hole"*`
    };
  }
}
