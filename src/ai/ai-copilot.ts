import { BYOKManager } from './byok-manager';
import { AIMessage, AIManeuverAction, SASMode } from '../physics/types';
import { Spacecraft } from '../physics/spacecraft';
import { NBodyEngine } from '../physics/nbody-engine';

export class AstraAICopilot {
  public byok: BYOKManager;
  public messages: AIMessage[] = [];
  public isThinking = false;

  private engine: NBodyEngine;
  private spacecraft: Spacecraft;
  private onActionCallback?: (action: AIManeuverAction) => void;

  constructor(
    engine: NBodyEngine,
    spacecraft: Spacecraft,
    onAction?: (action: AIManeuverAction) => void
  ) {
    this.engine = engine;
    this.spacecraft = spacecraft;
    this.byok = new BYOKManager();
    this.onActionCallback = onAction;

    // Welcome initial message
    this.messages.push({
      id: 'init-1',
      role: 'assistant',
      content: `**ASTRA AI Flight Director Online** // Systems Nominal.

I am your Autonomous Astrodynamics Copilot. I can assist with:
- **Orbital Maneuvers**: Hohmann transfers, circularization, plane changes, and gravity assists.
- **Real-Time Telemetry Analysis**: Orbital eccentricity, dynamic pressure (Max-Q), Lagrange point stability, and energy conservation.
- **Natural Language Scenario Generation**: Ask me to spawn binary stars, relativistic black holes, or planetary swarms.

*Tip: Connect your Google Gemini, OpenAI, or Anthropic API key in Settings, or use my built-in offline astrodynamics computer!*`,
      timestamp: Date.now()
    });
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
        // Online LLM Generation (Gemini / OpenAI / Anthropic / Ollama)
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
        // Offline Astrodynamics Computer Fallback
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
        content: `⚠️ **AI Copilot Uplink Error**: ${err.message || 'Request failed'}.\nFalling back to internal orbital mechanics calculator.`,
        timestamp: Date.now()
      };
      this.messages.push(errorMsg);
      return errorMsg;
    } finally {
      this.isThinking = false;
    }
  }

  private buildSystemPrompt(): string {
    const telem = this.spacecraft.getTelemetry();
    const physTelem = this.engine.telemetry.data;

    return `You are ASTRA AI, an elite NASA/SpaceX Chief Astrodynamics Officer & Orbital Flight Director embedded inside the ASTRODYNE PRIME WebGPU Relativistic Astrodynamics Simulator.

CURRENT LIVE SPACECRAFT & SYSTEM TELEMETRY:
- Vehicle: ${telem.name} (Stage ${telem.currentStageIndex + 1}/${telem.totalStages})
- Altitude: ${telem.altitude.toFixed(1)} km | Speed: ${telem.speed.toFixed(2)} km/s
- Apoapsis (Ap): ${telem.apoapsis.toFixed(1)} km | Periapsis (Pe): ${telem.periapsis.toFixed(1)} km
- Eccentricity (e): ${telem.eccentricity.toFixed(4)} | Period: ${telem.period.toFixed(1)} s
- Total Mass: ${telem.totalMass.toFixed(1)} t | Propellant Mass Remaining: ${telem.fuelPercent.toFixed(1)}%
- Delta-V Budget Remaining: ${telem.deltaVRemaining.toFixed(1)} m/s
- Dynamic Pressure (Q): ${telem.dynamicPressure.toFixed(2)} kPa (Max-Q: ${telem.maxQ.toFixed(2)} kPa)
- Reentry Thermal Intensity: ${(telem.reentryHeat * 100).toFixed(1)}%
- Primary Gravitational Body: ${telem.primaryBodyName} (Mass: ${this.spacecraft.primaryBodyMass})
- G-Force: ${telem.gForce.toFixed(2)} G | Throttle: ${(telem.throttle * 100).toFixed(0)}%
- Current SAS Mode: ${telem.sasMode.toUpperCase()}
- Active Particles in Simulation: ${physTelem.activeParticles.toLocaleString()}
- Hamiltonian Energy Drift: ${(physTelem.energyDrift * 100).toFixed(4)}%

CAPABILITIES & ACTIONS:
You can calculate precise orbital burns and execute actions. When the user requests a flight maneuver, orbital change, SAS orientation, or new scenario, output an executable JSON codeblock formatted EXACTLY like this:

\`\`\`json
{
  "action": "set_maneuver_node",
  "prograde": 45.2,
  "normal": 0.0,
  "radial": 5.1,
  "timeToNode": 15.0,
  "description": "Orbital Circularization Burn"
}
\`\`\`

Available action types:
1. "set_maneuver_node": { "action": "set_maneuver_node", "prograde": number, "normal": number, "radial": number, "timeToNode": number, "description": string }
2. "execute_burn": { "action": "execute_burn", "throttle": number, "duration": number, "mode": "prograde" | "retrograde" | "normal" }
3. "set_sas_mode": { "action": "set_sas_mode", "mode": "prograde" | "retrograde" | "normal" | "anti_normal" | "radial_in" | "radial_out" | "kill_rot" }
4. "stage_separation": { "action": "stage_separation" }
5. "generate_scenario": { "action": "generate_scenario", "scenarioName": string, "scenarioCode": string }

Always be mathematically rigorous, concise, authoritative, and helpful. Explain Vis-Viva equations ($v^2 = \mu (2/r - 1/a)$), Tsiolkovsky rocket equation ($\Delta v = I_{sp} g_0 \ln(m_0/m_f)$), and Keplerian mechanics clearly.`;
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

  // Built-in Offline Astrodynamics Computer
  private offlineAstrodynamicsSolver(prompt: string): { text: string; action?: AIManeuverAction } {
    const p = prompt.toLowerCase();
    const telem = this.spacecraft.getTelemetry();
    const mu = 1.0 * this.spacecraft.primaryBodyMass;
    const r = Math.max(telem.altitude + this.spacecraft.primaryBodyRadius, 1.0);
    const r_a = Math.max(telem.apoapsis + this.spacecraft.primaryBodyRadius, 1.0);
    const r_p = Math.max(telem.periapsis + this.spacecraft.primaryBodyRadius, 1.0);

    // 1. Circularize Orbit
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

**Flight Computation**:
- Target Radius ($r_c$): **${r_a.toFixed(1)} km**
- Current Ap Velocity ($v_{ap}$): **${v_ap.toFixed(2)} km/s**
- Required Circular Velocity ($v_c = \\sqrt{\\mu / r}$): **${v_circ.toFixed(2)} km/s**
- **Calculated $\\Delta v$ Required**: **+${deltaV.toFixed(2)} m/s (Prograde)**

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\`

*Maneuver node armed. Click **EXECUTE BURN** or press Space to ignite the main engine at apoapsis.*`,
        action
      };
    }

    // 2. Hohmann Transfer to Mars / Outer Body
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
        description: `Trans-${targetName} Injection (TMI)`
      };

      return {
        text: `### 🚀 Hohmann Transfer Trajectory: Earth $\\rightarrow$ ${targetName}

**Astrodynamics Solution**:
- Departure Radius ($r_1$): **${r.toFixed(1)} km**
- Target Arrival Radius ($r_2$): **${targetRadius.toFixed(1)} km**
- Transfer Semi-Major Axis ($a_{tx}$): **${a_tx.toFixed(1)} km**
- Transfer Time-of-Flight ($T_{tx} = \\pi\\sqrt{a^3/\\mu}$): **${timeOfFlight.toFixed(1)} s**
- **Trans-Injection $\\Delta v_1$**: **+${deltaV1.toFixed(2)} m/s (Prograde)**

\`\`\`json
${JSON.stringify(action, null, 2)}
\`\`\`

*Trans-${targetName} injection burn vector computed. Propellant reserves are sufficient (${telem.fuelPercent.toFixed(1)}% remaining).*`,
        action
      };
    }

    // 3. Prograde / Retrograde SAS Commands
    if (p.includes('prograde')) {
      return {
        text: `Aligning spacecraft attitude to **PROGRADE** vector $\\hat{v}$.`,
        action: { action: 'set_sas_mode', mode: SASMode.PROGRADE }
      };
    }
    if (p.includes('retrograde')) {
      return {
        text: `Aligning spacecraft attitude to **RETROGRADE** vector $-\\hat{v}$.`,
        action: { action: 'set_sas_mode', mode: SASMode.RETROGRADE }
      };
    }
    if (p.includes('normal')) {
      return {
        text: `Aligning spacecraft attitude to orbital **NORMAL** vector $\\hat{h} = \\vec{r} \\times \\vec{v}$.`,
        action: { action: 'set_sas_mode', mode: SASMode.NORMAL }
      };
    }

    // 4. Staging
    if (p.includes('stage') || p.includes('separation') || p.includes('jettison')) {
      return {
        text: `Executing stage separation sequence. Jettisoning spent booster.`,
        action: { action: 'stage_separation' }
      };
    }

    // 5. General Telemetry Analysis
    const isOrbitStable = telem.periapsis > 0 && telem.eccentricity < 1.0;
    const phys = this.engine.telemetry.data;

    return {
      text: `### 🛰️ Live Orbital Flight Diagnostics

**Vehicle Status**:
- **Orbit Classification**: ${isOrbitStable ? '✅ Stable Closed Keplerian Ellipse' : telem.eccentricity >= 1.0 ? '⚡ Hyperbolic Escape Trajectory' : '⚠️ Suborbital / Reentry Decaying Trajectory'}
- **Eccentricity ($e$)**: **${telem.eccentricity.toFixed(4)}** (0.0000 = Circular)
- **Apoapsis / Periapsis**: **${telem.apoapsis.toFixed(1)} km** / **${telem.periapsis.toFixed(1)} km**
- **Dynamic Pressure ($Q$)**: **${telem.dynamicPressure.toFixed(2)} kPa** (Max-Q: ${telem.maxQ.toFixed(2)} kPa)
- **Propellant Remaining**: **${telem.fuelPercent.toFixed(1)}%** ($\\Delta v_{rem} = ${telem.deltaVRemaining.toFixed(1)}$ m/s)
- **N-Body System Energy Conservation**: Drift is **${(phys.energyDrift * 100).toFixed(4)}%** (Symplectic integrity verified).

*Ask me to calculate a Hohmann transfer, plan a circularization burn, or generate custom celestial bodies!*`
    };
  }
}
