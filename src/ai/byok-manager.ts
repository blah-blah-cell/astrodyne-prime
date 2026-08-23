import { AIConfig } from '../physics/types.js';

const STORAGE_KEY = 'ASTRODYNE_AI_CONFIG_V3';

export interface ModelOption {
  id: string;
  name: string;
  badge: 'FRONTIER' | 'REASONING' | 'FLAGSHIP' | 'FAST' | 'HYBRID THINKING' | 'LOCAL';
  description: string;
}

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  gemini: [
    { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', badge: 'FRONTIER', description: 'Google frontier model for coding, agentic reasoning & real-time telemetry' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', badge: 'FLAGSHIP', description: 'Frontier deep multimodal reasoning & complex astrodynamics proofs' },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', badge: 'FAST', description: 'High-throughput low-latency orbital trajectory solver' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', badge: 'REASONING', description: 'Proven high-precision numerical physics reasoning' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'FAST', description: '1M token context window for full mission logs & telemetry' }
  ],
  openai: [
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', badge: 'FRONTIER', description: 'OpenAI frontier flagship for high-end reasoning, coding & space dynamics' },
    { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', badge: 'FLAGSHIP', description: 'Balanced high intelligence & rapid response flight director' },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', badge: 'FAST', description: 'Ultra-fast cost-efficient real-time telemetry analyzer' },
    { id: 'o4-mini', name: 'o4-mini', badge: 'REASONING', description: 'Next-gen step-by-step mathematical reasoning & physics solver' },
    { id: 'o3-pro', name: 'o3-pro', badge: 'REASONING', description: 'Deep thinking mathematical orbital mechanics derivation' },
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', badge: 'FLAGSHIP', description: 'Proven multimodal flight copilot' }
  ],
  anthropic: [
    { id: 'claude-opus-5', name: 'Claude Opus 5', badge: 'FRONTIER', description: 'Anthropic flagship: thoughtful proactive agentic planning & deep analysis' },
    { id: 'claude-fable-5', name: 'Claude Fable 5', badge: 'REASONING', description: 'Optimized for long-running autonomous missions & trajectory simulations' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', badge: 'FLAGSHIP', description: 'Mid-tier standard balancing speed and advanced astrodynamics precision' },
    { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', badge: 'FAST', description: 'Sub-second real-time maneuver node calculator' }
  ],
  deepseek: [
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4 Pro', badge: 'FRONTIER', description: 'Flagship deep reasoning with native thinking mode for physics proofs' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek-V4 Flash', badge: 'FAST', description: 'Ultra-fast low latency orbital burn calculator' },
    { id: 'deepseek-chat', name: 'DeepSeek-V3.2 (Chat)', badge: 'FLAGSHIP', description: 'Standard general-purpose spaceflight assistant' },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Reasoner)', badge: 'REASONING', description: 'Open-weights Chain-of-Thought mathematical solver' }
  ],
  xai: [
    { id: 'grok-4.6', name: 'Grok 4.6', badge: 'FRONTIER', description: 'xAI frontier flagship: 500K context & deep mathematical physics' },
    { id: 'grok-4.5', name: 'Grok 4.5', badge: 'FLAGSHIP', description: 'High capability coding & autonomous spacecraft guidance' },
    { id: 'grok-4.1-fast', name: 'Grok 4.1 Fast', badge: 'FAST', description: 'High throughput, low latency real-time telemetry processing' }
  ],
  ollama: [
    { id: 'deepseek-r1:14b', name: 'DeepSeek-R1 14B (Local)', badge: 'LOCAL', description: 'Local offline deep reasoning model via Ollama' },
    { id: 'llama3.3:70b', name: 'Llama 3.3 70B (Local)', badge: 'LOCAL', description: 'Local open-weights flagship' },
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
      model: 'gemini-3.7-flash',
      baseUrl: '',
      temperature: 0.3
    };

    try {
      if (typeof localStorage !== 'undefined') {
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
      }
    } catch (e) {
      console.warn('Failed to load AI BYOK config:', e);
    }
    return defaultConf;
  }

  public saveConfig(conf: AIConfig): void {
    this.config = { ...conf };
    try {
      if (typeof localStorage !== 'undefined') {
        const toStore = {
          ...this.config,
          apiKey: this.encodeKey(this.config.apiKey)
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      }
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
      (this.config.apiKey !== '' && this.config.apiKey.length > 5)
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

    // 1. Google Gemini API (Official v1beta Endpoint)
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

    // 2. OpenAI / DeepSeek / xAI API (Standard Chat Completions)
    if (provider === 'openai' || provider === 'deepseek' || (provider as any) === 'xai') {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      if (provider === 'deepseek') {
        endpoint = 'https://api.deepseek.com/chat/completions';
      } else if ((provider as any) === 'xai') {
        endpoint = 'https://api.x.ai/v1/chat/completions';
      }

      const isReasoning = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4') || model.includes('reasoner') || model.includes('v4-pro');

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

    // 3. Anthropic Claude API (Official Messages Endpoint)
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
          max_tokens: 2048
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
