import { CameraViewMode, CelestialBodyInfo, ParticleData, ParticleType, PresetConfig, RocketStage } from './types';

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

// 1. Real Solar System & Voyager 1/2 Slingshot Trajectory
export function generateSolarSystemVoyager(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_sun = 16000.0;

  // Sun
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_sun;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  const celestialBodies: CelestialBodyInfo[] = [
    { index: 0, name: 'Sun', radius: 15, mass: M_sun, color: [1.0, 0.8, 0.2] }
  ];

  // Planets: [Name, dist, mass, radius, color, hasAtmosphere, atmHeight, atmDensity]
  const planets = [
    { name: 'Mercury', r: 38.0, m: 3.5, rad: 2.0, color: [0.7, 0.7, 0.7] as [number, number, number] },
    { name: 'Venus', r: 60.0, m: 8.0, rad: 3.5, color: [0.9, 0.75, 0.4] as [number, number, number], hasAtmosphere: true, atmHeight: 20, atmDensity: 2.5 },
    { name: 'Earth', r: 85.0, m: 12.0, rad: 4.0, color: [0.2, 0.6, 1.0] as [number, number, number], hasAtmosphere: true, atmHeight: 25, atmDensity: 1.2 },
    { name: 'Mars', r: 120.0, m: 6.0, rad: 2.8, color: [0.9, 0.35, 0.15] as [number, number, number], hasAtmosphere: true, atmHeight: 15, atmDensity: 0.3 },
    { name: 'Jupiter', r: 190.0, m: 350.0, rad: 10.0, color: [0.85, 0.65, 0.45] as [number, number, number], hasAtmosphere: true, atmHeight: 40, atmDensity: 2.0 },
    { name: 'Saturn', r: 275.0, m: 140.0, rad: 8.0, color: [0.9, 0.8, 0.55] as [number, number, number], hasAtmosphere: true, atmHeight: 35, atmDensity: 1.5 }
  ];

  // Spawn Planets in orbit
  let pIndex = 1;
  for (let i = 0; i < planets.length; i++) {
    const pl = planets[i];
    const angle = (i === 4) ? 0.35 : (i === 5) ? 1.05 : (i * 1.4); // Position Jupiter & Saturn for grand tour
    const vp = Math.sqrt((G * (M_sun + pl.m)) / pl.r);

    const px = pl.r * Math.cos(angle);
    const pz = pl.r * Math.sin(angle);
    const pvx = -vp * Math.sin(angle);
    const pvz = vp * Math.cos(angle);

    const idx = pIndex * 4;
    positions[idx + 0] = px;
    positions[idx + 1] = 0;
    positions[idx + 2] = pz;
    positions[idx + 3] = pl.m;

    velocities[idx + 0] = pvx;
    velocities[idx + 1] = 0;
    velocities[idx + 2] = pvz;
    velocities[idx + 3] = ParticleType.PLANET;

    celestialBodies.push({
      index: pIndex,
      name: pl.name,
      radius: pl.rad,
      mass: pl.m,
      color: pl.color,
      hasAtmosphere: pl.hasAtmosphere,
      atmosphereHeight: pl.atmHeight,
      atmosphereDensity0: pl.atmDensity
    });

    pIndex++;
  }

  // Moons: Earth Moon, Galilean moons of Jupiter, Saturn's Titan
  const earthIdx = 3;
  const earthX = positions[earthIdx * 4];
  const earthZ = positions[earthIdx * 4 + 2];
  const earthVx = velocities[earthIdx * 4];
  const earthVz = velocities[earthIdx * 4 + 2];

  // Moon
  const rMoon = 10.0;
  const vMoon = Math.sqrt((G * 12.0) / rMoon);
  const moonIdx = pIndex * 4;
  positions[moonIdx + 0] = earthX + rMoon;
  positions[moonIdx + 1] = 0;
  positions[moonIdx + 2] = earthZ;
  positions[moonIdx + 3] = 0.5;
  velocities[moonIdx + 0] = earthVx;
  velocities[moonIdx + 1] = 0;
  velocities[moonIdx + 2] = earthVz + vMoon;
  velocities[moonIdx + 3] = ParticleType.MOON;
  pIndex++;

  // Saturn Ring Particles & Asteroid Belt
  const startDebris = pIndex;
  const ringCount = Math.floor((totalCount - startDebris) * 0.4);
  const asteroidCount = totalCount - startDebris - ringCount;

  // Saturn Ring
  const saturnIdx = 6;
  const satX = positions[saturnIdx * 4];
  const satZ = positions[saturnIdx * 4 + 2];
  const satVx = velocities[saturnIdx * 4];
  const satVz = velocities[saturnIdx * 4 + 2];

  for (let k = 0; k < ringCount; k++) {
    const idx = (startDebris + k) * 4;
    const rRing = randomUniform(12, 28);
    const ringAngle = randomUniform(0, 2 * Math.PI);
    const vCirc = Math.sqrt((G * 140.0) / rRing);

    positions[idx + 0] = satX + rRing * Math.cos(ringAngle);
    positions[idx + 1] = randomGaussian(0, 0.2);
    positions[idx + 2] = satZ + rRing * Math.sin(ringAngle);
    positions[idx + 3] = 0.05;

    velocities[idx + 0] = satVx - vCirc * Math.sin(ringAngle);
    velocities[idx + 1] = randomGaussian(0, 0.01);
    velocities[idx + 2] = satVz + vCirc * Math.cos(ringAngle);
    velocities[idx + 3] = ParticleType.GAS_DISC;
  }

  // Asteroid belt (between Mars and Jupiter)
  for (let k = 0; k < asteroidCount; k++) {
    const idx = (startDebris + ringCount + k) * 4;
    const rAst = randomUniform(145, 175);
    const astAngle = randomUniform(0, 2 * Math.PI);
    const vAst = Math.sqrt((G * M_sun) / rAst);

    positions[idx + 0] = rAst * Math.cos(astAngle);
    positions[idx + 1] = randomGaussian(0, 1.5);
    positions[idx + 2] = rAst * Math.sin(astAngle);
    positions[idx + 3] = 0.1;

    velocities[idx + 0] = -vAst * Math.sin(astAngle);
    velocities[idx + 1] = randomGaussian(0, 0.02);
    velocities[idx + 2] = vAst * Math.cos(astAngle);
    velocities[idx + 3] = ParticleType.DEBRIS;
  }

  // Voyager 1 Spacecraft Initial Condition: Hyperbolic Jupiter Flyby Gravity Assist
  // Departure from Earth orbit inbound towards Jupiter's SOI
  const jupIdx = 5;
  const jupX = positions[jupIdx * 4];
  const jupZ = positions[jupIdx * 4 + 2];
  const jupVx = velocities[jupIdx * 4];
  const jupVz = velocities[jupIdx * 4 + 2];

  // Position Voyager slightly ahead and inward of Jupiter for hyperbolic trailing-side gravity boost
  const vPos: [number, number, number] = [jupX - 35.0, 2.0, jupZ - 45.0];
  const vVel: [number, number, number] = [jupVx * 1.15 + 4.5, 0.2, jupVz * 1.15 + 5.2];

  const voyagerStages: RocketStage[] = [
    {
      id: 1,
      name: 'Voyager Propulsion Module',
      dryMass: 0.825,
      fuelMass: 0.45,
      maxFuelMass: 0.45,
      maxThrust: 8.0,
      isp: 330.0,
      burnRate: 0.02,
      ignited: true,
      separated: false
    }
  ];

  return {
    data,
    spacecraftInit: {
      position: vPos,
      velocity: vVel,
      stages: voyagerStages,
      primaryBodyIndex: 5, // Jupiter
      name: 'VOYAGER 1 (Deep Space)'
    }
  };
}

// 2. Rocket Launch & Orbital Insertion (Earth Pad to LEO)
export function generateRocketLaunchOrbital(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_Earth = 10000.0;
  const R_Earth = 45.0;

  // Central Earth
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_Earth;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Atmosphere & Satellite debris belt
  for (let i = 1; i < totalCount; i++) {
    const idx = i * 4;
    const isAtmosphere = i < totalCount * 0.4;

    if (isAtmosphere) {
      // Atmospheric cloud particles
      const r = R_Earth + randomUniform(0.5, 12.0);
      const theta = Math.acos(randomUniform(-1, 1));
      const phi = randomUniform(0, 2 * Math.PI);

      positions[idx + 0] = r * Math.sin(theta) * Math.cos(phi);
      positions[idx + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[idx + 2] = r * Math.cos(theta);
      positions[idx + 3] = 0.05;

      const vRot = Math.sqrt((G * M_Earth) / r) * 0.1; // slow atmospheric rotation
      velocities[idx + 0] = -vRot * Math.sin(phi);
      velocities[idx + 1] = 0;
      velocities[idx + 2] = vRot * Math.cos(phi);
      velocities[idx + 3] = ParticleType.GAS_DISC;
    } else {
      // LEO & GEO satellite orbital rings
      const r = R_Earth + randomUniform(20.0, 110.0);
      const angle = randomUniform(0, 2 * Math.PI);
      const vCirc = Math.sqrt((G * M_Earth) / r);

      positions[idx + 0] = r * Math.cos(angle);
      positions[idx + 1] = randomGaussian(0, 1.0);
      positions[idx + 2] = r * Math.sin(angle);
      positions[idx + 3] = 0.1;

      velocities[idx + 0] = -vCirc * Math.sin(angle);
      velocities[idx + 1] = randomGaussian(0, 0.02);
      velocities[idx + 2] = vCirc * Math.cos(angle);
      velocities[idx + 3] = ParticleType.DEBRIS;
    }
  }

  // Multi-Stage Rocket on Launch Pad at (0, R_Earth, 0)
  const padPos: [number, number, number] = [0, R_Earth + 0.5, 0];
  const padVel: [number, number, number] = [0, 0, 0];

  const heavyBoosterStages: RocketStage[] = [
    {
      id: 1,
      name: 'SuperHeavy Booster (9x Raptor)',
      dryMass: 35.0,
      fuelMass: 250.0,
      maxFuelMass: 250.0,
      maxThrust: 1400.0,
      isp: 330.0,
      burnRate: 1.8,
      ignited: true,
      separated: false
    },
    {
      id: 2,
      name: 'Orbital Starship Upper Stage',
      dryMass: 12.0,
      fuelMass: 75.0,
      maxFuelMass: 75.0,
      maxThrust: 320.0,
      isp: 380.0,
      burnRate: 0.55,
      ignited: false,
      separated: false
    },
    {
      id: 3,
      name: 'Payload Deployment Module',
      dryMass: 4.0,
      fuelMass: 18.0,
      maxFuelMass: 18.0,
      maxThrust: 50.0,
      isp: 410.0,
      burnRate: 0.12,
      ignited: false,
      separated: false
    }
  ];

  return {
    data,
    spacecraftInit: {
      position: padPos,
      velocity: padVel,
      stages: heavyBoosterStages,
      primaryBodyIndex: 0,
      name: 'FALCON PRIME (Launch Pad 39A)',
      isLaunchPad: true
    }
  };
}

// 3. Earth-to-Mars Hohmann Transfer Interplanetary Trajectory
export function generateEarthMarsHohmann(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_Sun = 15000.0;
  const r_Earth = 90.0;
  const r_Mars = 155.0;

  // Sun
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_Sun;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Earth
  const v_Earth = Math.sqrt((G * M_Sun) / r_Earth);
  positions[4] = r_Earth;
  positions[5] = 0;
  positions[6] = 0;
  positions[7] = 25.0;
  velocities[4] = 0;
  velocities[5] = 0;
  velocities[6] = v_Earth;
  velocities[7] = ParticleType.PLANET;

  // Mars (positioned at optimal phase angle ~44 deg ahead of Earth)
  const marsAngle = Math.PI * 0.44;
  const v_Mars = Math.sqrt((G * M_Sun) / r_Mars);
  positions[8] = r_Mars * Math.cos(marsAngle);
  positions[9] = 0;
  positions[10] = r_Mars * Math.sin(marsAngle);
  positions[11] = 12.0;
  velocities[8] = -v_Mars * Math.sin(marsAngle);
  velocities[9] = 0;
  velocities[10] = v_Mars * Math.cos(marsAngle);
  velocities[11] = ParticleType.PLANET;

  // Interplanetary Zodiacal Dust
  for (let i = 3; i < totalCount; i++) {
    const idx = i * 4;
    const r = randomUniform(40, 240);
    const angle = randomUniform(0, 2 * Math.PI);
    const vCirc = Math.sqrt((G * M_Sun) / r);

    positions[idx + 0] = r * Math.cos(angle);
    positions[idx + 1] = randomGaussian(0, 1.2);
    positions[idx + 2] = r * Math.sin(angle);
    positions[idx + 3] = 0.1;

    velocities[idx + 0] = -vCirc * Math.sin(angle);
    velocities[idx + 1] = randomGaussian(0, 0.02);
    velocities[idx + 2] = vCirc * Math.cos(angle);
    velocities[idx + 3] = ParticleType.DEBRIS;
  }

  // Spacecraft on Trans-Mars Injection Trajectory (Hohmann Transfer Periapsis)
  // Velocity calculated using Vis-Viva for transfer ellipse: a_tx = (r_Earth + r_Mars) / 2
  const a_tx = (r_Earth + r_Mars) / 2.0;
  const v_tx1 = Math.sqrt(M_Sun * (2.0 / r_Earth - 1.0 / a_tx));

  const scPos: [number, number, number] = [r_Earth, 0, 5.0];
  const scVel: [number, number, number] = [0, 0, v_tx1];

  const interStages: RocketStage[] = [
    {
      id: 1,
      name: 'Trans-Mars Injection Stage',
      dryMass: 10.0,
      fuelMass: 65.0,
      maxFuelMass: 65.0,
      maxThrust: 220.0,
      isp: 375.0,
      burnRate: 0.45,
      ignited: true,
      separated: false
    },
    {
      id: 2,
      name: 'Mars Aerocapture / Lander',
      dryMass: 5.0,
      fuelMass: 25.0,
      maxFuelMass: 25.0,
      maxThrust: 60.0,
      isp: 400.0,
      burnRate: 0.15,
      ignited: false,
      separated: false
    }
  ];

  return {
    data,
    spacecraftInit: {
      position: scPos,
      velocity: scVel,
      stages: interStages,
      primaryBodyIndex: 0, // Sun
      name: 'ARES-1 (Mars Transfer)'
    }
  };
}

// 4. Playable Flyable Spaceship in Earth Orbit
export function generatePlayableSpaceship(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_Earth = 10000.0;
  const R_Orbit = 90.0;

  // Earth
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_Earth;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  // Surrounding orbital debris / constellation
  for (let i = 1; i < totalCount; i++) {
    const idx = i * 4;
    const r = randomUniform(55, 180);
    const angle = randomUniform(0, 2 * Math.PI);
    const vCirc = Math.sqrt((G * M_Earth) / r);

    positions[idx + 0] = r * Math.cos(angle);
    positions[idx + 1] = randomGaussian(0, 2.0);
    positions[idx + 2] = r * Math.sin(angle);
    positions[idx + 3] = 0.1;

    velocities[idx + 0] = -vCirc * Math.sin(angle);
    velocities[idx + 1] = randomGaussian(0, 0.02);
    velocities[idx + 2] = vCirc * Math.cos(angle);
    velocities[idx + 3] = ParticleType.STAR;
  }

  // Spaceship in circular orbit
  const vOrb = Math.sqrt((G * M_Earth) / R_Orbit);
  const scPos: [number, number, number] = [R_Orbit, 0, 0];
  const scVel: [number, number, number] = [0, 0, vOrb];

  const flyableStages: RocketStage[] = [
    {
      id: 1,
      name: 'Orbital Maneuvering Vehicle',
      dryMass: 8.0,
      fuelMass: 60.0,
      maxFuelMass: 60.0,
      maxThrust: 180.0,
      isp: 360.0,
      burnRate: 0.35,
      ignited: true,
      separated: false
    }
  ];

  return {
    data,
    spacecraftInit: {
      position: scPos,
      velocity: scVel,
      stages: flyableStages,
      primaryBodyIndex: 0,
      name: 'ASTRA PRIME INTERCEPTOR'
    }
  };
}

// 5. Galaxy Collision (Milky Way & Andromeda Merger)
export function generateGalaxyCollision(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const count1 = Math.floor(totalCount * 0.55);
  const G = 1.0;
  const M_bh1 = 5000.0;
  const M_bh2 = 3500.0;

  const pos1 = [-160, 30, -30];
  const vel1 = [0.55, -0.18, 0.12];
  const r_disk1 = 120.0;

  const pos2 = [160, -30, 30];
  const vel2 = [-0.55, 0.18, -0.12];
  const r_disk2 = 90.0;

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
      positions[idx + 3] = 0.5;

      velocities[idx + 0] = vel1[0] + vx;
      velocities[idx + 1] = vel1[1] + vy;
      velocities[idx + 2] = vel1[2] + vz;
      velocities[idx + 3] = ParticleType.DARK_MATTER;
    } else {
      const r = Math.sqrt(Math.random()) * r_disk1 + 4.0;
      const armOffset = (Math.random() < 0.5 ? 0 : Math.PI) + (r / 25.0);
      const angle = randomUniform(0, 2 * Math.PI) * 0.3 + armOffset + randomGaussian(0, 0.15);
      
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      const y = randomGaussian(0, 1.8 * Math.exp(-r / r_disk1));

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

  for (let i = g2_start + 1; i < totalCount; i++) {
    const idx = i * 4;
    const r = Math.sqrt(Math.random()) * r_disk2 + 3.0;
    const armOffset = (Math.random() < 0.5 ? 0 : Math.PI) + (r / 20.0);
    const angle = randomUniform(0, 2 * Math.PI) * 0.35 + armOffset + randomGaussian(0, 0.18);

    let lx = r * Math.cos(angle);
    let lz = r * Math.sin(angle);
    let ly = randomGaussian(0, 1.4 * Math.exp(-r / r_disk2));

    const v_circ = Math.sqrt((G * M_bh2 + (r / r_disk2) * 2000.0) / (r + 3.0));
    let lvx = -v_circ * Math.sin(angle);
    let lvz = v_circ * Math.cos(angle);
    let lvy = randomGaussian(0, 0.05);

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

  return { data };
}

// 6. Accretion Disc & Tidal Disruption Event (TDE)
export function generateAccretionDiskTDE(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_BH = 15000.0;
  const discCount = Math.floor(totalCount * 0.85);

  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_BH;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

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

  return { data };
}

// 7. Sun-Jupiter Lagrange Points & Trojan Swarms (L4 / L5)
export function generateLagrangeTrojanPreset(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_sun = 10000.0;
  const M_jup = 250.0;
  const r_jup = 150.0;

  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_sun;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  const v_jup = Math.sqrt((G * (M_sun + M_jup)) / r_jup);
  positions[4] = r_jup;
  positions[5] = 0;
  positions[6] = 0;
  positions[7] = M_jup;
  velocities[4] = 0;
  velocities[5] = 0;
  velocities[6] = v_jup;
  velocities[7] = ParticleType.BLACK_HOLE;

  const trojanStart = 2;
  const remaining = totalCount - trojanStart;
  const l4Count = Math.floor(remaining * 0.45);
  const l5Count = Math.floor(remaining * 0.45);
  const beltCount = remaining - l4Count - l5Count;

  const l4_angle = Math.PI / 3.0;
  for (let i = 0; i < l4Count; i++) {
    const idx = (trojanStart + i) * 4;
    const dTheta = randomGaussian(0, 0.12);
    const dr = randomGaussian(0, 6.5);
    const curAngle = l4_angle + dTheta;
    const r = r_jup + dr;

    positions[idx + 0] = r * Math.cos(curAngle);
    positions[idx + 1] = randomGaussian(0, 3.0);
    positions[idx + 2] = r * Math.sin(curAngle);
    positions[idx + 3] = 0.2;

    const v_mag = Math.sqrt((G * M_sun) / r);
    velocities[idx + 0] = -v_mag * Math.sin(curAngle);
    velocities[idx + 1] = randomGaussian(0, 0.05);
    velocities[idx + 2] = v_mag * Math.cos(curAngle);
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  const l5_angle = -Math.PI / 3.0;
  for (let i = 0; i < l5Count; i++) {
    const idx = (trojanStart + l4Count + i) * 4;
    const dTheta = randomGaussian(0, 0.12);
    const dr = randomGaussian(0, 6.5);
    const curAngle = l5_angle + dTheta;
    const r = r_jup + dr;

    positions[idx + 0] = r * Math.cos(curAngle);
    positions[idx + 1] = randomGaussian(0, 3.0);
    positions[idx + 2] = r * Math.sin(curAngle);
    positions[idx + 3] = 0.2;

    const v_mag = Math.sqrt((G * M_sun) / r);
    velocities[idx + 0] = -v_mag * Math.sin(curAngle);
    velocities[idx + 1] = randomGaussian(0, 0.05);
    velocities[idx + 2] = v_mag * Math.cos(curAngle);
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  for (let i = 0; i < beltCount; i++) {
    const idx = (trojanStart + l4Count + l5Count + i) * 4;
    const r = randomUniform(115, 135);
    const angle = randomUniform(0, 2 * Math.PI);

    positions[idx + 0] = r * Math.cos(angle);
    positions[idx + 1] = randomGaussian(0, 2.0);
    positions[idx + 2] = r * Math.sin(angle);
    positions[idx + 3] = 0.15;

    const v_mag = Math.sqrt((G * M_sun) / r);
    velocities[idx + 0] = -v_mag * Math.sin(angle);
    velocities[idx + 1] = randomGaussian(0, 0.03);
    velocities[idx + 2] = v_mag * Math.cos(angle);
    velocities[idx + 3] = ParticleType.DEBRIS;
  }

  return { data };
}

// 8. 3-Body Figure-8 Choreography
export function generateFigure8Preset(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const m3 = 3000.0;
  const scale = 70.0;

  const x1 = 0.97000436 * scale;
  const y1 = -0.24308753 * scale;
  const v_scale = Math.sqrt((G * m3) / scale);

  const vx3 = -0.93240737 * v_scale;
  const vy3 = -0.86473146 * v_scale;
  const vx1 = -vx3 * 0.5;
  const vy1 = -vy3 * 0.5;

  positions[0] = x1;
  positions[1] = y1;
  positions[2] = 0;
  positions[3] = m3;
  velocities[0] = vx1;
  velocities[1] = vy1;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

  positions[4] = -x1;
  positions[5] = -y1;
  positions[6] = 0;
  positions[7] = m3;
  velocities[4] = vx1;
  velocities[5] = vy1;
  velocities[6] = 0;
  velocities[7] = ParticleType.BLACK_HOLE;

  positions[8] = 0;
  positions[9] = 0;
  positions[10] = 0;
  positions[11] = m3;
  velocities[8] = vx3;
  velocities[9] = vy3;
  velocities[10] = 0;
  velocities[11] = ParticleType.BLACK_HOLE;

  for (let i = 3; i < totalCount; i++) {
    const idx = i * 4;
    const r = randomUniform(scale * 1.5, scale * 3.5);
    const angle = randomUniform(0, 2 * Math.PI);
    const v_circ = Math.sqrt((G * 3.0 * m3) / r);

    positions[idx + 0] = r * Math.cos(angle);
    positions[idx + 1] = r * Math.sin(angle);
    positions[idx + 2] = randomGaussian(0, 4.0);
    positions[idx + 3] = 0.1;

    velocities[idx + 0] = -v_circ * Math.sin(angle);
    velocities[idx + 1] = v_circ * Math.cos(angle);
    velocities[idx + 2] = randomGaussian(0, 0.05);
    velocities[idx + 3] = ParticleType.TRACER_TROJAN;
  }

  return { data };
}

// 9. Globular Cluster Core Collapse
export function generateGlobularCluster(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_tot = 8000.0;
  const a = 35.0;

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

  return { data };
}

// 10. Saturnian Rings & Shepherd Moons
export function generateSaturnianRings(totalCount: number) {
  const data = createParticleArrays(totalCount);
  const { positions, velocities } = data;

  const G = 1.0;
  const M_planet = 12000.0;

  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = M_planet;
  velocities[0] = 0;
  velocities[1] = 0;
  velocities[2] = 0;
  velocities[3] = ParticleType.BLACK_HOLE;

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

  return { data };
}

export const PRESETS: PresetConfig[] = [
  {
    id: 'solar_system_voyager',
    name: 'Real Solar System & Voyager Slingshot',
    category: 'Interplanetary Astrodynamics',
    description: 'Precision Sun-Planets-Moons system with Voyager 1 executing a high-speed gravity assist slingshot past Jupiter and Saturn into deep space.',
    defaultParticles: 50000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.04,
    cameraDistance: 420,
    cameraMode: CameraViewMode.CHASE_SPACECRAFT,
    hasSpacecraft: true,
    generate: generateSolarSystemVoyager
  },
  {
    id: 'rocket_launch_orbital',
    name: 'Multi-Stage Rocket Launch & Orbital Insertion',
    category: 'Spaceflight Vehicle Physics',
    description: 'Launch pad liftoff with 3-stage heavy rocket, atmospheric drag, Max-Q aerodynamic pressure, gravity turn pitch guidance, and circularization.',
    defaultParticles: 40000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.03,
    cameraDistance: 120,
    cameraMode: CameraViewMode.CHASE_SPACECRAFT,
    hasSpacecraft: true,
    generate: generateRocketLaunchOrbital
  },
  {
    id: 'earth_mars_hohmann',
    name: 'Earth-to-Mars Hohmann Transfer Orbit',
    category: 'Orbital Transfers',
    description: 'Interplanetary Hohmann transfer trajectory with Trans-Mars Injection (TMI) burn vectors, heliocentric transfer ellipse, and orbital capture.',
    defaultParticles: 40000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.04,
    cameraDistance: 380,
    cameraMode: CameraViewMode.CHASE_SPACECRAFT,
    hasSpacecraft: true,
    generate: generateEarthMarsHohmann
  },
  {
    id: 'playable_spaceship_orbit',
    name: 'Playable Orbital Spacecraft (6-DoF Flight)',
    category: 'Spaceflight Vehicle Physics',
    description: 'Flyable spacecraft in closed Earth orbit with active WASD RCS attitude thrusters, throttle burns, prograde guidance, and Delta-V tracker.',
    defaultParticles: 50000,
    recommendedTheta: 0.5,
    defaultG: 1.0,
    defaultDt: 0.04,
    cameraDistance: 220,
    cameraMode: CameraViewMode.CHASE_SPACECRAFT,
    hasSpacecraft: true,
    generate: generatePlayableSpaceship
  },
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
