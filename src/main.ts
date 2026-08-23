import { AlgorithmType, ColorPalette, IntegratorType, PresetConfig, RenderParams, SimulationParams } from './physics/types';
import { TelemetryTracker } from './physics/telemetry';
import { NBodyEngine } from './physics/nbody-engine';
import { ParticleRenderer } from './renderer/renderer';
import { UIController } from './ui/ui-controller';
import { PRESETS } from './physics/presets';

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
  const fallbackOverlay = document.getElementById('webgpu-fallback') as HTMLElement;

  if (!navigator.gpu) {
    if (fallbackOverlay) fallbackOverlay.style.display = 'flex';
    console.error('WebGPU is not supported on this browser or hardware.');
    return;
  }

  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;

  try {
    adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      throw new Error('No appropriate GPUAdapter found.');
    }

    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize
      }
    });
  } catch (err) {
    console.error('Failed to initialize WebGPU device:', err);
    if (fallbackOverlay) fallbackOverlay.style.display = 'flex';
    return;
  }

  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  if (!context) {
    if (fallbackOverlay) fallbackOverlay.style.display = 'flex';
    return;
  }

  // Set initial canvas pixel dimensions
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  // Default Simulation Parameters
  const simParams: SimulationParams = {
    numParticles: 100000,
    timeStep: 0.08,
    substeps: 1,
    gravityConstant: 1.0,
    softening: 4.5,
    theta: 0.6,
    algorithm: AlgorithmType.BARNES_HUT,
    integrator: IntegratorType.VELOCITY_VERLET,
    enableCollisions: false,
    collisionRadius: 2.0,
    enableRelativisticPrecession: false,
    damping: 0.0,
    paused: false
  };

  // Default Render Parameters
  const renderParams: RenderParams = {
    pointSize: 1.8,
    exposure: 1.1,
    bloomIntensity: 1.2,
    bloomThreshold: 0.8,
    colorPalette: ColorPalette.BLACKBODY_PLANCK,
    trailPersistence: 0.0,
    showGrid: true,
    showAxes: true,
    showBVHBounds: false,
    brightnessScale: 1.2
  };

  const telemetry = new TelemetryTracker();
  const engine = new NBodyEngine(device, simParams, telemetry);
  await engine.init();

  const renderer = new ParticleRenderer(device, context, canvas, renderParams);

  // Function to load a scenario preset
  const loadPreset = (preset: PresetConfig, particleCount: number) => {
    simParams.numParticles = particleCount;
    simParams.theta = preset.recommendedTheta;
    simParams.gravityConstant = preset.defaultG;
    simParams.timeStep = preset.defaultDt;

    const data = preset.generate(particleCount);
    engine.initParticles(data);
    renderer.bindEngine(engine);

    renderer.camera.setDistance(preset.cameraDistance);
    renderer.camera.target = [0, 0, 0];
    uiController.controlsPanel.render();
  };

  const uiController = new UIController(engine, renderer, loadPreset);

  // Attach camera controls to canvas
  renderer.camera.attachControls(canvas, () => {
    return uiController.controlsPanel.currentTool === 'orbit';
  });

  // Handle window resizing
  const handleResize = () => {
    const curDpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const w = Math.floor(window.innerWidth * curDpr);
    const h = Math.floor(window.innerHeight * curDpr);
    renderer.resize(w, h);
  };
  window.addEventListener('resize', handleResize);

  // Load initial preset (Galaxy Collision)
  loadPreset(PRESETS[0], 100000);

  // Animation / Render Loop
  let lastTime = performance.now();

  const frame = (now: number) => {
    const dtMs = now - lastTime;
    lastTime = now;

    telemetry.updateFrame(dtMs);

    // 1. Run Physics Compute Passes
    const tCompStart = performance.now();
    engine.step();
    telemetry.data.computeTimeMs = parseFloat((performance.now() - tCompStart).toFixed(2));

    // 2. Render Scene & Post-processing
    const tRendStart = performance.now();
    renderer.render(engine);
    telemetry.data.renderTimeMs = parseFloat((performance.now() - tRendStart).toFixed(2));

    // 3. Update UI Telemetry HUD
    uiController.update();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', main);
