export type ToolchainState = 'idle' | 'ready' | 'loading' | 'unavailable';

export interface ToolchainEngine {
  id: string;
  name: string;
  version: string;
  role: string;
  state: ToolchainState;
}

export class ToolchainRegistry {
  private static engines = new Map<string, ToolchainEngine>([
    ['webgpu', { id: 'webgpu', name: 'WebGPU', version: 'native', role: 'N-body compute and rendering', state: 'loading' }],
    ['three', { id: 'three', name: 'Three.js', version: '0.185', role: 'CAD and robotics visualization', state: 'ready' }],
    ['manifold', { id: 'manifold', name: 'Manifold', version: '3.5', role: 'Watertight CSG and STL mesh generation', state: 'loading' }],
    ['openscad', { id: 'openscad', name: 'OpenSCAD', version: '2026.06.08 WASM', role: 'Full OpenSCAD language execution and STL generation', state: 'idle' }],
    ['occt', { id: 'occt', name: 'OpenCascade', version: '7.9.3', role: 'STEP, IGES, and BREP topology import', state: 'idle' }],
    ['jsbsim', { id: 'jsbsim', name: 'JSBSim', version: '1.2.4 WASM', role: 'Independent nonlinear flight-dynamics validation', state: 'idle' }],
    ['openrocket', { id: 'openrocket', name: 'OpenRocket Core', version: '24.12 JVM', role: 'Official six-degree flight simulation and rocket component model', state: 'idle' }],
    ['rapier', { id: 'rapier', name: 'Rapier', version: '0.20', role: 'Multibody dynamics and collisions', state: 'idle' }],
    ['barrowman', { id: 'barrowman', name: 'Barrowman + RK4', version: 'native', role: 'Rocket stability and ascent trajectory', state: 'ready' }],
    ['lbm', { id: 'lbm', name: 'D2Q9 LBM', version: 'native', role: 'Pressure-flow field solver', state: 'ready' }]
  ]);
  private static listeners = new Set<() => void>();

  static setState(id: string, state: ToolchainState): void {
    const engine = this.engines.get(id);
    if (!engine || engine.state === state) return;
    engine.state = state;
    this.listeners.forEach(listener => listener());
  }

  static list(): ToolchainEngine[] { return [...this.engines.values()]; }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
