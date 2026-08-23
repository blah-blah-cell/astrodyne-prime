import { ParticleData, ParticleType, PresetConfig } from './types';

function createParticleArrays(count: number): ParticleData {
  return {
    positions: new Float32Array(count * 4),
    velocities: new Float32Array(count * 4),
    accelerations: new Float32Array(count * 4),
    count
  };
}

function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomGaussian(mean = 0, std = 1): number {
  let u = 1 - Math.random();
  let v = Math.random();
  let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * std;
}

// 1. Galaxy Collision Preset (Milky Way & Andromeda)
export function generateGalaxyCollision(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const count1 = Math.floor(totalCount * 0.55);

  const G = 1.0;
  const M_bh1 = 5000.0;
  const M_bh2 = 3500.0;

  // Galaxy 1: Center at (-160, 30, -30), Vel (0.55, -0.18, 0.12)
  const pos1 = [-160, 30, -30];
  const vel1 = [0.55, -0.18, 0.12];
  const r_disk1 = 120.0;

  // Galaxy 2: Center at (160, -30, 30), Vel (-0.55, 0.18, -0.12)
  const pos2 = [160, -30, 30];
  const vel2 = [-0.55, 0.18, -0.12];
  const r_disk2 = 90.0;
  // Tilt Galaxy 2
  const tiltAngle = Math.PI * 0.35;
  const cosT = Math.cos(tiltAngle);
  const sinT = Math.sin(tiltAngle);

  // Galaxy 1 SMBH
  positions[0] = pos1[0];
  positions[1] = pos1[1];
  positions[2] = pos1[2];
  positions[3] = M_bh1;
  velocities[0] = vel1[0];
  velocities[1] = vel1[1];
  velocities[2] = vel1[2];
  velocities[3] = ParticleType.BLACK_HOLE;

  // Galaxy 1 Stars & Halo
  for (let i = 1; i < count1; i++) {
    const idx = i * 4;
    const isHalo = Math.random() < 0.15;
    
    if (isHalo) {
      // Dark matter halo (Plummer sphere)
      const r = r_disk1 * Math.pow(Math.random(), 0.6) * 1.5;
      const theta = Math.acos(randomUniform(-1, 1));
      const phi = randomUniform(0, 2 * Math.PI);
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);

      const v_circ = Math.sqrt((G * (M_bh1 + 2000)) / (r + 10.0)) * 0.7;
      const vx = -v_circ * Math.sin(phi);
      const vy = v_circ * Math.cos(phi);
      const vz = randomGaussian(0, v_circ * 0.3);

      positions[idx + 0] = pos1[0] + x;
      positions[idx + 1] = pos1[1] + y;
      positions[idx + 2] = pos1[2] + z;
      positions[idx + 3] = 0.5; // low mass halo

      velocities[idx + 0] = vel1[0] + vx;
      velocities[idx + 1] = vel1[1] + vy;
      velocities[idx + 2] = vel1[2] + vz;
      velocities[idx + 3] = ParticleType.DARK_MATTER;
    } else {
      // Exponential Disk + Spiral Arms
      const r = Math.sqrt(Math.random()) * r_disk1 + 4.0;
      const armOffset = (Math.random() < 0.5 ? 0 : Math.PI) + (r / 25.0); // 2 logarithmic spiral arms
      const angle = randomUniform(0, 2 * Math.PI) * 0.3 + armOffset + randomGaussian(0, 0.15);
      
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      const y = randomGaussian(0, 1.8 * Math.exp(-r / r_disk1)); // disk thickness

      const v_circ = Math.sqrt((G * (M_bh1 + (r / r_disk1) * 3000.0)) / (r + 4.0));
      const vx = -v_circ * Math.sin(angle);
      const vz = v_circ * Math.cos(angle);
      const vy = randomGaussian(0, 0.05);

      positions[idx + 0] = pos1[0] + x;
      positions[idx + 1] = pos1[1] + y;
      positions[idx + 2] = pos1[2] + z;
      positions[idx + 3] = randomUniform(0.8, 2.5);

      velocities[idx + 0] = vel1[0] + vx;
      velocities[idx + 1] = vel1[1] + vy;
      velocities[idx + 2] = vel1[2] + vz;
      velocities[idx + 3] = ParticleType.STAR;
    }
  }

  // Galaxy 2 SMBH
  const g2_start = count1;
  positions[g2_start * 4 + 0] = pos2[0];
  positions[g2_start * 4 + 1] = pos2[1];
  positions[g2_start * 4 + 2] = pos2[2];
  positions[g2_start * 4 + 3] = M_bh2;
  velocities[g2_start * 4 + 0] = vel2[0];
  velocities[g2_start * 4 + 1] = vel2[1];
  velocities[g2_start * 4 + 2] = vel2[2];
  velocities[g2_start * 4 + 3] = ParticleType.BLACK_HOLE;

  // Galaxy 2 Stars & Disc
  for (let i = g2_start + 1; i < totalCount; i++) {
    const idx = i * 4;
    const r = Math.sqrt(Math.random()) * r_disk2 + 3.0;
    const armOffset = (Math.random() < 0.5 ? 0 : Math.PI) + (r / 20.0);
    const angle = randomUniform(0, 2 * Math.PI) * 0.35 + armOffset + randomGaussian(0, 0.18);

    let lx = r * Math.cos(angle);
    let lz = r * Math.sin(angle);
    let ly = randomGaussian(0, 1.4 * Math.exp(-r / r_disk2));

    const v_circ = Math.sqrt((G * (M_bh2 + (r / r_disk2) * 2000.0)) / (r + 3.0));
    let lvx = -v_circ * Math.sin(angle);
    let lvz = v_circ * Math.cos(angle);
    let lvy = randomGaussian(0, 0.05);

    // Apply rotation / tilt to Galaxy 2
    const tx = lx;
    const ty = ly * cosT - lz * sinT;
    const tz = ly * sinT + lz * cosT;

    const tvx = lvx;
    const tvy = lvy * cosT - lvz * sinT;
    const tvz = lvy * sinT + lvz * cosT;

    positions[idx + 0] = pos2[0] + tx;
    positions[idx + 1] = pos2[1] + ty;
    positions[idx + 2] = pos2[2] + tz;
    positions[idx + 3] = randomUniform(0.6, 2.0);

    velocities[idx + 0] = vel2[0] + tvx;
    velocities[idx + 1] = vel2[1] + tvy;
    velocities[idx + 2] = vel2[2] + tvz;
    velocities[idx + 3] = ParticleType.GAS_DISC;
  }

  return data;
}

// 2. Accretion Disc & Tidal Disruption Event (TDE)
export function generateAccretionDiskTDE(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_BH = 15000.0;
  const discCount = Math.floor(totalCount * 0.85);

  // Central Supermassive Black Hole
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_BH;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Relativistic Accretion Disc
  const r_min = 12.0;
  const r_max = 140.0;

  for (let i = 1; i < discCount; i++) {
    const idx = i * 4;
    const r = r_min + (r_max - r_min) * Math.pow(Math.random(), 1.5);
    const angle = randomUniform(0, 2 * Math.PI);
    
    const h = 0.03 * r;
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    const y = randomGaussian(0, h);

    const v_circ = Math.sqrt((G * M_BH) / (r - 4.0));
    const vx = -v_circ * Math.sin(angle);
    const vz = v_circ * Math.cos(angle);
    const vy = randomGaussian(0, 0.02 * v_circ);

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = randomUniform(0.5, 1.5);

    velocities[idx + 0] = vx;
    velocities[idx + 1] = vy;
    velocities[idx + 2] = vz;
    velocities[idx + 3] = ParticleType.GAS_DISC;
  }

  // Incoming Star on Parabolic Tidal Disruption Orbit
  const starCenter = [-180.0, 45.0, -120.0];
  const starVel = [3.8, -0.65, 2.5];
  const starRadius = 8.0;

  for (let i = discCount; i < totalCount; i++) {
    const idx = i * 4;
    const r = starRadius * Math.pow(Math.random(), 0.7);
    const theta = Math.acos(randomUniform(-1, 1));
    const phi = randomUniform(0, 2 * Math.PI);

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    const v_int = Math.sqrt(200.0 / (r + 1.0)) * 0.15;
    const ivx = randomGaussian(0, v_int);
    const ivy = randomGaussian(0, v_int);
    const ivz = randomGaussian(0, v_int);

    positions[idx + 0] = starCenter[0] + x;
    positions[idx + 1] = starCenter[1] + y;
    positions[idx + 2] = starCenter[2] + z;
    positions[idx + 3] = randomUniform(1.0, 3.0);

    velocities[idx + 0] = starVel[0] + ivx;
    velocities[idx + 1] = starVel[1] + ivy;
    velocities[idx + 2] = starVel[2] + ivz;
    velocities[idx + 3] = ParticleType.STAR;
  }

  return data;
}

// 3. Solar System & Lagrange Points (Sun-Jupiter + L4/L5 Trojans)
export function generateLagrangeTrojanPreset(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_sun = 10000.0;
  const M_jup = 250.0;
  const r_jup = 150.0;

  // Sun at (0, 0, 0)
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_sun;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Jupiter in circular orbit at r_jup
  const v_jup = Math.sqrt((G * (M_sun + M_jup)) / r_jup);
  positions[4] = r_jup;
  positions[5] = 0;
  positions[6] = 0;
  positions[7] = M_jup;
  velocities[4] = 0;
  velocities[5] = 0;
  velocities[6] = v_jup;
  velocities[7] = ParticleType.BLACK_HOLE;

  // Terrestrial Inner Planets
  const planets = [
    { r: 30, m: 2.0, type: ParticleType.STAR },
    { r: 50, m: 5.0, type: ParticleType.STAR },
    { r: 75, m: 6.0, type: ParticleType.STAR },
    { r: 105, m: 3.5, type: ParticleType.STAR }
  ];

  for (let p = 0; p < planets.length; p++) {
    const pIdx = (2 + p) * 4;
    const pl = planets[p];
    const angle = randomUniform(0, 2 * Math.PI);
    const vp = Math.sqrt((G * M_sun) / pl.r);

    positions[pIdx + 0] = pl.r * Math.cos(angle);
    positions[pIdx + 1] = 0;
    positions[pIdx + 2] = pl.r * Math.sin(angle);
    positions[pIdx + 3] = pl.m;

    velocities[pIdx + 0] = -vp * Math.sin(angle);
    velocities[pIdx + 1] = 0;
    velocities[pIdx + 2] = vp * Math.cos(angle);
    velocities[pIdx + 3] = pl.type;
  }

  const trojanStart = 6;
  const remaining = totalCount - trojanStart;
  const l4Count = Math.floor(remaining * 0.45);
  const l5Count = Math.floor(remaining * 0.45);
  const beltCount = remaining - l4Count - l5Count;

  // L4 Trojan Point
  const l4_angle = Math.PI / 3.0;
  for (let i = 0; i < l4Count; i++) {
    const idx = (trojanStart + i) * 4;
    const dTheta = randomGaussian(0, 0.12);
    const dr = randomGaussian(0, 6.5);
    const curAngle = l4_angle + dTheta;
    const r = r_jup + dr;

    const x = r * Math.cos(curAngle);
    const z = r * Math.sin(curAngle);
    const y = randomGaussian(0, 3.0);

    const v_mag = Math.sqrt((G * M_sun) / r);
    const vx = -v_mag * Math.sin(curAngle);
    const vz = v_mag * Math.cos(curAngle);
    const vy = randomGaussian(0, 0.05);

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = 0.2;

    velocities[idx + 0] = vx;
    velocities[idx + 1] = vy;
    velocities[idx + 2] = vz;
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  // L5 Greek Point
  const l5_angle = -Math.PI / 3.0;
  for (let i = 0; i < l5Count; i++) {
    const idx = (trojanStart + l4Count + i) * 4;
    const dTheta = randomGaussian(0, 0.12);
    const dr = randomGaussian(0, 6.5);
    const curAngle = l5_angle + dTheta;
    const r = r_jup + dr;

    const x = r * Math.cos(curAngle);
    const z = r * Math.sin(curAngle);
    const y = randomGaussian(0, 3.0);

    const v_mag = Math.sqrt((G * M_sun) / r);
    const vx = -v_mag * Math.sin(curAngle);
    const vz = v_mag * Math.cos(curAngle);
    const vy = randomGaussian(0, 0.05);

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = 0.2;

    velocities[idx + 0] = vx;
    velocities[idx + 1] = vy;
    velocities[idx + 2] = vz;
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  // Main Asteroid Belt
  for (let i = 0; i < beltCount; i++) {
    const idx = (trojanStart + l4Count + l5Count + i) * 4;
    const r = randomUniform(115, 135);
    const angle = randomUniform(0, 2 * Math.PI);
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    const y = randomGaussian(0, 2.0);

    const v_mag = Math.sqrt((G * M_sun) / r);
    const vx = -v_mag * Math.sin(angle);
    const vz = v_mag * Math.cos(angle);

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = 0.15;

    velocities[idx + 0] = vx;
    velocities[idx + 1] = randomGaussian(0, 0.03);
    velocities[idx + 2] = vz;
    velocities[idx + 3] = ParticleType.DEBRIS;
  }

  return data;
}

// 4. 3-Body Figure-8 Choreography & Chaotic Halo
export function generateFigure8Preset(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const m3 = 3000.0;
  const scale = 70.0;

  // Chenciner & Montgomery initial conditions
  const x1 = 0.97000436 * scale;
  const y1 = -0.24308753 * scale;
  const v_scale = Math.sqrt((G * m3) / scale);

  const vx3 = -0.93240737 * v_scale;
  const vy3 = -0.86473146 * v_scale;
  const vx1 = -vx3 * 0.5;
  const vy1 = -vy3 * 0.5;

  // Body 1
  positions[0] = x1;
  positions[1] = y1;
  positions[2] = 0;
  positions[3] = m3;
  velocities[0] = vx1;
  velocities[1] = vy1;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Body 2
  positions[4] = -x1;
  positions[5] = -y1;
  positions[6] = 0;
  positions[7] = m3;
  velocities[4] = vx1;
  velocities[5] = vy1;
  velocities[6] = 0;
  velocities[7] = ParticleType.BLACK_HOLE;

  // Body 3 (at origin)
  positions[8] = 0;
  positions[9] = 0;
  positions[10] = 0;
  positions[11] = m3;
  velocities[8] = vx3;
  velocities[9] = vy3;
  velocities[10] = 0;
  velocities[11] = ParticleType.BLACK_HOLE;

  // Surrounding disc of tracer debris
  const r_min = scale * 1.5;
  const r_max = scale * 3.5;

  for (let i = 3; i < totalCount; i++) {
    const idx = i * 4;
    const r = randomUniform(r_min, r_max);
    const angle = randomUniform(0, 2 * Math.PI);
    const z = randomGaussian(0, 4.0);

    const v_circ = Math.sqrt((G * 3.0 * m3) / r);
    const vx = -v_circ * Math.sin(angle);
    const vy = v_circ * Math.cos(angle);

    positions[idx + 0] = r * Math.cos(angle);
    positions[idx + 1] = r * Math.sin(angle);
    positions[idx + 2] = z;
    positions[idx + 3] = 0.1;

    velocities[idx + 0] = vx;
    velocities[idx + 1] = vy;
    velocities[idx + 2] = randomGaussian(0, 0.05);
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  return data;
}

// 5. Globular Cluster Core Collapse (Plummer Model)
export function generateGlobularCluster(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_tot = 8000.0;
  const a = 35.0; // Plummer core radius

  for (let i = 0; i < totalCount; i++) {
    const idx = i * 4;

    const X = Math.max(Math.random(), 0.0001);
    const r = a / Math.sqrt(Math.pow(X, -2.0 / 3.0) - 1.0);

    const theta = Math.acos(randomUniform(-1, 1));
    const phi = randomUniform(0, 2 * Math.PI);

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    const v_esc = Math.sqrt(2.0 * G * M_tot / Math.sqrt(r * r + a * a));
    
    var v = 0;
    while (true) {
      const q = Math.random();
      const g_q = q * q * Math.pow(1.0 - q * q, 3.5);
      if (Math.random() < g_q / 0.1) {
        v = q * v_esc;
        break;
      }
    }

    const v_theta = Math.acos(randomUniform(-1, 1));
    const v_phi = randomUniform(0, 2 * Math.PI);

    const vx = v * Math.sin(v_theta) * Math.cos(v_phi);
    const vy = v * Math.sin(v_theta) * Math.sin(v_phi);
    const vz = v * Math.cos(v_theta);

    const mass = Math.max(0.5, 4.0 * Math.exp(-r / a) + randomUniform(0.2, 1.0));

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = mass;

    velocities[idx + 0] = vx;
    velocities[idx + 1] = vy;
    velocities[idx + 2] = vz;
    velocities[idx + 3] = (mass > 3.0) ? ParticleType.STAR : ParticleType.GAS_DISC;
  }

  return data;
}

// 6. Saturnian Rings & Shepherd Moons
export function generateSaturnianRings(totalCount: number): ParticleData {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_planet = 12000.0;

  // Central Planet
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_planet;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Inner Shepherd Moon
  const r_m1 = 85.0;
  const v_m1 = Math.sqrt((G * M_planet) / r_m1);
  positions[4] = r_m1;
  positions[5] = 0;
  positions[6] = 0;
  positions[7] = 80.0;
  velocities[4] = 0;
  velocities[5] = 0;
  velocities[6] = v_m1;
  velocities[7] = ParticleType.STAR;

  // Outer Shepherd Moon
  const r_m2 = 135.0;
  const v_m2 = Math.sqrt((G * M_planet) / r_m2);
  positions[8] = -r_m2;
  positions[9] = 0;
  positions[10] = 0;
  positions[11] = 90.0;
  velocities[8] = 0;
  velocities[9] = 0;
  velocities[10] = -v_m2;
  velocities[11] = ParticleType.STAR;

  // Ring particles
  for (let i = 3; i < totalCount; i++) {
    const idx = i * 4;
    var r = 0;
    while (true) {
      r = randomUniform(40, 160);
      if (r >= 105 && r <= 116) {
        if (Math.random() > 0.04) continue;
      }
      break;
    }

    const angle = randomUniform(0, 2 * Math.PI);
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    const y = randomGaussian(0, 0.4);

    const v_circ = Math.sqrt((G * M_planet) / r);
    const vx = -v_circ * Math.sin(angle);
    const vz = v_circ * Math.cos(angle);

    positions[idx + 0] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    positions[idx + 3] = randomUniform(0.1, 0.5);

    velocities[idx + 0] = vx;
    velocities[idx + 1] = randomGaussian(0, 0.01);
    velocities[idx + 2] = vz;
    velocities[idx + 3] = ParticleType.GAS_DISC;
  }

  return data;
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'galaxy_collision',
    name: 'Galaxy Collision (Milky Way vs Andromeda)',
    category: 'Galactic Dynamics',
    description: 'Two interacting spiral galaxies with central supermassive black holes, exponential discs, and dark matter halos on a parabolic merger trajectory.',
    defaultParticles: 100000,
    recommendedTheta: 0.6,
    defaultG: 1.0,
    defaultDt: 0.08,
    cameraDistance: 500,
    generate: generateGalaxyCollision
  },
  {
    id: 'accretion_tde',
    name: 'Black Hole Accretion & Tidal Disruption (TDE)',
    category: 'Relativistic Astrophysics',
    description: 'A supermassive black hole with a Keplerian accretion disk disrupting an incoming star at the Roche tidal limit into relativistic stellar debris.',
    defaultParticles: 100000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.05,
    cameraDistance: 320,
    generate: generateAccretionDiskTDE
  },
  {
    id: 'lagrange_trojans',
    name: 'Lagrange Points & Trojan Asteroids (L4/L5)',
    category: 'Orbital Mechanics',
    description: 'Sun-Jupiter 3-body system demonstrating stable equilibrium at triangular Lagrange points L4 & L5 with Trojan asteroid swarms in libration.',
    defaultParticles: 50000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.04,
    cameraDistance: 380,
    generate: generateLagrangeTrojanPreset
  },
  {
    id: 'figure8_choreography',
    name: '3-Body Figure-8 Choreography',
    category: 'Chaotic Choreographies',
    description: 'The celebrated Chenciner-Montgomery equal-mass planar Figure-8 periodic solution surrounded by a resonance-scattered test particle dust disk.',
    defaultParticles: 50000,
    recommendedTheta: 0.4,
    defaultG: 1.0,
    defaultDt: 0.03,
    cameraDistance: 260,
    generate: generateFigure8Preset
  },
  {
    id: 'globular_cluster',
    name: 'Globular Cluster Core Collapse (Plummer)',
    category: 'Stellar Dynamics',
    description: 'High-density virialized Plummer sphere exhibiting gravitational relaxation, mass segregation, and core-collapse instability.',
    defaultParticles: 100000,
    recommendedTheta: 0.6,
    defaultG: 1.0,
    defaultDt: 0.06,
    cameraDistance: 280,
    generate: generateGlobularCluster
  },
  {
    id: 'saturnian_rings',
    name: 'Planetary Rings & Shepherd Moons',
    category: 'Planetary Science',
    description: 'Keplerian particle ring system sculpted by orbital resonances and shepherd moons maintaining sharp boundaries and the Cassini division.',
    defaultParticles: 50000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.04,
    cameraDistance: 350,
    generate: generateSaturnianRings
  }
];
