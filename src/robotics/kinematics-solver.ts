import * as THREE from 'three';

export interface DHParameter {
  name: string;
  thetaDeg: number; // Joint angle (revolute variable)
  dM: number;       // Link offset (prismatic variable)
  aM: number;       // Link length
  alphaDeg: number; // Link twist
  jointType: 'revolute' | 'prismatic' | 'fixed';
  minLimitDeg?: number;
  maxLimitDeg?: number;
}

export interface EndEffectorPose {
  position: [number, number, number];
  orientationEulerDeg: [number, number, number];
  rotationMatrix: number[][];
}

export class DHKinematicsSolver {
  /**
   * Evaluates standard Denavit-Hartenberg Forward Kinematics for serial robotic chains.
   */
  public static computeForwardKinematics(dhChain: DHParameter[]): {
    jointTransforms: THREE.Matrix4[];
    endEffector: EndEffectorPose;
  } {
    let T = new THREE.Matrix4().identity();
    const jointTransforms: THREE.Matrix4[] = [T.clone()];

    for (const dh of dhChain) {
      const theta = THREE.MathUtils.degToRad(dh.thetaDeg);
      const alpha = THREE.MathUtils.degToRad(dh.alphaDeg);
      const a = dh.aM;
      const d = dh.dM;

      // Standard DH Transformation Matrix
      // [ cos(θ)  -sin(θ)cos(α)   sin(θ)sin(α)  a*cos(θ) ]
      // [ sin(θ)   cos(θ)cos(α)  -cos(θ)sin(α)  a*sin(θ) ]
      // [   0          sin(α)          cos(α)        d    ]
      // [   0            0               0           1    ]
      const Ai = new THREE.Matrix4().set(
        Math.cos(theta), -Math.sin(theta) * Math.cos(alpha),  Math.sin(theta) * Math.sin(alpha), a * Math.cos(theta),
        Math.sin(theta),  Math.cos(theta) * Math.cos(alpha), -Math.cos(theta) * Math.sin(alpha), a * Math.sin(theta),
        0,                Math.sin(alpha),                    Math.cos(alpha),                   d,
        0,                0,                                  0,                                 1
      );

      T = T.clone().multiply(Ai);
      jointTransforms.push(T.clone());
    }

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    T.decompose(pos, quat, scale);

    const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');

    const rotMat = [
      [T.elements[0], T.elements[4], T.elements[8]],
      [T.elements[1], T.elements[5], T.elements[9]],
      [T.elements[2], T.elements[6], T.elements[10]]
    ];

    return {
      jointTransforms,
      endEffector: {
        position: [parseFloat(pos.x.toFixed(4)), parseFloat(pos.y.toFixed(4)), parseFloat(pos.z.toFixed(4))],
        orientationEulerDeg: [
          parseFloat(THREE.MathUtils.radToDeg(euler.x).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(euler.y).toFixed(2)),
          parseFloat(THREE.MathUtils.radToDeg(euler.z).toFixed(2))
        ],
        rotationMatrix: rotMat
      }
    };
  }
}
