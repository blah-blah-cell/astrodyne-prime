import { RenderParams } from '../physics/types';
import { bloomBlurShader, bloomExtractShader } from '../shaders/bloom.wgsl';
import { postProcessShader } from '../shaders/postprocess.wgsl';

export class PostProcessor {
  private device: GPUDevice;
  public width = 1;
  public height = 1;
  public format: GPUTextureFormat;

  // Textures
  public sceneTexture!: GPUTexture;
  public sceneTextureView!: GPUTextureView;

  private bloomExtractTexture!: GPUTexture;
  private bloomExtractView!: GPUTextureView;

  private bloomPingTexture!: GPUTexture;
  private bloomPingView!: GPUTextureView;

  private bloomPongTexture!: GPUTexture;
  private bloomPongView!: GPUTextureView;

  // Sampler
  private linearSampler!: GPUSampler;

  // Uniform Buffers
  private bloomUniformBuffer!: GPUBuffer;
  private blurHorizontalBuffer!: GPUBuffer;
  private blurVerticalBuffer!: GPUBuffer;
  private postUniformBuffer!: GPUBuffer;

  // Pipelines
  private extractPipeline!: GPURenderPipeline;
  private blurPipeline!: GPURenderPipeline;
  private postPipeline!: GPURenderPipeline;

  constructor(device: GPUDevice, width: number, height: number, format: GPUTextureFormat) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.format = format;

    this.createSamplers();
    this.createUniformBuffers();
    this.createPipelines();
    this.resize(width, height);
  }

  private createSamplers(): void {
    this.linearSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  private createUniformBuffers(): void {
    const d = this.device;
    this.bloomUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.blurHorizontalBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.blurVerticalBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  private createPipelines(): void {
    const d = this.device;

    // 1. Bloom Extract Pipeline
    const extractModule = d.createShaderModule({ code: bloomExtractShader });
    this.extractPipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: extractModule, entryPoint: 'vs_main' },
      fragment: {
        module: extractModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });

    // 2. Bloom Blur Pipeline
    const blurModule = d.createShaderModule({ code: bloomBlurShader });
    this.blurPipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: blurModule, entryPoint: 'vs_main' },
      fragment: {
        module: blurModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba16float' }]
      },
      primitive: { topology: 'triangle-list' }
    });

    // 3. Composite & Tone Mapping Pipeline
    const postModule = d.createShaderModule({ code: postProcessShader });
    this.postPipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: postModule, entryPoint: 'vs_main' },
      fragment: {
        module: postModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    const d = this.device;

    // Destroy old textures if exist
    if (this.sceneTexture) {
      this.sceneTexture.destroy();
      this.bloomExtractTexture.destroy();
      this.bloomPingTexture.destroy();
      this.bloomPongTexture.destroy();
    }

    // 1. HDR Scene Texture
    this.sceneTexture = d.createTexture({
      size: [this.width, this.height, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.sceneTextureView = this.sceneTexture.createView();

    // 2. Half-resolution Bloom Textures
    const bloomW = Math.max(Math.floor(this.width / 2), 1);
    const bloomH = Math.max(Math.floor(this.height / 2), 1);

    this.bloomExtractTexture = d.createTexture({
      size: [bloomW, bloomH, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.bloomExtractView = this.bloomExtractTexture.createView();

    this.bloomPingTexture = d.createTexture({
      size: [bloomW, bloomH, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.bloomPingView = this.bloomPingTexture.createView();

    this.bloomPongTexture = d.createTexture({
      size: [bloomW, bloomH, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    this.bloomPongView = this.bloomPongTexture.createView();
  }

  public render(
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    params: RenderParams
  ): void {
    const d = this.device;
    const bloomW = Math.max(Math.floor(this.width / 2), 1);
    const bloomH = Math.max(Math.floor(this.height / 2), 1);

    // 1. Extract bright pixels for bloom
    d.queue.writeBuffer(
      this.bloomUniformBuffer,
      0,
      new Float32Array([params.bloomThreshold, 0.5, 0, 0])
    );

    const extractPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.bloomExtractView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });
    extractPass.setPipeline(this.extractPipeline);
    const extractBindGroup = d.createBindGroup({
      layout: this.extractPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bloomUniformBuffer } },
        { binding: 1, resource: this.sceneTextureView },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    extractPass.setBindGroup(0, extractBindGroup);
    extractPass.draw(3);
    extractPass.end();

    // 2. Separable Gaussian Blur (Horizontal Pass: Extract -> Ping)
    d.queue.writeBuffer(
      this.blurHorizontalBuffer,
      0,
      new Float32Array([1.0, 0.0, bloomW, bloomH])
    );
    const blurHPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.bloomPingView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });
    blurHPass.setPipeline(this.blurPipeline);
    const blurHBindGroup = d.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.blurHorizontalBuffer } },
        { binding: 1, resource: this.bloomExtractView },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    blurHPass.setBindGroup(0, blurHBindGroup);
    blurHPass.draw(3);
    blurHPass.end();

    // 3. Separable Gaussian Blur (Vertical Pass: Ping -> Pong)
    d.queue.writeBuffer(
      this.blurVerticalBuffer,
      0,
      new Float32Array([0.0, 1.0, bloomW, bloomH])
    );
    const blurVPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.bloomPongView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });
    blurVPass.setPipeline(this.blurPipeline);
    const blurVBindGroup = d.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.blurVerticalBuffer } },
        { binding: 1, resource: this.bloomPingView },
        { binding: 2, resource: this.linearSampler }
      ]
    });
    blurVPass.setBindGroup(0, blurVBindGroup);
    blurVPass.draw(3);
    blurVPass.end();

    // 4. Final Composite & ACES Tone Mapping to Target View
    d.queue.writeBuffer(
      this.postUniformBuffer,
      0,
      new Float32Array([
        params.exposure,
        params.bloomIntensity,
        0.35, // Vignette strength
        0.45  // Chromatic aberration
      ])
    );

    const postPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.01, g: 0.01, b: 0.02, a: 1 }
      }]
    });
    postPass.setPipeline(this.postPipeline);
    const postBindGroup = d.createBindGroup({
      layout: this.postPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.postUniformBuffer } },
        { binding: 1, resource: this.sceneTextureView },
        { binding: 2, resource: this.bloomPongView },
        { binding: 3, resource: this.linearSampler }
      ]
    });
    postPass.setBindGroup(0, postBindGroup);
    postPass.draw(3);
    postPass.end();
  }
}
