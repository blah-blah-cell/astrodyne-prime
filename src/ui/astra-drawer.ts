import { AstraAICopilot } from '../ai/ai-copilot';
import { AIManeuverAction } from '../physics/types';

export class AstraDrawer {
  private container: HTMLElement;
  private copilot: AstraAICopilot;
  private onExecuteManeuver: (action: AIManeuverAction) => void;

  public isOpen = false;
  private isSettingsOpen = false;

  private chatMessagesEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private drawerEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;

  constructor(
    container: HTMLElement,
    copilot: AstraAICopilot,
    onExecuteManeuver: (action: AIManeuverAction) => void
  ) {
    this.container = container;
    this.copilot = copilot;
    this.onExecuteManeuver = onExecuteManeuver;

    this.buildDOM();
    this.renderMessages();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- ASTRA AI Copilot Drawer -->
      <aside id="astra-drawer" class="astra-drawer glass-drawer">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <span class="drawer-logo">✨</span>
            <div>
              <div class="drawer-title">ASTRA AI COPILOT</div>
              <div class="drawer-subtitle">Autonomous Astrodynamics Assistant</div>
            </div>
          </div>
          <div class="drawer-actions">
            <button id="btn-ai-settings" class="btn-icon-header" title="BYOK API Settings">⚙️</button>
            <button id="btn-close-drawer" class="btn-icon-header" title="Close Drawer">✕</button>
          </div>
        </div>

        <!-- Quick Action Prompt Chips -->
        <div class="quick-chips-wrapper">
          <button class="quick-chip" data-prompt="Plan a Hohmann transfer burn from Earth to Mars.">🚀 Hohmann to Mars</button>
          <button class="quick-chip" data-prompt="Calculate delta-v required to circularize orbit at apoapsis.">⭕ Circularize Orbit</button>
          <button class="quick-chip" data-prompt="Analyze my current orbital parameters and dynamic pressure stability.">📊 Telemetry Check</button>
          <button class="quick-chip" data-prompt="Set SAS flight computer to orbital Prograde vector.">🟢 Align Prograde</button>
        </div>

        <!-- Chat Conversation Messages Container -->
        <div class="drawer-chat-stream" id="astra-chat-stream"></div>

        <!-- Chat Input Bar -->
        <div class="drawer-input-bar">
          <input type="text" id="astra-input" placeholder="Ask ASTRA AI to plan a burn or analyze telemetry..." autocomplete="off">
          <button id="btn-send-ai" class="btn-send-msg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </aside>

      <!-- BYOK Settings Modal -->
      <div id="ai-settings-modal" class="ai-modal-overlay" style="display: none;">
        <div class="ai-modal-card glass-panel">
          <div class="modal-header">
            <div class="modal-title">AI Engine & BYOK Configuration</div>
            <button id="btn-close-settings" class="btn-close-modal">✕</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">AI Provider</label>
              <select id="select-ai-provider" class="form-select">
                <option value="gemini">Google Gemini API (Recommended)</option>
                <option value="openai">OpenAI API</option>
                <option value="anthropic">Anthropic Claude API</option>
                <option value="ollama">Local Ollama / Custom Endpoint</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Model Selection</label>
              <select id="select-ai-model" class="form-select">
                <option value="gemini-2.0-flash">gemini-2.0-flash (Fast & Accurate)</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              </select>
            </div>

            <div class="form-group" id="group-api-key">
              <label class="form-label">API Key</label>
              <div class="key-input-wrapper">
                <input type="password" id="input-ai-key" class="form-input" placeholder="Paste your API key here...">
                <button type="button" id="btn-toggle-key-vis" class="btn-toggle-vis">👁️</button>
              </div>
              <div class="form-hint">Stored locally in encrypted browser localStorage. Never sent to third parties.</div>
            </div>

            <div class="form-group" id="group-base-url" style="display: none;">
              <label class="form-label">Base URL (Ollama / Local Proxy)</label>
              <input type="text" id="input-ai-url" class="form-input" placeholder="http://localhost:11434">
            </div>

            <div class="form-group">
              <label class="form-label">Temperature: <span id="val-ai-temp">0.4</span></label>
              <input type="range" id="range-ai-temp" min="0.0" max="1.0" step="0.05" value="0.4">
            </div>

            <div id="test-key-status" class="test-key-result" style="display: none;"></div>
          </div>

          <div class="modal-footer">
            <button id="btn-test-ai-key" class="btn-secondary">Test Connection</button>
            <button id="btn-save-ai-settings" class="btn-primary">Save Configuration</button>
          </div>
        </div>
      </div>
    `;

    this.drawerEl = this.container.querySelector('#astra-drawer')!;
    this.chatMessagesEl = this.container.querySelector('#astra-chat-stream')!;
    this.inputEl = this.container.querySelector('#astra-input') as HTMLInputElement;
    this.settingsModalEl = this.container.querySelector('#ai-settings-modal')!;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Close Drawer
    const btnClose = this.container.querySelector('#btn-close-drawer');
    btnClose?.addEventListener('click', () => this.toggleDrawer(false));

    // Send Message
    const btnSend = this.container.querySelector('#btn-send-ai');
    btnSend?.addEventListener('click', () => this.handleSendMessage());

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSendMessage();
      }
    });

    // Quick Chips
    const chips = this.container.querySelectorAll('.quick-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          this.inputEl.value = prompt;
          this.handleSendMessage();
        }
      });
    });

    // Settings Modal Open/Close
    const btnSettings = this.container.querySelector('#btn-ai-settings');
    btnSettings?.addEventListener('click', () => this.toggleSettings(true));

    const btnCloseSettings = this.container.querySelector('#btn-close-settings');
    btnCloseSettings?.addEventListener('click', () => this.toggleSettings(false));

    // Provider Change
    const selectProvider = this.container.querySelector('#select-ai-provider') as HTMLSelectElement;
    const selectModel = this.container.querySelector('#select-ai-model') as HTMLSelectElement;
    const groupKey = this.container.querySelector('#group-api-key') as HTMLElement;
    const groupUrl = this.container.querySelector('#group-base-url') as HTMLElement;

    selectProvider.addEventListener('change', () => {
      const p = selectProvider.value;
      if (p === 'gemini') {
        selectModel.innerHTML = `
          <option value="gemini-2.0-flash">gemini-2.0-flash (Fast & Accurate)</option>
          <option value="gemini-1.5-pro">gemini-1.5-pro</option>
          <option value="gemini-1.5-flash">gemini-1.5-flash</option>
        `;
        groupKey.style.display = 'block';
        groupUrl.style.display = 'none';
      } else if (p === 'openai') {
        selectModel.innerHTML = `
          <option value="gpt-4o">gpt-4o (Omni State-of-the-Art)</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="o3-mini">o3-mini (Advanced Reasoning)</option>
        `;
        groupKey.style.display = 'block';
        groupUrl.style.display = 'none';
      } else if (p === 'anthropic') {
        selectModel.innerHTML = `
          <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet (High Intelligence)</option>
          <option value="claude-3-5-haiku-20241022">claude-3-5-haiku (Lightning Speed)</option>
        `;
        groupKey.style.display = 'block';
        groupUrl.style.display = 'none';
      } else if (p === 'ollama') {
        selectModel.innerHTML = `
          <option value="llama3.2">llama3.2</option>
          <option value="mistral">mistral</option>
          <option value="deepseek-r1">deepseek-r1</option>
        `;
        groupKey.style.display = 'none';
        groupUrl.style.display = 'block';
      }
    });

    // Toggle Key Visibility
    const btnToggleVis = this.container.querySelector('#btn-toggle-key-vis');
    const inputKey = this.container.querySelector('#input-ai-key') as HTMLInputElement;
    btnToggleVis?.addEventListener('click', () => {
      inputKey.type = inputKey.type === 'password' ? 'text' : 'password';
    });

    // Temperature Slider
    const rangeTemp = this.container.querySelector('#range-ai-temp') as HTMLInputElement;
    const valTemp = this.container.querySelector('#val-ai-temp') as HTMLElement;
    rangeTemp?.addEventListener('input', () => {
      valTemp.textContent = parseFloat(rangeTemp.value).toFixed(2);
    });

    // Test Connection
    const btnTest = this.container.querySelector('#btn-test-ai-key');
    const testStatus = this.container.querySelector('#test-key-status') as HTMLElement;
    btnTest?.addEventListener('click', async () => {
      testStatus.style.display = 'block';
      testStatus.className = 'test-key-result text-amber';
      testStatus.textContent = 'Testing connection to AI provider...';

      this.copilot.byok.saveConfig({
        provider: selectProvider.value as any,
        model: selectModel.value,
        apiKey: inputKey.value.trim(),
        baseUrl: (this.container.querySelector('#input-ai-url') as HTMLInputElement).value.trim(),
        temperature: parseFloat(rangeTemp.value)
      });

      const res = await this.copilot.byok.testConnection();
      testStatus.className = res.success ? 'test-key-result text-emerald' : 'test-key-result text-red';
      testStatus.textContent = res.message;
    });

    // Save Settings
    const btnSave = this.container.querySelector('#btn-save-ai-settings');
    btnSave?.addEventListener('click', () => {
      this.copilot.byok.saveConfig({
        provider: selectProvider.value as any,
        model: selectModel.value,
        apiKey: inputKey.value.trim(),
        baseUrl: (this.container.querySelector('#input-ai-url') as HTMLInputElement).value.trim(),
        temperature: parseFloat(rangeTemp.value)
      });
      this.toggleSettings(false);
    });
  }

  public toggleDrawer(open?: boolean): void {
    this.isOpen = open !== undefined ? open : !this.isOpen;
    if (this.isOpen) {
      this.drawerEl.classList.add('open');
      this.inputEl.focus();
    } else {
      this.drawerEl.classList.remove('open');
    }
  }

  public toggleSettings(open?: boolean): void {
    this.isSettingsOpen = open !== undefined ? open : !this.isSettingsOpen;
    this.settingsModalEl.style.display = this.isSettingsOpen ? 'flex' : 'none';

    if (this.isSettingsOpen) {
      const conf = this.copilot.byok.getConfig();
      const selectProvider = this.container.querySelector('#select-ai-provider') as HTMLSelectElement;
      const selectModel = this.container.querySelector('#select-ai-model') as HTMLSelectElement;
      const inputKey = this.container.querySelector('#input-ai-key') as HTMLInputElement;
      const inputUrl = this.container.querySelector('#input-ai-url') as HTMLInputElement;
      const rangeTemp = this.container.querySelector('#range-ai-temp') as HTMLInputElement;
      const valTemp = this.container.querySelector('#val-ai-temp') as HTMLElement;

      selectProvider.value = conf.provider;
      selectProvider.dispatchEvent(new Event('change'));
      selectModel.value = conf.model;
      inputKey.value = conf.apiKey;
      inputUrl.value = conf.baseUrl || '';
      rangeTemp.value = String(conf.temperature);
      valTemp.textContent = conf.temperature.toFixed(2);
    }
  }

  private async handleSendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.copilot.isThinking) return;

    this.inputEl.value = '';
    this.renderMessages();
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;

    await this.copilot.sendMessage(text);
    this.renderMessages();
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }

  private formatMarkdown(content: string): string {
    let html = content
      .replace(/### (.*?)\n/g, '<div class="md-h3">$1</div>')
      .replace(/## (.*?)\n/g, '<div class="md-h2">$1</div>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/```json\s*([\s\S]*?)\s*```/g, '<pre class="md-code"><code>$1</code></pre>')
      .replace(/\n/g, '<br>');

    return html;
  }

  public renderMessages(): void {
    this.chatMessagesEl.innerHTML = this.copilot.messages.map(msg => `
      <div class="chat-bubble-row ${msg.role === 'user' ? 'user-msg' : 'assistant-msg'}">
        <div class="chat-avatar">${msg.role === 'user' ? '👨‍🚀' : '✨'}</div>
        <div class="chat-bubble-card">
          <div class="chat-sender-name">${msg.role === 'user' ? 'MISSION COMMANDER' : 'ASTRA AI COPILOT'}</div>
          <div class="chat-body-text">${this.formatMarkdown(msg.content)}</div>
          ${msg.action ? this.renderActionCard(msg.action) : ''}
        </div>
      </div>
    `).join('');

    if (this.copilot.isThinking) {
      this.chatMessagesEl.innerHTML += `
        <div class="chat-bubble-row assistant-msg">
          <div class="chat-avatar">✨</div>
          <div class="chat-bubble-card thinking-bubble">
            <span class="pulse-dot"></span> Computing orbital mechanics & trajectory vectors...
          </div>
        </div>
      `;
    }

    const actionBtns = this.chatMessagesEl.querySelectorAll('.btn-execute-action');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const actionIdx = parseInt(btn.getAttribute('data-action-idx') || '0', 10);
        const targetMsg = this.copilot.messages[actionIdx];
        if (targetMsg && targetMsg.action) {
          this.onExecuteManeuver(targetMsg.action);
        }
      });
    });
  }

  private renderActionCard(action: AIManeuverAction): string {
    const actionIdx = this.copilot.messages.findIndex(m => m.action === action);

    if (action.action === 'set_maneuver_node') {
      return `
        <div class="action-card-box">
          <div class="action-card-title">🎯 MANEUVER NODE COMPUTED</div>
          <div class="action-metrics-grid">
            <div>Prograde ΔV: <b>+${action.prograde || 0} m/s</b></div>
            <div>Time to Burn: <b>${action.timeToNode || 0}s</b></div>
          </div>
          <button class="btn-execute-action btn-primary" data-action-idx="${actionIdx}">
            ⚡ EXECUTE BURN NODE
          </button>
        </div>
      `;
    }

    if (action.action === 'set_sas_mode') {
      return `
        <div class="action-card-box">
          <div class="action-card-title">🧭 SAS ATTITUDE GUIDANCE</div>
          <div>Aligning vehicle forward vector to <b>${action.mode?.toUpperCase()}</b>.</div>
          <button class="btn-execute-action btn-primary" data-action-idx="${actionIdx}">
            ORIENT SPACECRAFT
          </button>
        </div>
      `;
    }

    if (action.action === 'stage_separation') {
      return `
        <div class="action-card-box">
          <div class="action-card-title">🚀 STAGE SEPARATION READY</div>
          <button class="btn-execute-action btn-primary" data-action-idx="${actionIdx}">
            SEPARATE STAGE NOW
          </button>
        </div>
      `;
    }

    return '';
  }
}
