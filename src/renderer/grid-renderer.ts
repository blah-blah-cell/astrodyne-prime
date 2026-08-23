import { gridRenderShader } from '../shaders/grid-render.wgsl';
import { Camera } from './camera';

export class GridRenderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;
  private bindGroup!: GPUBindGroup;

  constructor(device: GPUDevice) {
    this.device = device;
    this.uniformBuffer = device.createBuffer({
      size: 160, // 2x mat4 (128) + vec4 (16) + 4 floats (16)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const module = device.createShaderModule({ code: gridRenderShader });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-strip' }
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    });
  }

  public render(
    renderPass: GPURenderPassEncoder,
    camera: Camera,
    showAxes = true,
    gridSize = 50.0
  ): void {
    const d = this.device;
    const uniformData = new ArrayBuffer(160);

    // viewProj matrix (64 bytes)
    new Float32Array(uniformData, 0, 16).set(camera.viewProjMatrix);
    // invViewProj matrix (64 bytes)
    new Float32Array(uniformData, 64, 16).set(camera.invViewProjMatrix);
    // eyePos (16 bytes)
    new Float32Array(uniformData, 128, 4).set(camera.eyePos);
    // gridSize, subdivisions, showAxes
    new Float32Array(uniformData, 144, 4).set([gridSize, 5.0, showAxes ? 1.0 : 0.0, 0.0]);

    d.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(4);
  }
}
