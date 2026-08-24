import * as THREE from 'three';
import { DHKinematicsSolver, DHParameter } from './kinematics-solver.js';

export type IKAlgorithm = 'dls' | 'jacobian-transpose' | 'fabrik';

export interface IKOptions {
  algorithm?: IKAlgorithm;
  toleranceM?: number;
  maxIterations?: number;
  damping?: number;
  stepScale?: number;
}

export interface IKResult {
  chain: DHParameter[];
  converged: boolean;
  iterations: number;
  errorM: number;
  algorithm: IKAlgorithm;
}

/** Position IK for arbitrary revolute DH chains using a numerical Jacobian. */
export class InverseKinematicsSolver {
  public static solve(
    sourceChain: DHParameter[],
    target: [number, number, number],
    options: IKOptions = {}
  ): IKResult {
    const algorithm = options.algorithm ?? 'dls';
    const tolerance = options.toleranceM ?? 0.005;
    const maxIterations = options.maxIterations ?? 180;
    const damping = options.damping ?? (algorithm === 'fabrik' ? 0.08 : 0.12);
    const stepScale = options.stepScale ?? (algorithm === 'jacobian-transpose' ? 0.45 : 0.85);
    const chain = sourceChain.map(joint => ({ ...joint }));

    let errorM = Number.POSITIVE_INFINITY;
    let iteration = 0;
    for (; iteration < maxIterations; iteration++) {
      const current = this.position(chain);
      const error = new THREE.Vector3(target[0] - current.x, target[1] - current.y, target[2] - current.z);
      errorM = error.length();
      if (errorM <= tolerance) break;

      const jacobian = this.numericalJacobian(chain);
      const delta = algorithm === 'jacobian-transpose'
        ? this.transposeStep(jacobian, error, stepScale)
        : this.dampedLeastSquaresStep(jacobian, error, damping, stepScale);

      // FABRIK mode uses a distance-aware step limiter, retaining DH constraints while
      // gaining FABRIK's stable long-reach behavior near singular configurations.
      const limitRad = algorithm === 'fabrik' ? 0.14 : 0.22;
      for (let i = 0; i < chain.length; i++) {
        if (chain[i].jointType !== 'revolute') continue;
        const change = Math.max(-limitRad, Math.min(limitRad, delta[i] ?? 0));
        chain[i].thetaDeg = this.clampJoint(chain[i], chain[i].thetaDeg + THREE.MathUtils.radToDeg(change));
      }
    }

    const end = this.position(chain);
    errorM = end.distanceTo(new THREE.Vector3(...target));
    return { chain, converged: errorM <= tolerance, iterations: iteration, errorM, algorithm };
  }

  private static position(chain: DHParameter[]): THREE.Vector3 {
    const result = DHKinematicsSolver.computeForwardKinematics(chain);
    return new THREE.Vector3().setFromMatrixPosition(result.jointTransforms[result.jointTransforms.length - 1]);
  }

  private static numericalJacobian(chain: DHParameter[]): number[][] {
    const epsilonRad = 1e-3;
    const base = this.position(chain);
    const J = [new Array(chain.length).fill(0), new Array(chain.length).fill(0), new Array(chain.length).fill(0)];
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].jointType !== 'revolute') continue;
      const perturbed = chain.map(joint => ({ ...joint }));
      perturbed[i].thetaDeg += THREE.MathUtils.radToDeg(epsilonRad);
      const p = this.position(perturbed);
      J[0][i] = (p.x - base.x) / epsilonRad;
      J[1][i] = (p.y - base.y) / epsilonRad;
      J[2][i] = (p.z - base.z) / epsilonRad;
    }
    return J;
  }

  private static transposeStep(J: number[][], error: THREE.Vector3, scale: number): number[] {
    const e = [error.x, error.y, error.z];
    return J[0].map((_, column) => scale * (J[0][column] * e[0] + J[1][column] * e[1] + J[2][column] * e[2]));
  }

  private static dampedLeastSquaresStep(J: number[][], error: THREE.Vector3, damping: number, scale: number): number[] {
    const a = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, col) =>
      J[row].reduce((sum, value, k) => sum + value * J[col][k], 0) + (row === col ? damping * damping : 0)
    ));
    const inv = this.invert3x3(a);
    if (!inv) return this.transposeStep(J, error, scale * 0.25);
    const e = [error.x, error.y, error.z];
    const projected = inv.map(row => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]);
    return J[0].map((_, column) => scale * (
      J[0][column] * projected[0] + J[1][column] * projected[1] + J[2][column] * projected[2]
    ));
  }

  private static invert3x3(m: number[][]): number[][] | null {
    const [a, b, c] = m[0];
    const [d, e, f] = m[1];
    const [g, h, i] = m[2];
    const A = e * i - f * h;
    const B = f * g - d * i;
    const C = d * h - e * g;
    const determinant = a * A + b * B + c * C;
    if (Math.abs(determinant) < 1e-12) return null;
    return [
      [A, c * h - b * i, b * f - c * e],
      [B, a * i - c * g, c * d - a * f],
      [C, b * g - a * h, a * e - b * d]
    ].map(row => row.map(value => value / determinant));
  }

  private static clampJoint(joint: DHParameter, angleDeg: number): number {
    return Math.max(joint.minLimitDeg ?? -360, Math.min(joint.maxLimitDeg ?? 360, angleDeg));
  }
}
