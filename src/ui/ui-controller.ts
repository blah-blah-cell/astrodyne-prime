import { ControlsPanel } from './controls-panel.js';
import { PresetsPanel } from './presets-panel.js';
import { TelemetryPanel } from './telemetry-panel.js';
import { FlightDirectorHUD } from './flight-director-hud.js';
import { AstraDrawer } from './astra-drawer.js';
import { AstraAICopilot } from '../ai/ai-copilot.js';
import { AIManeuverAction, CameraViewMode, MouseTool, PresetConfig, RocketStage } from '../physics/types.js';
import { NBodyEngine } from '../physics/nbody-engine.js';
import { ParticleRenderer } from '../renderer/renderer.js';
import { PRESETS } from '../physics/presets.js';
import { PartGraph } from '../builder/part-graph.js';
import { PART_CATALOG } from '../builder/catalog.js';
import { BuilderViewport } from '../builder/builder-view.js';
import { BuilderUI } from '../builder/builder-ui.js';

export class UIController {
  public telemetryPanel: TelemetryPanel;
  public presetsPanel: PresetsPanel;
  public controlsPanel: ControlsPanel;
  public flightDirectorHUD: FlightDirectorHUD;
  public astraDrawer: AstraDrawer;
  public astraCopilot: AstraAICopilot;

  // AXIOM Modular Builder Subsystem
  public partGraph: PartGraph;
  public builderViewport: BuilderViewport;
  public builderUI: BuilderUI;
  public currentMode: 'SPACEFLIGHT' | 'BUILDER' = 'SPACEFLIGHT';

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

    // 1. AI Copilot Instance
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
    this.partGraph = new PartGraph('Custom Modular Rocket');
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
    const hudPanel = document.getElementById('hud-left-panel');
    const scHud = document.getElementById('spacecraft-hud');

    btnSpace?.addEventListener('click', () => {
      this.currentMode = 'SPACEFLIGHT';
      btnSpace.classList.add('active');
      btnBuilder?.classList.remove('active');

      if (hudPanel) hudPanel.style.display = 'flex';
      if (scHud) scHud.style.display = 'flex';
      this.builderUI.setVisible(false);
      this.renderer.params.cameraMode = CameraViewMode.CHASE_SPACECRAFT;
    });

    btnBuilder?.addEventListener('click', () => {
      this.currentMode = 'BUILDER';
      btnBuilder.classList.add('active');
      btnSpace?.classList.remove('active');

      if (hudPanel) hudPanel.style.display = 'none';
      if (scHud) scHud.style.display = 'none';
      this.builderUI.setVisible(true);
      this.builderUI.updateTelemetry();
    });
  }

  private handleLaunchCustomMachine(): void {
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
    this.engine.spacecraft.name = 'AXIOM-1 MK-I';
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

  private handleAIManeuverAction(action: AIManeuverAction): void {
    const sc = this.engine.spacecraft;
    if (!sc) return;

    if (action.action === 'set_maneuver_node') {
      sc.addManeuverNode(
        action.timeToNode || 10.0,
        action.prograde || 0,
        action.normal || 0,
        action.radial || 0,
        action.description || 'AI Computed Maneuver'
      );
      sc.executeActiveManeuver();
    } else if (action.action === 'execute_burn') {
      sc.throttle = action.throttle ?? 1.0;
      if (action.mode) sc.setSASMode(action.mode);
    } else if (action.action === 'set_sas_mode' && action.mode) {
      sc.setSASMode(action.mode);
    } else if (action.action === 'stage_separation') {
      sc.separateStage();
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
