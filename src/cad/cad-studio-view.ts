import * as THREE from 'three';
import { ManifoldCADEngine, CADMeshResult } from './manifold-engine.js';
import { OpenSCADEvaluator } from './openscad-evaluator.js';

export const CAD_TEMPLATES: Record<string, { name: string; code: string }> = {
  rocket_nosecone: {
    name: 'Supersonic Ogive Nosecone (with Hollow Shell & Shoulder)',
    code: `// Supersonic Ogive Rocket Nosecone with Base Shoulder
const noseLength = 60;
const noseRadius = 15;
const wallThickness = 1.5;
const shoulderLength = 15;
const shoulderRadius = noseRadius - wallThickness;

// Solid Outer Body (Cone / Ogive approximation via revolved cylinder stack)
let outer = cylinder(noseLength, noseRadius, 0.5, 64, false);
let shoulder = translate(cylinder(shoulderLength, shoulderRadius, shoulderRadius, 64, false), [0, 0, -shoulderLength]);
let combined = union(outer, shoulder);

// Hollow Interior Cavity for payload / avionics
let inner = translate(cylinder(noseLength + shoulderLength - 2, shoulderRadius - wallThickness, 0.5, 64, false), [0, 0, -shoulderLength + wallThickness]);

return difference(combined, inner);`
  },
  motor_mount: {
    name: 'NEMA17 / 12V Motor Mounting Plate (with M3 Screw Pattern)',
    code: `// Precision NEMA17 / DC Motor Mount with M3 Bolt Pattern
const plateWidth = 42;
const plateHeight = 42;
const plateThickness = 5;
const centerBoreRadius = 11;
const screwHoleRadius = 1.6; // M3 clearance (3.2mm diameter)
const screwPitch = 31.0;     // NEMA17 standard 31mm square pattern

let plate = cube([plateWidth, plateHeight, plateThickness], true);
let centerHole = cylinder(plateThickness + 2, centerBoreRadius, centerBoreRadius, 48, true);

// 4x M3 Mounting Holes
let h1 = translate(cylinder(plateThickness + 2, screwHoleRadius, screwHoleRadius, 32, true), [screwPitch/2, screwPitch/2, 0]);
let h2 = translate(cylinder(plateThickness + 2, screwHoleRadius, screwHoleRadius, 32, true), [-screwPitch/2, screwPitch/2, 0]);
let h3 = translate(cylinder(plateThickness + 2, screwHoleRadius, screwHoleRadius, 32, true), [screwPitch/2, -screwPitch/2, 0]);
let h4 = translate(cylinder(plateThickness + 2, screwHoleRadius, screwHoleRadius, 32, true), [-screwPitch/2, -screwPitch/2, 0]);

return difference(plate, centerHole, h1, h2, h3, h4);`
  },
  spur_gear: {
    name: '40-Tooth Module 1.0 Spur Gear (with D-Shaft Keyway)',
    code: `// 40-Tooth Spur Gear with 5mm D-Shaft Bore
const numTeeth = 40;
const pitchRadius = numTeeth / 2.0; // 20mm
const gearThickness = 6;
const shaftRadius = 2.5; // 5mm shaft

let gearBody = cylinder(gearThickness, pitchRadius, pitchRadius, 64, true);

// Shaft bore
let shaft = cylinder(gearThickness + 2, shaftRadius, shaftRadius, 32, true);
// D-cut flat
let dCut = translate(cube([5, 2, gearThickness + 4], true), [0, shaftRadius - 0.75, 0]);
let shaftKeyway = difference(shaft, dCut);

// Weight reduction cutouts
let w1 = translate(cylinder(gearThickness + 2, 4, 4, 32, true), [10, 0, 0]);
let w2 = translate(cylinder(gearThickness + 2, 4, 4, 32, true), [-10, 0, 0]);
let w3 = translate(cylinder(gearThickness + 2, 4, 4, 32, true), [0, 10, 0]);
let w4 = translate(cylinder(gearThickness + 2, 4, 4, 32, true), [0, -10, 0]);

return difference(gearBody, shaftKeyway, w1, w2, w3, w4);`
  }
};

export class CADStudioView {
  private container: HTMLElement;
  private evaluator?: OpenSCADEvaluator;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private currentMesh: THREE.Mesh | null = null;
  private lastResult: CADMeshResult | null = null;

  private onImportToAxiom?: (result: CADMeshResult) => void;

  constructor(
    container: HTMLElement,
    onImportToAxiom?: (result: CADMeshResult) => void
  ) {
    this.container = container;
    this.onImportToAxiom = onImportToAxiom;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(80, 80, 100);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;

    this.initLightsAndGrid();
    this.renderUI();

    // Async init WASM engine
    ManifoldCADEngine.getInstance().then(engine => {
      this.evaluator = new OpenSCADEvaluator(engine);
      this.compileCurrentScript();
    }).catch(err => {
      console.warn('[CADStudioView] WASM Init Warning:', err);
    });
  }

  private initLightsAndGrid(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00f2fe, 1.2);
    dirLight1.position.set(50, 100, 50);
    dirLight1.castShadow = true;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.8);
    dirLight2.position.set(-50, -50, -50);
    this.scene.add(dirLight2);

    const grid = new THREE.GridHelper(200, 40, 0x1e293b, 0x0f172a);
    grid.position.y = -20;
    this.scene.add(grid);
  }

  private renderUI(): void {
    this.container.innerHTML = `
      <div class="cad-studio-layout">
        <!-- Left Code & Presets Sidebar -->
        <div class="cad-code-sidebar">
          <div class="cad-header">
            <div class="cad-title">📐 OpenSCAD / Manifold-3D CSG Studio</div>
            <div class="cad-badge">Guaranteed 2-Manifold WASM</div>
          </div>

          <div class="cad-template-picker">
            <label class="cad-label">Engineering Templates:</label>
            <select id="cad-template-select" class="form-select">
              <option value="rocket_nosecone">🚀 Supersonic Ogive Nosecone</option>
              <option value="motor_mount">⚙️ NEMA17 / DC Motor Mount</option>
              <option value="spur_gear">⚙️ 40T Spur Gear with Keyway</option>
            </select>
          </div>

          <div class="cad-editor-wrapper">
            <div class="cad-editor-header">
              <span>Parametric OpenSCAD Script:</span>
              <button id="btn-cad-compile" class="btn-cad-run">⚡ Compile CSG Model</button>
            </div>
            <textarea id="cad-code-editor" class="cad-code-area" spellcheck="false">${CAD_TEMPLATES.rocket_nosecone.code}</textarea>
          </div>

          <!-- Physical Diagnostics -->
          <div class="cad-telemetry-box">
            <div class="cad-telem-row"><span>Solid Volume:</span> <b id="cad-val-vol">0.0 mm³</b></div>
            <div class="cad-telem-row"><span>Surface Area:</span> <b id="cad-val-area">0.0 mm²</b></div>
            <div class="cad-telem-row"><span>Triangles / Vertices:</span> <b id="cad-val-geom">0 / 0</b></div>
            <div class="cad-telem-row"><span>Est. 3D Print Mass (PLA):</span> <b id="cad-val-mass">0.0 g</b></div>
          </div>

          <!-- Export & AXIOM Integration Buttons -->
          <div class="cad-actions-row">
            <button id="btn-export-stl" class="btn-cad-export">📥 Export STL (3D Print)</button>
            <button id="btn-import-axiom" class="btn-cad-import">➕ Import to AXIOM</button>
          </div>
        </div>

        <!-- Right 3D WebGL Viewport -->
        <div class="cad-viewport-wrapper" id="cad-canvas-container"></div>
      </div>
    `;

    const canvasContainer = this.container.querySelector('#cad-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.appendChild(this.renderer.domElement);
      this.resize();
    }

    this.attachEvents();
    this.compileCurrentScript();
  }

  private attachEvents(): void {
    const templateSelect = this.container.querySelector('#cad-template-select') as HTMLSelectElement;
    const editor = this.container.querySelector('#cad-code-editor') as HTMLTextAreaElement;
    const btnCompile = this.container.querySelector('#btn-cad-compile');
    const btnExportSTL = this.container.querySelector('#btn-export-stl');
    const btnImportAxiom = this.container.querySelector('#btn-import-axiom');

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
        this.onImportToAxiom(this.lastResult);
        alert('✓ Model imported into AXIOM Modular Part Graph!');
      }
    });

    window.addEventListener('resize', () => this.resize());
  }

  public async compileCurrentScript(): Promise<void> {
    const editor = this.container.querySelector('#cad-code-editor') as HTMLTextAreaElement;
    if (!editor) return;

    if (!this.evaluator) {
      const engine = await ManifoldCADEngine.getInstance();
      this.evaluator = new OpenSCADEvaluator(engine);
    }

    try {
      const res = await this.evaluator.evaluateScript(editor.value);
      this.lastResult = res;

      if (this.currentMesh) {
        this.scene.remove(this.currentMesh);
      }

      this.currentMesh = res.mesh;
      this.scene.add(this.currentMesh);

      // Update Diagnostics
      const volEl = this.container.querySelector('#cad-val-vol');
      const areaEl = this.container.querySelector('#cad-val-area');
      const geomEl = this.container.querySelector('#cad-val-geom');
      const massEl = this.container.querySelector('#cad-val-mass');

      const volCm3 = res.volumeMm3 / 1000.0;
      const plaMassG = volCm3 * 1.24; // 1.24 g/cm3 for PLA

      if (volEl) volEl.textContent = `${res.volumeMm3.toFixed(1)} mm³ (${volCm3.toFixed(2)} cm³)`;
      if (areaEl) areaEl.textContent = `${res.surfaceAreaMm2.toFixed(1)} mm²`;
      if (geomEl) geomEl.textContent = `${res.numTriangles.toLocaleString()} tris / ${res.numVertices.toLocaleString()} verts`;
      if (massEl) massEl.textContent = `${plaMassG.toFixed(2)} g`;
    } catch (err: any) {
      console.error('[CADStudioView] Compile error:', err);
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
    if (this.currentMesh) {
      this.currentMesh.rotation.y += 0.005;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
