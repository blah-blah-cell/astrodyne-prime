import { Camera } from './camera';
import { GridRenderer } from './grid-renderer';
import { PostProcessor } from './post-process';
import { ColorPalette, RenderParams } from '../physics/types';
import { particleRenderShader } from '../shaders/particle-render.wgsl';
import { NBodyEngine } from '../physics/nbody-engine';

export class ParticleRenderer {
  public device: GPUDevice;
  public context: GPUCanvasContext;
  public canvas: HTMLCanvasElement;
  public presentationFormat: GPUTextureFormat;

  public camera: Camera;
  public gridRenderer: GridRenderer;
  public postProcessor: PostProcessor;

  public params: RenderParams;

  // Particle Render Pipeline
  private particlePipeline!: GPURenderPipeline;
  private cameraUniformBuffer!: GPUBuffer;
  private particleBindGroup!: GPUBindGroup;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvas: HTMLCanvasElement,
    params: RenderParams
  ) {
    this.device = device;
    this.context = context;
    this.canvas = canvas;
    this.params = params;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'opaque'
    });

    this.camera = new Camera(canvas.width / canvas.height);
    this.gridRenderer = new GridRenderer(device);
    this.postProcessor = new PostProcessor(
      device,
      canvas.width,
      canvas.height,
      this.presentationFormat
    );

    this.createCameraBuffer();
    this.createParticlePipeline();
  }

  private createCameraBuffer(): void {
    // 2x mat4 (128) + eyePos (16) + screenSize (8) + pointSize (4) + brightness (4) + palette (4) + trail (4) + pad (8) = 176 bytes
    this.cameraUniformBuffer = this.device.createBuffer({
      size: 192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  private createParticlePipeline(): void {
    const d = this.device;
    const module = d.createShaderModule({ code: particleRenderShader });

    this.particlePipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main'
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, // Additive HDR glow
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });
  }

  public bindEngine(engine: NBodyEngine): void {
    const d = this.device;
    this.particleBindGroup = d.createBindGroup({
      layout: this.particlePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: engine.posMassBuffer } },
        { binding: 2, resource: { buffer: engine.velTypeBuffer } },
        { binding: 3, resource: { buffer: engine.accelBuffer } }
      ]
    });
  }

  public resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.camera.resize(width, height);
      this.postProcessor.resize(width, height);
    }
  }

  private getPaletteIndex(p: ColorPalette): number {
    switch (p) {
      case ColorPalette.BLACKBODY_PLANCK: return 0;
      case ColorPalette.COSMIC_NEBULA: return 1;
      case ColorPalette.VELOCITY_HEATMAP: return 2;
      case ColorPalette.GRAVITATIONAL_POTENTIAL: return 3;
      case ColorPalette.PARTICLE_TYPE: return 4;
      case ColorPalette.ELECTRIC_CYAN: return 5;
      default: return 0;
    }
  }

  private updateCameraUniforms(): void {
    const d = this.device;
    const buf = new ArrayBuffer(192);

    // viewProj (64 bytes)
    new Float32Array(buf, 0, 16).set(this.camera.viewProjMatrix);
    // invView (64 bytes)
    new Float32Array(buf, 64, 16).set(this.camera.invViewMatrix);
    // eyePos (16 bytes)
    new Float32Array(buf, 128, 4).set(this.camera.eyePos);
    // screenSize (8 bytes)
    new Float32Array(buf, 144, 2).set([this.canvas.width, this.canvas.height]);
    // pointSize & brightnessScale (8 bytes)
    new Float32Array(buf, 152, 2).set([this.params.pointSize, this.params.brightnessScale]);
    // paletteType & trailPersistence (8 bytes)
    new Uint32Array(buf, 160, 1).set([this.getPaletteIndex(this.params.colorPalette)]);
    new Float32Array(buf, 164, 1).set([this.params.trailPersistence]);

    d.queue.writeBuffer(this.cameraUniformBuffer, 0, buf);
  }

  public render(engine: NBodyEngine): void {
    this.camera.update();
    this.updateCameraUniforms();

    const commandEncoder = this.device.createCommandEncoder({ label: 'Particle Render Pass' });
    const currentTexture = this.context.getCurrentTexture();
    const targetView = currentTexture.createView();

    // 1. Render Scene (Grid + Particles) into HDR scene texture
    const scenePass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.postProcessor.sceneTextureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
      }]
    });

    // Grid pass
    if (this.params.showGrid) {
      this.gridRenderer.render(scenePass, this.camera, this.params.showAxes);
    }

    // Particle billboards pass
    if (engine.count > 0 && this.particleBindGroup) {
      scenePass.setPipeline(this.particlePipeline);
      scenePass.setBindGroup(0, this.particleBindGroup);
      scenePass.draw(4, engine.count, 0, 0);
    }

    scenePass.end();

    // 2. Bloom & ACES Tone Mapping Post-Process to Screen
    this.postProcessor.render(commandEncoder, targetView, this.params);

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
