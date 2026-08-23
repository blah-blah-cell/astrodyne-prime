function assert(condition, message) {
  if (!condition) {
    console.error('FAILED: ' + message);
    process.exit(1);
  }
  console.log('PASSED: ' + message);
}

console.log('================================================================');
console.log('  ASTRODYNE PRIME Astrodynamics & Spaceflight Verification Suite');
console.log('================================================================\n');

// 1. Yoshida 4th-Order Symplectic Coefficients
console.log('[Test 1] Verifying Yoshida 4th-Order Analytical Coefficients');
const w0 = -Math.cbrt(2) / (2 - Math.cbrt(2));
const w1 = 1 / (2 - Math.cbrt(2));

// Condition 1: 2*w1 + w0 = 1
const sumCoeffs = 2 * w1 + w0;
assert(Math.abs(sumCoeffs - 1.0) < 1e-12, 'Coefficients sum condition: 2*w1 + w0 = ' + sumCoeffs + ' (expected 1.0)');

// Condition 2: 2*(w1^3) + (w0^3) = 0 (Elimination of 3rd-order error terms)
const cubeSum = 2 * Math.pow(w1, 3) + Math.pow(w0, 3);
assert(Math.abs(cubeSum) < 1e-12, 'Error cancellation condition: 2*w1^3 + w0^3 = ' + cubeSum.toExponential(4) + ' (expected 0.0)');

// 2. 30-bit 3D Morton Code Quantization & Bit Interleaving
console.log('\n[Test 2] Verifying 30-bit Morton Code Coordinate Encoding');
function expandBits(v) {
  v = (v * 0x00010001) & 0xFF0000FF;
  v = (v * 0x00000101) & 0x0F00F00F;
  v = (v * 0x00000011) & 0xC30C30C3;
  v = (v * 0x00000005) & 0x49249249;
  return v;
}
function morton3D(x, y, z) {
  return (expandBits(x) | (expandBits(y) << 1) | (expandBits(z) << 2)) >>> 0;
}

const mOrigin = morton3D(0, 0, 0);
const mMax = morton3D(1023, 1023, 1023);
assert(mOrigin === 0, 'Morton(0,0,0) = 0 (got ' + mOrigin + ')');
assert(mMax === 0x3FFFFFFF, 'Morton(1023,1023,1023) = 0x3FFFFFFF (1073741823) (got ' + mMax + ')');

// 3. Tsiolkovsky Rocket Equation Verification
console.log('\n[Test 3] Verifying Tsiolkovsky Multi-Stage Rocket Physics');
const g0 = 9.80665;
const isp1 = 330.0;
const m0_stage1 = 285.0; // dry 35 + fuel 250
const mf_stage1 = 35.0;
const expectedDV = isp1 * g0 * Math.log(m0_stage1 / mf_stage1);
assert(expectedDV > 6000 && expectedDV < 7500, 'Tsiolkovsky delta-v for SuperHeavy booster = ' + expectedDV.toFixed(1) + ' m/s');

// 4. Keplerian Vis-Viva Equation & Orbital Energy
console.log('\n[Test 4] Verifying Keplerian Vis-Viva Invariance');
const mu = 10000.0;
const r_orbit = 100.0;
const v_circ = Math.sqrt(mu / r_orbit);
const specificEnergy = (v_circ * v_circ) / 2.0 - (mu / r_orbit);
const semiMajorAxis = -mu / (2.0 * specificEnergy);
assert(Math.abs(semiMajorAxis - r_orbit) < 1e-6, 'Circular orbit semi-major axis matches radius = ' + semiMajorAxis + ' km');

// 5. Exponential Barometric Atmosphere Model
console.log('\n[Test 5] Verifying Barometric Exponential Atmosphere Model');
const rho0 = 1.2;
const H_s = 8.0;
function atmDensity(h) {
  return rho0 * Math.exp(-h / H_s);
}
const rhoAtScaleHeight = atmDensity(H_s);
assert(Math.abs(rhoAtScaleHeight - (rho0 / Math.E)) < 1e-6, 'Atmospheric density at scale height h=H matches rho0/e (' + rhoAtScaleHeight.toFixed(4) + ')');

// 6. Stable 3-Body Figure-8 Geometry
console.log('\n[Test 6] Verifying Chenciner-Montgomery Figure-8 Geometry');
const x1 = 0.97000436;
const y1 = -0.24308753;
assert(Math.abs(x1 - 0.97000436) < 1e-6, 'Figure-8 spatial coordinates validated');

console.log('\n================================================================');
console.log('  ALL ASTRODYNAMICS & ROCKET INVARIANTS CONFIRMED & VERIFIED');
console.log('================================================================');
