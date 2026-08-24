import type { RocketAeroConfig } from './barrowman-solver.js';
import { ToolchainRegistry } from '../engineering/toolchain-registry.js';

export interface OpenRocketTrajectoryPoint {
  timeSec: number;
  altitudeM: number;
  velocityMs: number;
}

export interface OpenRocketCoreResult {
  ok: true;
  backend: 'OpenRocket Core';
  version: '24.12';
  apogeeAltitudeM: number;
  timeToApogeeSec: number;
  maxVelocityMs: number;
  flightTimeSec: number;
  samples: number;
  warnings: number;
  trajectory: OpenRocketTrajectoryPoint[];
}

export interface OpenRocketHealth {
  ok: boolean;
  available: boolean;
  backend: string;
  version: string;
}

export class OpenRocketCoreBackend {
  static async health(): Promise<OpenRocketHealth> {
    const response = await fetch('/api/openrocket/health');
    if (!response.ok) throw new Error(`OpenRocket health check failed (${response.status})`);
    return response.json() as Promise<OpenRocketHealth>;
  }

  static async simulate(config: RocketAeroConfig): Promise<OpenRocketCoreResult> {
    ToolchainRegistry.setState('openrocket', 'loading');
    try {
      const response = await fetch('/api/openrocket/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const result = await response.json() as OpenRocketCoreResult | { ok: false; error?: string };
      if (!response.ok || !result.ok) throw new Error('error' in result ? result.error || 'OpenRocket simulation failed' : `OpenRocket simulation failed (${response.status})`);
      ToolchainRegistry.setState('openrocket', 'ready');
      return result;
    } catch (error) {
      ToolchainRegistry.setState('openrocket', 'unavailable');
      throw error;
    }
  }
}
