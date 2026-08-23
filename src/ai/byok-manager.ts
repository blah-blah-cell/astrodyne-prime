import { AIConfig } from '../physics/types.js';

const STORAGE_KEY = 'ASTRODYNE_AI_CONFIG_V2';

export interface ModelOption {
  id: string;
  name: string;
  badge: 'REASONING' | 'FLAGSHIP' | 'FAST' | 'HYBRID THINKING' | 'LOCAL';
  description: string;
}

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', badge: 'REASONING', description: 'State-of-the-art multimodal reasoning & astrodynamics math' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'FAST', description: 'Ultra-fast 1M token context window & real-time telemetry analysis' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: 'FAST', description: 'Low latency real-time flight copilot & burn planner' },
    { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental', badge: 'FLAGSHIP', description: 'Frontier orbital mechanics & complex celestial choreography' },
    { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking', badge: 'REASONING', description: 'Dedicated Chain-of-Thought mathematical physics solver' }
  ],
  openai: [
    { id: 'o3-mini', name: 'o3-mini (High STEM)', badge: 'REASONING', description: 'Frontier STEM & numerical physics reasoning model' },
    { id: 'o1', name: 'o1 (Full Reasoning)', badge: 'REASONING', description: 'Deep orbital mechanics derivation and multi-body analysis' },
    { id: 'gpt-4.5-preview', name: 'GPT-4.5 Preview', badge: 'FLAGSHIP', description: 'Next-generation massive knowledge flagship' },
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', badge: 'FLAGSHIP', description: 'Flagship multimodal vision & astrodynamics synthesis' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'FAST', description: 'Lightweight & cost-efficient flight director' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', badge: 'HYBRID THINKING', description: 'Hybrid standard / extended thinking for mission planning' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', badge: 'FLAGSHIP', description: 'Industry benchmark for precise astrodynamics code' },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', badge: 'FAST', description: 'Sub-second trajectory vector solver' }
  ],
  deepseek: [
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoner)', badge: 'REASONING', description: 'Open-weights frontier reasoning & mathematical physics proofs' },
    { id: 'deepseek-chat', name: 'DeepSeek-V3', badge: 'FLAGSHIP', description: 'Fast multi-stage vehicle burn & orbit calculations' }
  ],
  ollama: [
    { id: 'deepseek-r1:14b', name: 'DeepSeek-R1 14B (Local)', badge: 'LOCAL', description: 'Local offline deep reasoning model via Ollama' },
    { id: 'llama3.3:70b', name: 'Llama 3.3 70B (Local)', badge: 'LOCAL', description: 'High capability open-weights model' },
    { id: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder 32B (Local)', badge: 'LOCAL', description: 'Local precision math & trajectory generation' }
  ]
};

export class BYOKManager {
  private config: AIConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AIConfig {
    const defaultConf: AIConfig = {
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.5-flash',
      baseUrl: '',
      temperature: 0.3
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          provider: parsed.provider || defaultConf.provider,
          apiKey: parsed.apiKey ? this.decodeKey(parsed.apiKey) : '',
          model: parsed.model || defaultConf.model,
          baseUrl: parsed.baseUrl || '',
          temperature: parsed.temperature ?? defaultConf.temperature
        };
      }
    } catch (e) {
      console.warn('Failed to load AI BYOK config:', e);
    }
    return defaultConf;
  }

  public saveConfig(conf: AIConfig): void {
    this.config = { ...conf };
    try {
      const toStore = {
        ...this.config,
        apiKey: this.encodeKey(this.config.apiKey)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save AI BYOK config:', e);
    }
  }

  public getConfig(): AIConfig {
    return { ...this.config };
  }

  public hasValidKey(): boolean {
    return (
      (this.config.provider === 'ollama' && !!this.config.baseUrl) ||
      (this.config.apiKey !== '' && this.config.apiKey.length > 6)
    );
  }

  private encodeKey(key: string): string {
    if (!key) return '';
    try {
      return btoa(encodeURIComponent(key));
    } catch {
      return key;
    }
  }

  private decodeKey(encoded: string): string {
    if (!encoded) return '';
    try {
      return decodeURIComponent(atob(encoded));
    } catch {
      return encoded;
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    if (!this.hasValidKey()) {
      return { success: false, message: 'Please enter a valid API key or endpoint URL.', latencyMs: 0 };
    }

    const t0 = performance.now();
    try {
      const testPrompt = 'Respond with "ASTRODYNE_NOMINAL" if connected.';
      const res = await this.sendChatRequest([
        { role: 'system', content: 'You are Astrodyne Astrodynamics Copilot.' },
        { role: 'user', content: testPrompt }
      ]);

      const latencyMs = Math.round(performance.now() - t0);

      if (res) {
        return { success: true, message: `Connected to ${this.config.provider.toUpperCase()} (${this.config.model})`, latencyMs };
      } else {
        return { success: false, message: 'Empty response received from AI provider.', latencyMs };
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - t0);
      return { success: false, message: err.message || 'API connection failed.', latencyMs };
    }
  }

  public async sendChatRequest(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
    const { provider, apiKey, model, baseUrl, temperature } = this.config;

    // 1. Google Gemini API
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const systemInstruction = messages.find(m => m.role === 'system')?.content;

      const body: any = {
        contents,
        generationConfig: {
          temperature: temperature ?? 0.3,
          maxOutputTokens: 2048
        }
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error: HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // 2. OpenAI / DeepSeek API
    if (provider === 'openai' || provider === 'deepseek') {
      const isDeepSeek = provider === 'deepseek';
      const endpoint = isDeepSeek 
        ? 'https://api.deepseek.com/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const isReasoning = model.startsWith('o1') || model.startsWith('o3') || model.includes('reasoner');

      const body: any = {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      };

      if (!isReasoning) {
        body.temperature = temperature ?? 0.3;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `${provider.toUpperCase()} API error: HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 3. Anthropic Claude API
    if (provider === 'anthropic') {
      const url = 'https://api.anthropic.com/v1/messages';
      const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
      const userAndAssistantMsgs = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: userAndAssistantMsgs,
          max_tokens: 2048,
          temperature: temperature ?? 0.3
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error: HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.content?.[0]?.text || '';
    }

    // 4. Local Ollama / Custom OpenAI-compatible Endpoint
    if (provider === 'ollama') {
      const base = (baseUrl || '').replace(/\/$/, '') || 'http://localhost:11434';
      const url = `${base}/v1/chat/completions`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperature ?? 0.3
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama connection error: HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }
}
