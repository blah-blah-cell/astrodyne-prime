import * as THREE from 'three';
import { PartAssembly, PartDefinition, PartInstance } from './types.js';

export class PartGraph {
  public assembly: PartAssembly;
  private definitions: Map<string, PartDefinition> = new Map();

  constructor(name: string = 'Modular Rocket / Rover Assembly') {
    this.assembly = {
      name,
      version: '1.0.0',
      parts: new Map(),
      totalMassKg: 0,
      centerOfMassWorld: [0, 0, 0]
    };
  }

  public registerDefinitions(defs: PartDefinition[]): void {
    for (const d of defs) {
      this.definitions.set(d.id, d);
    }
  }

  public getDefinition(id: string): PartDefinition | undefined {
    return this.definitions.get(id);
  }

  public addPart(instance: PartInstance): void {
    this.assembly.parts.set(instance.instanceId, instance);
    if (!this.assembly.rootPartId) {
      this.assembly.rootPartId = instance.instanceId;
    }
    this.recomputeMassAndCenter();
  }

  public removePart(instanceId: string): void {
    const part = this.assembly.parts.get(instanceId);
    if (!part) return;

    for (const [_, other] of this.assembly.parts.entries()) {
      for (const [sockId, conn] of other.attachedSockets.entries()) {
        if (conn.targetPartId === instanceId) {
          other.attachedSockets.delete(sockId);
        }
      }
    }

    if (part.mesh && part.mesh.parent) {
      part.mesh.parent.remove(part.mesh);
    }

    this.assembly.parts.delete(instanceId);

    if (this.assembly.rootPartId === instanceId) {
      const first = this.assembly.parts.keys().next().value;
      this.assembly.rootPartId = first;
    }

    this.recomputeMassAndCenter();
  }

  public connectSockets(
    partAId: string,
    socketAId: string,
    partBId: string,
    socketBId: string
  ): void {
    const partA = this.assembly.parts.get(partAId);
    const partB = this.assembly.parts.get(partBId);

    if (partA && partB) {
      partA.attachedSockets.set(socketAId, { targetPartId: partBId, targetSocketId: socketBId });
      partB.attachedSockets.set(socketBId, { targetPartId: partAId, targetSocketId: socketAId });
    }
  }

  public recomputeMassAndCenter(): void {
    let totalMass = 0;
    const weightedPos = new THREE.Vector3(0, 0, 0);

    for (const [_, instance] of this.assembly.parts.entries()) {
      const def = this.definitions.get(instance.definitionId);
      if (!def) continue;

      const partMass = def.massKg;
      totalMass += partMass;

      const partPos = new THREE.Vector3(...instance.position);
      const partQuat = new THREE.Quaternion(...instance.rotationQuaternion);
      const localCm = new THREE.Vector3(...def.centerOfMass).applyQuaternion(partQuat);
      const worldCm = partPos.clone().add(localCm);

      weightedPos.add(worldCm.multiplyScalar(partMass));
    }

    this.assembly.totalMassKg = totalMass;
    if (totalMass > 0) {
      weightedPos.divideScalar(totalMass);
      this.assembly.centerOfMassWorld = [weightedPos.x, weightedPos.y, weightedPos.z];
    } else {
      this.assembly.centerOfMassWorld = [0, 0, 0];
    }
  }

  public serialize(): string {
    const partsArray = Array.from(this.assembly.parts.values()).map((p) => ({
      instanceId: p.instanceId,
      definitionId: p.definitionId,
      position: p.position,
      rotationQuaternion: p.rotationQuaternion,
      attachedSockets: Array.from(p.attachedSockets.entries())
    }));

    return JSON.stringify({
      name: this.assembly.name,
      version: this.assembly.version,
      rootPartId: this.assembly.rootPartId,
      parts: partsArray
    }, null, 2);
  }

  public clear(): void {
    for (const [_, p] of this.assembly.parts.entries()) {
      if (p.mesh && p.mesh.parent) {
        p.mesh.parent.remove(p.mesh);
      }
    }
    this.assembly.parts.clear();
    this.assembly.rootPartId = undefined;
    this.recomputeMassAndCenter();
  }
}
