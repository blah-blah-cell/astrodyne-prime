import { PRESETS } from '../physics/presets';
import { PresetConfig } from '../physics/types';

export class PresetsPanel {
  private container: HTMLElement;
  private onSelectPreset: (preset: PresetConfig, particleCount: number) => void;
  public selectedCount = 100000;
  public currentPresetId = PRESETS[0].id;

  constructor(
    container: HTMLElement,
    onSelectPreset: (preset: PresetConfig, particleCount: number) => void
  ) {
    this.container = container;
    this.onSelectPreset = onSelectPreset;
    this.render();
  }

  public render(): void {
    const particleCounts = [10000, 50000, 100000, 250000, 500000, 1000000];

    this.container.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">
          <span>PARTICLE DENSITY</span>
          <span class="badge-count">${(this.selectedCount / 1000).toFixed(0)}k</span>
        </div>
        <div class="count-selector-grid">
          ${particleCounts.map(count => `
            <button class="count-btn ${count === this.selectedCount ? 'active' : ''}" data-count="${count}">
              ${count >= 1000000 ? '1.0M' : `${count / 1000}k`}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">
          <span>CELESTIAL SCENARIOS</span>
        </div>
        <div class="presets-list">
          ${PRESETS.map(preset => `
            <div class="preset-card ${preset.id === this.currentPresetId ? 'active' : ''}" data-preset-id="${preset.id}">
              <div class="preset-card-header">
                <span class="preset-name">${preset.name}</span>
                <span class="preset-category">${preset.category}</span>
              </div>
              <div class="preset-desc">${preset.description}</div>
              <div class="preset-footer">
                <span class="preset-tag">θ = ${preset.recommendedTheta}</span>
                <span class="preset-tag">G = ${preset.defaultG}</span>
                <button class="btn-load-preset">SIMULATE</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    const countBtns = this.container.querySelectorAll('.count-btn');
    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.getAttribute('data-count') || '100000', 10);
        this.selectedCount = count;
        countBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const badge = this.container.querySelector('.badge-count');
        if (badge) badge.textContent = count >= 1000000 ? '1.0M' : `${count / 1000}k`;

        const preset = PRESETS.find(p => p.id === this.currentPresetId) || PRESETS[0];
        this.onSelectPreset(preset, this.selectedCount);
      });
    });

    const presetCards = this.container.querySelectorAll('.preset-card');
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-preset-id');
        const preset = PRESETS.find(p => p.id === id);
        if (preset) {
          this.currentPresetId = preset.id;
          presetCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          this.onSelectPreset(preset, this.selectedCount);
        }
      });
    });
  }
}
