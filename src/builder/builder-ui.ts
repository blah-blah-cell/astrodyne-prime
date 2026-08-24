import * as THREE from 'three';
import { PartGraph } from './part-graph.js';
import { PartCategory, PartDefinition, PartInstance } from './types.js';
import { PART_CATALOG } from './catalog.js';
import { BuilderViewport } from './builder-view.js';
import { ElectricalPowerBus, PowerBusLoad } from './power-bus.js';
import { CollaborativeDesignSession, CollaborationOperation } from '../collaboration/crdt-session.js';
import { HardwareTelemetryBridge, MAVLinkTelemetry } from '../hardware/mavlink-bridge.js';
import { SimulationExporter, SimulationExportFormat } from './simulation-exporters.js';
import { EngineeringCouncil } from '../ai/engineering-council.js';
import { EngineeringSketchIngestion } from '../ai/sketch-ingestion.js';
import { EngineeringMeasurements } from '../engineering/measurements.js';
import { EngineeringProjectSession } from '../engineering/project-session.js';

export class BuilderUI {
  private container: HTMLElement;
  private viewport: BuilderViewport;
  private partGraph: PartGraph;
  private onLaunchSpacecraft: () => void;
  private onSketchCAD: (script: string) => void;
  private collaboration: CollaborativeDesignSession | null = null;
  private hardware = new HardwareTelemetryBridge();
  private hardwareConnected = false;
  private history: string[] = [];
  private historyIndex = -1;
  private restoringHistory = false;
  private mateReferenceId: string | null = null;
  private catalogVisible = true;
  private inspectorVisible = true;
  private panelLayoutInitialized = false;

  private activeCategory: PartCategory | 'ALL' = 'ALL';
  public isVisible = false;

  constructor(
    container: HTMLElement,
    viewport: BuilderViewport,
    partGraph: PartGraph,
    onLaunchSpacecraft: () => void,
    onSketchCAD: (script: string) => void
  ) {
    this.container = container;
    this.viewport = viewport;
    this.partGraph = partGraph;
    this.onLaunchSpacecraft = onLaunchSpacecraft;
    this.onSketchCAD = onSketchCAD;

    this.buildDOM();
    this.viewport.setSelectionHandler((instance, definition) => {
      this.renderSelectionInspector(instance, definition);
      if (instance && window.innerWidth <= 900) {
        this.catalogVisible = false;
        this.inspectorVisible = true;
        this.applyPanelVisibility();
      }
    });
    this.viewport.setAssemblyChangeHandler(() => this.recordHistory());
    this.viewport.setPlacementChangeHandler((definition, message) => this.updatePlacementStatus(definition, message));
    this.bindEvents();
    this.renderPartPalette();
    const savedAssembly = EngineeringProjectSession.get().artifacts.assembly?.data as { parts?: unknown[] } | undefined;
    if (Array.isArray(savedAssembly?.parts) && savedAssembly.parts.length) this.applyAssemblyJSON(JSON.stringify(savedAssembly));
    this.recordHistory();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div id="builder-view-toolbar" class="builder-view-toolbar" style="display: none" aria-label="Assembly camera controls">
        <button id="builder-toggle-catalog" class="active">Catalog</button><button id="builder-toggle-inspector" class="active">Inspector</button><span></span><button id="builder-tool-move" class="active">Move</button><button id="builder-tool-rotate">Rotate</button><button id="builder-tool-space">World</button><span></span><button id="builder-view-all">Fit All</button><button id="builder-view-selected">Selection</button><button id="builder-view-iso">Iso</button><button id="builder-view-front">Front</button><button id="builder-view-top">Top</button>
      </div>
      <!-- Left Part Palette Drawer -->
      <aside id="builder-palette-drawer" class="part-palette-drawer glass-panel" style="display: none;">
        <div class="drawer-header">
          <div class="palette-title">AXIOM MODULAR PARTS</div>
          <div class="category-chips-wrapper">
            <button class="cat-chip active" data-cat="ALL">All</button>
            <button class="cat-chip" data-cat="${PartCategory.STRUCTURAL}">Frame</button>
            <button class="cat-chip" data-cat="${PartCategory.MECHANICAL}">Drive</button>
            <button class="cat-chip" data-cat="${PartCategory.AEROSPACE}">Rocket</button>
            <button class="cat-chip" data-cat="${PartCategory.ROBOTICS_MOBILITY}">Robotics</button>
            <button class="cat-chip" data-cat="${PartCategory.ELECTRONICS_LOGIC}">Power</button>
          </div>
        </div>

        <div class="placement-toolbar">
          <div id="placement-status">Select a catalog part or use Add for automatic placement.</div>
          <button id="btn-cancel-placement" class="secondary-btn" disabled>Cancel Placement</button>
        </div>

        <div class="palette-grid" id="builder-palette-grid"></div>
      </aside>

      <!-- Right Telemetry & Action Drawer -->
      <aside id="builder-telemetry-drawer" class="telemetry-inspector-drawer glass-panel" style="display: none;">
        <div class="drawer-header">
          <div class="palette-title">MULTIBODY TELEMETRY</div>
        </div>

        <div class="project-toolbar">
          <input id="project-name" class="form-input project-name-input" value="${EngineeringProjectSession.get().name}" aria-label="Project name">
          <button id="btn-history-undo" class="secondary-btn" disabled>Undo</button>
          <button id="btn-history-redo" class="secondary-btn" disabled>Redo</button>
          <button id="btn-save-project" class="secondary-btn">Save Project</button>
          <label class="secondary-btn project-load-label" for="input-load-project">Open</label>
          <input id="input-load-project" type="file" accept="application/json,.json" hidden>
        </div>

        <div class="inspector-body">
          <div class="telem-card">
            <div class="telem-row">
              <span class="telem-label">Total Parts</span>
              <span class="telem-val" id="builder-val-count">0</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Total Mass</span>
              <span class="telem-val" id="builder-val-mass">0.00 kg</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Drive Capacity</span>
              <span class="telem-val" id="builder-val-torque">0.0 Nm</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Center of Mass</span>
              <span class="telem-val" id="builder-val-cm">[0.0, 0.0, 0.0]</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Power Bus</span>
              <span class="telem-val" id="builder-val-power">NO BATTERY</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Estimated Runtime</span>
              <span class="telem-val" id="builder-val-runtime">—</span>
            </div>
            <div class="telem-row">
              <span class="telem-label">Launch Readiness</span>
              <span class="telem-val" id="builder-val-launch">ADD ROCKET MOTOR</span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
            <button id="btn-builder-test-physics" class="primary-btn" style="background: linear-gradient(135deg, #059669, #10b981); padding: 9px; font-size: 11.5px; font-weight: 700;">
              Run Kinematics Test
            </button>
            <button id="btn-builder-launch" class="primary-btn" style="background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 9px; font-size: 11.5px; font-weight: 700;">
              Launch Vehicle
            </button>
            <button id="btn-builder-clear" class="secondary-btn" style="padding: 7px; font-size: 11px;">
              Clear Assembly
            </button>
          </div>

          <details class="help-card assembly-help" style="margin-top: 10px;">
            <summary class="help-title">Controls Reference</summary>
            <ul class="help-list">
              <li><strong>Add:</strong> Places and selects a part automatically</li>
              <li><strong>Catalog card:</strong> Arms click-to-place mode</li>
              <li><strong>Drag selected:</strong> Move directly on the grid</li>
              <li><strong>Proximity:</strong> Automatic socket alignment</li>
              <li><strong>Test Mode:</strong> Drive rover with WASD keys</li>
              <li><strong>Right Click:</strong> Orbit 3D studio camera</li>
            </ul>
          </details>

          <div class="selection-inspector" id="selection-inspector">
            <div class="help-title">SELECTION INSPECTOR</div>
            <div class="systems-inline-row"><label><input id="assembly-grid-snap" type="checkbox" checked> Grid snap</label><label><input id="assembly-socket-snap" type="checkbox" checked> Socket snap</label></div>
            <label>Grid step (m) <input id="assembly-grid-size" class="form-input" type="number" value="0.05" min="0.001" step="0.001"></label>
            <div class="selection-empty" id="selection-empty">Select a part in the viewport to inspect exact geometry and placement.</div>
            <div class="selection-content" id="selection-content" hidden>
              <div class="selection-name" id="selection-name">Part</div>
              <div class="selection-meta" id="selection-meta">ID</div>
              <div class="transform-grid">
                <label>X <input id="selected-pos-x" class="form-input" type="number" step="0.001"></label>
                <label>Y <input id="selected-pos-y" class="form-input" type="number" step="0.001"></label>
                <label>Z <input id="selected-pos-z" class="form-input" type="number" step="0.001"></label>
              </div>
              <div class="transform-label">ROTATION · degrees</div>
              <div class="transform-grid">
                <label>X <input id="selected-rot-x" class="form-input" type="number" step="1"></label>
                <label>Y <input id="selected-rot-y" class="form-input" type="number" step="1"></label>
                <label>Z <input id="selected-rot-z" class="form-input" type="number" step="1"></label>
              </div>
              <div class="mate-workbench">
                <div class="mate-workbench-head"><span>Exact socket mate</span><button id="btn-set-mate-reference" class="secondary-btn">Set selected as reference</button></div>
                <div id="mate-reference-status" class="selection-meta">No reference part selected.</div>
                <div class="mate-grid">
                  <label>Moving socket<select id="mate-source-socket" class="form-select"></select></label>
                  <label>Reference socket<select id="mate-target-socket" class="form-select"></select></label>
                  <label>Axial offset (m)<input id="mate-offset" class="form-input" type="number" value="0" step="0.001"></label>
                  <label>Twist (deg)<input id="mate-twist" class="form-input" type="number" value="0" step="1"></label>
                </div>
                <div class="mate-actions"><button id="btn-apply-mate" class="primary-btn">Apply mate</button><button id="btn-clear-mate-reference" class="secondary-btn">Clear reference</button></div>
                <div id="mate-measurement" class="mate-measurement">Select a reference and a moving part to measure and constrain.</div>
              </div>
              <div class="selection-actions">
                <button id="btn-apply-transform" class="primary-btn">Apply Transform</button>
                <button id="btn-focus-selected" class="secondary-btn">Frame Selection</button>
                <button id="btn-duplicate-selected" class="secondary-btn">Duplicate</button>
                <button id="btn-detach-selected" class="secondary-btn">Detach Connections</button>
                <button id="btn-rotate-x" class="secondary-btn">Rotate X 90°</button>
                <button id="btn-rotate-y" class="secondary-btn">Rotate Y 90°</button>
                <button id="btn-rotate-z" class="secondary-btn">Rotate Z 90°</button>
                <button id="btn-delete-selected" class="danger-btn">Delete</button>
              </div>
            </div>
          </div>

          <div class="engineering-systems-card">
            <div class="help-title">CONNECTED ENGINEERING</div>
            <div class="systems-inline-row"><input id="collab-room-id" class="form-input" value="mission-alpha" aria-label="Collaboration room"><button id="btn-collab-connect" class="secondary-btn">Join</button></div>
            <button id="btn-collab-sync" class="secondary-btn">Synchronize Assembly</button>
            <div class="systems-status" id="collab-status">OFFLINE</div>
            <button id="btn-hardware-connect" class="secondary-btn">Connect MAVLink Hardware</button>
            <div class="systems-status" id="hardware-status">NO HARDWARE</div>
            <div class="systems-inline-row"><select id="simulation-export-format" class="form-select" aria-label="Simulation export format"><option value="gazebo">Gazebo SDF</option><option value="moveit">MoveIt Config</option><option value="isaac">Isaac Sim USD</option></select><button id="btn-simulation-export" class="secondary-btn">Export</button></div>
          </div>

          <div class="engineering-systems-card">
            <div class="help-title">DESIGN REVIEW</div>
            <button id="btn-council-review" class="secondary-btn">Run Engineering Review</button>
            <div class="systems-report" id="council-report">Council standing by.</div>
            <label class="secondary-btn sketch-upload-label" for="input-sketch-design">Import Engineering Sketch</label>
            <input id="input-sketch-design" type="file" accept="image/*" hidden>
            <div class="systems-status" id="sketch-status">NO SKETCH</div>
          </div>
        </div>
      </aside>
    `;
  }

  private bindEvents(): void {
    const chipBtns = this.container.querySelectorAll('.cat-chip');
    chipBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chipBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-cat') as any;
        this.renderPartPalette();
      });
    });

    const btnClear = this.container.querySelector('#btn-builder-clear');
    btnClear?.addEventListener('click', () => {
      this.viewport.setActivePartDef(null);
      this.viewport.selectPart(null);
      this.partGraph.clear();
      this.updateTelemetry();
      this.viewport.updateSocketMarkers();
      this.renderPartPalette();
      this.recordHistory();
    });

    const btnTest = this.container.querySelector('#btn-builder-test-physics') as HTMLButtonElement;
    btnTest?.addEventListener('click', async () => {
      if (!this.viewport.isKinematicsTestMode) {
        btnTest.textContent = 'Stop Kinematics Test';
        btnTest.style.background = '#991b1b';
        await this.viewport.startKinematicsTest();
      } else {
        btnTest.textContent = 'Run Kinematics Test';
        btnTest.style.background = '';
        this.viewport.stopKinematicsTest();
      }
    });

    const btnLaunch = this.container.querySelector('#btn-builder-launch');
    btnLaunch?.addEventListener('click', () => {
      this.onLaunchSpacecraft();
    });

    this.container.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest('button');
      if (!button) return;
      if (button.id === 'btn-collab-connect') this.toggleCollaboration();
      else if (button.id === 'btn-collab-sync') {
        this.collaboration?.publish('assembly', this.partGraph.serialize());
        this.updateCollaborationStatus('ASSEMBLY SYNCED');
      } else if (button.id === 'btn-hardware-connect') this.toggleHardware();
      else if (button.id === 'btn-simulation-export') this.exportSimulation();
      else if (button.id === 'btn-council-review') this.runCouncilReview();
      else if (button.id === 'btn-set-mate-reference') this.setMateReference();
      else if (button.id === 'btn-clear-mate-reference') { this.mateReferenceId = null; this.refreshSelectionInspector(); }
      else if (button.id === 'btn-apply-mate') this.applyMate();
      else if (button.id === 'btn-apply-transform') this.applySelectedTransform();
      else if (button.id === 'btn-focus-selected') this.viewport.focusSelectedPart();
      else if (button.id === 'btn-duplicate-selected') { if (this.viewport.duplicateSelectedPart()) this.updateTelemetry(); }
      else if (button.id === 'btn-detach-selected') { this.viewport.detachSelectedPart(); }
      else if (button.id === 'btn-rotate-x' || button.id === 'btn-rotate-y' || button.id === 'btn-rotate-z') { if (this.viewport.rotateSelectedBy(button.id.slice(-1) as 'x' | 'y' | 'z', 90)) this.updateTelemetry(); }
      else if (button.id === 'btn-delete-selected') {
        if (this.viewport.deleteSelectedPart()) this.updateTelemetry();
      }
      else if (button.id === 'btn-history-undo') this.restoreHistory(this.historyIndex - 1);
      else if (button.id === 'btn-history-redo') this.restoreHistory(this.historyIndex + 1);
      else if (button.id === 'btn-save-project') this.saveProject();
      else if (button.id === 'btn-cancel-placement') { this.viewport.setActivePartDef(null); this.renderPartPalette(); }
      else if (button.id === 'builder-toggle-catalog') {
        this.catalogVisible = !this.catalogVisible;
        if (this.catalogVisible && window.innerWidth <= 900) this.inspectorVisible = false;
        this.applyPanelVisibility();
      }
      else if (button.id === 'builder-toggle-inspector') {
        this.inspectorVisible = !this.inspectorVisible;
        if (this.inspectorVisible && window.innerWidth <= 900) this.catalogVisible = false;
        this.applyPanelVisibility();
      }
      else if (button.id === 'builder-view-all') this.viewport.frameAssembly();
      else if (button.id === 'builder-view-selected') this.viewport.focusSelectedPart();
      else if (button.id === 'builder-view-iso') this.viewport.setCameraView('iso');
      else if (button.id === 'builder-view-front') this.viewport.setCameraView('front');
      else if (button.id === 'builder-view-top') this.viewport.setCameraView('top');
      else if (button.id === 'builder-tool-move' || button.id === 'builder-tool-rotate') {
        const move = this.container.querySelector('#builder-tool-move');
        const rotate = this.container.querySelector('#builder-tool-rotate');
        move?.classList.toggle('active', button.id === 'builder-tool-move');
        rotate?.classList.toggle('active', button.id === 'builder-tool-rotate');
        this.viewport.setTransformMode(button.id === 'builder-tool-move' ? 'translate' : 'rotate');
      } else if (button.id === 'builder-tool-space') {
        button.textContent = this.viewport.toggleTransformSpace() === 'world' ? 'World' : 'Local';
      }
    });
    (this.container.querySelector('#input-sketch-design') as HTMLInputElement | null)?.addEventListener('change', event => this.ingestSketch(event));
    (this.container.querySelector('#input-load-project') as HTMLInputElement | null)?.addEventListener('change', event => this.loadProject(event));
    (this.container.querySelector('#project-name') as HTMLInputElement | null)?.addEventListener('change', event => {
      EngineeringProjectSession.setName((event.target as HTMLInputElement).value);
    });
    (this.container.querySelector('#assembly-grid-snap') as HTMLInputElement | null)?.addEventListener('change', event => { this.viewport.gridSnapEnabled = (event.target as HTMLInputElement).checked; this.viewport.configureTransformSnapping(); });
    (this.container.querySelector('#assembly-socket-snap') as HTMLInputElement | null)?.addEventListener('change', event => { this.viewport.socketSnapEnabled = (event.target as HTMLInputElement).checked; });
    (this.container.querySelector('#assembly-grid-size') as HTMLInputElement | null)?.addEventListener('change', event => { this.viewport.gridSize = Math.max(0.001, Number((event.target as HTMLInputElement).value) || 0.05); this.viewport.configureTransformSnapping(); });
    (this.container.querySelector('#mate-source-socket') as HTMLSelectElement | null)?.addEventListener('change', () => this.populateCompatibleMateTargets());
  }

  private recordHistory(): void {
    if (this.restoringHistory) return;
    const snapshot = this.partGraph.serialize();
    if (snapshot === this.history[this.historyIndex]) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.updateHistoryButtons();
    this.updateTelemetry();
    EngineeringProjectSession.setArtifact('assembly', `${this.partGraph.assembly.parts.size} parts · ${EngineeringMeasurements.scalar(this.partGraph.assembly.totalMassKg, 'kg')}`, JSON.parse(snapshot));
  }

  private restoreHistory(index: number): void {
    if (index < 0 || index >= this.history.length) return;
    this.restoringHistory = true;
    this.applyAssemblyJSON(this.history[index]);
    this.restoringHistory = false;
    this.historyIndex = index;
    this.viewport.selectPart(null);
    this.updateHistoryButtons();
  }

  private updateHistoryButtons(): void {
    const undo = this.container.querySelector('#btn-history-undo') as HTMLButtonElement | null;
    const redo = this.container.querySelector('#btn-history-redo') as HTMLButtonElement | null;
    if (undo) undo.disabled = this.historyIndex <= 0;
    if (redo) redo.disabled = this.historyIndex >= this.history.length - 1;
  }

  private saveProject(): void {
    const payload = JSON.stringify({
      format: 'astrodyne-project',
      version: 1,
      project: EngineeringProjectSession.get(),
      assembly: JSON.parse(this.partGraph.serialize())
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.partGraph.assembly.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engineering-project'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async loadProject(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload?.format === 'astrodyne-project' && payload.assembly) {
      if (payload.project) EngineeringProjectSession.import(payload.project);
      this.applyAssemblyJSON(JSON.stringify(payload.assembly));
      const name = this.container.querySelector('#project-name') as HTMLInputElement | null;
      if (name) name.value = EngineeringProjectSession.get().name;
    } else {
      this.applyAssemblyJSON(text);
    }
    this.recordHistory();
    input.value = '';
  }

  private renderSelectionInspector(instance: PartInstance | null, definition: PartDefinition | null): void {
    const empty = this.container.querySelector('#selection-empty') as HTMLElement | null;
    const content = this.container.querySelector('#selection-content') as HTMLElement | null;
    if (!empty || !content) return;
    empty.hidden = !!instance;
    content.hidden = !instance;
    if (!instance || !definition) return;
    const name = this.container.querySelector('#selection-name');
    const meta = this.container.querySelector('#selection-meta');
    if (name) name.textContent = definition.name;
    if (meta) meta.textContent = `${instance.instanceId} · ${definition.dimensions.map((value: number) => EngineeringMeasurements.scalar(value, 'm')).join(' × ')} · ${instance.attachedSockets.size} connection${instance.attachedSockets.size === 1 ? '' : 's'}`;
    ['x', 'y', 'z'].forEach((axis, index) => {
      const input = this.container.querySelector(`#selected-pos-${axis}`) as HTMLInputElement | null;
      if (input) input.value = instance.position[index].toFixed(EngineeringMeasurements.getPrecision());
    });
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...instance.rotationQuaternion), 'XYZ');
    ['x', 'y', 'z'].forEach((axis, index) => {
      const input = this.container.querySelector(`#selected-rot-${axis}`) as HTMLInputElement | null;
      if (input) input.value = THREE.MathUtils.radToDeg([euler.x, euler.y, euler.z][index]).toFixed(EngineeringMeasurements.getPrecision());
    });
    this.renderMateWorkbench(instance, definition);
  }

  private refreshSelectionInspector(): void {
    const selected = this.viewport.selectedPartId ? this.partGraph.assembly.parts.get(this.viewport.selectedPartId) ?? null : null;
    this.renderSelectionInspector(selected, selected ? this.partGraph.getDefinition(selected.definitionId) ?? null : null);
  }

  private setMateReference(): void {
    if (!this.viewport.selectedPartId) return;
    this.mateReferenceId = this.viewport.selectedPartId;
    this.refreshSelectionInspector();
    this.updatePlacementStatus(null, 'Mate reference captured. Select the moving part, choose sockets, then apply the mate.');
  }

  private renderMateWorkbench(instance: PartInstance, definition: PartDefinition): void {
    if (this.mateReferenceId && !this.partGraph.assembly.parts.has(this.mateReferenceId)) this.mateReferenceId = null;
    const reference = this.mateReferenceId ? this.partGraph.assembly.parts.get(this.mateReferenceId) ?? null : null;
    const referenceDefinition = reference ? this.partGraph.getDefinition(reference.definitionId) ?? null : null;
    const status = this.container.querySelector('#mate-reference-status');
    const sourceSelect = this.container.querySelector('#mate-source-socket') as HTMLSelectElement | null;
    const targetSelect = this.container.querySelector('#mate-target-socket') as HTMLSelectElement | null;
    const apply = this.container.querySelector('#btn-apply-mate') as HTMLButtonElement | null;
    const measurement = this.container.querySelector('#mate-measurement');
    if (status) status.textContent = reference && referenceDefinition ? `Reference: ${referenceDefinition.name} · ${reference.instanceId}` : 'No reference part selected.';
    if (sourceSelect) sourceSelect.innerHTML = definition.sockets.map(socket => `<option value="${socket.id}">${socket.name} · ${socket.type}</option>`).join('');
    if (targetSelect) targetSelect.innerHTML = '';
    this.populateCompatibleMateTargets(instance, definition, reference, referenceDefinition);
    const usable = !!reference && !!referenceDefinition && reference.instanceId !== instance.instanceId && definition.sockets.length > 0 && referenceDefinition.sockets.length > 0;
    if (apply) apply.disabled = !usable;
    if (measurement) {
      if (!reference || reference.instanceId === instance.instanceId) {
        measurement.textContent = reference ? 'Reference captured. Select a different part to mate.' : 'Select a reference and a moving part to measure and constrain.';
      } else {
        const delta = new THREE.Vector3(...instance.position).sub(new THREE.Vector3(...reference.position));
        measurement.textContent = `Center delta ${EngineeringMeasurements.vector([delta.x, delta.y, delta.z], 'm')} · distance ${EngineeringMeasurements.scalar(delta.length(), 'm')}`;
      }
    }
  }

  private populateCompatibleMateTargets(
    instance?: PartInstance | null,
    definition?: PartDefinition | null,
    reference?: PartInstance | null,
    referenceDefinition?: PartDefinition | null
  ): void {
    const selected = instance ?? (this.viewport.selectedPartId ? this.partGraph.assembly.parts.get(this.viewport.selectedPartId) ?? null : null);
    const selectedDefinition = definition ?? (selected ? this.partGraph.getDefinition(selected.definitionId) ?? null : null);
    const mateReference = reference ?? (this.mateReferenceId ? this.partGraph.assembly.parts.get(this.mateReferenceId) ?? null : null);
    const mateReferenceDefinition = referenceDefinition ?? (mateReference ? this.partGraph.getDefinition(mateReference.definitionId) ?? null : null);
    const sourceSelect = this.container.querySelector('#mate-source-socket') as HTMLSelectElement | null;
    const targetSelect = this.container.querySelector('#mate-target-socket') as HTMLSelectElement | null;
    if (!sourceSelect || !targetSelect || !selectedDefinition || !mateReference || !mateReferenceDefinition) return;
    const source = selectedDefinition.sockets.find(socket => socket.id === sourceSelect.value) ?? selectedDefinition.sockets[0];
    const compatible = source ? mateReferenceDefinition.sockets.filter(socket => {
      const oppositeGender = source.gender === 'NEUTRAL' ? socket.gender === 'NEUTRAL' : source.gender !== socket.gender;
      return socket.type === source.type && oppositeGender && !mateReference.attachedSockets.has(socket.id);
    }) : [];
    targetSelect.innerHTML = compatible.length
      ? compatible.map(socket => `<option value="${socket.id}">${socket.name} · ${socket.type}</option>`).join('')
      : '<option value="">No compatible free socket</option>';
    const apply = this.container.querySelector('#btn-apply-mate') as HTMLButtonElement | null;
    if (apply) apply.disabled = !selected || selected.instanceId === mateReference.instanceId || compatible.length === 0;
  }

  private applyMate(): void {
    if (!this.mateReferenceId) return;
    const sourceSocketId = (this.container.querySelector('#mate-source-socket') as HTMLSelectElement | null)?.value ?? '';
    const targetSocketId = (this.container.querySelector('#mate-target-socket') as HTMLSelectElement | null)?.value ?? '';
    const offset = Number((this.container.querySelector('#mate-offset') as HTMLInputElement | null)?.value ?? 0);
    const twist = Number((this.container.querySelector('#mate-twist') as HTMLInputElement | null)?.value ?? 0);
    const readout = this.container.querySelector('#mate-measurement');
    try {
      const result = this.viewport.mateSelectedTo(this.mateReferenceId, sourceSocketId, targetSocketId, offset, twist);
      const message = `Mate solved · moved ${EngineeringMeasurements.scalar(result.displacementM, 'm')} · position error ${EngineeringMeasurements.scalar(result.socketErrorM, 'm')} · angular error ${EngineeringMeasurements.scalar(result.angularErrorDeg, 'deg')}`;
      if (readout) readout.textContent = message;
      this.updatePlacementStatus(null, message);
      this.updateTelemetry();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (readout) readout.textContent = `Mate failed · ${message}`;
      this.updatePlacementStatus(null, `Mate failed · ${message}`);
    }
  }

  private applySelectedTransform(): void {
    const read = (axis: string) => Number((this.container.querySelector(`#selected-pos-${axis}`) as HTMLInputElement | null)?.value);
    const readRotation = (axis: string) => Number((this.container.querySelector(`#selected-rot-${axis}`) as HTMLInputElement | null)?.value);
    if (this.viewport.updateSelectedTransform([read('x'), read('y'), read('z')], [readRotation('x'), readRotation('y'), readRotation('z')])) this.updateTelemetry();
  }

  private toggleCollaboration(): void {
    const button = this.container.querySelector('#btn-collab-connect') as HTMLButtonElement | null;
    if (this.collaboration) {
      this.collaboration.disconnect();
      this.collaboration = null;
      if (button) button.textContent = 'Join';
      this.updateCollaborationStatus('OFFLINE');
      return;
    }
    const room = (this.container.querySelector('#collab-room-id') as HTMLInputElement | null)?.value.trim() || 'mission-alpha';
    this.collaboration = new CollaborativeDesignSession(room);
    this.collaboration.subscribe(operation => this.handleCollaborationOperation(operation));
    if (!this.collaboration.connect()) {
      this.collaboration = null;
      this.updateCollaborationStatus('UNSUPPORTED');
      return;
    }
    if (button) button.textContent = 'Leave';
    this.collaboration.publish('assembly', this.partGraph.serialize());
    this.updateCollaborationStatus('CONNECTED');
  }

  private handleCollaborationOperation(operation: CollaborationOperation): void {
    if (operation.key === 'assembly' && operation.clientId !== this.collaboration?.clientId && typeof operation.value === 'string') {
      this.applyAssemblyJSON(operation.value);
    }
    const peers = this.collaboration?.snapshot().peers ?? 0;
    this.updateCollaborationStatus(`LIVE · ${peers} PEER${peers === 1 ? '' : 'S'}`);
  }

  private applyAssemblyJSON(serialized: string): void {
    try {
      const data = JSON.parse(serialized) as { name?: string; parts?: Array<{ instanceId: string; definitionId: string; position: [number, number, number]; rotationQuaternion: [number, number, number, number]; attachedSockets?: Array<[string, { targetPartId: string; targetSocketId: string }]> }> };
      if (!Array.isArray(data.parts)) return;
      this.partGraph.clear();
      let skipped = 0;
      for (const part of data.parts) {
        const definition = this.partGraph.getDefinition(part.definitionId);
        if (!definition) { skipped++; continue; }
        const mesh = definition.createMesh();
        mesh.position.set(...part.position);
        mesh.quaternion.set(...part.rotationQuaternion);
        this.viewport.scene.add(mesh);
        this.partGraph.addPart({ ...part, attachedSockets: new Map(part.attachedSockets ?? []), mesh });
      }
      if (data.name) this.partGraph.assembly.name = data.name;
      this.viewport.updateSocketMarkers();
      this.updateTelemetry();
      this.updatePlacementStatus(null, skipped
        ? `Restored ${data.parts.length - skipped} parts; ${skipped} custom definition${skipped === 1 ? '' : 's'} unavailable in this session.`
        : `Restored ${data.parts.length} saved part${data.parts.length === 1 ? '' : 's'}.`);
    } catch { this.updatePlacementStatus(null, 'ASSEMBLY LOAD ERROR · Invalid project payload'); }
  }

  private updateCollaborationStatus(text: string): void {
    const status = this.container.querySelector('#collab-status');
    if (status) status.textContent = text;
  }

  private toggleHardware(): void {
    const status = this.container.querySelector('#hardware-status');
    const button = this.container.querySelector('#btn-hardware-connect') as HTMLButtonElement | null;
    if (this.hardwareConnected) {
      this.hardwareConnected = false;
      void this.hardware.disconnect();
      if (button) button.textContent = 'Connect MAVLink Hardware';
      if (status) status.textContent = 'NO HARDWARE';
      return;
    }
    if (!this.hardware.isSupported()) {
      if (status) status.textContent = 'WEBSERIAL UNSUPPORTED';
      return;
    }
    this.hardwareConnected = true;
    if (button) button.textContent = 'Disconnect Hardware';
    if (status) status.textContent = 'REQUESTING PORT…';
    void this.hardware.connect(telemetry => this.updateHardwareTelemetry(telemetry)).catch(error => {
      this.hardwareConnected = false;
      if (button) button.textContent = 'Connect MAVLink Hardware';
      if (status) status.textContent = `LINK ERROR · ${error instanceof Error ? error.message : 'UNKNOWN'}`;
    });
  }

  private updateHardwareTelemetry(telemetry: MAVLinkTelemetry): void {
    const status = this.container.querySelector('#hardware-status');
    if (status) status.textContent = `MAV ${telemetry.messageId} · ALT ${(telemetry.altitudeM ?? 0).toFixed(1)} m · HDG ${(telemetry.headingDeg ?? 0).toFixed(0)}°`;
  }

  private exportSimulation(): void {
    const format = ((this.container.querySelector('#simulation-export-format') as HTMLSelectElement | null)?.value ?? 'gazebo') as SimulationExportFormat;
    const output = SimulationExporter.export(this.partGraph, format);
    const url = URL.createObjectURL(new Blob([output.data], { type: output.mimeType }));
    const link = document.createElement('a');
    link.href = url; link.download = output.filename; link.click();
    URL.revokeObjectURL(url);
  }

  private runCouncilReview(): void {
    const report = EngineeringCouncil.review(this.partGraph);
    const element = this.container.querySelector('#council-report');
    if (!element) return;
    element.innerHTML = `<b>${report.score}/100 · ${report.summary}</b>${report.findings.map(item => `<div class="council-finding ${item.severity.toLowerCase()}"><span>${item.role}</span>${item.finding}<small>${item.action}</small></div>`).join('')}`;
  }

  private async ingestSketch(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const analysis = EngineeringSketchIngestion.analyze(context.getImageData(0, 0, canvas.width, canvas.height));
    const status = this.container.querySelector('#sketch-status');
    if (status) status.textContent = `${analysis.classification} · ${(analysis.symmetry * 100).toFixed(0)}% SYMMETRY`;
    this.onSketchCAD(analysis.cadScript);
  }

  public renderPartPalette(): void {
    const grid = this.container.querySelector('#builder-palette-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = this.activeCategory === 'ALL'
      ? PART_CATALOG
      : PART_CATALOG.filter(p => p.category === this.activeCategory);

    for (const def of filtered) {
      const card = document.createElement('div');
      card.className = `part-card ${this.viewport.activePartDef?.id === def.id ? 'active' : ''}`;
      card.innerHTML = `
        <div class="part-card-header">
          <span class="part-category-tag">${def.category}</span>
          <span class="part-mass-tag">${(def.massKg * 1000).toFixed(0)}g</span>
        </div>
        <div class="part-card-title">${def.name}</div>
        <div class="part-card-desc">${def.description}</div>
        <div class="part-card-footer"><div class="part-sockets-count">${def.sockets.length} snap sockets</div><button class="part-add-btn" type="button">Add</button></div>
      `;

      card.addEventListener('click', event => {
        if ((event.target as HTMLElement).closest('.part-add-btn')) {
          event.stopPropagation();
          this.viewport.setActivePartDef(null);
          this.viewport.addPartAtNextFreePosition(def);
          this.renderPartPalette();
          return;
        }
        this.container.querySelectorAll('.part-card').forEach(c => c.classList.remove('active'));
        if (this.viewport.activePartDef?.id === def.id) {
          this.viewport.setActivePartDef(null);
        } else {
          card.classList.add('active');
          this.viewport.setActivePartDef(def);
        }
      });

      grid.appendChild(card);
    }
  }

  private updatePlacementStatus(definition: PartDefinition | null, message: string): void {
    const status = this.container.querySelector('#placement-status');
    const cancel = this.container.querySelector('#btn-cancel-placement') as HTMLButtonElement | null;
    if (status) status.textContent = message;
    if (cancel) cancel.disabled = !definition;
  }

  public showStatus(message: string): void { this.updatePlacementStatus(null, message); }

  public updateTelemetry(): void {
    const valCount = this.container.querySelector('#builder-val-count');
    const valMass = this.container.querySelector('#builder-val-mass');
    const valTorque = this.container.querySelector('#builder-val-torque');
    const valCm = this.container.querySelector('#builder-val-cm');
    const valPower = this.container.querySelector('#builder-val-power');
    const valRuntime = this.container.querySelector('#builder-val-runtime');
    const valLaunch = this.container.querySelector('#builder-val-launch');

    const totalParts = this.partGraph.assembly.parts.size;
    const totalMass = this.partGraph.assembly.totalMassKg;
    const cm = this.partGraph.assembly.centerOfMassWorld;

    let totalTorque = 0;
    const loads: PowerBusLoad[] = [];
    let battery: { nominalVoltageV: number; capacityAh: number; internalResistanceOhm: number; stateOfCharge: number } | null = null;
    let solarPowerW = 0;
    let totalThrustN = 0;
    let totalPropellantKg = 0;
    for (const [_, inst] of this.partGraph.assembly.parts.entries()) {
      const def = this.partGraph.getDefinition(inst.definitionId);
      if (def?.properties?.maxTorqueNm) {
        totalTorque += def.properties.maxTorqueNm;
      }
      const properties = def?.properties;
      if (properties?.batteryCapacityAh && properties.nominalVoltageV) {
        battery = {
          nominalVoltageV: properties.nominalVoltageV,
          capacityAh: properties.batteryCapacityAh,
          internalResistanceOhm: properties.batteryInternalResistanceOhm ?? 0.02,
          stateOfCharge: properties.batteryStateOfCharge ?? 1
        };
      }
      if (properties?.solarPanelAreaM2) {
        solarPowerW += ElectricalPowerBus.solarPower(properties.solarPanelAreaM2, properties.solarEfficiency ?? 0.2, 0);
      }
      if (properties?.stallTorqueNm) {
        loads.push({
          name: def?.name ?? 'Motor',
          currentA: ElectricalPowerBus.motorCurrent(
            properties.stallTorqueNm * 0.35,
            properties.motorTorqueConstantNmPerA ?? 0.2
          )
        });
      }
      totalThrustN += properties?.thrustN ?? 0;
      totalPropellantKg += properties?.propellantMassKg ?? 0;
    }

    if (valCount) valCount.textContent = `${totalParts}`;
    if (valMass) valMass.textContent = EngineeringMeasurements.scalar(totalMass, 'kg');
    if (valTorque) valTorque.textContent = EngineeringMeasurements.scalar(totalTorque, 'N·m');
    if (valCm) valCm.textContent = EngineeringMeasurements.vector(cm, 'm');
    if (battery) {
      const power = ElectricalPowerBus.evaluate(battery, loads, solarPowerW);
      if (valPower) valPower.textContent = `${EngineeringMeasurements.scalar(power.busVoltageV, 'V')} · ${EngineeringMeasurements.scalar(power.loadCurrentA, 'A')}${power.brownout ? ' · BROWNOUT' : ''}`;
      if (valRuntime) valRuntime.textContent = Number.isFinite(power.runtimeHours) ? EngineeringMeasurements.scalar(power.runtimeHours, 'h') : 'CHARGING';
    } else {
      if (valPower) valPower.textContent = 'NO BATTERY';
      if (valRuntime) valRuntime.textContent = '—';
    }
    const launchReady = totalThrustN > 0 && totalPropellantKg > 0;
    if (valLaunch) valLaunch.textContent = launchReady
      ? `${EngineeringMeasurements.scalar(totalThrustN, 'N')} · ${EngineeringMeasurements.scalar(totalPropellantKg, 'kg')} propellant`
      : 'ADD ROCKET MOTOR';
    const launchButton = this.container.querySelector('#btn-builder-launch') as HTMLButtonElement | null;
    if (launchButton) {
      launchButton.disabled = !launchReady;
      launchButton.title = launchReady ? 'Transfer this configured vehicle to Flight' : 'Add a rocket motor with thrust and propellant before launch';
    }
    const testButton = this.container.querySelector('#btn-builder-test-physics') as HTMLButtonElement | null;
    if (testButton && !this.viewport.isKinematicsTestMode) testButton.disabled = totalParts === 0;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    const toolbar = this.container.querySelector('#builder-view-toolbar') as HTMLElement;
    if (visible && !this.panelLayoutInitialized) {
      this.inspectorVisible = window.innerWidth > 900;
      this.panelLayoutInitialized = true;
    }
    if (toolbar) toolbar.style.display = visible ? 'flex' : 'none';
    this.applyPanelVisibility();
    this.viewport.setVisible(visible);
  }

  private applyPanelVisibility(): void {
    const palette = this.container.querySelector('#builder-palette-drawer') as HTMLElement | null;
    const inspector = this.container.querySelector('#builder-telemetry-drawer') as HTMLElement | null;
    const catalogButton = this.container.querySelector('#builder-toggle-catalog');
    const inspectorButton = this.container.querySelector('#builder-toggle-inspector');
    if (palette) palette.style.display = this.isVisible && this.catalogVisible ? 'flex' : 'none';
    if (inspector) inspector.style.display = this.isVisible && this.inspectorVisible ? 'flex' : 'none';
    catalogButton?.classList.toggle('active', this.catalogVisible);
    inspectorButton?.classList.toggle('active', this.inspectorVisible);
  }
}
