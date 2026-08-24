import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ToolchainRegistry } from '../engineering/toolchain-registry.js';
import { CADMeshResult } from './manifold-engine.js';

interface WorkerResponse {
  id: number;
  ok: boolean;
  stl?: Uint8Array;
  error?: string;
}

function geometryMetrics(geometry: THREE.BufferGeometry): { volumeMm3: number; surfaceAreaMm2: number; triangles: number } {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = index ? index.count / 3 : position.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let signedVolume = 0;
  let surfaceAreaMm2 = 0;
  for (let triangle = 0; triangle < triangles; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(position as THREE.BufferAttribute, ia);
    b.fromBufferAttribute(position as THREE.BufferAttribute, ib);
    c.fromBufferAttribute(position as THREE.BufferAttribute, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    surfaceAreaMm2 += ab.cross(ac).length() * 0.5;
    signedVolume += a.dot(b.clone().cross(c)) / 6;
  }
  return { volumeMm3: Math.abs(signedVolume), surfaceAreaMm2, triangles };
}

function geometryToASCIISTL(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = index ? index.count / 3 : position.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let output = 'solid OpenSCAD_Model\n';
  for (let triangle = 0; triangle < triangles; triangle++) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3;
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    a.fromBufferAttribute(position as THREE.BufferAttribute, ia);
    b.fromBufferAttribute(position as THREE.BufferAttribute, ib);
    c.fromBufferAttribute(position as THREE.BufferAttribute, ic);
    normal.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    output += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n    outer loop\n`;
    output += `      vertex ${a.x} ${a.y} ${a.z}\n      vertex ${b.x} ${b.y} ${b.z}\n      vertex ${c.x} ${c.y} ${c.z}\n`;
    output += '    endloop\n  endfacet\n';
  }
  return `${output}endsolid OpenSCAD_Model\n`;
}

export class OpenSCADWASMBackend {
  private static worker: Worker | null = null;
  private static nextRequestId = 1;
  private static pending = new Map<number, { resolve: (stl: Uint8Array) => void; reject: (error: Error) => void }>();

  private static getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./openscad-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const request = this.pending.get(event.data.id);
        if (!request) return;
        this.pending.delete(event.data.id);
        if (event.data.ok && event.data.stl) request.resolve(event.data.stl);
        else request.reject(new Error(event.data.error || 'OpenSCAD failed without diagnostics'));
      };
      this.worker.onerror = event => {
        const error = new Error(event.message || 'OpenSCAD worker failed');
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
        ToolchainRegistry.setState('openscad', 'unavailable');
      };
    }
    return this.worker;
  }

  static async evaluate(script: string): Promise<CADMeshResult> {
    if (!script.trim()) throw new Error('OpenSCAD script is empty');
    ToolchainRegistry.setState('openscad', 'loading');
    const id = this.nextRequestId++;
    try {
      const stl = await new Promise<Uint8Array>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.getWorker().postMessage({ id, script });
      });
      const geometry = new STLLoader().parse(stl.buffer as ArrayBuffer);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const metrics = geometryMetrics(geometry);
      if (!metrics.triangles || !Number.isFinite(metrics.volumeMm3) || metrics.volumeMm3 <= 0) {
        throw new Error('OpenSCAD produced an empty or non-solid STL');
      }
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x2d6ea3,
        metalness: 0.1,
        roughness: 0.55,
        side: THREE.DoubleSide
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ToolchainRegistry.setState('openscad', 'ready');
      return {
        geometry,
        mesh,
        volumeMm3: metrics.volumeMm3,
        surfaceAreaMm2: metrics.surfaceAreaMm2,
        numVertices: geometry.getAttribute('position').count,
        numTriangles: metrics.triangles,
        stlData: geometryToASCIISTL(geometry),
        sourceLabel: 'OpenSCAD 2026.06.08 WASM'
      };
    } catch (error) {
      ToolchainRegistry.setState('openscad', 'unavailable');
      throw error;
    }
  }
}
