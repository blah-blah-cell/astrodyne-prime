import { AstraAICopilot } from '../ai/ai-copilot.js';
import { PROVIDER_MODELS } from '../ai/byok-manager.js';
import { AIManeuverAction } from '../physics/types.js';

export class AstraDrawer {
  private container: HTMLElement;
  private copilot: AstraAICopilot;
  private onExecuteManeuver: (action: AIManeuverAction) => void;

  public isOpen = false;

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
      <aside id="astra-drawer" class="astra-drawer glass-drawer hidden">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <span class="drawer-logo">A</span>
            <div>
              <div class="drawer-title">ENGINEERING ASSISTANT</div>
              <div class="drawer-subtitle">Analysis and workflow tools</div>
            </div>
          </div>
          <div class="drawer-actions">
            <button id="btn-ai-settings" class="btn-icon-header" title="AI Provider & Model Settings">SETTINGS</button>
            <button id="btn-close-drawer" class="btn-icon-header" title="Close Drawer">CLOSE</button>
          </div>
        </div>

        <!-- Quick Action Prompt Chips -->
        <div class="quick-chips-wrapper">
          <button class="quick-chip" data-prompt="Plan a Hohmann transfer burn from Earth to Mars.">Hohmann to Mars</button>
          <button class="quick-chip" data-prompt="Calculate delta-v required to circularize orbit at apoapsis.">Circularize Orbit</button>
          <button class="quick-chip" data-prompt="Analyze my current orbital parameters and dynamic pressure stability.">Telemetry Check</button>
          <button class="quick-chip" data-prompt="Set SAS flight computer to orbital Prograde vector.">Align Prograde</button>
        </div>

        <!-- Chat Conversation Messages Container -->
        <div class="drawer-chat-stream" id="astra-chat-stream"></div>

        <!-- Chat Input Bar -->
        <div class="drawer-input-bar">
          <input type="text" id="astra-input" placeholder="Plan a maneuver or analyze telemetry..." autocomplete="off">
          <button id="btn-send-ai" class="btn-send-msg" title="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </aside>

      <!-- Luxury Glassmorphic BYOK Settings Modal -->
      <div id="ai-settings-modal" class="ai-modal-overlay" style="display: none;">
        <div class="ai-modal-card glass-panel">
          <div class="modal-header">
            <div class="modal-title-group">
              <div class="modal-title-icon">AI</div>
              <div>
                <div class="modal-title">AI Engine & Model Configuration</div>
                <div class="modal-subtitle">Configure frontier reasoning LLMs & Bring-Your-Own-Key</div>
              </div>
            </div>
            <button id="btn-close-settings" class="btn-close-modal">CLOSE</button>
          </div>

          <div class="modal-body">
            <!-- Provider Segmented Tabs -->
            <div class="form-group">
              <label class="form-label">Select AI Provider</label>
              <div class="provider-pill-grid">
                <button type="button" class="provider-pill active" data-provider="gemini">
                  <span class="provider-icon">G</span>
                  <span class="provider-name">Google Gemini</span>
                </button>
                <button type="button" class="provider-pill" data-provider="openai">
                  <span class="provider-icon">O</span>
                  <span class="provider-name">OpenAI</span>
                </button>
                <button type="button" class="provider-pill" data-provider="anthropic">
                  <span class="provider-icon">A</span>
                  <span class="provider-name">Anthropic</span>
                </button>
                <button type="button" class="provider-pill" data-provider="deepseek">
                  <span class="provider-icon">D</span>
                  <span class="provider-name">DeepSeek</span>
                </button>
                <button type="button" class="provider-pill" data-provider="xai">
                  <span class="provider-icon">G</span>
                  <span class="provider-name">xAI Grok</span>
                </button>
                <button type="button" class="provider-pill" data-provider="ollama">
                  <span class="provider-icon">L</span>
                  <span class="provider-name">Local Ollama</span>
                </button>
              </div>
            </div>

            <!-- Model Selection Dropdown with Badges -->
            <div class="form-group">
              <label class="form-label">Model Selection</label>
              <select id="select-ai-model" class="form-select"></select>
              <div id="model-desc-hint" class="model-desc-hint"></div>
            </div>

            <!-- API Key Input with Visibility Toggle -->
            <div class="form-group" id="group-api-key">
              <div class="label-row-with-link">
                <label class="form-label">API Key</label>
                <a id="link-get-api-key" href="https://aistudio.google.com/app/apikey" target="_blank" class="link-get-key">Get Key ↗</a>
              </div>
              <div class="key-input-wrapper">
                <input type="password" id="input-ai-key" class="form-input" placeholder="Paste your API key here...">
                <button type="button" id="btn-toggle-key-vis" class="btn-toggle-vis" title="Show/Hide Key">SHOW</button>
              </div>
              <div class="form-hint">
                <span>Stored in local browser storage and never sent to our servers.</span>
              </div>
            </div>

            <!-- Local Endpoint Base URL (for Ollama) -->
            <div class="form-group" id="group-base-url" style="display: none;">
              <label class="form-label">Ollama / Custom API Base URL</label>
              <input type="text" id="input-ai-url" class="form-input" placeholder="http://localhost:11434">
            </div>

            <!-- Temperature Slider -->
            <div class="form-group">
              <div class="label-row-with-link">
                <label class="form-label">Temperature: <span id="val-ai-temp" class="badge-value">0.30</span></label>
                <span class="temp-role-hint" id="temp-role-hint">Deterministic Physics</span>
              </div>
              <input type="range" id="range-ai-temp" min="0.0" max="1.0" step="0.05" value="0.30" class="form-range">
            </div>

            <!-- Live Test Status Badge -->
            <div id="test-key-status" class="test-key-result" style="display: none;"></div>
          </div>

          <div class="modal-footer">
            <button id="btn-test-ai-key" class="btn-modal-secondary">Test Connection</button>
            <button id="btn-save-ai-settings" class="btn-modal-primary">Save Configuration</button>
          </div>
        </div>
      </div>
    `;

    this.drawerEl = this.container.querySelector('#astra-drawer')!;
    this.chatMessagesEl = this.container.querySelector('#astra-chat-stream')!;
    this.inputEl = this.container.querySelector('#astra-input') as HTMLInputElement;
    this.settingsModalEl = this.container.querySelector('#ai-settings-modal')!;

    this.attachEvents();
    this.populateSettingsForm();
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
    chips.forEach((c) => {
      c.addEventListener('click', () => {
        const prompt = c.getAttribute('data-prompt');
        if (prompt) {
          this.inputEl.value = prompt;
          this.handleSendMessage();
        }
      });
    });

    // Open Settings Modal
    const btnSettings = this.container.querySelector('#btn-ai-settings');
    btnSettings?.addEventListener('click', () => this.openSettingsModal());

    // Close Settings Modal
    const btnCloseSettings = this.container.querySelector('#btn-close-settings');
    btnCloseSettings?.addEventListener('click', () => this.closeSettingsModal());

    // Provider Pills
    const providerPills = this.container.querySelectorAll('.provider-pill');
    providerPills.forEach((p) => {
      p.addEventListener('click', () => {
        providerPills.forEach((x) => x.classList.remove('active'));
        p.classList.add('active');
        const provider = p.getAttribute('data-provider') || 'gemini';
        this.updateModelOptionsForProvider(provider);
      });
    });

    // Model Selector Change
    const modelSelect = this.container.querySelector('#select-ai-model') as HTMLSelectElement;
    modelSelect?.addEventListener('change', () => {
      this.updateModelDescription(modelSelect.value);
    });

    // Toggle API Key Visibility
    const btnToggleVis = this.container.querySelector('#btn-toggle-key-vis');
    const inputKey = this.container.querySelector('#input-ai-key') as HTMLInputElement;
    btnToggleVis?.addEventListener('click', () => {
      if (inputKey.type === 'password') {
        inputKey.type = 'text';
        btnToggleVis.textContent = 'HIDE';
      } else {
        inputKey.type = 'password';
        btnToggleVis.textContent = 'SHOW';
      }
    });

    // Temperature Slider
    const tempRange = this.container.querySelector('#range-ai-temp') as HTMLInputElement;
    const tempVal = this.container.querySelector('#val-ai-temp');
    const tempHint = this.container.querySelector('#temp-role-hint');
    tempRange?.addEventListener('input', () => {
      const v = parseFloat(tempRange.value);
      if (tempVal) tempVal.textContent = v.toFixed(2);
      if (tempHint) {
        tempHint.textContent = v <= 0.2 ? 'Deterministic Physics' : v <= 0.5 ? 'Balanced Flight Plan' : 'Creative Exploration';
      }
    });

    // Test Connection
    const btnTest = this.container.querySelector('#btn-test-ai-key');
    const statusDiv = this.container.querySelector('#test-key-status') as HTMLElement;
    btnTest?.addEventListener('click', async () => {
      this.saveCurrentFormToManager();
      btnTest.textContent = 'Testing...';
      btnTest.setAttribute('disabled', 'true');
      statusDiv.style.display = 'block';
      statusDiv.className = 'test-key-result testing';
      statusDiv.textContent = 'Pinging model endpoint...';

      const res = await this.copilot.byok.testConnection();
      btnTest.removeAttribute('disabled');
      btnTest.textContent = 'Test Connection';

      if (res.success) {
        statusDiv.className = 'test-key-result success';
        statusDiv.innerHTML = `CONNECTED · ${res.message} <span class="latency-badge">${res.latencyMs} ms</span>`;
      } else {
        statusDiv.className = 'test-key-result error';
        statusDiv.textContent = `ERROR · ${res.message}`;
      }
    });

    // Save Settings
    const btnSave = this.container.querySelector('#btn-save-ai-settings');
    btnSave?.addEventListener('click', () => {
      this.saveCurrentFormToManager();
      this.closeSettingsModal();
      this.renderMessages();
    });
  }

  private updateModelOptionsForProvider(provider: string, selectedModel?: string): void {
    const modelSelect = this.container.querySelector('#select-ai-model') as HTMLSelectElement;
    const keyGroup = this.container.querySelector('#group-api-key') as HTMLElement;
    const urlGroup = this.container.querySelector('#group-base-url') as HTMLElement;
    const getKeyLink = this.container.querySelector('#link-get-api-key') as HTMLAnchorElement;

    if (!modelSelect) return;
    modelSelect.innerHTML = '';

    const models = PROVIDER_MODELS[provider] || [];
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `[${m.badge}] ${m.name}`;
      if (selectedModel && selectedModel === m.id) {
        opt.selected = true;
      }
      modelSelect.appendChild(opt);
    }

    if (provider === 'ollama') {
      keyGroup.style.display = 'none';
      urlGroup.style.display = 'block';
    } else {
      keyGroup.style.display = 'block';
      urlGroup.style.display = 'none';

      if (provider === 'gemini') {
        getKeyLink.href = 'https://aistudio.google.com/app/apikey';
        getKeyLink.textContent = 'Get Gemini Key ↗';
      } else if (provider === 'openai') {
        getKeyLink.href = 'https://platform.openai.com/api-keys';
        getKeyLink.textContent = 'Get OpenAI Key ↗';
      } else if (provider === 'anthropic') {
        getKeyLink.href = 'https://console.anthropic.com/settings/keys';
        getKeyLink.textContent = 'Get Claude Key ↗';
      } else if (provider === 'deepseek') {
        getKeyLink.href = 'https://platform.deepseek.com/api_keys';
        getKeyLink.textContent = 'Get DeepSeek Key ↗';
      } else if (provider === 'xai') {
        getKeyLink.href = 'https://console.x.ai/';
        getKeyLink.textContent = 'Get xAI Key ↗';
      }
    }

    this.updateModelDescription(modelSelect.value);
  }

  private updateModelDescription(modelId: string): void {
    const hint = this.container.querySelector('#model-desc-hint');
    if (!hint) return;

    for (const p in PROVIDER_MODELS) {
      const match = PROVIDER_MODELS[p].find(m => m.id === modelId);
      if (match) {
        hint.textContent = match.description;
        return;
      }
    }
    hint.textContent = '';
  }

  private populateSettingsForm(): void {
    const conf = this.copilot.byok.getConfig();
    const provider = conf.provider || 'gemini';

    const pills = this.container.querySelectorAll('.provider-pill');
    pills.forEach((p) => {
      if (p.getAttribute('data-provider') === provider) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });

    this.updateModelOptionsForProvider(provider, conf.model);

    const inputKey = this.container.querySelector('#input-ai-key') as HTMLInputElement;
    if (inputKey) inputKey.value = conf.apiKey;

    const inputUrl = this.container.querySelector('#input-ai-url') as HTMLInputElement;
    if (inputUrl) inputUrl.value = conf.baseUrl || '';

    const tempRange = this.container.querySelector('#range-ai-temp') as HTMLInputElement;
    const tempVal = this.container.querySelector('#val-ai-temp');
    if (tempRange) tempRange.value = String(conf.temperature ?? 0.3);
    if (tempVal) tempVal.textContent = (conf.temperature ?? 0.3).toFixed(2);
  }

  private saveCurrentFormToManager(): void {
    const activePill = this.container.querySelector('.provider-pill.active');
    const provider = activePill?.getAttribute('data-provider') as any || 'gemini';
    const modelSelect = this.container.querySelector('#select-ai-model') as HTMLSelectElement;
    const inputKey = this.container.querySelector('#input-ai-key') as HTMLInputElement;
    const inputUrl = this.container.querySelector('#input-ai-url') as HTMLInputElement;
    const tempRange = this.container.querySelector('#range-ai-temp') as HTMLInputElement;

    this.copilot.byok.saveConfig({
      provider,
      model: modelSelect ? modelSelect.value : 'gemini-2.5-flash',
      apiKey: inputKey ? inputKey.value.trim() : '',
      baseUrl: inputUrl ? inputUrl.value.trim() : '',
      temperature: tempRange ? parseFloat(tempRange.value) : 0.3
    });
  }

  public openSettingsModal(): void {
    this.populateSettingsForm();
    this.settingsModalEl.style.display = 'flex';
  }

  public closeSettingsModal(): void {
    this.settingsModalEl.style.display = 'none';
    const statusDiv = this.container.querySelector('#test-key-status') as HTMLElement;
    if (statusDiv) statusDiv.style.display = 'none';
  }

  public toggleDrawer(force?: boolean): void {
    this.isOpen = force !== undefined ? force : !this.isOpen;
    if (this.isOpen) {
      this.drawerEl.classList.remove('hidden');
      this.inputEl.focus();
    } else {
      this.drawerEl.classList.add('hidden');
    }
  }

  private async handleSendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.copilot.isThinking) return;

    this.inputEl.value = '';
    this.renderMessages();

    await this.copilot.sendMessage(text);
    this.renderMessages();
  }

  public renderMessages(): void {
    if (!this.chatMessagesEl) return;
    this.chatMessagesEl.innerHTML = '';

    for (const msg of this.copilot.messages) {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-bubble-${msg.role}`;

      const sender = document.createElement('div');
      sender.className = 'chat-sender-tag';
      sender.textContent = msg.role === 'user' ? 'YOU' : 'ASSISTANT';

      const body = document.createElement('div');
      body.className = 'chat-body-text';
      body.innerHTML = this.formatMarkdown(msg.content);

      bubble.appendChild(sender);
      bubble.appendChild(body);

      if (msg.action && (msg.action.action === 'set_maneuver_node' || msg.action.action === 'execute_burn')) {
        const dv = msg.action.prograde || 0;
        const dur = msg.action.duration || 0;
        const actionBtn = document.createElement('button');
        actionBtn.className = 'maneuver-burn-trigger';
        actionBtn.innerHTML = `
          <span class="burn-fire-icon">BURN</span>
          <div class="burn-btn-content">
            <div class="burn-title-main">EXECUTE BURN NODE</div>
            <div class="burn-val-sub">ΔV: ${dv.toFixed(1)} m/s (Burn: ${dur.toFixed(1)}s)</div>
          </div>
        `;
        actionBtn.addEventListener('click', () => {
          if (msg.action) this.onExecuteManeuver(msg.action);
        });
        bubble.appendChild(actionBtn);
      }

      this.chatMessagesEl.appendChild(bubble);
    }

    if (this.copilot.isThinking) {
      const thinkingBubble = document.createElement('div');
      thinkingBubble.className = 'chat-bubble chat-bubble-assistant thinking';
      thinkingBubble.innerHTML = '<span class="thinking-dots">Calculating trajectory vector...</span>';
      this.chatMessagesEl.appendChild(thinkingBubble);
    }

    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }

  private formatMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}
