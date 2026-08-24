import RAPIER from '@dimforge/rapier3d-compat';
import { ToolchainRegistry } from '../engineering/toolchain-registry.js';
import * as THREE from 'three';
import { PartAssembly, PartDefinition, SocketType } from './types.js';

export interface MultibodyJointBinding {
  jointId: string;
  type: 'FIXED' | 'REVOLUTE' | 'PRISMATIC' | 'SPHERICAL';
  joint: RAPIER.ImpulseJoint;
  partAId: string;
  partBId: string;
  isMotorized: boolean;
  targetVelocity: number;
  maxTorque: number;
}

export interface MultibodyBodyBinding {
  instanceId: string;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
  definition: PartDefinition;
}

export class MultibodySolver {
  public isInitialized = false;
  public world!: RAPIER.World;
  public bodyBindings: Map<string, MultibodyBodyBinding> = new Map();
  public jointBindings: Map<string, MultibodyJointBinding> = new Map();
  public isSimulating = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    ToolchainRegistry.setState('rapier', 'loading');
    try {
      await RAPIER.init();
      const gravity = { x: 0.0, y: -9.81, z: 0.0 };
      this.world = new RAPIER.World(gravity);

      // Ground plane collider
      const groundDesc = RAPIER.ColliderDesc.cuboid(50.0, 0.5, 50.0).setTranslation(0.0, -0.5, 0.0);
      this.world.createCollider(groundDesc);

      this.isInitialized = true;
      console.log('[MultibodySolver] Rapier3D WASM Multibody Physics Engine Ready.');
      ToolchainRegistry.setState('rapier', 'ready');
    } catch (error) {
      ToolchainRegistry.setState('rapier', 'unavailable');
      throw error;
    }
  }

  public buildSimulationWorld(
    assembly: PartAssembly,
    getDefinition: (id: string) => PartDefinition | undefined
  ): void {
    if (!this.isInitialized) return;

    this.clear();

    // 1. Create RigidBodies & Colliders for all assembled parts
    for (const [instanceId, instance] of assembly.parts.entries()) {
      const def = getDefinition(instance.definitionId);
      if (!def || !instance.mesh) continue;

      const partPos = new THREE.Vector3(...instance.position);
      const partQuat = new THREE.Quaternion(...instance.rotationQuaternion);

      // Create Dynamic RigidBody
      const rbDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(partPos.x, partPos.y, partPos.z)
        .setRotation({ x: partQuat.x, y: partQuat.y, z: partQuat.z, w: partQuat.w })
        .setAdditionalMass(def.massKg);

      const rigidBody = this.world.createRigidBody(rbDesc);

      // Create Collider matching part geometry
      const [dimX, dimY, dimZ] = def.dimensions;
      let colliderDesc: RAPIER.ColliderDesc;

      if (def.physicsShape === 'HULL' && instance.mesh instanceof THREE.Mesh) {
        const position = instance.mesh.geometry.getAttribute('position');
        const points = new Float32Array(position.count * 3);
        for (let index = 0; index < position.count; index++) {
          points[index * 3] = position.getX(index) * instance.mesh.scale.x;
          points[index * 3 + 1] = position.getY(index) * instance.mesh.scale.y;
          points[index * 3 + 2] = position.getZ(index) * instance.mesh.scale.z;
        }
        colliderDesc = RAPIER.ColliderDesc.convexHull(points) ?? RAPIER.ColliderDesc.cuboid(dimX / 2, dimY / 2, dimZ / 2);
      } else if (def.physicsShape === 'CYLINDER') {
        colliderDesc = RAPIER.ColliderDesc.cylinder(dimY / 2, dimX / 2);
      } else if (def.physicsShape === 'CONE') {
        colliderDesc = RAPIER.ColliderDesc.cone(dimY / 2, dimX / 2);
      } else if (def.physicsShape === 'SPHERE') {
        colliderDesc = RAPIER.ColliderDesc.ball(dimX / 2);
      } else {
        colliderDesc = RAPIER.ColliderDesc.cuboid(dimX / 2, dimY / 2, dimZ / 2);
      }

      colliderDesc.setRestitution(0.25).setFriction(0.8);
      const collider = this.world.createCollider(colliderDesc, rigidBody);

      this.bodyBindings.set(instanceId, {
        instanceId,
        rigidBody,
        collider,
        mesh: instance.mesh,
        definition: def
      });
    }

    // 2. Create Kinematic & Dynamic Joint Constraints from Connected Sockets
    const processedConnections = new Set<string>();

    for (const [instanceId, instance] of assembly.parts.entries()) {
      const sourceBinding = this.bodyBindings.get(instanceId);
      const defA = getDefinition(instance.definitionId);
      if (!sourceBinding || !defA) continue;

      for (const [sockId, conn] of instance.attachedSockets.entries()) {
        const pairKey = [instanceId, sockId, conn.targetPartId, conn.targetSocketId].sort().join('::');
        if (processedConnections.has(pairKey)) continue;
        processedConnections.add(pairKey);

        const targetBinding = this.bodyBindings.get(conn.targetPartId);
        const defB = getDefinition(assembly.parts.get(conn.targetPartId)?.definitionId || '');
        if (!targetBinding || !defB) continue;

        const sockA = defA.sockets.find(s => s.id === sockId);
        const sockB = defB.sockets.find(s => s.id === conn.targetSocketId);
        if (!sockA || !sockB) continue;

        const anchorA = { x: sockA.localPosition[0], y: sockA.localPosition[1], z: sockA.localPosition[2] };
        const anchorB = { x: sockB.localPosition[0], y: sockB.localPosition[1], z: sockB.localPosition[2] };

        // Determine Joint Type based on Socket Type
        if (sockA.type === SocketType.CYLINDRICAL_AXIAL || sockA.type === SocketType.HINGE_PIVOT) {
          const axisA = { x: sockA.localNormal[0], y: sockA.localNormal[1], z: sockA.localNormal[2] };
          const jointParams = RAPIER.JointData.revolute(anchorA, anchorB, axisA);

          // Check for joint angle limits or motorized drive
          if (defA.properties?.jointLimitsDeg) {
            const minRad = (defA.properties.jointLimitsDeg[0] * Math.PI) / 180;
            const maxRad = (defA.properties.jointLimitsDeg[1] * Math.PI) / 180;
            jointParams.limitsEnabled = true;
            jointParams.limits = [minRad, maxRad];
          }

          const joint = this.world.createImpulseJoint(jointParams, sourceBinding.rigidBody, targetBinding.rigidBody, true);
          
          this.jointBindings.set(pairKey, {
            jointId: pairKey,
            type: 'REVOLUTE',
            joint,
            partAId: instanceId,
            partBId: conn.targetPartId,
            isMotorized: !!defA.properties?.maxTorqueNm,
            targetVelocity: 0,
            maxTorque: defA.properties?.maxTorqueNm || 10.0
          });
        } else if (sockA.type === SocketType.SLIDER_LINEAR) {
          // Prismatic suspension slider joint
          const axisA = { x: sockA.localNormal[0], y: sockA.localNormal[1], z: sockA.localNormal[2] };
          const jointParams = RAPIER.JointData.prismatic(anchorA, anchorB, axisA);

          const joint = this.world.createImpulseJoint(jointParams, sourceBinding.rigidBody, targetBinding.rigidBody, true);

          this.jointBindings.set(pairKey, {
            jointId: pairKey,
            type: 'PRISMATIC',
            joint,
            partAId: instanceId,
            partBId: conn.targetPartId,
            isMotorized: false,
            targetVelocity: 0,
            maxTorque: 0
          });
        } else if (sockA.type === SocketType.BALL_SOCKET) {
          // Spherical ball joint
          const jointParams = RAPIER.JointData.spherical(anchorA, anchorB);
          const joint = this.world.createImpulseJoint(jointParams, sourceBinding.rigidBody, targetBinding.rigidBody, true);

          this.jointBindings.set(pairKey, {
            jointId: pairKey,
            type: 'SPHERICAL',
            joint,
            partAId: instanceId,
            partBId: conn.targetPartId,
            isMotorized: false,
            targetVelocity: 0,
            maxTorque: 0
          });
        } else {
          // Fixed Welded Coupler (Flanges, Snap Grids, Hex Bolts)
          const jointParams = RAPIER.JointData.fixed(
            anchorA,
            { x: 0, y: 0, z: 0, w: 1 },
            anchorB,
            { x: 0, y: 0, z: 0, w: 1 }
          );
          const joint = this.world.createImpulseJoint(jointParams, sourceBinding.rigidBody, targetBinding.rigidBody, true);

          this.jointBindings.set(pairKey, {
            jointId: pairKey,
            type: 'FIXED',
            joint,
            partAId: instanceId,
            partBId: conn.targetPartId,
            isMotorized: false,
            targetVelocity: 0,
            maxTorque: 0
          });
        }
      }
    }

    console.log(`[MultibodySolver] Built simulation world: ${this.bodyBindings.size} RigidBodies, ${this.jointBindings.size} Dynamic Joints.`);
  }

  /**
   * Apply user drive inputs to motorized revolute joints (Throttle & Steering)
   */
  public applyDriveControls(throttle: number, steering: number): void {
    if (!this.isSimulating) return;

    for (const [_, binding] of this.jointBindings.entries()) {
      if (binding.type === 'REVOLUTE') {
        if (binding.isMotorized) {
          // Differential steering or forward/reverse drive
          const driveSpeed = (throttle + steering * 0.4) * 35.0;
          (binding.joint as any).configureMotorVelocity(driveSpeed, binding.maxTorque);
        } else if ((binding.joint as any).configureMotorPosition) {
          // Positional steering angle
          const steerAngleRad = (steering * 35.0 * Math.PI) / 180;
          (binding.joint as any).configureMotorPosition(steerAngleRad, 100.0, 10.0);
        }
      }
    }
  }

  /**
   * Step physics and sync 3D scene meshes
   */
  public step(dt: number = 1 / 60): void {
    if (!this.isInitialized || !this.isSimulating) return;

    this.world.timestep = Math.min(dt, 0.033);
    this.world.step();

    for (const [_, binding] of this.bodyBindings.entries()) {
      const pos = binding.rigidBody.translation();
      const rot = binding.rigidBody.rotation();

      binding.mesh.position.set(pos.x, pos.y, pos.z);
      binding.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }
  }

  public start(): void {
    this.isSimulating = true;
  }

  public pause(): void {
    this.isSimulating = false;
  }

  public clear(): void {
    if (!this.isInitialized) return;
    this.isSimulating = false;

    for (const [_, j] of this.jointBindings.entries()) {
      this.world.removeImpulseJoint(j.joint, true);
    }
    this.jointBindings.clear();

    for (const [_, b] of this.bodyBindings.entries()) {
      this.world.removeRigidBody(b.rigidBody);
    }
    this.bodyBindings.clear();
  }
}
