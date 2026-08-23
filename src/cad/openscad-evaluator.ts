import { ManifoldCADEngine, CADMeshResult } from './manifold-engine.js';

export interface OpenSCADParam {
  name: string;
  type: 'number' | 'boolean' | 'string';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export class OpenSCADEvaluator {
  private engine: ManifoldCADEngine;

  constructor(engine: ManifoldCADEngine) {
    this.engine = engine;
  }

  // Parse OpenSCAD / Parametric JS CAD script and execute CSG tree
  public async evaluateScript(script: string, customParams: Record<string, any> = {}): Promise<CADMeshResult> {
    const M = this.engine;
    
    // Helper context exposed to script
    const ctx = {
      cube: (size: [number, number, number] | number, center = true) => M.cube(size, center),
      cylinder: (h: number, r1: number, r2: number = r1, fn = 32, center = true) => M.cylinder(h, r1, r2, fn, center),
      sphere: (r: number, fn = 32) => M.sphere(r, fn),
      union: (...solids: any[]) => {
        if (solids.length === 0) return M.cube([0.01, 0.01, 0.01]);
        let res = solids[0];
        for (let i = 1; i < solids.length; i++) {
          res = M.union(res, solids[i]);
        }
        return res;
      },
      difference: (base: any, ...subtracts: any[]) => {
        let res = base;
        for (const sub of subtracts) {
          res = M.difference(res, sub);
        }
        return res;
      },
      intersection: (...solids: any[]) => {
        if (solids.length === 0) return M.cube([0.01, 0.01, 0.01]);
        let res = solids[0];
        for (let i = 1; i < solids.length; i++) {
          res = M.intersection(res, solids[i]);
        }
        return res;
      },
      translate: (solid: any, offset: [number, number, number]) => {
        return solid.translate(offset);
      },
      rotate: (solid: any, eulerDeg: [number, number, number]) => {
        return solid.rotate(eulerDeg);
      },
      scale: (solid: any, factor: [number, number, number] | number) => {
        const s: [number, number, number] = typeof factor === 'number' ? [factor, factor, factor] : factor;
        return solid.scale(s);
      },
      params: customParams
    };

    // Preprocessing OpenSCAD syntax to JS DSL if user typed raw OpenSCAD
    const processedCode = this.transpileOpenSCAD(script);

    const fn = new Function('ctx', `
      with (ctx) {
        ${processedCode}
      }
    `);

    const resultSolid = fn(ctx);
    if (!resultSolid || typeof resultSolid.volume !== 'function') {
      throw new Error('Script must return a valid Manifold CSG solid (e.g. return difference(body, holes);)');
    }

    return this.engine.toThreeMesh(resultSolid);
  }

  // Lightweight OpenSCAD transpile layer
  private transpileOpenSCAD(code: string): string {
    let js = code;

    // Convert variables $fn -> fn
    js = js.replace(/\$fn/g, 'fn');

    // If script contains `module main()` or direct OpenSCAD syntax, wrap into function return
    if (!js.includes('return ') && (js.includes('difference(') || js.includes('union(') || js.includes('cube(') || js.includes('cylinder('))) {
      // Find top-level expression
      js = `return (() => {
${js}
})();`;
    }

    return js;
  }
}
