import * as THREE from 'three';
import { PartCategory, PartDefinition, SocketGender, SocketType } from './types.js';

export function getStandardMaterials() {
  return {
    aluminum: new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.25 }),
    carbonFiber: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.2 }),
    brassGear: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.3 }),
    rubberTire: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 }),
    rocketBody: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.1, roughness: 0.4 }),
    rocketMotor: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 }),
    finMaterial: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4 }),
    electronics: new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.5 })
  };
}

export const PART_CATALOG: PartDefinition[] = [
  {
    id: 'beam_aluminum_2020_05m',
    name: '2020 Aluminum Extrusion (0.5m)',
    category: PartCategory.STRUCTURAL,
    description: 'Precision T-slot aluminum frame profile. High torsional rigidity.',
    massKg: 0.25,
    centerOfMass: [0, 0.25, 0],
    dimensions: [0.02, 0.5, 0.02],
    physicsShape: 'BOX',
    sockets: [
      { id: 'end_bottom', name: 'Bottom Socket', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.NEUTRAL, localPosition: [0, 0, 0], localNormal: [0, -1, 0] },
      { id: 'end_top', name: 'Top Socket', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.NEUTRAL, localPosition: [0, 0.5, 0], localNormal: [0, 1, 0] },
      { id: 'side_mid', name: 'Center Mount', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.NEUTRAL, localPosition: [0, 0.25, 0.01], localNormal: [0, 0, 1] }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().aluminum;
      const geom = new THREE.BoxGeometry(0.02, 0.5, 0.02);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = 0.25;
      mesh.castShadow = true;
      return mesh;
    }
  },
  {
    id: 'block_modular_cube_025m',
    name: 'Modular Snap Block (0.25m)',
    category: PartCategory.STRUCTURAL,
    description: 'Universal building block with 6-face snap sockets.',
    massKg: 0.15,
    centerOfMass: [0, 0.125, 0],
    dimensions: [0.25, 0.25, 0.25],
    physicsShape: 'BOX',
    sockets: [
      { id: 'top', name: 'Top Face', type: SocketType.SNAP_GRID, gender: SocketGender.FEMALE, localPosition: [0, 0.25, 0], localNormal: [0, 1, 0] },
      { id: 'bottom', name: 'Bottom Face', type: SocketType.SNAP_GRID, gender: SocketGender.MALE, localPosition: [0, 0, 0], localNormal: [0, -1, 0] },
      { id: 'front', name: 'Front Face', type: SocketType.SNAP_GRID, gender: SocketGender.NEUTRAL, localPosition: [0, 0.125, 0.125], localNormal: [0, 0, 1] },
      { id: 'back', name: 'Back Face', type: SocketType.SNAP_GRID, gender: SocketGender.NEUTRAL, localPosition: [0, 0.125, -0.125], localNormal: [0, 0, -1] },
      { id: 'left', name: 'Left Face', type: SocketType.SNAP_GRID, gender: SocketGender.NEUTRAL, localPosition: [-0.125, 0.125, 0], localNormal: [-1, 0, 0] },
      { id: 'right', name: 'Right Face', type: SocketType.SNAP_GRID, gender: SocketGender.NEUTRAL, localPosition: [0.125, 0.125, 0], localNormal: [1, 0, 0] }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().carbonFiber;
      const geom = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = 0.125;
      mesh.castShadow = true;
      return mesh;
    }
  },
  {
    id: 'rocket_fuselage_tube_08m',
    name: 'Airframe Fuselage Tube (75mm x 0.8m)',
    category: PartCategory.AEROSPACE,
    description: 'Lightweight fiberglass rocket airframe body tube.',
    massKg: 0.45,
    centerOfMass: [0, 0.4, 0],
    dimensions: [0.075, 0.8, 0.075],
    physicsShape: 'CYLINDER',
    sockets: [
      { id: 'coupler_bottom', name: 'Aft Flange', type: SocketType.FLANGE_COUPLER, gender: SocketGender.MALE, localPosition: [0, 0, 0], localNormal: [0, -1, 0], radius: 0.0375 },
      { id: 'coupler_top', name: 'Forward Flange', type: SocketType.FLANGE_COUPLER, gender: SocketGender.FEMALE, localPosition: [0, 0.8, 0], localNormal: [0, 1, 0], radius: 0.0375 },
      { id: 'fin_slot_1', name: 'Fin Mount 1', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.FEMALE, localPosition: [0.0375, 0.1, 0], localNormal: [1, 0, 0] },
      { id: 'fin_slot_2', name: 'Fin Mount 2', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.FEMALE, localPosition: [-0.0187, 0.1, 0.0324], localNormal: [-0.5, 0, 0.866] },
      { id: 'fin_slot_3', name: 'Fin Mount 3', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.FEMALE, localPosition: [-0.0187, 0.1, -0.0324], localNormal: [-0.5, 0, -0.866] }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().rocketBody;
      const geom = new THREE.CylinderGeometry(0.0375, 0.0375, 0.8, 32);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = 0.4;
      mesh.castShadow = true;
      return mesh;
    }
  },
  {
    id: 'rocket_nosecone_ogive',
    name: 'Von Kármán Aerodynamic Nose Cone',
    category: PartCategory.AEROSPACE,
    description: 'Low-drag supersonic nose cone with base coupler.',
    massKg: 0.18,
    centerOfMass: [0, 0.12, 0],
    dimensions: [0.075, 0.3, 0.075],
    physicsShape: 'CONE',
    properties: { dragCoefficientCd: 0.15 },
    sockets: [
      { id: 'base_coupler', name: 'Base Coupler Socket', type: SocketType.FLANGE_COUPLER, gender: SocketGender.MALE, localPosition: [0, 0, 0], localNormal: [0, -1, 0], radius: 0.0375 }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().rocketBody;
      const geom = new THREE.ConeGeometry(0.0375, 0.3, 32);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = 0.15;
      mesh.castShadow = true;
      return mesh;
    }
  },
  {
    id: 'rocket_motor_solid_pro38',
    name: 'Solid Rocket Motor (Pro38 3-Grain)',
    category: PartCategory.AEROSPACE,
    description: 'Composite solid propellant rocket motor (480 N thrust).',
    massKg: 0.62,
    centerOfMass: [0, 0.15, 0],
    dimensions: [0.038, 0.3, 0.038],
    physicsShape: 'CYLINDER',
    properties: { thrustN: 480, burnTimeSec: 2.8, propellantMassKg: 0.32 },
    sockets: [
      { id: 'forward_retention', name: 'Forward Thrust Ring', type: SocketType.FLANGE_COUPLER, gender: SocketGender.FEMALE, localPosition: [0, 0.3, 0], localNormal: [0, 1, 0], radius: 0.019 },
      { id: 'nozzle_exhaust', name: 'Nozzle Exit Socket', type: SocketType.FLANGE_COUPLER, gender: SocketGender.MALE, localPosition: [0, 0, 0], localNormal: [0, -1, 0], radius: 0.019 }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().rocketMotor;
      const group = new THREE.Group();
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.28, 24), mat);
      casing.position.y = 0.16;
      casing.castShadow = true;
      group.add(casing);
      return group;
    }
  },
  {
    id: 'fin_trapezoidal_aero',
    name: 'Trapezoidal Aerodynamic Fin',
    category: PartCategory.AERODYNAMICS,
    description: 'Beveled G10 fiberglass stabilizing fin for rocket aerodynamic center of pressure.',
    massKg: 0.06,
    centerOfMass: [0.06, 0.075, 0],
    dimensions: [0.12, 0.15, 0.003],
    physicsShape: 'BOX',
    properties: { dragCoefficientCd: 0.02 },
    sockets: [
      { id: 'root_mount', name: 'Fin Root Tab', type: SocketType.HEX_BOLT_MOUNT, gender: SocketGender.MALE, localPosition: [0, 0.075, 0], localNormal: [-1, 0, 0] }
    ],
    createMesh: () => {
      const mat = getStandardMaterials().finMaterial;
      const geom = new THREE.BoxGeometry(0.12, 0.15, 0.004);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0.06, 0.075, 0);
      mesh.castShadow = true;
      return mesh;
    }
  },
  {
    id: 'wheel_all_terrain_02m',
    name: 'All-Terrain Robot Wheel (0.2m)',
    category: PartCategory.ROBOTICS_MOBILITY,
    description: 'High-traction rubber tread tire with aluminum hub.',
    massKg: 0.45,
    centerOfMass: [0, 0.03, 0],
    dimensions: [0.2, 0.06, 0.2],
    physicsShape: 'CYLINDER',
    sockets: [
      { id: 'axle_hub', name: 'Hub Axle Socket', type: SocketType.CYLINDRICAL_AXIAL, gender: SocketGender.FEMALE, localPosition: [0, 0.03, 0], localNormal: [0, 1, 0], radius: 0.006 }
    ],
    createMesh: () => {
      const group = new THREE.Group();
      const tireMat = getStandardMaterials().rubberTire;
      const hubMat = getStandardMaterials().aluminum;

      const tireGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 32);
      const tire = new THREE.Mesh(tireGeom, tireMat);
      tire.position.y = 0.03;
      tire.castShadow = true;
      group.add(tire);

      const hubGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.062, 16);
      const hub = new THREE.Mesh(hubGeom, hubMat);
      hub.position.y = 0.03;
      group.add(hub);
      return group;
    }
  }
];
