import { PartGraph } from './part-graph.js';
import { PartCategory } from './types.js';
import { PART_CATALOG } from './catalog.js';
import { BuilderViewport } from './builder-view.js';

export class BuilderUI {
  private container: HTMLElement;
  private viewport: BuilderViewport;
  private partGraph: PartGraph;
  private onLaunchSpacecraft: () => void;

  private activeCategory: PartCategory | 'ALL' = 'ALL';
  public isVisible = false;

  constructor(
    container: HTMLElement,
    viewport: BuilderViewport,
    partGraph: PartGraph,
    onLaunchSpacecraft: () => void
  ) {
    this.container = container;
    this.viewport = viewport;
    this.partGraph = partGraph;
    this.onLaunchSpacecraft = onLaunchSpacecraft;

    this.buildDOM();
    this.bindEvents();
    this.renderPartPalette();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
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
          </div>
        </div>

        <div class="palette-grid" id="builder-palette-grid"></div>
      </aside>

      <!-- Right Telemetry & Action Drawer -->
      <aside id="builder-telemetry-drawer" class="telemetry-inspector-drawer glass-panel" style="display: none;">
        <div class="drawer-header">
          <div class="palette-title">MULTIBODY TELEMETRY</div>
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
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
            <button id="btn-builder-test-physics" class="primary-btn" style="background: linear-gradient(135deg, #059669, #10b981); padding: 9px; font-size: 11.5px; font-weight: 700;">
              ▶ Run Kinematics / Drive Test
            </button>
            <button id="btn-builder-launch" class="primary-btn" style="background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 9px; font-size: 11.5px; font-weight: 700;">
              🚀 Launch Vehicle to Space
            </button>
            <button id="btn-builder-clear" class="secondary-btn" style="padding: 7px; font-size: 11px;">
              🗑️ Clear Assembly
            </button>
          </div>

          <div class="help-card" style="margin-top: 10px;">
            <div class="help-title">Controls & Kinematics</div>
            <ul class="help-list">
              <li><strong>Left Click:</strong> Snap/place selected part</li>
              <li><strong>Proximity:</strong> Automatic socket alignment</li>
              <li><strong>Test Mode:</strong> Drive rover with WASD keys</li>
              <li><strong>Right Click:</strong> Orbit 3D studio camera</li>
            </ul>
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
      this.partGraph.clear();
      while (this.viewport.scene.children.length > 0) {
        this.viewport.scene.remove(this.viewport.scene.children[0]);
      }
      this.updateTelemetry();
      this.viewport.updateSocketMarkers();
    });

    const btnTest = this.container.querySelector('#btn-builder-test-physics') as HTMLButtonElement;
    btnTest?.addEventListener('click', async () => {
      if (!this.viewport.isKinematicsTestMode) {
        btnTest.textContent = '⏹ Stop Physics Test';
        btnTest.style.background = 'linear-gradient(135deg, #e11d48, #be123c)';
        await this.viewport.startKinematicsTest();
      } else {
        btnTest.textContent = '▶ Run Kinematics / Drive Test';
        btnTest.style.background = 'linear-gradient(135deg, #059669, #10b981)';
        this.viewport.stopKinematicsTest();
      }
    });

    const btnLaunch = this.container.querySelector('#btn-builder-launch');
    btnLaunch?.addEventListener('click', () => {
      this.onLaunchSpacecraft();
    });
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
        <div class="part-sockets-count">🔗 ${def.sockets.length} snap sockets</div>
      `;

      card.addEventListener('click', () => {
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

  public updateTelemetry(): void {
    const valCount = this.container.querySelector('#builder-val-count');
    const valMass = this.container.querySelector('#builder-val-mass');
    const valTorque = this.container.querySelector('#builder-val-torque');
    const valCm = this.container.querySelector('#builder-val-cm');

    const totalParts = this.partGraph.assembly.parts.size;
    const totalMass = this.partGraph.assembly.totalMassKg;
    const cm = this.partGraph.assembly.centerOfMassWorld;

    let totalTorque = 0;
    for (const [_, inst] of this.partGraph.assembly.parts.entries()) {
      const def = this.partGraph.getDefinition(inst.definitionId);
      if (def?.properties?.maxTorqueNm) {
        totalTorque += def.properties.maxTorqueNm;
      }
    }

    if (valCount) valCount.textContent = `${totalParts}`;
    if (valMass) valMass.textContent = `${totalMass.toFixed(2)} kg`;
    if (valTorque) valTorque.textContent = `${totalTorque.toFixed(1)} Nm`;
    if (valCm) valCm.textContent = `[${cm[0].toFixed(2)}, ${cm[1].toFixed(2)}, ${cm[2].toFixed(2)}]`;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    const palette = this.container.querySelector('#builder-palette-drawer') as HTMLElement;
    const telem = this.container.querySelector('#builder-telemetry-drawer') as HTMLElement;

    if (palette) palette.style.display = visible ? 'flex' : 'none';
    if (telem) telem.style.display = visible ? 'flex' : 'none';
    this.viewport.setVisible(visible);
  }
}
