import { ControlsPanel } from './controls-panel';
import { PresetsPanel } from './presets-panel';
import { TelemetryPanel } from './telemetry-panel';
import { FlightDirectorHUD } from './flight-director-hud';
import { AstraDrawer } from './astra-drawer';
import { AstraAICopilot } from '../ai/ai-copilot';
import { AIManeuverAction, CameraViewMode, MouseTool, PresetConfig } from '../physics/types';
import { NBodyEngine } from '../physics/nbody-engine';
import { ParticleRenderer } from '../renderer/renderer';
import { PRESETS } from '../physics/presets';

export class UIController {
  public telemetryPanel: TelemetryPanel;
  public presetsPanel: PresetsPanel;
  public controlsPanel: ControlsPanel;
  public flightDirectorHUD: FlightDirectorHUD;
  public astraDrawer: AstraDrawer;
  public astraCopilot: AstraAICopilot;

  private engine: NBodyEngine;
  private renderer: ParticleRenderer;
  private onLoadPreset: (preset: PresetConfig, count: number) => void;

  public activeTab: 'presets' | 'controls' | 'telemetry' = 'presets';

  // Active Key States for smooth continuous flight controls
  private activeKeys = new Set<string>();

  constructor(
    engine: NBodyEngine,
    renderer: ParticleRenderer,
    onLoadPreset: (preset: PresetConfig, count: number) => void
  ) {
    this.engine = engine;
    this.renderer = renderer;
    this.onLoadPreset = onLoadPreset;

    // AI Copilot Instance
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

    // Flight Director HUD (Top Bar + Cockpit Flight Deck)
    this.flightDirectorHUD = new FlightDirectorHUD(
      hudContainer,
      engine,
      renderer,
      () => this.astraDrawer.toggleDrawer()
    );

    // ASTRA AI Assistant Drawer
    this.astraDrawer = new AstraDrawer(
      astraContainer,
      this.astraCopilot,
      (action) => this.handleAIManeuverAction(action)
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
    this.initCanvasMouseEvents();
    this.initKeyboardControls();
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

  private initCanvasMouseEvents(): void {
    const canvas = this.renderer.canvas;
    let isInteracting = false;

    canvas.addEventListener('mousedown', (e) => {
      if (this.controlsPanel.currentTool === MouseTool.ORBIT_CAMERA) {
        return;
      }

      if (e.button === 0) {
        isInteracting = true;
        const rect = canvas.getBoundingClientRect();
        const world = this.renderer.camera.screenToWorldPlane(
          e.clientX - rect.left,
          e.clientY - rect.top,
          canvas.width,
          canvas.height
        );

        if (world) {
          if (this.controlsPanel.currentTool === MouseTool.BLACK_HOLE_SPAWN) {
            this.engine.spawnBlackHole(world[0], world[1], world[2], 5000);
          } else {
            this.engine.mouseActive = true;
            this.engine.mouseWorldPos = world;
          }
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isInteracting) return;
      const rect = canvas.getBoundingClientRect();
      const world = this.renderer.camera.screenToWorldPlane(
        e.clientX - rect.left,
        e.clientY - rect.top,
        canvas.width,
        canvas.height
      );

      if (world) {
        this.engine.mouseWorldPos = world;
      }
    });

    window.addEventListener('mouseup', () => {
      isInteracting = false;
      this.engine.mouseActive = false;
    });
  }

  private initKeyboardControls(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      this.activeKeys.add(e.code);

      // Single-shot keys
      if (e.code === 'Space') {
        e.preventDefault();
        this.engine.params.paused = !this.engine.params.paused;
        this.controlsPanel.render();
      } else if (e.code === 'KeyR') {
        const currentPreset = PRESETS.find(p => p.id === this.presetsPanel.currentPresetId) || PRESETS[0];
        this.onLoadPreset(currentPreset, this.presetsPanel.selectedCount);
      } else if (e.code === 'KeyG') {
        this.renderer.params.showGrid = !this.renderer.params.showGrid;
        this.controlsPanel.render();
      } else if (e.code === 'KeyO') {
        this.renderer.params.showOrbits = !this.renderer.params.showOrbits;
        this.controlsPanel.render();
      } else if (e.code === 'KeyT') {
        this.astraDrawer.toggleDrawer();
      } else if (e.code === 'KeyV') {
        const cur = this.renderer.params.cameraMode;
        const next = cur === CameraViewMode.ORBIT
          ? CameraViewMode.CHASE_SPACECRAFT
          : cur === CameraViewMode.CHASE_SPACECRAFT
          ? CameraViewMode.COCKPIT_POV
          : CameraViewMode.ORBIT;
        this.renderer.params.cameraMode = next;
      } else if (e.code === 'KeyZ') {
        this.engine.spacecraft.throttle = 1.0;
      } else if (e.code === 'KeyX') {
        if (e.shiftKey) {
          this.engine.spacecraft.separateStage();
        } else {
          this.engine.spacecraft.throttle = 0.0;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.activeKeys.delete(e.code);
    });
  }

  public update(): void {
    const sc = this.engine.spacecraft;

    if (sc && sc.active) {
      let pitch = 0;
      let yaw = 0;
      let roll = 0;

      if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) pitch -= 1.0;
      if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) pitch += 1.0;
      if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) yaw -= 1.0;
      if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) yaw += 1.0;
      if (this.activeKeys.has('KeyQ')) roll -= 1.0;
      if (this.activeKeys.has('KeyE')) roll += 1.0;

      sc.rcsTorque = [pitch, yaw, roll];

      if (this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight')) {
        sc.throttle = Math.min(sc.throttle + 0.02, 1.0);
      }
      if (this.activeKeys.has('ControlLeft') || this.activeKeys.has('ControlRight')) {
        sc.throttle = Math.max(sc.throttle - 0.02, 0.0);
      }
    }

    this.flightDirectorHUD.update();
    this.telemetryPanel.update();
  }
}
