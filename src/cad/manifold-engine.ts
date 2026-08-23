import initModule from 'manifold-3d';
import * as THREE from 'three';

export interface CADMeshResult {
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  volumeMm3: number;
  surfaceAreaMm2: number;
  numVertices: number;
  numTriangles: number;
  stlData: string;
}

export class ManifoldCADEngine {
  private static instance: ManifoldCADEngine;
  private wasm: any = null;
  private isInitialized = false;

  public static async getInstance(): Promise<ManifoldCADEngine> {
    if (!ManifoldCADEngine.instance) {
      ManifoldCADEngine.instance = new ManifoldCADEngine();
      await ManifoldCADEngine.instance.init();
    }
    return ManifoldCADEngine.instance;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      this.wasm = await initModule();
      this.wasm.setup();
      this.isInitialized = true;
      console.log('[ManifoldCADEngine] Manifold-3D WASM CSG Engine Initialized.');
    } catch (err) {
      console.error('[ManifoldCADEngine] Failed to initialize Manifold-3D WASM:', err);
      throw err;
    }
  }

  public get Manifold() {
    return this.wasm.Manifold;
  }

  // Basic CSG Primitives
  public cube(size: [number, number, number] | number, center = true): any {
    const s: [number, number, number] = typeof size === 'number' ? [size, size, size] : size;
    return this.Manifold.cube(s, center);
  }

  public cylinder(height: number, radiusBottom: number, radiusTop: number = radiusBottom, circularSegments = 32, center = true): any {
    return this.Manifold.cylinder(height, radiusBottom, radiusTop, circularSegments, center);
  }

  public sphere(radius: number, circularSegments = 32): any {
    return this.Manifold.sphere(radius, circularSegments);
  }

  // Boolean Operations
  public union(a: any, b: any): any {
    return this.Manifold.union(a, b);
  }

  public difference(a: any, b: any): any {
    return this.Manifold.difference(a, b);
  }

  public intersection(a: any, b: any): any {
    return this.Manifold.intersection(a, b);
  }

  // Convert Manifold solid to Three.js BufferGeometry & Mesh
  public toThreeMesh(manifoldObj: any, material?: THREE.Material): CADMeshResult {
    const rawMesh = manifoldObj.getMesh();
    const geom = new THREE.BufferGeometry();

    const positions = new Float32Array(rawMesh.vertProperties);
    const indices = new Uint32Array(rawMesh.triVerts);

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    geom.computeBoundingBox();

    const mat = material || new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.2,
      roughness: 0.4,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const volume = manifoldObj.volume();
    const surfaceArea = manifoldObj.surfaceArea ? manifoldObj.surfaceArea() : 0;
    const stlData = this.generateSTL(rawMesh);

    return {
      geometry: geom,
      mesh,
      volumeMm3: volume,
      surfaceAreaMm2: surfaceArea,
      numVertices: rawMesh.numVert,
      numTriangles: rawMesh.numTri,
      stlData
    };
  }

  // Generate ASCII STL for 3D Printing
  public generateSTL(rawMesh: any, solidName = 'OpenSCAD_Model'): string {
    let stl = `solid ${solidName}\n`;
    const verts = rawMesh.vertProperties;
    const tris = rawMesh.triVerts;

    for (let i = 0; i < tris.length; i += 3) {
      const i0 = tris[i] * 3;
      const i1 = tris[i + 1] * 3;
      const i2 = tris[i + 2] * 3;

      const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
      const bx = verts[i1], by = verts[i1 + 1], bz = verts[i1 + 2];
      const cx = verts[i2], cy = verts[i2 + 1], cz = verts[i2 + 2];

      const v1x = bx - ax, v1y = by - ay, v1z = bz - az;
      const v2x = cx - ax, v2y = cy - ay, v2z = cz - az;

      let nx = v1y * v2z - v1z * v2y;
      let ny = v1z * v2x - v1x * v2z;
      let nz = v1x * v2y - v1y * v2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;

      stl += `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${ax.toFixed(6)} ${ay.toFixed(6)} ${az.toFixed(6)}\n`;
      stl += `      vertex ${bx.toFixed(6)} ${by.toFixed(6)} ${bz.toFixed(6)}\n`;
      stl += `      vertex ${cx.toFixed(6)} ${cy.toFixed(6)} ${cz.toFixed(6)}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
    stl += `endsolid ${solidName}\n`;
    return stl;
  }
}
