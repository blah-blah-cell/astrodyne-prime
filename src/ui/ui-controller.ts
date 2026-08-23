import { ControlsPanel } from './controls-panel';
import { PresetsPanel } from './presets-panel';
import { TelemetryPanel } from './telemetry-panel';
import { MouseTool, PresetConfig } from '../physics/types';
import { NBodyEngine } from '../physics/nbody-engine';
import { ParticleRenderer } from '../renderer/renderer';
import { PRESETS } from '../physics/presets';

export class UIController {
  public telemetryPanel: TelemetryPanel;
  public presetsPanel: PresetsPanel;
  public controlsPanel: ControlsPanel;

  private engine: NBodyEngine;
  private renderer: ParticleRenderer;
  private onLoadPreset: (preset: PresetConfig, count: number) => void;

  public activeTab: 'presets' | 'controls' | 'telemetry' = 'presets';

  constructor(
    engine: NBodyEngine,
    renderer: ParticleRenderer,
    onLoadPreset: (preset: PresetConfig, count: number) => void
  ) {
    this.engine = engine;
    this.renderer = renderer;
    this.onLoadPreset = onLoadPreset;

    const telemContainer = document.getElementById('telemetry-content')!;
    const presetsContainer = document.getElementById('presets-content')!;
    const controlsContainer = document.getElementById('controls-content')!;

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
    this.initKeyboardShortcuts();
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

  private initKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.engine.params.paused = !this.engine.params.paused;
        this.controlsPanel.render();
      } else if (e.key === 'r' || e.key === 'R') {
        const currentPreset = PRESETS.find(p => p.id === this.presetsPanel.currentPresetId) || PRESETS[0];
        this.onLoadPreset(currentPreset, this.presetsPanel.selectedCount);
      } else if (e.key === 'g' || e.key === 'G') {
        this.renderer.params.showGrid = !this.renderer.params.showGrid;
        this.controlsPanel.render();
      } else if (e.key === '1') {
        this.controlsPanel.currentTool = MouseTool.ORBIT_CAMERA;
        this.controlsPanel.render();
      } else if (e.key === '2') {
        this.controlsPanel.currentTool = MouseTool.GRAVITY_WELL;
        this.controlsPanel.render();
      } else if (e.key === '3') {
        this.controlsPanel.currentTool = MouseTool.REPULSOR;
        this.controlsPanel.render();
      }
    });
  }

  public update(): void {
    this.telemetryPanel.update();
  }
}
