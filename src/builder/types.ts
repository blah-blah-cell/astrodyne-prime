import * as THREE from 'three';

export enum SocketType {
  CYLINDRICAL_AXIAL = 'CYLINDRICAL_AXIAL', // Shafts, bearings, motors (rotational torque)
  FLANGE_COUPLER = 'FLANGE_COUPLER',       // Rocket tubes, couplers, decouplers
  HEX_BOLT_MOUNT = 'HEX_BOLT_MOUNT',       // Structural frames, plates, motor mounts
  HINGE_PIVOT = 'HINGE_PIVOT',             // Servos, steering knuckles, control surfaces
  SNAP_GRID = 'SNAP_GRID'                  // Modular building blocks, universal frames
}

export enum SocketGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  NEUTRAL = 'NEUTRAL'
}

export interface AttachmentSocket {
  id: string;
  name: string;
  type: SocketType;
  gender: SocketGender;
  localPosition: [number, number, number];
  localNormal: [number, number, number];
  radius?: number;
  isOccupied?: boolean;
}

export enum PartCategory {
  STRUCTURAL = 'STRUCTURAL',
  MECHANICAL = 'MECHANICAL',
  AEROSPACE = 'AEROSPACE',
  AERODYNAMICS = 'AERODYNAMICS',
  ROBOTICS_MOBILITY = 'ROBOTICS_MOBILITY',
  ELECTRONICS_LOGIC = 'ELECTRONICS_LOGIC'
}

export interface PartDefinition {
  id: string;
  name: string;
  category: PartCategory;
  description: string;
  massKg: number;
  centerOfMass: [number, number, number];
  dimensions: [number, number, number];
  sockets: AttachmentSocket[];
  createMesh: () => THREE.Object3D;
  physicsShape: 'BOX' | 'CYLINDER' | 'SPHERE' | 'CONE';
  properties?: {
    gearTeeth?: number;
    maxTorqueNm?: number;
    thrustN?: number;
    burnTimeSec?: number;
    propellantMassKg?: number;
    dragCoefficientCd?: number;
    jointType?: 'FIXED' | 'REVOLUTE' | 'PRISMATIC' | 'SPHERICAL';
  };
}

export interface PartInstance {
  instanceId: string;
  definitionId: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  attachedSockets: Map<string, { targetPartId: string; targetSocketId: string }>;
  mesh?: THREE.Object3D;
}

export interface PartAssembly {
  name: string;
  version: string;
  parts: Map<string, PartInstance>;
  rootPartId?: string;
  totalMassKg: number;
  centerOfMassWorld: [number, number, number];
}
