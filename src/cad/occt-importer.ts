import OcctJS, { OcctFormat, OcctJSColor, OcctJSModule, OcctJSNode } from '@tx-code/occt-js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ToolchainRegistry } from '../engineering/toolchain-registry.js';
import { CADMeshResult } from './manifold-engine.js';

const occtWasmUrl = new URL('../../node_modules/@tx-code/occt-js/dist/occt-js.wasm', import.meta.url).href;

export interface OCCTImportResult extends CADMeshResult {
  sourceFormat: OcctFormat;
  sourceUnit: string;
  assemblyParts: number;
  topologyFaces: number;
  topologyEdges: number;
}

export class OpenCascadeImporter {
  private static instance: OpenCascadeImporter;
  private module?: OcctJSModule;
  private initializing?: Promise<void>;

  static async getInstance(): Promise<OpenCascadeImporter> {
    if (!this.instance) this.instance = new OpenCascadeImporter();
    await this.instance.init();
    return this.instance;
  }

  async init(): Promise<void> {
    if (this.module) return;
    if (!this.initializing) {
      ToolchainRegistry.setState('occt', 'loading');
      this.initializing = OcctJS({ locateFile: () => occtWasmUrl })
        .then(module => {
          this.module = module;
          ToolchainRegistry.setState('occt', 'ready');
        })
        .catch(error => {
          this.initializing = undefined;
          ToolchainRegistry.setState('occt', 'unavailable');
          throw error;
        });
    }
    await this.initializing;
  }

  async importFile(file: File, format: OcctFormat): Promise<OCCTImportResult> {
    await this.init();
    const result = this.module!.ReadFile(format, new Uint8Array(await file.arrayBuffer()), {
      rootMode: 'multiple-shapes',
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.001,
      angularDeflection: 0.35,
      readNames: true,
      readColors: true
    });
    if (!result.success || !result.geometries?.length) throw new Error(result.error || 'OpenCascade returned no triangulated geometry');

    const transformed: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const usedMeshes = new Set<number>();
    const appendNode = (node: OcctJSNode, parent: THREE.Matrix4) => {
      const local = node.transform?.length === 16 ? new THREE.Matrix4().fromArray(node.transform) : new THREE.Matrix4();
      const world = parent.clone().multiply(local);
      for (const meshIndex of node.meshes || []) {
        const source = result.geometries?.[meshIndex];
        if (!source) continue;
        usedMeshes.add(meshIndex);
        transformed.push(this.toGeometry(source.positions, source.normals, source.indices).applyMatrix4(world));
        materials.push(this.toMaterial(source.color));
      }
      for (const child of node.children || []) appendNode(child, world);
    };
    for (const root of result.rootNodes || []) appendNode(root, new THREE.Matrix4());
    result.geometries.forEach((geometry, index) => {
      if (!usedMeshes.has(index)) {
        transformed.push(this.toGeometry(geometry.positions, geometry.normals, geometry.indices));
        materials.push(this.toMaterial(geometry.color));
      }
    });

    const geometry = mergeGeometries(transformed, true);
    if (!geometry) throw new Error('OpenCascade meshes could not be merged');
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const metrics = this.calculateMetrics(geometry);

    return {
      geometry,
      mesh,
      volumeMm3: metrics.volume,
      surfaceAreaMm2: metrics.area,
      numVertices: geometry.getAttribute('position').count,
      numTriangles: (geometry.index?.count || 0) / 3,
      stlData: this.generateSTL(geometry, file.name.replace(/[^a-z0-9_-]+/gi, '_')),
      sourceFormat: format,
      sourceUnit: result.sourceUnit || 'millimeter',
      assemblyParts: result.stats?.partCount || result.rootNodes?.length || 1,
      topologyFaces: result.geometries.reduce((sum, item) => sum + item.faces.length, 0),
      topologyEdges: result.geometries.reduce((sum, item) => sum + item.edges.length, 0)
    };
  }

  private toGeometry(positions: Float32Array, normals: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
    if (normals.length) geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3));
    else geometry.computeVertexNormals();
    return geometry;
  }

  private toMaterial(color?: OcctJSColor | null): THREE.MeshStandardMaterial {
    const scale = color && Math.max(color.r, color.g, color.b) > 1 ? 1 / 255 : 1;
    const displayColor = color
      ? new THREE.Color(color.r * scale, color.g * scale, color.b * scale)
      : new THREE.Color(0x9aa8b5);
    return new THREE.MeshStandardMaterial({
      color: displayColor,
      metalness: 0.15,
      roughness: 0.55,
      side: THREE.DoubleSide
    });
  }

  private calculateMetrics(geometry: THREE.BufferGeometry): { volume: number; area: number } {
    const positions = geometry.getAttribute('position');
    const index = geometry.index;
    if (!index) return { volume: 0, area: 0 };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    let signedVolume = 0;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(positions, index.getX(i));
      b.fromBufferAttribute(positions, index.getX(i + 1));
      c.fromBufferAttribute(positions, index.getX(i + 2));
      ab.subVectors(b, a); ac.subVectors(c, a);
      area += ab.cross(ac).length() * 0.5;
      signedVolume += a.dot(b.clone().cross(c)) / 6;
    }
    return { volume: Math.abs(signedVolume), area };
  }

  private generateSTL(geometry: THREE.BufferGeometry, name: string): string {
    const positions = geometry.getAttribute('position');
    const index = geometry.index;
    if (!index) return `solid ${name}\nendsolid ${name}\n`;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    let output = `solid ${name}\n`;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(positions, index.getX(i)); b.fromBufferAttribute(positions, index.getX(i + 1)); c.fromBufferAttribute(positions, index.getX(i + 2));
      normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      output += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n    outer loop\n      vertex ${a.x} ${a.y} ${a.z}\n      vertex ${b.x} ${b.y} ${b.z}\n      vertex ${c.x} ${c.y} ${c.z}\n    endloop\n  endfacet\n`;
    }
    return `${output}endsolid ${name}\n`;
  }
}
