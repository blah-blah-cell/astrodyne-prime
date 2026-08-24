import * as THREE from 'three';
import { TransformControls, TransformControlsMode } from 'three/addons/controls/TransformControls.js';
import { ManifoldCADEngine, CADMeshResult } from './manifold-engine.js';
import { OpenSCADEvaluator } from './openscad-evaluator.js';
import { CADAerodynamicAnalyzer, MeshAerodynamicResult } from './aerodynamic-analyzer.js';
import { EngineeringMeasurements } from '../engineering/measurements.js';
import { EngineeringProjectSession } from '../engineering/project-session.js';
import { CADFeature, CADFeatureModel, CADPrimitiveType } from './feature-model.js';
import { OpenCascadeImporter } from './occt-importer.js';
import { OpenSCADWASMBackend } from './openscad-wasm-backend.js';

const CAD_MATERIALS = {
  pla: { name: 'PLA', densityGcm3: 1.24 },
  petg: { name: 'PETG', densityGcm3: 1.27 },
  abs: { name: 'ABS', densityGcm3: 1.04 },
  aluminum: { name: 'Aluminum 6061', densityGcm3: 2.70 },
  steel: { name: 'Steel', densityGcm3: 7.85 }
} as const;
type CADMaterialKey = keyof typeof CAD_MATERIALS;
export function calculateCADMassKg(volumeMm3: number, material: CADMaterialKey): number {
  return Math.max(0, volumeMm3) / 1000 * CAD_MATERIALS[material].densityGcm3 / 1000;
}

export const CAD_TEMPLATES: Record<string, { name: string; code: string }> = {
  rocket_nosecone: {
    name: 'Hollow Conical Nose Cone with Shoulder',
    code: `// Executed by OpenSCAD 2026.06.08 WebAssembly
$fn = 96;
nose_length = 60;
nose_radius = 15;
wall = 1.5;
shoulder_length = 15;
shoulder_radius = nose_radius - wall;

difference() {
  union() {
    cylinder(h=nose_length, r1=nose_radius, r2=0.5);
    translate([0, 0, -shoulder_length])
      cylinder(h=shoulder_length, r=shoulder_radius);
  }
  translate([0, 0, -shoulder_length + wall])
    cylinder(h=nose_length + shoulder_length - 2,
             r1=shoulder_radius - wall, r2=0.5);
}`
  },
  motor_mount: {
    name: 'NEMA17 / 12V Motor Mounting Plate (with M3 Screw Pattern)',
    code: `// Executed by OpenSCAD 2026.06.08 WebAssembly
$fn = 64;
plate = [42, 42, 5];
center_bore_radius = 11;
screw_hole_radius = 1.6;
screw_pitch = 31;

difference() {
  cube(plate, center=true);
  cylinder(h=plate.z + 2, r=center_bore_radius, center=true);
  for (x=[-1, 1], y=[-1, 1])
    translate([x*screw_pitch/2, y*screw_pitch/2, 0])
      cylinder(h=plate.z + 2, r=screw_hole_radius, center=true);
}`
  },
  spur_gear: {
    name: '40-Tooth Module 1.0 Spur Gear (with D-Shaft Keyway)',
    code: `// Executed by OpenSCAD 2026.06.08 WebAssembly
$fn = 96;
teeth = 40;
module_mm = 1;
pitch_radius = teeth * module_mm / 2;
root_radius = pitch_radius - 1.25 * module_mm;
tooth_depth = 2.25 * module_mm;
tooth_width = PI * module_mm * 0.48;
thickness = 6;

difference() {
  union() {
    cylinder(h=thickness, r=root_radius, center=true);
    for (i=[0:teeth-1])
      rotate([0, 0, i*360/teeth])
        translate([root_radius + tooth_depth/2, 0, 0])
          cube([tooth_depth, tooth_width, thickness], center=true);
  }
  difference() {
    cylinder(h=thickness + 2, r=2.5, center=true);
    translate([0, 1.75, 0]) cube([5, 2, thickness + 4], center=true);
  }
  for (p=[[10,0],[-10,0],[0,10],[0,-10]])
    translate([p.x, p.y, 0]) cylinder(h=thickness + 2, r=4, center=true);
}`
  }
};

export class CADStudioView {
  private container: HTMLElement;
  private evaluator?: OpenSCADEvaluator;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private transformControls: TransformControls;
  private transformHelper: THREE.Object3D;
  private featureHandles = new Map<string, THREE.Mesh>();
  private featureHandlesGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private currentMesh: THREE.Mesh | null = null;
  private lastResult: CADMeshResult | null = null;
  private features: CADFeature[] = [];
  private selectedFeatureId: string | null = null;
  private featureHistory: string[] = [];
  private featureHistoryIndex = -1;
  private cameraSpherical = new THREE.Spherical(150, Math.PI / 3, Math.PI / 4);
  private cameraTarget = new THREE.Vector3();
  private navigationMode: 'none' | 'orbit' | 'pan' = 'none';
  private pointerDown = new THREE.Vector2();
  private pointerMoved = false;
  private transformDragging = false;
  private previousPointer = new THREE.Vector2();
  private material: CADMaterialKey = 'pla';
  private lastStatusText = 'READY';
  private lastArtifactMetadata: Record<string, unknown> = {};

  private onImportToAxiom?: (result: CADMeshResult) => void;
  private onAeroAnalysis?: (analysis: MeshAerodynamicResult) => void;

  constructor(
    container: HTMLElement,
    onImportToAxiom?: (result: CADMeshResult) => void,
    onAeroAnalysis?: (analysis: MeshAerodynamicResult) => void
  ) {
    this.container = container;
    this.onImportToAxiom = onImportToAxiom;
    this.onAeroAnalysis = onAeroAnalysis;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f4f6);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(80, 80, 100);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.mode = 'translate';
    this.transformControls.space = 'world';
    this.transformControls.size = 0.85;
    this.transformControls.translationSnap = 1;
    this.transformControls.rotationSnap = THREE.MathUtils.degToRad(15);
    this.transformHelper = this.transformControls.getHelper();
    this.scene.add(this.transformHelper);
    this.scene.add(this.featureHandlesGroup);
    this.transformControls.addEventListener('mouseDown', () => {
      this.transformDragging = true;
      this.navigationMode = 'none';
    });
    this.transformControls.addEventListener('objectChange', () => this.syncFeatureFromGizmo(false));
    this.transformControls.addEventListener('mouseUp', () => {
      this.syncFeatureFromGizmo(true);
      this.transformDragging = false;
    });

    this.initLightsAndGrid();
    const savedCAD = EngineeringProjectSession.get().artifacts.cad?.data as { features?: CADFeature[]; material?: CADMaterialKey } | undefined;
    this.features = Array.isArray(savedCAD?.features) && savedCAD.features.length ? structuredClone(savedCAD.features) : [CADFeatureModel.create('box', 1)];
    if (savedCAD?.material && savedCAD.material in CAD_MATERIALS) this.material = savedCAD.material;
    this.selectedFeatureId = this.features[0].id;
    this.renderUI();
    this.recordFeatureHistory();

    // Async init WASM engine
    ManifoldCADEngine.getInstance().then(engine => {
      this.evaluator = new OpenSCADEvaluator(engine);
      void this.rebuildFeatures();
    }).catch(err => {
      console.warn('[CADStudioView] WASM Init Warning:', err);
    });
  }

  private initLightsAndGrid(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(50, 100, 50);
    dirLight1.castShadow = true;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xb9cbe0, 0.7);
    dirLight2.position.set(-50, -50, -50);
    this.scene.add(dirLight2);

    const grid = new THREE.GridHelper(200, 40, 0xaab4bf, 0xd9dee5);
    grid.position.y = -20;
    this.scene.add(grid);
  }

  private renderUI(): void {
    this.container.innerHTML = `
      <div class="cad-studio-layout">
        <!-- Left Code & Presets Sidebar -->
        <div class="cad-code-sidebar">
          <div class="cad-header">
            <div class="cad-title">Parametric CAD</div>
            <div class="cad-badge">OpenSCAD 2026.06.08 WASM · Manifold 3.5 · OpenCascade 7.9.3</div>
            <div id="cad-build-status" class="systems-status">READY</div>
          </div>

          <div class="cad-feature-workbench">
            <div class="cad-feature-toolbar">
              <button data-add-feature="box" class="secondary-btn">Add Box</button>
              <button data-add-feature="cylinder" class="secondary-btn">Add Cylinder</button>
              <button data-add-feature="sphere" class="secondary-btn">Add Sphere</button>
            </div>
            <div class="cad-feature-toolbar">
              <button id="btn-cad-new" class="secondary-btn">New Model</button>
              <button id="btn-cad-save" class="secondary-btn">Save CAD</button>
              <button id="btn-cad-open" class="secondary-btn">Open CAD</button>
              <input id="cad-file-input" type="file" accept="application/json,.json" hidden>
            </div>
            <div class="cad-feature-toolbar">
              <button id="btn-cad-import-exchange" class="secondary-btn">Import STEP / IGES / BREP</button>
              <input id="cad-exchange-input" type="file" accept=".step,.stp,.iges,.igs,.brep,.brp" hidden>
            </div>
            <div class="cad-history-toolbar">
              <span>FEATURE HISTORY</span>
              <button id="btn-cad-undo" class="secondary-btn">Undo</button>
              <button id="btn-cad-redo" class="secondary-btn">Redo</button>
            </div>
            <div id="cad-feature-list" class="cad-feature-list"></div>
            <div id="cad-feature-inspector" class="cad-feature-inspector"></div>
          </div>

          <details class="cad-script-tools">
            <summary>Advanced script and templates</summary>
          <div class="cad-template-picker">
            <label class="cad-label">Engineering Templates:</label>
            <select id="cad-template-select" class="form-select">
              <option value="rocket_nosecone">Hollow Conical Nose Cone</option>
              <option value="motor_mount">NEMA17 / DC Motor Mount</option>
              <option value="spur_gear">40T Spur Gear with Keyway</option>
            </select>
          </div>

          <div class="cad-editor-wrapper">
            <div class="cad-editor-header">
              <span>OpenSCAD source:</span>
              <button id="btn-cad-compile" class="btn-cad-run">Render with OpenSCAD</button>
            </div>
            <textarea id="cad-code-editor" class="cad-code-area" spellcheck="false">${CAD_TEMPLATES.rocket_nosecone.code}</textarea>
          </div>
          </details>

          <!-- Physical Diagnostics -->
          <div class="cad-telemetry-box">
            <div class="cad-telem-row"><span>Solid Volume:</span> <b id="cad-val-vol">0.0 mm³</b></div>
            <div class="cad-telem-row"><span>Surface Area:</span> <b id="cad-val-area">0.0 mm²</b></div>
            <div class="cad-telem-row"><span>Overall Size:</span> <b id="cad-val-bounds">0 × 0 × 0 mm</b></div>
            <div class="cad-telem-row"><span>Triangles / Vertices:</span> <b id="cad-val-geom">0 / 0</b></div>
            <div class="cad-telem-row"><label for="cad-material">Material / mass:</label><span><select id="cad-material" class="form-select"><option value="pla" ${this.material === 'pla' ? 'selected' : ''}>PLA</option><option value="petg" ${this.material === 'petg' ? 'selected' : ''}>PETG</option><option value="abs" ${this.material === 'abs' ? 'selected' : ''}>ABS</option><option value="aluminum" ${this.material === 'aluminum' ? 'selected' : ''}>Aluminum 6061</option><option value="steel" ${this.material === 'steel' ? 'selected' : ''}>Steel</option></select> <b id="cad-val-mass">0.0 g</b></span></div>
            <div class="cad-telem-row"><span>Projected Frontal Area:</span> <b id="cad-val-frontal">0.0 mm²</b></div>
            <div class="cad-telem-row"><span>Estimated Drag / Fineness:</span> <b id="cad-val-drag">Cd 0.00 / 0.0</b></div>
          </div>

          <!-- Export & AXIOM Integration Buttons -->
          <div class="cad-actions-row">
            <button id="btn-export-stl" class="btn-cad-export">Export STL</button>
            <button id="btn-import-axiom" class="btn-cad-import">Transfer to Assembly</button>
            <button id="btn-send-aero" class="btn-cad-import">Transfer to Aerodynamics</button>
          </div>
        </div>

        <!-- Right 3D WebGL Viewport -->
        <div class="cad-viewport-wrapper" id="cad-canvas-container">
          <div class="cad-view-toolbar">
            <button data-cad-tool="translate" class="active">Move</button>
            <button data-cad-tool="rotate">Rotate</button>
            <button id="btn-cad-transform-space">World</button>
            <button id="btn-cad-transform-snap" class="active">Snap 1 mm</button>
            <span class="cad-toolbar-divider"></span>
            <button data-cad-view="fit">Fit</button><button data-cad-view="iso">Iso</button><button data-cad-view="front">Front</button><button data-cad-view="top">Top</button>
          </div>
          <div class="cad-mouse-help">Left click selects · drag gizmo edits · right drag orbits · middle drag pans · wheel zooms</div>
        </div>
      </div>
    `;

    const canvasContainer = this.container.querySelector('#cad-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.appendChild(this.renderer.domElement);
      this.resize();
    }

    this.attachEvents();
    this.renderFeatureEditor();
    void this.rebuildFeatures();
  }

  private attachEvents(): void {
    const templateSelect = this.container.querySelector('#cad-template-select') as HTMLSelectElement;
    const editor = this.container.querySelector('#cad-code-editor') as HTMLTextAreaElement;
    const btnCompile = this.container.querySelector('#btn-cad-compile');
    const btnExportSTL = this.container.querySelector('#btn-export-stl');
    const btnImportAxiom = this.container.querySelector('#btn-import-axiom');
    const btnSendAero = this.container.querySelector('#btn-send-aero');

    this.container.querySelectorAll('[data-add-feature]').forEach(button => button.addEventListener('click', () => {
      this.addFeature(button.getAttribute('data-add-feature') as CADPrimitiveType);
    }));
    this.container.querySelector('#btn-cad-undo')?.addEventListener('click', () => this.restoreFeatureHistory(this.featureHistoryIndex - 1));
    this.container.querySelector('#btn-cad-redo')?.addEventListener('click', () => this.restoreFeatureHistory(this.featureHistoryIndex + 1));
    this.container.querySelector('#btn-cad-new')?.addEventListener('click', () => {
      this.features = [CADFeatureModel.create('box', 1)];
      this.selectedFeatureId = this.features[0].id;
      this.featureHistory = [];
      this.featureHistoryIndex = -1;
      this.commitFeatureChange();
    });
    this.container.querySelector('#btn-cad-save')?.addEventListener('click', () => this.saveFeatureFile());
    this.container.querySelector('#btn-cad-open')?.addEventListener('click', () => (this.container.querySelector('#cad-file-input') as HTMLInputElement | null)?.click());
    this.container.querySelector('#cad-file-input')?.addEventListener('change', event => void this.openFeatureFile((event.target as HTMLInputElement).files?.[0]));
    this.container.querySelector('#btn-cad-import-exchange')?.addEventListener('click', () => (this.container.querySelector('#cad-exchange-input') as HTMLInputElement | null)?.click());
    this.container.querySelector('#cad-exchange-input')?.addEventListener('change', event => void this.importExchangeFile((event.target as HTMLInputElement).files?.[0]));
    this.container.querySelector('#cad-material')?.addEventListener('change', event => {
      this.material = (event.target as HTMLSelectElement).value as CADMaterialKey;
      if (this.lastResult) this.presentResult(this.lastResult, this.lastStatusText, this.lastArtifactMetadata);
    });
    this.container.querySelectorAll('[data-cad-view]').forEach(button => button.addEventListener('click', () => this.setCameraView(button.getAttribute('data-cad-view') ?? 'fit')));
    this.container.querySelectorAll('[data-cad-tool]').forEach(button => button.addEventListener('click', () => {
      const mode = button.getAttribute('data-cad-tool') as Extract<TransformControlsMode, 'translate' | 'rotate'>;
      this.transformControls.setMode(mode);
      this.container.querySelectorAll('[data-cad-tool]').forEach(item => item.classList.toggle('active', item === button));
    }));
    this.container.querySelector('#btn-cad-transform-space')?.addEventListener('click', event => {
      const next = this.transformControls.space === 'world' ? 'local' : 'world';
      this.transformControls.setSpace(next);
      (event.currentTarget as HTMLButtonElement).textContent = next === 'world' ? 'World' : 'Local';
    });
    this.container.querySelector('#btn-cad-transform-snap')?.addEventListener('click', event => {
      const button = event.currentTarget as HTMLButtonElement;
      const enabled = !button.classList.contains('active');
      button.classList.toggle('active', enabled);
      button.textContent = enabled ? 'Snap 1 mm' : 'Snap off';
      this.transformControls.translationSnap = enabled ? 1 : null;
      this.transformControls.rotationSnap = enabled ? THREE.MathUtils.degToRad(15) : null;
    });
    this.renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    this.renderer.domElement.addEventListener('pointerdown', event => {
      this.pointerDown.set(event.clientX, event.clientY);
      this.previousPointer.copy(this.pointerDown);
      this.pointerMoved = false;
      if (event.button === 2 || (event.button === 0 && event.altKey)) this.navigationMode = 'orbit';
      else if (event.button === 1) this.navigationMode = 'pan';
      else this.navigationMode = 'none';
      if (this.navigationMode !== 'none') this.renderer.domElement.setPointerCapture(event.pointerId);
    });
    this.renderer.domElement.addEventListener('pointermove', event => {
      if (Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 3) this.pointerMoved = true;
      if (this.navigationMode === 'none') return;
      const dx = event.clientX - this.previousPointer.x;
      const dy = event.clientY - this.previousPointer.y;
      if (this.navigationMode === 'orbit') {
        this.cameraSpherical.theta -= dx * 0.008;
        this.cameraSpherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.cameraSpherical.phi - dy * 0.008));
      } else {
        const forward = this.cameraTarget.clone().sub(this.camera.position).normalize();
        const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const scale = this.cameraSpherical.radius * 0.0015;
        this.cameraTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      }
      this.previousPointer.set(event.clientX, event.clientY);
      this.updateCamera();
    });
    this.renderer.domElement.addEventListener('pointerup', event => {
      if (event.button === 0 && !this.pointerMoved && !this.transformDragging && !this.transformControls.axis) this.selectFeatureAtPointer(event);
      this.navigationMode = 'none';
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
    });
    this.renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); this.cameraSpherical.radius = Math.max(2, Math.min(2000, this.cameraSpherical.radius * Math.exp(event.deltaY * 0.001))); this.updateCamera(); }, { passive: false });

    templateSelect?.addEventListener('change', () => {
      const tmpl = CAD_TEMPLATES[templateSelect.value];
      if (tmpl && editor) {
        editor.value = tmpl.code;
        this.compileCurrentScript();
      }
    });

    btnCompile?.addEventListener('click', () => {
      this.compileCurrentScript();
    });

    btnExportSTL?.addEventListener('click', () => {
      if (!this.lastResult) return;
      const blob = new Blob([this.lastResult.stlData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `astrodyne_cad_model_${Date.now()}.stl`;
      a.click();
      URL.revokeObjectURL(url);
    });

    btnImportAxiom?.addEventListener('click', () => {
      if (this.lastResult && this.onImportToAxiom) {
        this.onImportToAxiom(this.createTransferSnapshot());
        const buildStatus = this.container.querySelector('#cad-build-status');
        if (buildStatus) buildStatus.textContent = 'TRANSFERRED · ASSEMBLY PART CREATED';
      }
    });

    btnSendAero?.addEventListener('click', () => {
      if (!this.lastResult || !this.onAeroAnalysis) return;
      this.onAeroAnalysis(CADAerodynamicAnalyzer.analyze(this.createTransferSnapshot().geometry));
      document.getElementById('btn-nav-rocketry')?.click();
    });

    window.addEventListener('resize', () => this.resize());
  }

  private addFeature(type: CADPrimitiveType): void {
    const feature = CADFeatureModel.create(type, this.features.length + 1);
    if (this.features.length) feature.operation = type === 'cylinder' ? 'subtract' : 'union';
    this.features.push(feature);
    this.selectedFeatureId = feature.id;
    this.commitFeatureChange();
  }

  private renderFeatureEditor(): void {
    const list = this.container.querySelector('#cad-feature-list');
    const inspector = this.container.querySelector('#cad-feature-inspector');
    if (!list || !inspector) return;
    list.innerHTML = this.features.map((feature, index) => `<button class="cad-feature-row ${feature.id === this.selectedFeatureId ? 'active' : ''}" data-feature-id="${feature.id}"><span>${index + 1}</span><b>${feature.name}</b><small>${index === 0 ? 'BASE' : feature.operation.toUpperCase()} · ${feature.type.toUpperCase()}</small></button>`).join('');
    list.querySelectorAll('[data-feature-id]').forEach(button => button.addEventListener('click', () => { this.selectedFeatureId = button.getAttribute('data-feature-id'); this.renderFeatureEditor(); }));
    const feature = this.features.find(item => item.id === this.selectedFeatureId);
    if (!feature) { inspector.innerHTML = '<div class="selection-empty">Add or select a feature.</div>'; return; }
    const number = (label: string, field: string, axis: number, value: number, step = 1) => `<label>${label}<input class="form-input" type="number" step="${step}" value="${value}" data-feature-field="${field}" data-axis="${axis}"></label>`;
    inspector.innerHTML = `
      <div class="cad-inspector-head"><input id="cad-feature-name" class="form-input" value="${feature.name}"><label><input id="cad-feature-enabled" type="checkbox" ${feature.enabled ? 'checked' : ''}> Enabled</label></div>
      <div class="cad-inspector-grid"><label>Operation<select id="cad-feature-operation" class="form-select" ${this.features[0]?.id === feature.id ? 'disabled' : ''}><option value="union" ${feature.operation === 'union' ? 'selected' : ''}>Union</option><option value="subtract" ${feature.operation === 'subtract' ? 'selected' : ''}>Subtract</option><option value="intersect" ${feature.operation === 'intersect' ? 'selected' : ''}>Intersect</option></select></label><label>Segments<input id="cad-feature-segments" class="form-input" type="number" min="8" max="256" value="${feature.segments}"></label></div>
      <div class="cad-inspector-section"><span>DIMENSIONS · mm</span><div class="cad-inspector-grid three">${number(feature.type === 'box' ? 'Width X' : 'Radius 1', 'dimensions', 0, feature.dimensions[0], .1)}${number(feature.type === 'box' ? 'Depth Y' : feature.type === 'cylinder' ? 'Radius 2' : 'Radius Y', 'dimensions', 1, feature.dimensions[1], .1)}${number(feature.type === 'box' ? 'Height Z' : feature.type === 'cylinder' ? 'Height' : 'Radius Z', 'dimensions', 2, feature.dimensions[2], .1)}</div></div>
      <div class="cad-inspector-section"><span>POSITION · mm</span><div class="cad-inspector-grid three">${number('X', 'position', 0, feature.position[0], .1)}${number('Y', 'position', 1, feature.position[1], .1)}${number('Z', 'position', 2, feature.position[2], .1)}</div></div>
      <div class="cad-inspector-section"><span>ROTATION · deg</span><div class="cad-inspector-grid three">${number('X', 'rotation', 0, feature.rotation[0], 1)}${number('Y', 'rotation', 1, feature.rotation[1], 1)}${number('Z', 'rotation', 2, feature.rotation[2], 1)}</div></div>
      <div class="cad-feature-actions"><button id="btn-cad-apply-feature" class="primary-btn">Apply and Rebuild</button><button id="btn-cad-feature-up" class="secondary-btn" ${this.features.indexOf(feature) === 0 ? 'disabled' : ''}>Move Up</button><button id="btn-cad-feature-down" class="secondary-btn" ${this.features.indexOf(feature) === this.features.length - 1 ? 'disabled' : ''}>Move Down</button><button id="btn-cad-duplicate-feature" class="secondary-btn">Duplicate</button><button id="btn-cad-delete-feature" class="danger-btn" ${this.features.length <= 1 ? 'disabled' : ''}>Delete</button></div>`;
    inspector.querySelector('#btn-cad-apply-feature')?.addEventListener('click', () => this.readFeatureInspector(feature));
    inspector.querySelector('#btn-cad-feature-up')?.addEventListener('click', () => this.moveFeature(feature, -1));
    inspector.querySelector('#btn-cad-feature-down')?.addEventListener('click', () => this.moveFeature(feature, 1));
    inspector.querySelector('#btn-cad-duplicate-feature')?.addEventListener('click', () => { const copy = structuredClone(feature); copy.id = `feature-${Date.now()}`; copy.name += ' Copy'; copy.position[0] += 5; this.features.splice(this.features.indexOf(feature) + 1, 0, copy); this.selectedFeatureId = copy.id; this.commitFeatureChange(); });
    inspector.querySelector('#btn-cad-delete-feature')?.addEventListener('click', () => { if (this.features.length <= 1) return; this.features = this.features.filter(item => item.id !== feature.id); this.selectedFeatureId = this.features[Math.max(0, this.features.length - 1)]?.id ?? null; this.commitFeatureChange(); });
    this.rebuildFeatureHandles();
  }

  private rebuildFeatureHandles(): void {
    this.transformControls.detach();
    for (const handle of this.featureHandles.values()) {
      handle.geometry.dispose();
      (handle.material as THREE.Material).dispose();
      this.featureHandlesGroup.remove(handle);
    }
    this.featureHandles.clear();
    for (const feature of this.features) {
      if (!feature.enabled) continue;
      let geometry: THREE.BufferGeometry;
      if (feature.type === 'box') {
        geometry = new THREE.BoxGeometry(...feature.dimensions);
      } else if (feature.type === 'cylinder') {
        geometry = new THREE.CylinderGeometry(feature.dimensions[1], feature.dimensions[0], feature.dimensions[2], Math.max(12, Math.min(64, feature.segments)));
        geometry.rotateX(Math.PI / 2);
      } else {
        geometry = new THREE.SphereGeometry(feature.dimensions[0], Math.max(12, Math.min(48, feature.segments)), Math.max(8, Math.min(32, Math.round(feature.segments / 2))));
        geometry.scale(1, feature.dimensions[1] / Math.max(0.01, feature.dimensions[0]), feature.dimensions[2] / Math.max(0.01, feature.dimensions[0]));
      }
      const selected = feature.id === this.selectedFeatureId;
      const color = feature.operation === 'subtract' ? 0xc2413b : feature.operation === 'intersect' ? 0xa56a00 : 0x1769aa;
      const material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: selected ? 0.72 : 0.2, depthTest: false });
      const handle = new THREE.Mesh(geometry, material);
      handle.position.set(...feature.position);
      handle.rotation.set(...feature.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
      handle.userData.featureId = feature.id;
      handle.renderOrder = 10;
      this.featureHandles.set(feature.id, handle);
      this.featureHandlesGroup.add(handle);
    }
    const selectedHandle = this.selectedFeatureId ? this.featureHandles.get(this.selectedFeatureId) : undefined;
    if (selectedHandle) this.transformControls.attach(selectedHandle);
  }

  private selectFeatureAtPointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObjects([...this.featureHandles.values()], false)[0];
    if (!hit) return;
    this.selectedFeatureId = hit.object.userData.featureId as string;
    this.renderFeatureEditor();
  }

  private syncFeatureFromGizmo(commit: boolean): void {
    if (!this.selectedFeatureId) return;
    const feature = this.features.find(item => item.id === this.selectedFeatureId);
    const handle = this.featureHandles.get(this.selectedFeatureId);
    if (!feature || !handle) return;
    feature.position = [handle.position.x, handle.position.y, handle.position.z].map(value => Number(value.toFixed(4))) as [number, number, number];
    feature.rotation = [handle.rotation.x, handle.rotation.y, handle.rotation.z].map(value => Number(THREE.MathUtils.radToDeg(value).toFixed(3))) as [number, number, number];
    if (commit) this.commitFeatureChange();
    else {
      this.container.querySelectorAll<HTMLInputElement>('[data-feature-field="position"]').forEach(input => { input.value = String(feature.position[Number(input.dataset.axis) as 0 | 1 | 2]); });
      this.container.querySelectorAll<HTMLInputElement>('[data-feature-field="rotation"]').forEach(input => { input.value = String(feature.rotation[Number(input.dataset.axis) as 0 | 1 | 2]); });
    }
  }

  private createTransferSnapshot(): CADMeshResult {
    if (!this.lastResult) throw new Error('No CAD solid is available to transfer.');
    const source = this.lastResult;
    source.mesh.updateMatrix();
    const geometry = source.geometry.clone();
    geometry.applyMatrix4(source.mesh.matrix);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = source.mesh.material instanceof THREE.MeshStandardMaterial
      ? source.mesh.material.clone()
      : new THREE.MeshStandardMaterial({ color: 0x1769aa, metalness: 0.15, roughness: 0.52, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { ...source, geometry, mesh };
  }

  private moveFeature(feature: CADFeature, delta: -1 | 1): void {
    const from = this.features.indexOf(feature);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.features.length) return;
    this.features.splice(from, 1);
    this.features.splice(to, 0, feature);
    this.features[0].operation = 'union';
    this.commitFeatureChange();
  }

  private readFeatureInspector(feature: CADFeature): void {
    const inspector = this.container.querySelector('#cad-feature-inspector');
    if (!inspector) return;
    feature.name = (inspector.querySelector('#cad-feature-name') as HTMLInputElement).value.trim() || feature.name;
    feature.enabled = (inspector.querySelector('#cad-feature-enabled') as HTMLInputElement).checked;
    feature.operation = (inspector.querySelector('#cad-feature-operation') as HTMLSelectElement).value as CADFeature['operation'];
    feature.segments = Math.max(8, Math.min(256, Number((inspector.querySelector('#cad-feature-segments') as HTMLInputElement).value) || 32));
    inspector.querySelectorAll('[data-feature-field]').forEach(input => {
      const element = input as HTMLInputElement;
      const field = element.dataset.featureField as 'dimensions' | 'position' | 'rotation';
      const axis = Number(element.dataset.axis) as 0 | 1 | 2;
      const value = Number(element.value);
      if (Number.isFinite(value)) feature[field][axis] = field === 'dimensions' ? Math.max(.01, value) : value;
    });
    this.commitFeatureChange();
  }

  private commitFeatureChange(): void { this.recordFeatureHistory(); this.renderFeatureEditor(); void this.rebuildFeatures(); }
  private saveFeatureFile(): void {
    const payload = JSON.stringify({ format: 'astrodyne-cad', version: 1, units: 'mm', material: this.material, features: this.features }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `astrodyne-model-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url);
  }
  private async openFeatureFile(file?: File): Promise<void> {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format !== 'astrodyne-cad' || !Array.isArray(payload.features) || !payload.features.length) throw new Error('Not an Astrodyne CAD file');
      const validTypes = ['box', 'cylinder', 'sphere']; const validOps = ['union', 'subtract', 'intersect'];
      if (payload.features.some((feature: CADFeature) => !validTypes.includes(feature.type) || !validOps.includes(feature.operation) || !Array.isArray(feature.dimensions))) throw new Error('Invalid feature data');
      this.features = payload.features; this.material = payload.material in CAD_MATERIALS ? payload.material : 'pla';
      const materialSelect = this.container.querySelector('#cad-material') as HTMLSelectElement | null; if (materialSelect) materialSelect.value = this.material;
      this.selectedFeatureId = this.features[0].id; this.featureHistory = []; this.featureHistoryIndex = -1; this.commitFeatureChange();
    } catch (error) {
      const buildStatus = this.container.querySelector('#cad-build-status'); if (buildStatus) buildStatus.textContent = `OPEN ERROR · ${error instanceof Error ? error.message : 'INVALID FILE'}`;
    } finally { const input = this.container.querySelector('#cad-file-input') as HTMLInputElement | null; if (input) input.value = ''; }
  }
  private async importExchangeFile(file?: File): Promise<void> {
    if (!file) return;
    const buildStatus = this.container.querySelector('#cad-build-status');
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const format = extension === 'step' || extension === 'stp' ? 'step' : extension === 'iges' || extension === 'igs' ? 'iges' : extension === 'brep' || extension === 'brp' ? 'brep' : null;
      if (!format) throw new Error('Supported formats: STEP, STP, IGES, IGS, BREP, BRP');
      if (buildStatus) buildStatus.textContent = `OPENCASCADE IMPORT · ${file.name.toUpperCase()}`;
      const importer = await OpenCascadeImporter.getInstance();
      const result = await importer.importFile(file, format);
      this.presentResult(result, `OCCT ${format.toUpperCase()} · ${result.assemblyParts} PARTS · ${result.topologyFaces} FACES`, {
        source: 'OpenCascade 7.9.3',
        sourceFile: file.name,
        sourceFormat: result.sourceFormat,
        sourceUnit: result.sourceUnit,
        assemblyParts: result.assemblyParts,
        topologyFaces: result.topologyFaces,
        topologyEdges: result.topologyEdges
      });
    } catch (error) {
      if (buildStatus) buildStatus.textContent = `IMPORT ERROR · ${error instanceof Error ? error.message : 'INVALID CAD EXCHANGE FILE'}`;
    } finally {
      const input = this.container.querySelector('#cad-exchange-input') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  }
  private recordFeatureHistory(): void { const state = JSON.stringify(this.features); if (state === this.featureHistory[this.featureHistoryIndex]) return; this.featureHistory = this.featureHistory.slice(0, this.featureHistoryIndex + 1); this.featureHistory.push(state); if (this.featureHistory.length > 50) this.featureHistory.shift(); this.featureHistoryIndex = this.featureHistory.length - 1; this.updateFeatureHistoryButtons(); }
  private restoreFeatureHistory(index: number): void { if (index < 0 || index >= this.featureHistory.length) return; this.features = JSON.parse(this.featureHistory[index]); this.featureHistoryIndex = index; this.selectedFeatureId = this.features[0]?.id ?? null; this.updateFeatureHistoryButtons(); this.renderFeatureEditor(); void this.rebuildFeatures(); }
  private updateFeatureHistoryButtons(): void { const undo = this.container.querySelector('#btn-cad-undo') as HTMLButtonElement | null; const redo = this.container.querySelector('#btn-cad-redo') as HTMLButtonElement | null; if (undo) undo.disabled = this.featureHistoryIndex <= 0; if (redo) redo.disabled = this.featureHistoryIndex >= this.featureHistory.length - 1; }
  private async rebuildFeatures(): Promise<void> {
    if (!this.evaluator) {
      const engine = await ManifoldCADEngine.getInstance();
      this.evaluator = new OpenSCADEvaluator(engine);
    }
    const buildStatus = this.container.querySelector('#cad-build-status');
    try {
      if (buildStatus) buildStatus.textContent = 'MANIFOLD FEATURE REBUILD';
      const generatedScript = CADFeatureModel.toScript(this.features);
      const res = await this.evaluator.evaluateScript(generatedScript);
      this.presentResult(res, `MANIFOLD SOLID · ${res.numTriangles} TRIANGLES`, {
        source: 'Manifold 3.5 feature model',
        features: structuredClone(this.features),
        generatedScript
      });
    } catch (error) {
      if (buildStatus) buildStatus.textContent = `BUILD ERROR · ${error instanceof Error ? error.message : 'INVALID FEATURE MODEL'}`;
    }
  }

  private updateCamera(): void { this.camera.position.setFromSpherical(this.cameraSpherical).add(this.cameraTarget); this.camera.lookAt(this.cameraTarget); }
  private setCameraView(view: string): void { if (view === 'fit') return this.fitCameraToModel(); if (view === 'front') this.cameraSpherical.set(this.cameraSpherical.radius, Math.PI / 2, 0); else if (view === 'top') this.cameraSpherical.set(this.cameraSpherical.radius, 0.01, 0); else this.cameraSpherical.set(this.cameraSpherical.radius, Math.PI / 3, Math.PI / 4); this.updateCamera(); }
  private fitCameraToModel(): void {
    if (!this.currentMesh) return;
    const sphere = new THREE.Box3().setFromObject(this.currentMesh).getBoundingSphere(new THREE.Sphere());
    this.cameraTarget.copy(sphere.center);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.05, this.camera.aspect));
    const limitingFov = Math.max(THREE.MathUtils.degToRad(5), Math.min(verticalFov, horizontalFov));
    this.cameraSpherical.radius = Math.max(5, sphere.radius / Math.sin(limitingFov / 2) * 1.2);
    this.updateCamera();
  }

  private presentResult(res: CADMeshResult, statusText: string, artifactMetadata: Record<string, unknown>): void {
    this.lastStatusText = statusText;
    this.lastArtifactMetadata = artifactMetadata;
    this.lastResult = res;
    if (this.currentMesh) this.scene.remove(this.currentMesh);
    this.currentMesh = res.mesh;
    this.scene.add(this.currentMesh);
    this.fitCameraToModel();

    const volCm3 = res.volumeMm3 / 1000;
    const massG = calculateCADMassKg(res.volumeMm3, this.material) * 1000;
    res.materialKey = this.material;
    res.materialName = CAD_MATERIALS[this.material].name;
    res.densityGcm3 = CAD_MATERIALS[this.material].densityGcm3;
    res.massKg = massG / 1000;
    res.sourceLabel = typeof artifactMetadata.sourceFile === 'string'
      ? artifactMetadata.sourceFile
      : typeof artifactMetadata.source === 'string' ? artifactMetadata.source : 'Parametric CAD';
    res.geometry.computeBoundingBox();
    const size = res.geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
    const aero = CADAerodynamicAnalyzer.analyze(res.geometry);
    const setText = (selector: string, value: string) => { const element = this.container.querySelector(selector); if (element) element.textContent = value; };
    setText('#cad-val-vol', `${EngineeringMeasurements.scalar(res.volumeMm3, 'mm³')} · ${EngineeringMeasurements.scalar(volCm3, 'cm³')}`);
    setText('#cad-val-area', EngineeringMeasurements.scalar(res.surfaceAreaMm2, 'mm²'));
    setText('#cad-val-geom', `${res.numTriangles.toLocaleString()} tris / ${res.numVertices.toLocaleString()} verts`);
    setText('#cad-val-bounds', `${EngineeringMeasurements.scalar(size.x)} × ${EngineeringMeasurements.scalar(size.y)} × ${EngineeringMeasurements.scalar(size.z)} mm`);
    setText('#cad-val-mass', EngineeringMeasurements.scalar(massG, 'g'));
    setText('#cad-val-frontal', EngineeringMeasurements.scalar(aero.frontalAreaMm2, 'mm²'));
    setText('#cad-val-drag', `Cd ${EngineeringMeasurements.scalar(aero.estimatedCd)} · fineness ${EngineeringMeasurements.scalar(aero.finenessRatio)}`);
    EngineeringProjectSession.setArtifact('cad', `${EngineeringMeasurements.scalar(res.volumeMm3, 'mm³')} · ${res.numTriangles} triangles`, {
      volumeMm3: res.volumeMm3,
      surfaceAreaMm2: res.surfaceAreaMm2,
      triangles: res.numTriangles,
      frontalAreaMm2: aero.frontalAreaMm2,
      estimatedCd: aero.estimatedCd,
      boundsMm: [size.x, size.y, size.z],
      material: this.material,
      densityGcm3: CAD_MATERIALS[this.material].densityGcm3,
      massG,
      ...artifactMetadata
    });
    setText('#cad-build-status', statusText);
  }

  public async compileCurrentScript(): Promise<void> {
    const editor = this.container.querySelector('#cad-code-editor') as HTMLTextAreaElement;
    if (!editor) return;

    try {
      const buildStatus = this.container.querySelector('#cad-build-status');
      if (buildStatus) buildStatus.textContent = 'OPENSCAD WASM · PARSING AND RENDERING';
      const res = await OpenSCADWASMBackend.evaluate(editor.value);
      this.presentResult(res, `OPENSCAD SOLID · ${res.numTriangles} TRIANGLES`, {
        source: 'OpenSCAD 2026.06.08 WASM',
        sourceFormat: 'scad',
        sourceScript: editor.value
      });
    } catch (err: any) {
      console.error('[CADStudioView] Compile error:', err);
      const buildStatus = this.container.querySelector('#cad-build-status');
      if (buildStatus) buildStatus.textContent = `BUILD ERROR · ${err instanceof Error ? err.message : 'INVALID MODEL'}`;
    }
  }

  public resize(): void {
    const canvasContainer = this.container.querySelector('#cad-canvas-container') as HTMLElement;
    if (!canvasContainer) return;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
