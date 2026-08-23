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
            <button class="cat-chip" data-cat="${PartCategory.AEROSPACE}">Rocket</button>
            <button class="cat-chip" data-cat="${PartCategory.ROBOTICS_MOBILITY}">Robotics</button>
          </div>
        </div>

        <div class="palette-grid" id="builder-palette-grid"></div>
      </aside>

      <!-- Right Telemetry & Action Drawer -->
      <aside id="builder-telemetry-drawer" class="telemetry-inspector-drawer glass-panel" style="display: none;">
        <div class="drawer-header">
          <div class="palette-title">ASSEMBLY TELEMETRY</div>
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
              <span class="telem-label">Center of Mass</span>
              <span class="telem-val" id="builder-val-cm">[0.0, 0.0, 0.0]</span>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
            <button id="btn-builder-launch" class="primary-btn" style="background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 10px; font-size: 12px;">
              🚀 Launch Vehicle to Space
            </button>
            <button id="btn-builder-clear" class="secondary-btn">
              🗑️ Clear Assembly
            </button>
          </div>

          <div class="help-card" style="margin-top: 14px;">
            <div class="help-title">Controls</div>
            <ul class="help-list">
              <li><strong>Left Click:</strong> Snap/place selected part</li>
              <li><strong>Proximity:</strong> Automatic socket alignment</li>
              <li><strong>Right Click:</strong> Orbit camera</li>
            </ul>
          </div>
        </div>
      </aside>
    `;
  }

  private bindEvents(): void {
    const catChips = this.container.querySelectorAll('.cat-chip');
    catChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        catChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeCategory = chip.getAttribute('data-cat') as any;
        this.renderPartPalette();
      });
    });

    document.getElementById('btn-builder-clear')?.addEventListener('click', () => {
      if (confirm('Clear entire modular machine assembly?')) {
        this.partGraph.clear();
        this.viewport.updateSocketMarkers();
        this.updateTelemetry();
      }
    });

    document.getElementById('btn-builder-launch')?.addEventListener('click', () => {
      this.onLaunchSpacecraft();
    });
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    const pDrawer = document.getElementById('builder-palette-drawer');
    const tDrawer = document.getElementById('builder-telemetry-drawer');
    if (pDrawer) pDrawer.style.display = visible ? 'flex' : 'none';
    if (tDrawer) tDrawer.style.display = visible ? 'flex' : 'none';
    this.viewport.setVisible(visible);
  }

  private renderPartPalette(): void {
    const grid = document.getElementById('builder-palette-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const filtered = this.activeCategory === 'ALL'
      ? PART_CATALOG
      : PART_CATALOG.filter((p) => p.category === this.activeCategory);

    for (const part of filtered) {
      const card = document.createElement('div');
      card.className = `part-card ${this.viewport.activePartDef?.id === part.id ? 'active' : ''}`;
      card.innerHTML = `
        <div class="part-card-header">
          <span class="part-category-tag">${part.category}</span>
          <span class="part-mass-tag">${(part.massKg * 1000).toFixed(0)}g</span>
        </div>
        <div class="part-card-title">${part.name}</div>
        <div class="part-card-desc">${part.description}</div>
        <div class="part-sockets-count">🔗 ${part.sockets.length} snap sockets</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.part-card').forEach((c) => c.classList.remove('active'));
        if (this.viewport.activePartDef?.id === part.id) {
          this.viewport.setActivePartDef(null);
        } else {
          card.classList.add('active');
          this.viewport.setActivePartDef(part);
        }
      });

      grid.appendChild(card);
    }
  }

  public updateTelemetry(): void {
    const countEl = document.getElementById('builder-val-count');
    const massEl = document.getElementById('builder-val-mass');
    const cmEl = document.getElementById('builder-val-cm');

    if (countEl) countEl.textContent = String(this.partGraph.assembly.parts.size);
    if (massEl) massEl.textContent = `${this.partGraph.assembly.totalMassKg.toFixed(2)} kg`;
    if (cmEl) cmEl.textContent = `[${this.partGraph.assembly.centerOfMassWorld.map(v => v.toFixed(2)).join(', ')}]`;
  }
}
