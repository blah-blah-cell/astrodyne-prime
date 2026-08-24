import * as THREE from 'three';

export interface MeshAerodynamicResult {
  frontalAreaMm2: number;
  sideAreaMm2: number;
  referenceAreaM2: number;
  lengthMm: number;
  finenessRatio: number;
  estimatedCd: number;
  sampleCount: number;
}

/** Derives reference area and a transparent engineering Cd estimate from a CAD mesh. */
export class CADAerodynamicAnalyzer {
  public static analyze(geometry: THREE.BufferGeometry): MeshAerodynamicResult {
    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) throw new Error('CAD mesh requires triangle positions');
    const index = geometry.getIndex();
    let areaX = 0;
    let areaY = 0;
    let areaZ = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let tri = 0; tri < triangleCount; tri++) {
      const read = (offset: number, target: THREE.Vector3) => {
        const vertex = index ? index.getX(tri * 3 + offset) : tri * 3 + offset;
        target.fromBufferAttribute(position, vertex);
      };
      read(0, a); read(1, b); read(2, c);
      cross.crossVectors(b.sub(a), c.sub(a)).multiplyScalar(0.5);
      // Half the absolute projected surface sum avoids counting front and back twice.
      areaX += Math.abs(cross.x) * 0.5;
      areaY += Math.abs(cross.y) * 0.5;
      areaZ += Math.abs(cross.z) * 0.5;
    }
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox?.getSize(size);
    const lengthMm = Math.max(size.x, size.y, size.z, 1e-6);
    const frontalAreaMm2 = Math.min(areaX, areaY, areaZ);
    const sideAreaMm2 = Math.max(areaX, areaY, areaZ);
    const equivalentDiameter = 2 * Math.sqrt(Math.max(frontalAreaMm2, 1e-6) / Math.PI);
    const finenessRatio = lengthMm / Math.max(equivalentDiameter, 1e-6);
    const bluffness = Math.min(1, frontalAreaMm2 / Math.max(sideAreaMm2, 1e-6));
    const estimatedCd = Math.max(0.08, Math.min(1.35, 0.08 + 0.72 * bluffness + 0.12 / Math.max(finenessRatio, 0.25)));
    return {
      frontalAreaMm2,
      sideAreaMm2,
      referenceAreaM2: frontalAreaMm2 / 1_000_000,
      lengthMm,
      finenessRatio,
      estimatedCd,
      sampleCount: triangleCount
    };
  }
}
