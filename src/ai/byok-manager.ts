import { AIConfig } from '../physics/types';

const STORAGE_KEY = 'ASTRODYNE_AI_CONFIG_V1';

export class BYOKManager {
  private config: AIConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AIConfig {
    const defaultConf: AIConfig = {
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-2.0-flash',
      baseUrl: '',
      temperature: 0.4
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
      (this.config.apiKey !== '' && this.config.apiKey.length > 8)
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

  public async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.hasValidKey()) {
      return { success: false, message: 'Please enter a valid API key or endpoint URL.' };
    }

    try {
      const testPrompt = 'Respond with "ASTRODYNE_ONLINE" if connected.';
      const res = await this.sendChatRequest([
        { role: 'system', content: 'You are Astrodyne Astrodynamics Copilot.' },
        { role: 'user', content: testPrompt }
      ]);

      if (res) {
        return { success: true, message: `Connected successfully to ${this.config.provider} (${this.config.model})!` };
      } else {
        return { success: false, message: 'Empty response received from AI provider.' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'API connection failed.' };
    }
  }

  public async sendChatRequest(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  ): Promise<string> {
    const { provider, apiKey, model, baseUrl, temperature } = this.config;

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

      const systemMsg = messages.find(m => m.role === 'system');

      const body: any = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: 1024
        }
      };

      if (systemMsg) {
        body.systemInstruction = {
          parts: [{ text: systemMsg.content }]
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini API Error (${response.status})`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (provider === 'openai' || provider === 'ollama') {
      const endpoint = provider === 'ollama' 
        ? `${baseUrl || 'http://localhost:11434'}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (apiKey && provider === 'openai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `${provider.toUpperCase()} API Error (${response.status})`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }

    if (provider === 'anthropic') {
      const endpoint = 'https://api.anthropic.com/v1/messages';
      const systemMsg = messages.find(m => m.role === 'system');
      const userAssistantMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          system: systemMsg?.content,
          messages: userAssistantMessages,
          max_tokens: 1024,
          temperature
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Anthropic API Error (${response.status})`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
    }

    throw new Error(`Unsupported AI Provider: ${provider}`);
  }
}
