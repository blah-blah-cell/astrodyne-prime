import { ControlsPanel } from './controls-panel.js';
import { PresetsPanel } from './presets-panel.js';
import { TelemetryPanel } from './telemetry-panel.js';
import { FlightDirectorHUD } from './flight-director-hud.js';
import { AstraDrawer } from './astra-drawer.js';
import { AstraAICopilot } from '../ai/ai-copilot.js';
import { AIManeuverAction, CameraViewMode, CelestialBodyInfo, MouseTool, PresetConfig, RocketStage } from '../physics/types.js';
import { NBodyEngine } from '../physics/nbody-engine.js';
import { ParticleRenderer } from '../renderer/renderer.js';
import { PRESETS } from '../physics/presets.js';
import { PartGraph } from '../builder/part-graph.js';
import { PART_CATALOG } from '../builder/catalog.js';
import { PartCategory, SocketType, SocketGender } from '../builder/types.js';
import { BuilderViewport } from '../builder/builder-view.js';
import { BuilderUI } from '../builder/builder-ui.js';
import { CADStudioView } from '../cad/cad-studio-view.js';
import { RocketryStudioView } from '../rocketry/rocketry-studio-view.js';
import { RoboticsStudioView } from '../robotics/robotics-studio-view.js';

export type StudioMode = 'SPACEFLIGHT' | 'BUILDER' | 'CAD' | 'ROCKETRY' | 'ROBOTICS';

export class UIController {
  public telemetryPanel: TelemetryPanel;
  public presetsPanel: PresetsPanel;
  public controlsPanel: ControlsPanel;
  public flightDirectorHUD: FlightDirectorHUD;
  public astraDrawer: AstraDrawer;
  public astraCopilot: AstraAICopilot;

  // AXIOM Modular Builder
  public partGraph: PartGraph;
  public builderViewport: BuilderViewport;
  public builderUI: BuilderUI;

  // Engineering Studios
  public cadStudio?: CADStudioView;
  public rocketryStudio?: RocketryStudioView;
  public roboticsStudio?: RoboticsStudioView;

  public currentMode: StudioMode = 'SPACEFLIGHT';

  private engine: NBodyEngine;
  private renderer: ParticleRenderer;
  private onLoadPreset: (preset: PresetConfig, count: number) => void;

  public activeTab: 'presets' | 'controls' | 'telemetry' = 'presets';
  private activeKeys = new Set<string>();

  constructor(
    engine: NBodyEngine,
    renderer: ParticleRenderer,
    onLoadPreset: (preset: PresetConfig, count: number) => void
  ) {
    this.engine = engine;
    this.renderer = renderer;
    this.onLoadPreset = onLoadPreset;

    // 1. AI Copilot Instance with Action Callback
    this.astraCopilot = new AstraAICopilot(
      engine,
      engine.spacecraft,
      (action) => this.handleAIManeuverAction(action)
    );

    const hudContainer = document.getElementById('flight-director-container') || document.body;
    const astraContainer = document.getElementById('astra-container') || document.body;
    const telemContainer = document.getElementById('telemetry-content')!;
    const presetsContainer = document.getElementById('presets-content')!;
    const controlsContainer = document.getElementById('controls-content')!;

    // 2. Flight Director HUD
    this.flightDirectorHUD = new FlightDirectorHUD(
      hudContainer,
      engine,
      renderer,
      () => this.astraDrawer.toggleDrawer()
    );

    // 3. ASTRA AI Drawer
    this.astraDrawer = new AstraDrawer(
      astraContainer,
      this.astraCopilot,
      (action) => this.handleAIManeuverAction(action)
    );

    // 4. AXIOM Builder Engine & Viewport
    this.partGraph = new PartGraph('Custom Modular Machine');
    this.partGraph.registerDefinitions(PART_CATALOG);

    const builderViewportContainer = document.createElement('div');
    builderViewportContainer.id = 'builder-viewport-container';
    builderViewportContainer.style.position = 'absolute';
    builderViewportContainer.style.top = '0';
    builderViewportContainer.style.left = '0';
    builderViewportContainer.style.width = '100vw';
    builderViewportContainer.style.height = '100vh';
    builderViewportContainer.style.zIndex = '5';
    builderViewportContainer.style.display = 'none';
    document.body.appendChild(builderViewportContainer);

    this.builderViewport = new BuilderViewport(builderViewportContainer, this.partGraph);

    const builderContainer = document.createElement('div');
    builderContainer.id = 'builder-ui-container';
    document.body.appendChild(builderContainer);

    this.builderUI = new BuilderUI(
      builderContainer,
      this.builderViewport,
      this.partGraph,
      () => this.handleLaunchCustomMachine()
    );

    // 5. Initialize OpenSCAD CAD Studio Container
    const cadContainer = document.createElement('div');
    cadContainer.id = 'cad-studio-container';
    cadContainer.className = 'studio-fullscreen-container';
    cadContainer.style.display = 'none';
    document.body.appendChild(cadContainer);

    this.cadStudio = new CADStudioView(cadContainer, (res) => {
      // Import custom CAD mesh into AXIOM part graph
      const customDefId = `cad_part_${Date.now()}`;
      this.partGraph.registerDefinitions([{
        id: customDefId,
        name: 'Custom CAD Solid',
        category: PartCategory.STRUCTURAL,
        description: `OpenSCAD generated solid (${(res.volumeMm3 / 1000).toFixed(1)} cm³)`,
        massKg: Math.max(0.1, (res.volumeMm3 / 1000) * 0.00124),
        centerOfMass: [0, 0, 0],
        dimensions: [0.1, 0.1, 0.1],
        physicsShape: 'BOX',
        createMesh: () => res.mesh.clone(),
        sockets: [
          { id: 'top', name: 'Top Hex Mount', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.NEUTRAL, localPosition: [0, 0.1, 0], localNormal: [0, 1, 0] },
          { id: 'bottom', name: 'Bottom Hex Mount', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.NEUTRAL, localPosition: [0, -0.1, 0], localNormal: [0, -1, 0] }
        ]
      }]);
      document.getElementById('btn-nav-builder')?.click();
    });

    // 6. Initialize OpenRocket Studio Container
    const rocketryContainer = document.createElement('div');
    rocketryContainer.id = 'rocketry-studio-container';
    rocketryContainer.className = 'studio-fullscreen-container';
    rocketryContainer.style.display = 'none';
    document.body.appendChild(rocketryContainer);

    this.rocketryStudio = new RocketryStudioView(rocketryContainer, (config, summary) => {
      // Direct Launch from OpenRocket to Spaceflight
      const totalMass = summary.stability.totalMassKg;
      const propMass = config.propellantMassKg;
      const dryMass = Math.max(0.1, totalMass - propMass);

      const customStage: RocketStage = {
        id: 1,
        name: config.name || 'OpenRocket Booster',
        dryMass,
        fuelMass: propMass,
        maxFuelMass: propMass,
        maxThrust: config.motorThrustN / 100,
        isp: 290,
        burnRate: propMass / Math.max(0.1, config.motorBurnTimeSec),
        ignited: true,
        separated: false
      };

      this.engine.spacecraft.active = true;
      this.engine.spacecraft.name = config.name || 'OpenRocket-1';
      this.engine.spacecraft.stages = [customStage];
      this.engine.spacecraft.currentStageIndex = 0;
      this.engine.spacecraft.position = [0, 10.5, 0];
      this.engine.spacecraft.velocity = [0, 0, 0];
      this.engine.spacecraft.throttle = 1.0;
      this.engine.spacecraft.isLaunchPad = true;
      this.engine.spacecraft.calculateDeltaV();
      this.engine.spacecraft.updateKeplerianElements();

      document.getElementById('btn-nav-spaceflight')?.click();
    });

    // 7. Initialize URDF Robotics Studio Container
    const roboticsContainer = document.createElement('div');
    roboticsContainer.id = 'robotics-studio-container';
    roboticsContainer.className = 'studio-fullscreen-container';
    roboticsContainer.style.display = 'none';
    document.body.appendChild(roboticsContainer);

    this.roboticsStudio = new RoboticsStudioView(roboticsContainer);

    // Context Bridge for AI Telemetry
    this.astraCopilot.setContextBridge({
      getCurrentMode: () => (this.currentMode === 'BUILDER' ? 'BUILDER' : 'SPACEFLIGHT'),
      getPartGraph: () => this.partGraph
    });

    this.telemetryPanel = new TelemetryPanel(telemContainer, engine.telemetry);
    
    this.presetsPanel = new PresetsPanel(presetsContainer, (preset, count) => {
      this.onLoadPreset(preset, count);
    });

    this.controlsPanel = new ControlsPanel(
      controlsContainer,
      engine.params,
      renderer.params,
      () => {},
      () => {
        const currentPreset = PRESETS.find(p => p.id === this.presetsPanel.currentPresetId) || PRESETS[0];
        this.onLoadPreset(currentPreset, this.presetsPanel.selectedCount);
      },
      (tool) => {
        this.handleToolChange(tool);
      }
    );

    this.initTabs();
    this.initModeNavigation();
    this.initKeyboardControls();
  }

  private initModeNavigation(): void {
    const btnSpace = document.getElementById('btn-nav-spaceflight');
    const btnBuilder = document.getElementById('btn-nav-builder');
    const btnCad = document.getElementById('btn-nav-cad');
    const btnRocketry = document.getElementById('btn-nav-rocketry');
    const btnRobotics = document.getElementById('btn-nav-robotics');

    const allBtns = [btnSpace, btnBuilder, btnCad, btnRocketry, btnRobotics];

    const hudPanel = document.getElementById('hud-left-panel');
    const scHud = document.getElementById('spacecraft-hud');
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    const cadCont = document.getElementById('cad-studio-container');
    const rockCont = document.getElementById('rocketry-studio-container');
    const robCont = document.getElementById('robotics-studio-container');

    const switchStudio = (mode: StudioMode, activeBtn: HTMLElement | null) => {
      this.currentMode = mode;
      allBtns.forEach(b => b?.classList.remove('active'));
      activeBtn?.classList.add('active');

      // Hide all by default
      if (hudPanel) hudPanel.style.display = 'none';
      if (scHud) scHud.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
      this.builderUI.setVisible(false);
      if (cadCont) cadCont.style.display = 'none';
      if (rockCont) rockCont.style.display = 'none';
      if (robCont) robCont.style.display = 'none';

      if (mode === 'SPACEFLIGHT') {
        if (hudPanel) hudPanel.style.display = 'flex';
        if (scHud) scHud.style.display = 'flex';
        if (sidebar) sidebar.style.display = 'flex';
        this.renderer.params.cameraMode = CameraViewMode.CHASE_SPACECRAFT;
      } else if (mode === 'BUILDER') {
        this.builderUI.setVisible(true);
        this.builderUI.updateTelemetry();
      } else if (mode === 'CAD') {
        if (cadCont) cadCont.style.display = 'flex';
        this.cadStudio?.resize();
      } else if (mode === 'ROCKETRY') {
        if (rockCont) rockCont.style.display = 'flex';
      } else if (mode === 'ROBOTICS') {
        if (robCont) robCont.style.display = 'flex';
        this.roboticsStudio?.resize();
      }
    };

    btnSpace?.addEventListener('click', () => switchStudio('SPACEFLIGHT', btnSpace));
    btnBuilder?.addEventListener('click', () => switchStudio('BUILDER', btnBuilder));
    btnCad?.addEventListener('click', () => switchStudio('CAD', btnCad));
    btnRocketry?.addEventListener('click', () => switchStudio('ROCKETRY', btnRocketry));
    btnRobotics?.addEventListener('click', () => switchStudio('ROBOTICS', btnRobotics));
  }

  public handleLaunchCustomMachine(): void {
    const totalMass = this.partGraph.assembly.totalMassKg || 5.0;
    
    let totalThrustN = 0;
    let propellantKg = 0;
    let burnSec = 3.0;

    for (const [_, inst] of this.partGraph.assembly.parts.entries()) {
      const def = this.partGraph.getDefinition(inst.definitionId);
      if (def?.properties?.thrustN) {
        totalThrustN += def.properties.thrustN;
        propellantKg += def.properties.propellantMassKg || 0.5;
        burnSec = def.properties.burnTimeSec || 3.0;
      }
    }

    if (totalThrustN === 0) {
      totalThrustN = 800;
      propellantKg = totalMass * 0.4;
    }

    const customStage: RocketStage = {
      id: 1,
      name: 'AXIOM Custom Booster',
      dryMass: Math.max(1.0, totalMass - propellantKg),
      fuelMass: propellantKg,
      maxFuelMass: propellantKg,
      maxThrust: totalThrustN / 100,
      isp: 280,
      burnRate: propellantKg / burnSec,
      ignited: true,
      separated: false
    };

    this.engine.spacecraft.active = true;
    this.engine.spacecraft.name = this.partGraph.assembly.name || 'AXIOM-1 MK-I';
    this.engine.spacecraft.stages = [customStage];
    this.engine.spacecraft.currentStageIndex = 0;
    this.engine.spacecraft.position = [0, 10.5, 0];
    this.engine.spacecraft.velocity = [0, 0, 0];
    this.engine.spacecraft.throttle = 1.0;
    this.engine.spacecraft.isLaunchPad = true;
    this.engine.spacecraft.calculateDeltaV();
    this.engine.spacecraft.updateKeplerianElements();

    document.getElementById('btn-nav-spaceflight')?.click();
    console.log(`[AXIOM] Launched Custom Machine with ${totalThrustN}N thrust!`);
  }

  private initTabs(): void {
    const tabButtons = document.querySelectorAll('.nav-tab');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as 'presets' | 'controls' | 'telemetry';
        this.activeTab = tab;
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');
      });
    });
  }

  private handleToolChange(tool: MouseTool): void {
    this.engine.mouseToolId = (tool === MouseTool.GRAVITY_WELL) ? 1 : (tool === MouseTool.REPULSOR) ? 2 : 0;
  }

  public handleAIManeuverAction(action: AIManeuverAction): void {
    console.log('[ASTRA AI Action Received]', action);
    const sc = this.engine.spacecraft;

    // 0. OpenSCAD CAD Model Generation
    if (action.action === 'generate_cad_model') {
      document.getElementById('btn-nav-cad')?.click();
      if (action.cadScript && this.cadStudio) {
        const editor = document.getElementById('cad-code-editor') as HTMLTextAreaElement;
        if (editor) {
          editor.value = action.cadScript;
          this.cadStudio.compileCurrentScript();
        }
      }
    }

    // 0.1 OpenRocket Aerodynamics & Stability Simulation
    else if (action.action === 'simulate_rocket_aero') {
      document.getElementById('btn-nav-rocketry')?.click();
      if (action.rocketConfig && this.rocketryStudio) {
        this.rocketryStudio.runSimulation();
        if (action.launchAfterAeroSim) {
          setTimeout(() => {
            document.getElementById('btn-launch-aero-sim')?.click();
          }, 1000);
        }
      }
    }

    // 0.2 URDF Robotics & DH Kinematics Configuration
    else if (action.action === 'configure_robot_chain') {
      document.getElementById('btn-nav-robotics')?.click();
      if (action.dhChain && this.roboticsStudio) {
        this.roboticsStudio.updateKinematics();
      }
    }

    // 1. Orbital Maneuvers & Flight Guidance
    if (action.action === 'set_maneuver_node' && sc) {
      sc.addManeuverNode(
        action.timeToNode || 10.0,
        action.prograde || 0,
        action.normal || 0,
        action.radial || 0,
        action.description || 'AI Computed Maneuver'
      );
      sc.executeActiveManeuver();
    } else if (action.action === 'execute_burn' && sc) {
      sc.throttle = action.throttle ?? 1.0;
      if (action.mode) sc.setSASMode(action.mode);
    } else if (action.action === 'set_throttle' && sc) {
      sc.throttle = Math.max(0.0, Math.min(1.0, action.throttle ?? 1.0));
    } else if (action.action === 'set_sas_mode' && action.mode && sc) {
      sc.setSASMode(action.mode);
    } else if (action.action === 'stage_separation' && sc) {
      sc.separateStage();
    }

    // 2. AXIOM Machine Synthesis & Direct Creation
    else if (action.action === 'build_machine') {
      if (action.clearExisting) {
        this.partGraph.clear();
        while (this.builderViewport.scene.children.length > 0) {
          this.builderViewport.scene.remove(this.builderViewport.scene.children[0]);
        }
      }

      if (action.machineName) {
        this.partGraph.assembly.name = action.machineName;
      }

      if (action.parts && action.parts.length > 0) {
        for (const p of action.parts) {
          const def = this.partGraph.getDefinition(p.definitionId);
          if (!def) continue;

          const mesh = def.createMesh();
          const pos = p.position || [0, 0, 0];
          const quat = p.rotation || [0, 0, 0, 1];

          mesh.position.set(...pos);
          mesh.quaternion.set(...quat);
          this.builderViewport.scene.add(mesh);

          const instanceId = `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          this.partGraph.addPart({
            instanceId,
            definitionId: def.id,
            position: pos,
            rotationQuaternion: quat,
            attachedSockets: new Map(),
            mesh
          });
        }
      }

      this.builderUI.updateTelemetry();
      this.builderViewport.updateSocketMarkers();

      if (action.launchAfterBuild) {
        this.handleLaunchCustomMachine();
      } else {
        document.getElementById('btn-nav-builder')?.click();
      }
    }

    // 3. Direct Launch Trigger
    else if (action.action === 'launch_custom_vehicle') {
      this.handleLaunchCustomMachine();
    }

    // 4. Mode Switching
    else if (action.action === 'switch_mode') {
      if (action.targetMode === 'BUILDER') {
        document.getElementById('btn-nav-builder')?.click();
      } else {
        document.getElementById('btn-nav-spaceflight')?.click();
      }
    }

    // 5. Celestial Body Injection
    else if (action.action === 'spawn_celestial_body' && action.body) {
      const b = action.body;
      const newBody: CelestialBodyInfo = {
        index: this.engine.celestialBodies.length,
        name: b.name,
        radius: b.radius,
        mass: b.mass,
        color: b.color || [0.2, 0.7, 0.9]
      };
      this.engine.celestialBodies.push(newBody);
      console.log(`[ASTRA AI] Spawned new celestial body: ${b.name}`);
    }

    // 6. Time Warp
    else if (action.action === 'set_time_warp' && action.warp) {
      this.engine.params.timeStep = action.warp * 0.016;
    }
  }

  private initKeyboardControls(): void {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      this.activeKeys.add(e.code);

      const sc = this.engine.spacecraft;
      if (!sc || !sc.active) return;

      if (e.code === 'KeyZ') sc.throttle = 1.0;
      if (e.code === 'KeyX') sc.throttle = 0.0;
      if (e.code === 'Space') {
        e.preventDefault();
        sc.separateStage();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.activeKeys.delete(e.code);
    });
  }

  public update(): void {
    this.flightDirectorHUD.update();
    if (this.activeTab === 'telemetry') {
      this.telemetryPanel.update();
    }

    if (this.currentMode === 'BUILDER') {
      this.builderUI.updateTelemetry();
      this.builderViewport.render();

      if (this.builderViewport.isKinematicsTestMode) {
        let driveThrottle = 0;
        let driveSteering = 0;
        if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) driveThrottle += 1.0;
        if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) driveThrottle -= 1.0;
        if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) driveSteering -= 1.0;
        if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) driveSteering += 1.0;

        this.builderViewport.multibodySolver.applyDriveControls(driveThrottle, driveSteering);
      }
    } else if (this.currentMode === 'CAD') {
      this.cadStudio?.render();
    } else if (this.currentMode === 'ROBOTICS') {
      this.roboticsStudio?.render();
    }

    const sc = this.engine.spacecraft;
    if (sc && sc.active && this.currentMode === 'SPACEFLIGHT') {
      if (this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight')) {
        sc.throttle = Math.min(1.0, sc.throttle + 0.02);
      }
      if (this.activeKeys.has('ControlLeft') || this.activeKeys.has('ControlRight')) {
        sc.throttle = Math.max(0.0, sc.throttle - 0.02);
      }

      let pitch = 0, yaw = 0, roll = 0;
      if (this.activeKeys.has('KeyW')) pitch += 1.0;
      if (this.activeKeys.has('KeyS')) pitch -= 1.0;
      if (this.activeKeys.has('KeyA')) yaw -= 1.0;
      if (this.activeKeys.has('KeyD')) yaw += 1.0;
      if (this.activeKeys.has('KeyQ')) roll -= 1.0;
      if (this.activeKeys.has('KeyE')) roll += 1.0;

      if (pitch !== 0 || yaw !== 0 || roll !== 0) {
        sc.rcsTorque = [pitch, yaw, roll];
      } else {
        sc.rcsTorque = [0, 0, 0];
      }
    }
  }
}
