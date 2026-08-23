import { Spacecraft } from '../physics/spacecraft';
import { trajectoryRenderShader } from '../shaders/trajectory-render.wgsl';

export class TrajectoryRenderer {
  private device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private vertexBuffer!: GPUBuffer;
  private vertexCapacity = 2048; // max vertices for lines & markers

  constructor(device: GPUDevice) {
    this.device = device;
    this.createPipeline();
    this.createBuffers();
  }

  private createBuffers(): void {
    // 7 floats per vertex: 3 pos + 4 color = 28 bytes
    this.vertexBuffer = this.device.createBuffer({
      size: this.vertexCapacity * 28,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
  }

  private createPipeline(): void {
    const d = this.device;
    const module = d.createShaderModule({ code: trajectoryRenderShader });

    this.pipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 28,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // pos
            { shaderLocation: 1, offset: 12, format: 'float32x4' } // color
          ]
        }]
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, // Additive glow
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'line-list'
      }
    });
  }

  public render(
    passEncoder: GPURenderPassEncoder,
    cameraUniformBuffer: GPUBuffer,
    spacecraft: Spacecraft,
    showOrbits = true,
    showGuidance = true
  ): void {
    if (!spacecraft.active) return;

    const vertices: number[] = [];

    // 1. Render Keplerian Orbital Ellipse / Hyperbola Trajectory
    if (showOrbits && spacecraft.trajectoryPoints.length >= 2) {
      const isEscape = spacecraft.keplerian.eccentricity >= 1.0;
      const r_c = isEscape ? 1.0 : 0.05;
      const g_c = isEscape ? 0.4 : 0.9;
      const b_c = isEscape ? 0.8 : 1.0;
      const alpha = 0.75;

      const pts = spacecraft.trajectoryPoints;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        // Vertex 1
        vertices.push(p1.x, p1.y, p1.z, r_c, g_c, b_c, alpha);
        // Vertex 2
        vertices.push(p2.x, p2.y, p2.z, r_c, g_c, b_c, alpha);
      }

      // Close loop for ellipse
      if (!isEscape && pts.length > 2) {
        const pLast = pts[pts.length - 1];
        const pFirst = pts[0];
        vertices.push(pLast.x, pLast.y, pLast.z, r_c, g_c, b_c, alpha);
        vertices.push(pFirst.x, pFirst.y, pFirst.z, r_c, g_c, b_c, alpha);
      }
    }

    // 2. Spacecraft 3D Locator Crosshair & Nose Vector
    const sPos = spacecraft.position;
    const fwd = spacecraft.forward;
    const right = spacecraft.right;
    const up = spacecraft.up;
    const craftSize = 3.5;

    // Body Triangle / Pointer (Forward in bright cyan/amber)
    const noseX = sPos[0] + fwd[0] * craftSize * 1.5;
    const noseY = sPos[1] + fwd[1] * craftSize * 1.5;
    const noseZ = sPos[2] + fwd[2] * craftSize * 1.5;

    const leftX = sPos[0] - right[0] * craftSize - fwd[0] * craftSize * 0.5;
    const leftY = sPos[1] - right[1] * craftSize - fwd[1] * craftSize * 0.5;
    const leftZ = sPos[2] - right[2] * craftSize - fwd[2] * craftSize * 0.5;

    const rightX = sPos[0] + right[0] * craftSize - fwd[0] * craftSize * 0.5;
    const rightY = sPos[1] + right[1] * craftSize - fwd[1] * craftSize * 0.5;
    const rightZ = sPos[2] + right[2] * craftSize - fwd[2] * craftSize * 0.5;

    // Line Left -> Nose
    vertices.push(leftX, leftY, leftZ, 0.2, 0.9, 1.0, 1.0);
    vertices.push(noseX, noseY, noseZ, 0.2, 0.9, 1.0, 1.0);

    // Line Nose -> Right
    vertices.push(noseX, noseY, noseZ, 0.2, 0.9, 1.0, 1.0);
    vertices.push(rightX, rightY, rightZ, 0.2, 0.9, 1.0, 1.0);

    // Line Right -> Left
    vertices.push(rightX, rightY, rightZ, 0.2, 0.9, 1.0, 1.0);
    vertices.push(leftX, leftY, leftZ, 0.2, 0.9, 1.0, 1.0);

    // Vertical fin / dorsal antenna
    const topX = sPos[0] + up[0] * craftSize * 0.8 - fwd[0] * craftSize * 0.5;
    const topY = sPos[1] + up[1] * craftSize * 0.8 - fwd[1] * craftSize * 0.5;
    const topZ = sPos[2] + up[2] * craftSize * 0.8 - fwd[2] * craftSize * 0.5;

    vertices.push(noseX, noseY, noseZ, 0.9, 0.9, 1.0, 1.0);
    vertices.push(topX, topY, topZ, 0.9, 0.9, 1.0, 1.0);

    // 3. Guidance Vectors (Prograde, Normal, Maneuver)
    if (showGuidance) {
      const vecLen = 14.0;
      const vel = spacecraft.velocity;
      const speed = Math.hypot(vel[0], vel[1], vel[2]);

      if (speed > 0.01) {
        // Prograde vector (Bright Emerald Green)
        const vHatX = vel[0] / speed;
        const vHatY = vel[1] / speed;
        const vHatZ = vel[2] / speed;

        vertices.push(sPos[0], sPos[1], sPos[2], 0.1, 1.0, 0.4, 0.85);
        vertices.push(sPos[0] + vHatX * vecLen, sPos[1] + vHatY * vecLen, sPos[2] + vHatZ * vecLen, 0.1, 1.0, 0.4, 0.85);

        // Retrograde vector (Crimson Red)
        vertices.push(sPos[0], sPos[1], sPos[2], 1.0, 0.2, 0.2, 0.5);
        vertices.push(sPos[0] - vHatX * (vecLen * 0.7), sPos[1] - vHatY * (vecLen * 0.7), sPos[2] - vHatZ * (vecLen * 0.7), 1.0, 0.2, 0.2, 0.5);
      }

      // Active Maneuver Node Vector (Brilliant Gold)
      if (spacecraft.activeManeuverNode && speed > 0.01) {
        const vHatX = vel[0] / speed;
        const vHatY = vel[1] / speed;
        const vHatZ = vel[2] / speed;
        const h = spacecraft.keplerian.angularMomentumVector;
        const hMag = Math.hypot(h[0], h[1], h[2]);

        if (hMag > 0.01) {
          const nHatX = h[0] / hMag;
          const nHatY = h[1] / hMag;
          const nHatZ = h[2] / hMag;

          const rHatX = nHatY * vHatZ - nHatZ * vHatY;
          const rHatY = nHatZ * vHatX - nHatX * vHatZ;
          const rHatZ = nHatX * vHatY - nHatY * vHatX;

          const node = spacecraft.activeManeuverNode;
          const mvX = vHatX * node.deltaVPrograde + nHatX * node.deltaVNormal + rHatX * node.deltaVRadial;
          const mvY = vHatY * node.deltaVPrograde + nHatY * node.deltaVNormal + rHatY * node.deltaVRadial;
          const mvZ = vHatZ * node.deltaVPrograde + nHatZ * node.deltaVNormal + rHatZ * node.deltaVRadial;
          const mvMag = Math.hypot(mvX, mvY, mvZ);

          if (mvMag > 0.01) {
            const dirX = (mvX / mvMag) * (vecLen * 1.3);
            const dirY = (mvY / mvMag) * (vecLen * 1.3);
            const dirZ = (mvZ / mvMag) * (vecLen * 1.3);

            vertices.push(sPos[0], sPos[1], sPos[2], 1.0, 0.8, 0.0, 1.0);
            vertices.push(sPos[0] + dirX, sPos[1] + dirY, sPos[2] + dirZ, 1.0, 0.8, 0.0, 1.0);
          }
        }
      }
    }

    // 4. Exhaust Plume Particles Rendering (As glowing line segments)
    const plumes = spacecraft.plumeParticles;
    for (let i = 0; i < plumes.length; i++) {
      const p = plumes[i];
      const tailX = p.x - p.vx * 0.04;
      const tailY = p.y - p.vy * 0.04;
      const tailZ = p.z - p.vz * 0.04;

      vertices.push(tailX, tailY, tailZ, p.r, p.g, p.b, p.alpha * 0.8);
      vertices.push(p.x, p.y, p.z, p.r, p.g, p.b, p.alpha);
    }

    // 5. Atmospheric Reentry Plasma Glow (If heating active)
    if (spacecraft.reentryHeat > 0.05) {
      const glowRadius = craftSize * (1.5 + spacecraft.reentryHeat * 2.0);
      const glowAlpha = Math.min(spacecraft.reentryHeat * 1.5, 1.0);
      const gColor = [1.0, 0.35 + (1.0 - spacecraft.reentryHeat) * 0.4, 0.1];

      // Front plasma bow shock arc
      for (let a = 0; a < 8; a++) {
        const theta1 = (a / 8) * Math.PI - Math.PI / 2;
        const theta2 = ((a + 1) / 8) * Math.PI - Math.PI / 2;

        const p1x = noseX + (right[0] * Math.cos(theta1) + up[0] * Math.sin(theta1)) * glowRadius;
        const p1y = noseY + (right[1] * Math.cos(theta1) + up[1] * Math.sin(theta1)) * glowRadius;
        const p1z = noseZ + (right[2] * Math.cos(theta1) + up[2] * Math.sin(theta1)) * glowRadius;

        const p2x = noseX + (right[0] * Math.cos(theta2) + up[0] * Math.sin(theta2)) * glowRadius;
        const p2y = noseY + (right[1] * Math.cos(theta2) + up[1] * Math.sin(theta2)) * glowRadius;
        const p2z = noseZ + (right[2] * Math.cos(theta2) + up[2] * Math.sin(theta2)) * glowRadius;

        vertices.push(p1x, p1y, p1z, gColor[0], gColor[1], gColor[2], glowAlpha);
        vertices.push(p2x, p2y, p2z, gColor[0], gColor[1], gColor[2], glowAlpha);
      }
    }

    if (vertices.length === 0) return;

    const vertCount = vertices.length / 7;
    const floatArray = new Float32Array(vertices);

    // Expand buffer if needed
    if (vertCount > this.vertexCapacity) {
      this.vertexCapacity = vertCount * 2;
      this.createBuffers();
    }

    this.device.queue.writeBuffer(this.vertexBuffer, 0, floatArray.buffer, 0, floatArray.byteLength);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: cameraUniformBuffer } }]
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(vertCount, 1, 0, 0);
  }
}
