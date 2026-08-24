import * as THREE from 'three';
import { AttachmentSocket, PartDefinition, PartInstance, SocketGender } from './types.js';

export interface WorldSocket {
  socket: AttachmentSocket;
  partInstanceId: string;
  worldPosition: THREE.Vector3;
  worldNormal: THREE.Vector3;
}

export class SocketRegistry {
  public static getWorldSockets(instance: PartInstance, definition: PartDefinition): WorldSocket[] {
    const worldSockets: WorldSocket[] = [];
    const partPos = new THREE.Vector3(...instance.position);
    const partQuat = new THREE.Quaternion(...instance.rotationQuaternion);

    for (const socket of definition.sockets) {
      const localPos = new THREE.Vector3(...socket.localPosition);
      const localNorm = new THREE.Vector3(...socket.localNormal);

      const worldPos = localPos.applyQuaternion(partQuat).add(partPos);
      const worldNorm = localNorm.applyQuaternion(partQuat).normalize();

      worldSockets.push({
        socket: { ...socket, isOccupied: instance.attachedSockets.has(socket.id) },
        partInstanceId: instance.instanceId,
        worldPosition: worldPos,
        worldNormal: worldNorm
      });
    }

    return worldSockets;
  }

  public static isCompatible(s1: AttachmentSocket, s2: AttachmentSocket): boolean {
    if (s1.type !== s2.type) return false;
    if (s1.gender === SocketGender.NEUTRAL && s2.gender === SocketGender.NEUTRAL) return true;
    if (s1.gender === SocketGender.MALE && s2.gender === SocketGender.FEMALE) return true;
    if (s1.gender === SocketGender.FEMALE && s2.gender === SocketGender.MALE) return true;
    return false;
  }

  public static findBestSnapTarget(
    sourceWorldSockets: WorldSocket[],
    allExistingWorldSockets: WorldSocket[],
    maxSnapDistance: number = 0.45
  ): { source: WorldSocket; target: WorldSocket; distance: number } | null {
    let closestMatch: { source: WorldSocket; target: WorldSocket; distance: number } | null = null;
    let minDistance = maxSnapDistance;

    for (const src of sourceWorldSockets) {
      if (src.socket.isOccupied) continue;

      for (const tgt of allExistingWorldSockets) {
        if (src.partInstanceId === tgt.partInstanceId || tgt.socket.isOccupied) continue;
        if (!this.isCompatible(src.socket, tgt.socket)) continue;

        const dist = src.worldPosition.distanceTo(tgt.worldPosition);
        if (dist < minDistance) {
          minDistance = dist;
          closestMatch = { source: src, target: tgt, distance: dist };
        }
      }
    }

    return closestMatch;
  }

  public static computeSnapTransform(
    sourceSocketLocal: AttachmentSocket,
    targetWorldSocket: WorldSocket
  ): { position: [number, number, number]; rotationQuaternion: [number, number, number, number] } {
    return this.computeMateTransform(sourceSocketLocal, targetWorldSocket, 0, 0);
  }

  public static computeMateTransform(
    sourceSocketLocal: AttachmentSocket,
    targetWorldSocket: WorldSocket,
    offsetM: number = 0,
    twistDegrees: number = 0
  ): { position: [number, number, number]; rotationQuaternion: [number, number, number, number] } {
    const targetNorm = targetWorldSocket.worldNormal.clone();
    const desiredSourceNorm = targetNorm.clone().negate();
    const localSourceNorm = new THREE.Vector3(...sourceSocketLocal.localNormal).normalize();

    const rotQuat = new THREE.Quaternion().setFromUnitVectors(localSourceNorm, desiredSourceNorm);
    if (twistDegrees) {
      const twist = new THREE.Quaternion().setFromAxisAngle(targetNorm, THREE.MathUtils.degToRad(twistDegrees));
      rotQuat.premultiply(twist).normalize();
    }
    const localSourcePosRotated = new THREE.Vector3(...sourceSocketLocal.localPosition).applyQuaternion(rotQuat);
    const requiredWorldPos = targetWorldSocket.worldPosition.clone().addScaledVector(targetNorm, offsetM).sub(localSourcePosRotated);

    return {
      position: [requiredWorldPos.x, requiredWorldPos.y, requiredWorldPos.z],
      rotationQuaternion: [rotQuat.x, rotQuat.y, rotQuat.z, rotQuat.w]
    };
  }
}
