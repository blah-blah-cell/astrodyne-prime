import {
  AlgorithmType,
  CameraViewMode,
  ColorPalette,
  IntegratorType,
  PresetConfig,
  RenderParams,
  SimulationParams
} from './physics/types';
import { TelemetryTracker } from './physics/telemetry';
import { NBodyEngine } from './physics/nbody-engine';
import { ParticleRenderer } from './renderer/renderer';
import { UIController } from './ui/ui-controller';
import { PRESETS } from './physics/presets';
import { ToolchainRegistry } from './engineering/toolchain-registry';

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
    ToolchainRegistry.setState('webgpu', 'ready');
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
    numParticles: 50000,
    timeStep: 0.04,
    substeps: 1,
    gravityConstant: 1.0,
    softening: 4.0,
    theta: 0.5,
    algorithm: AlgorithmType.BARNES_HUT,
    integrator: IntegratorType.VELOCITY_VERLET,
    enableCollisions: false,
    collisionRadius: 2.0,
    enableRelativisticPrecession: false,
    damping: 0.0,
    paused: false,
    timeWarp: 1
  };

  // Default Render Parameters
  const renderParams: RenderParams = {
    pointSize: 2.0,
    exposure: 1.2,
    bloomIntensity: 1.3,
    bloomThreshold: 0.75,
    colorPalette: ColorPalette.BLACKBODY_PLANCK,
    trailPersistence: 0.0,
    showGrid: true,
    showAxes: true,
    showBVHBounds: false,
    showOrbits: true,
    showGuidanceVectors: true,
    brightnessScale: 1.3,
    cameraMode: CameraViewMode.CHASE_SPACECRAFT
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
    if (preset.cameraMode) {
      renderParams.cameraMode = preset.cameraMode;
    }
    if (preset.id === 'rocket_launch_orbital') {
      renderParams.colorPalette = ColorPalette.PARTICLE_TYPE;
      renderParams.pointSize = 1.2;
      renderParams.bloomIntensity = 0.35;
      renderParams.brightnessScale = 0.9;
    } else {
      renderParams.colorPalette = ColorPalette.BLACKBODY_PLANCK;
      renderParams.pointSize = 2.0;
      renderParams.bloomIntensity = 1.3;
      renderParams.brightnessScale = 1.3;
    }

    const generated = preset.generate(particleCount);
    engine.initParticles(generated.data);
    engine.celestialBodies = preset.bodies || [];

    if (generated.spacecraftInit) {
      const scInit = generated.spacecraftInit;
      engine.spacecraft.active = true;
      engine.spacecraft.name = scInit.name || 'ASTRA-1';
      engine.spacecraft.position = [...scInit.position];
      engine.spacecraft.velocity = [...scInit.velocity];
      engine.spacecraft.acceleration = [0, 0, 0];
      engine.spacecraft.stages = scInit.stages;
      engine.spacecraft.currentStageIndex = 0;
      engine.spacecraft.dynamicsMode = 'normalized';
      engine.spacecraft.centerGimbal();
      engine.spacecraft.throttle = 0.0;
      engine.spacecraft.isLaunchPad = !!scInit.isLaunchPad;
      if (scInit.isLaunchPad) engine.spacecraft.launchPadLocation = [...scInit.position];
      engine.spacecraft.primaryBodyIndex = scInit.primaryBodyIndex;
      engine.spacecraft.calculateDeltaV();
      engine.spacecraft.updateKeplerianElements();
    } else {
      engine.spacecraft.active = false;
    }

    renderer.bindEngine(engine);
    renderer.camera.setDistance(preset.cameraDistance);
    renderer.camera.setTarget(0, 0, 0);
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

  // Load initial preset (Solar System Voyager Slingshot)
  loadPreset(PRESETS[0], 50000);

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

    // 3. Update UI Telemetry HUD & Spacecraft Flight Deck
    uiController.update();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', main);
