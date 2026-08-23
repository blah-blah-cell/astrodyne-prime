import {
  AlgorithmType,
  IntegratorType,
  ParticleData,
  ParticleType,
  SimulationParams
} from './types';
import { boundReductionShader, mortonShader } from '../shaders/morton.wgsl';
import { bitonicLocalSortShader, bitonicSortShader } from '../shaders/bitonic-sort.wgsl';
import { bvhBuildShader } from '../shaders/bvh-build.wgsl';
import { barnesHutShader } from '../shaders/barnes-hut.wgsl';
import { directForceShader } from '../shaders/direct-force.wgsl';
import { integrateShader } from '../shaders/integrate.wgsl';
import { collisionShader } from '../shaders/collision.wgsl';
import { telemetryReduceShader } from '../shaders/telemetry-reduce.wgsl';
import { TelemetryTracker } from './telemetry';

export class NBodyEngine {
  public device: GPUDevice;
  public params: SimulationParams;
  public telemetry: TelemetryTracker;

  public count = 0;
  public pow2Count = 0;

  // GPU Buffers
  public posMassBuffer!: GPUBuffer;
  public velTypeBuffer!: GPUBuffer;
  public accelBuffer!: GPUBuffer;

  private mortonKeysBuffer!: GPUBuffer;
  private particleIndicesBuffer!: GPUBuffer;
  private boundsBuffer!: GPUBuffer;
  private internalNodesBuffer!: GPUBuffer;
  private leafNodesBuffer!: GPUBuffer;
  private leafParentsBuffer!: GPUBuffer;
  private nodeVisitedBuffer!: GPUBuffer;

  private telemetryBuffer!: GPUBuffer;
  private telemetryStagingBuffer!: GPUBuffer;

  // Uniform Buffers
  private mortonUniformBuffer!: GPUBuffer;
  private boundsUniformBuffer!: GPUBuffer;
  private sortUniformBuffer!: GPUBuffer;
  private bvhUniformBuffer!: GPUBuffer;
  private simUniformBuffer!: GPUBuffer;
  private integrateUniformBuffer!: GPUBuffer;
  private collisionUniformBuffer!: GPUBuffer;
  private telemetryUniformBuffer!: GPUBuffer;

  // Compute Pipelines
  private boundsPipeline!: GPUComputePipeline;
  private mortonPipeline!: GPUComputePipeline;
  private bitonicSortPipeline!: GPUComputePipeline;
  private bitonicLocalPipeline!: GPUComputePipeline;
  private bvhTopologyPipeline!: GPUComputePipeline;
  private bvhLeavesPipeline!: GPUComputePipeline;
  private bvhAggregationPipeline!: GPUComputePipeline;
  private barnesHutPipeline!: GPUComputePipeline;
  private directForcePipeline!: GPUComputePipeline;
  private integratePipeline!: GPUComputePipeline;
  private collisionPipeline!: GPUComputePipeline;
  private telemetryReducePipeline!: GPUComputePipeline;

  // Bind Groups
  private boundsBindGroup!: GPUBindGroup;
  private mortonBindGroup!: GPUBindGroup;
  private bvhBindGroup!: GPUBindGroup;
  private barnesHutBindGroup!: GPUBindGroup;
  private directForceBindGroup!: GPUBindGroup;
  private collisionBindGroup!: GPUBindGroup;
  private telemetryBindGroup!: GPUBindGroup;

  // Mouse Interaction State
  public mouseActive = false;
  public mouseToolId = 0; // 0: none, 1: attractor, 2: repulsor
  public mouseStrength = 5000.0;
  public mouseWorldPos: [number, number, number] = [0, 0, 0];

  private isReadingTelemetry = false;

  constructor(device: GPUDevice, params: SimulationParams, telemetry: TelemetryTracker) {
    this.device = device;
    this.params = params;
    this.telemetry = telemetry;
  }

  public async init(): Promise<void> {
    this.createPipelines();
  }

  private nextPowerOf2(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
  }

  public initParticles(data: ParticleData): void {
    this.count = data.count;
    this.pow2Count = this.nextPowerOf2(this.count);

    this.createBuffers(data);
    this.createBindGroups();
    this.telemetry.resetBaseline();
  }

  private createPipelines(): void {
    const d = this.device;

    // 1. Bounds Reduction
    const boundsModule = d.createShaderModule({ code: boundReductionShader });
    this.boundsPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: boundsModule, entryPoint: 'main' }
    });

    // 2. Morton Code Generation
    const mortonModule = d.createShaderModule({ code: mortonShader });
    this.mortonPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: mortonModule, entryPoint: 'main' }
    });

    // 3. Bitonic Sort
    const sortModule = d.createShaderModule({ code: bitonicSortShader });
    this.bitonicSortPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: sortModule, entryPoint: 'main' }
    });

    const localSortModule = d.createShaderModule({ code: bitonicLocalSortShader });
    this.bitonicLocalPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: localSortModule, entryPoint: 'main' }
    });

    // 4. BVH Tree Construction
    const bvhModule = d.createShaderModule({ code: bvhBuildShader });
    this.bvhTopologyPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: bvhModule, entryPoint: 'build_topology' }
    });
    this.bvhLeavesPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: bvhModule, entryPoint: 'init_leaves' }
    });
    this.bvhAggregationPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: bvhModule, entryPoint: 'aggregate_multipoles' }
    });

    // 5. Barnes-Hut Traversal
    const bhModule = d.createShaderModule({ code: barnesHutShader });
    this.barnesHutPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: bhModule, entryPoint: 'main' }
    });

    // 6. Direct Force N^2
    const directModule = d.createShaderModule({ code: directForceShader });
    this.directForcePipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: directModule, entryPoint: 'main' }
    });

    // 7. Integrator
    const intModule = d.createShaderModule({ code: integrateShader });
    this.integratePipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: intModule, entryPoint: 'main' }
    });

    // 8. Collision
    const colModule = d.createShaderModule({ code: collisionShader });
    this.collisionPipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: colModule, entryPoint: 'main' }
    });

    // 9. Telemetry Reduction
    const telemModule = d.createShaderModule({ code: telemetryReduceShader });
    this.telemetryReducePipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: telemModule, entryPoint: 'main' }
    });
  }

  private createBuffers(data: ParticleData): void {
    const d = this.device;
    const n = this.count;
    const nPow2 = this.pow2Count;

    // Particle Buffers
    this.posMassBuffer = d.createBuffer({
      size: n * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    d.queue.writeBuffer(this.posMassBuffer, 0, data.positions.buffer, data.positions.byteOffset, data.positions.byteLength);

    this.velTypeBuffer = d.createBuffer({
      size: n * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    d.queue.writeBuffer(this.velTypeBuffer, 0, data.velocities.buffer, data.velocities.byteOffset, data.velocities.byteLength);

    this.accelBuffer = d.createBuffer({
      size: n * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    d.queue.writeBuffer(this.accelBuffer, 0, data.accelerations.buffer, data.accelerations.byteOffset, data.accelerations.byteLength);

    // Sorting & Morton Buffers
    this.mortonKeysBuffer = d.createBuffer({
      size: nPow2 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.particleIndicesBuffer = d.createBuffer({
      size: nPow2 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Bounds Buffer (min vec4, max vec4)
    this.boundsBuffer = d.createBuffer({
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // BVH Buffers: BVHNode is 48 bytes (3 x vec4)
    const nodeSize = 48;
    this.internalNodesBuffer = d.createBuffer({
      size: Math.max(n - 1, 1) * nodeSize,
      usage: GPUBufferUsage.STORAGE
    });
    this.leafNodesBuffer = d.createBuffer({
      size: n * nodeSize,
      usage: GPUBufferUsage.STORAGE
    });
    this.leafParentsBuffer = d.createBuffer({
      size: n * 4,
      usage: GPUBufferUsage.STORAGE
    });
    this.nodeVisitedBuffer = d.createBuffer({
      size: Math.max(n - 1, 1) * 4,
      usage: GPUBufferUsage.STORAGE
    });

    // Telemetry Buffers
    this.telemetryBuffer = d.createBuffer({
      size: 64, // 16 floats
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    this.telemetryStagingBuffer = d.createBuffer({
      size: 64,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    // Uniform Buffers
    this.mortonUniformBuffer = d.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.boundsUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sortUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bvhUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.simUniformBuffer = d.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.integrateUniformBuffer = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.collisionUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.telemetryUniformBuffer = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  private createBindGroups(): void {
    const d = this.device;

    // Bounds Reduction BindGroup
    this.boundsBindGroup = d.createBindGroup({
      layout: this.boundsPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.boundsUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.boundsBuffer } }
      ]
    });

    // Morton BindGroup
    this.mortonBindGroup = d.createBindGroup({
      layout: this.mortonPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.mortonUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.mortonKeysBuffer } },
        { binding: 3, resource: { buffer: this.particleIndicesBuffer } }
      ]
    });

    // BVH Tree BindGroup
    this.bvhBindGroup = d.createBindGroup({
      layout: this.bvhTopologyPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bvhUniformBuffer } },
        { binding: 1, resource: { buffer: this.mortonKeysBuffer } },
        { binding: 2, resource: { buffer: this.particleIndicesBuffer } },
        { binding: 3, resource: { buffer: this.posMassBuffer } },
        { binding: 4, resource: { buffer: this.internalNodesBuffer } },
        { binding: 5, resource: { buffer: this.leafNodesBuffer } },
        { binding: 6, resource: { buffer: this.leafParentsBuffer } },
        { binding: 7, resource: { buffer: this.nodeVisitedBuffer } }
      ]
    });

    // Barnes-Hut Traversal BindGroup
    this.barnesHutBindGroup = d.createBindGroup({
      layout: this.barnesHutPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.internalNodesBuffer } },
        { binding: 3, resource: { buffer: this.leafNodesBuffer } },
        { binding: 4, resource: { buffer: this.accelBuffer } }
      ]
    });

    // Direct Force BindGroup
    this.directForceBindGroup = d.createBindGroup({
      layout: this.directForcePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.accelBuffer } }
      ]
    });

    // Collision BindGroup
    this.collisionBindGroup = d.createBindGroup({
      layout: this.collisionPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.collisionUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.velTypeBuffer } }
      ]
    });

    // Telemetry BindGroup
    this.telemetryBindGroup = d.createBindGroup({
      layout: this.telemetryReducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.telemetryUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.velTypeBuffer } },
        { binding: 3, resource: { buffer: this.accelBuffer } },
        { binding: 4, resource: { buffer: this.telemetryBuffer } }
      ]
    });
  }

  public step(): void {
    if (this.params.paused || this.count === 0) {
      return;
    }

    const tStart = performance.now();
    const substeps = this.params.substeps;
    const subDt = this.params.timeStep / substeps;

    const commandEncoder = this.device.createCommandEncoder({ label: 'NBody Physics Step' });

    for (let s = 0; s < substeps; s++) {
      if (this.params.integrator === IntegratorType.YOSHIDA_4TH) {
        this.stepYoshida(commandEncoder, subDt);
      } else {
        this.stepVelocityVerlet(commandEncoder, subDt);
      }
    }

    // Telemetry Reduction Pass
    this.dispatchTelemetry(commandEncoder);

    this.device.queue.submit([commandEncoder.finish()]);

    const computeMs = performance.now() - tStart;
    this.telemetry.data.computeTimeMs = parseFloat(computeMs.toFixed(2));
    this.telemetry.calculateGFLOPS(
      this.count,
      this.params.algorithm === AlgorithmType.BARNES_HUT,
      computeMs
    );

    this.pollTelemetry();
  }

  private stepVelocityVerlet(encoder: GPUCommandEncoder, dt: number): void {
    // 1. Kick 1 & Drift (v += a*dt/2, x += v*dt)
    this.dispatchIntegrate(encoder, dt, 0, 0, 0);

    // 2. Force evaluation (Barnes-Hut or Direct)
    this.dispatchForce(encoder);

    // 3. Collision merge pass (if enabled)
    if (this.params.enableCollisions) {
      this.dispatchCollision(encoder);
    }

    // 4. Kick 2 (v += a*dt/2)
    this.dispatchIntegrate(encoder, dt, 1, 0, 0);
  }

  private stepYoshida(encoder: GPUCommandEncoder, dt: number): void {
    // Yoshida 4th-Order Symplectic Coefficients
    const w0 = -1.7024143839193153;
    const w1 = 1.3512071919596578;
    const c1 = w1 / 2;
    const c2 = (w0 + w1) / 2;
    const c3 = c2;
    const c4 = c1;
    const d1 = w1;
    const d2 = w0;
    const d3 = w1;

    // Stage 1
    this.dispatchForce(encoder);
    this.dispatchIntegrate(encoder, dt, 2, c1, d1);

    // Stage 2
    this.dispatchForce(encoder);
    this.dispatchIntegrate(encoder, dt, 2, c2, d2);

    // Stage 3
    this.dispatchForce(encoder);
    this.dispatchIntegrate(encoder, dt, 2, c3, d3);

    // Stage 4
    this.dispatchForce(encoder);
    this.dispatchIntegrate(encoder, dt, 2, c4, 0);
  }

  private dispatchForce(encoder: GPUCommandEncoder): void {
    if (this.params.algorithm === AlgorithmType.BARNES_HUT && this.count >= 2) {
      this.dispatchBarnesHut(encoder);
    } else {
      this.dispatchDirectForce(encoder);
    }
  }

  private dispatchBarnesHut(encoder: GPUCommandEncoder): void {
    const d = this.device;
    const count = this.count;
    const pow2 = this.pow2Count;
    const workgroups = Math.ceil(count / 256);
    const pow2Workgroups = Math.ceil(pow2 / 256);

    // 1. Bounds reduction
    const boundsUniforms = new Uint32Array([count, 0, 0, 0]);
    d.queue.writeBuffer(this.boundsUniformBuffer, 0, boundsUniforms.buffer);

    const boundsPass = encoder.beginComputePass({ label: 'Bounds Reduction' });
    boundsPass.setPipeline(this.boundsPipeline);
    boundsPass.setBindGroup(0, this.boundsBindGroup);
    boundsPass.dispatchWorkgroups(1);
    boundsPass.end();

    // 2. Morton code computation
    const mortonUniforms = new ArrayBuffer(48);
    new Uint32Array(mortonUniforms, 0, 4).set([count, 0, 0, 0]);
    new Float32Array(mortonUniforms, 16, 4).set([-2000, -2000, -2000, 0]);
    new Float32Array(mortonUniforms, 32, 4).set([2000, 2000, 2000, 0]);
    d.queue.writeBuffer(this.mortonUniformBuffer, 0, mortonUniforms);

    const mortonPass = encoder.beginComputePass({ label: 'Morton Codes' });
    mortonPass.setPipeline(this.mortonPipeline);
    mortonPass.setBindGroup(0, this.mortonBindGroup);
    mortonPass.dispatchWorkgroups(workgroups);
    mortonPass.end();

    // 3. Bitonic Sort
    const localSortUniforms = new Uint32Array([pow2, 0, 0, 0]);
    d.queue.writeBuffer(this.sortUniformBuffer, 0, localSortUniforms.buffer);

    const localSortPass = encoder.beginComputePass({ label: 'Local Bitonic Sort' });
    localSortPass.setPipeline(this.bitonicLocalPipeline);
    const sortBindGroup = d.createBindGroup({
      layout: this.bitonicLocalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sortUniformBuffer } },
        { binding: 1, resource: { buffer: this.mortonKeysBuffer } },
        { binding: 2, resource: { buffer: this.particleIndicesBuffer } }
      ]
    });
    localSortPass.setBindGroup(0, sortBindGroup);
    localSortPass.dispatchWorkgroups(Math.max(1, Math.ceil(pow2 / 512)));
    localSortPass.end();

    // Global Bitonic Sort stages for k >= 1024
    for (let k = 1024; k <= pow2; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        const sortData = new Uint32Array([pow2, k, j, 0]);
        d.queue.writeBuffer(this.sortUniformBuffer, 0, sortData.buffer);

        const sortPass = encoder.beginComputePass({ label: `Bitonic Sort k=${k} j=${j}` });
        sortPass.setPipeline(this.bitonicSortPipeline);
        const globalSortBindGroup = d.createBindGroup({
          layout: this.bitonicSortPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.sortUniformBuffer } },
            { binding: 1, resource: { buffer: this.mortonKeysBuffer } },
            { binding: 2, resource: { buffer: this.particleIndicesBuffer } }
          ]
        });
        sortPass.setBindGroup(0, globalSortBindGroup);
        sortPass.dispatchWorkgroups(pow2Workgroups);
        sortPass.end();
      }
    }

    // 4. BVH Tree Construction
    const bvhUniforms = new Uint32Array([count, 0, 0, 0]);
    d.queue.writeBuffer(this.bvhUniformBuffer, 0, bvhUniforms.buffer);

    const bvhPass = encoder.beginComputePass({ label: 'BVH Hierarchy Build' });
    bvhPass.setBindGroup(0, this.bvhBindGroup);

    // Leaves init
    bvhPass.setPipeline(this.bvhLeavesPipeline);
    bvhPass.dispatchWorkgroups(workgroups);

    // Topology build (N - 1 internal nodes)
    bvhPass.setPipeline(this.bvhTopologyPipeline);
    bvhPass.dispatchWorkgroups(Math.max(1, Math.ceil((count - 1) / 256)));

    // Multipole aggregation
    bvhPass.setPipeline(this.bvhAggregationPipeline);
    bvhPass.dispatchWorkgroups(workgroups);
    bvhPass.end();

    // 5. Barnes-Hut Traversal & Force Calculation
    this.updateSimUniforms();
    const bhPass = encoder.beginComputePass({ label: 'Barnes-Hut Force Traversal' });
    bhPass.setPipeline(this.barnesHutPipeline);
    bhPass.setBindGroup(0, this.barnesHutBindGroup);
    bhPass.dispatchWorkgroups(workgroups);
    bhPass.end();
  }

  private dispatchDirectForce(encoder: GPUCommandEncoder): void {
    this.updateSimUniforms();
    const directPass = encoder.beginComputePass({ label: 'Direct N^2 Force' });
    directPass.setPipeline(this.directForcePipeline);
    directPass.setBindGroup(0, this.directForceBindGroup);
    directPass.dispatchWorkgroups(Math.ceil(this.count / 256));
    directPass.end();
  }

  private updateSimUniforms(): void {
    const simData = new ArrayBuffer(48);
    const u32View = new Uint32Array(simData, 0, 1);
    const f32View = new Float32Array(simData, 4, 11);

    u32View[0] = this.count;
    f32View[0] = this.params.gravityConstant;
    f32View[1] = this.params.softening * this.params.softening;
    f32View[2] = this.params.theta;

    // Mouse tool
    new Uint32Array(simData, 16, 1)[0] = this.mouseActive ? this.mouseToolId : 0;
    new Float32Array(simData, 20, 1)[0] = this.mouseStrength;

    // Mouse pos + active
    new Float32Array(simData, 32, 4).set([
      this.mouseWorldPos[0],
      this.mouseWorldPos[1],
      this.mouseWorldPos[2],
      this.mouseActive ? 1.0 : 0.0
    ]);

    this.device.queue.writeBuffer(this.simUniformBuffer, 0, simData);
  }

  private dispatchIntegrate(
    encoder: GPUCommandEncoder,
    dt: number,
    substepType: number,
    c_coeff: number,
    d_coeff: number
  ): void {
    const d = this.device;
    const intData = new ArrayBuffer(32);
    new Uint32Array(intData, 0, 1)[0] = this.count;
    new Float32Array(intData, 4, 1)[0] = dt;
    new Float32Array(intData, 8, 1)[0] = this.params.damping;
    new Uint32Array(intData, 12, 1)[0] = this.params.enableRelativisticPrecession ? 1 : 0;
    new Uint32Array(intData, 16, 1)[0] = substepType;
    new Float32Array(intData, 20, 1)[0] = c_coeff;
    new Float32Array(intData, 24, 1)[0] = d_coeff;

    d.queue.writeBuffer(this.integrateUniformBuffer, 0, intData);

    const intPass = encoder.beginComputePass({ label: `Integrator Type=${substepType}` });
    intPass.setPipeline(this.integratePipeline);
    const intBindGroup = d.createBindGroup({
      layout: this.integratePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.integrateUniformBuffer } },
        { binding: 1, resource: { buffer: this.posMassBuffer } },
        { binding: 2, resource: { buffer: this.velTypeBuffer } },
        { binding: 3, resource: { buffer: this.accelBuffer } }
      ]
    });
    intPass.setBindGroup(0, intBindGroup);
    intPass.dispatchWorkgroups(Math.ceil(this.count / 256));
    intPass.end();
  }

  private dispatchCollision(encoder: GPUCommandEncoder): void {
    const colData = new ArrayBuffer(16);
    new Uint32Array(colData, 0, 1)[0] = this.count;
    new Float32Array(colData, 4, 1)[0] = this.params.collisionRadius * this.params.collisionRadius;
    this.device.queue.writeBuffer(this.collisionUniformBuffer, 0, colData);

    const colPass = encoder.beginComputePass({ label: 'Celestial Collision' });
    colPass.setPipeline(this.collisionPipeline);
    colPass.setBindGroup(0, this.collisionBindGroup);
    colPass.dispatchWorkgroups(Math.ceil(this.count / 256));
    colPass.end();
  }

  private dispatchTelemetry(encoder: GPUCommandEncoder): void {
    const telemUniforms = new Uint32Array([this.count, 0, 0, 0]);
    this.device.queue.writeBuffer(this.telemetryUniformBuffer, 0, telemUniforms.buffer);

    const telemPass = encoder.beginComputePass({ label: 'Telemetry Reduction' });
    telemPass.setPipeline(this.telemetryReducePipeline);
    telemPass.setBindGroup(0, this.telemetryBindGroup);
    telemPass.dispatchWorkgroups(1);
    telemPass.end();

    if (!this.isReadingTelemetry) {
      encoder.copyBufferToBuffer(this.telemetryBuffer, 0, this.telemetryStagingBuffer, 0, 64);
    }
  }

  private async pollTelemetry(): Promise<void> {
    if (this.isReadingTelemetry) return;
    this.isReadingTelemetry = true;

    try {
      await this.telemetryStagingBuffer.mapAsync(GPUMapMode.READ);
      const copyArray = new Float32Array(this.telemetryStagingBuffer.getMappedRange().slice(0));
      this.telemetryStagingBuffer.unmap();

      const totalMass = copyArray[0];
      const ke = copyArray[1];
      const pe = copyArray[2];
      const Lx = copyArray[4];
      const Ly = copyArray[5];
      const Lz = copyArray[6];
      const comX = copyArray[8];
      const comY = copyArray[9];
      const comZ = copyArray[10];
      const activeCount = copyArray[11];

      this.telemetry.setPhysicsMetrics(
        totalMass,
        ke,
        pe,
        [Lx, Ly, Lz],
        [comX, comY, comZ],
        activeCount
      );
    } catch {
      // Buffer busy / unmapped
    } finally {
      this.isReadingTelemetry = false;
    }
  }

  // Particle Injection Tool
  public spawnBlackHole(x: number, y: number, z: number, mass = 2500): void {
    const pos = new Float32Array([x, y, z, mass]);
    const vel = new Float32Array([0, 0, 0, ParticleType.BLACK_HOLE]);
    this.device.queue.writeBuffer(this.posMassBuffer, (this.count - 1) * 16, pos.buffer);
    this.device.queue.writeBuffer(this.velTypeBuffer, (this.count - 1) * 16, vel.buffer);
  }
}
