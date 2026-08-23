export const integrateShader = /* wgsl */ `
struct IntegrateUniforms {
  count: u32,
  dt: f32,
  damping: f32,
  enableRelativity: u32,
  substepType: u32, // 0: Verlet Kick-Drift, 1: Verlet Kick-Final, 2: Yoshida Stage
  c_coeff: f32,     // For Yoshida drift
  d_coeff: f32,     // For Yoshida kick
  pad0: f32,
};

@group(0) @binding(0) var<uniform> uniforms: IntegrateUniforms;
@group(0) @binding(1) var<storage, read_write> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velType: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> accelerations: array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= uniforms.count) {
    return;
  }

  var p = posMass[idx];
  var v = velType[idx];
  let a_data = accelerations[idx];

  // Inactive particle
  if (p.w <= 0.0) {
    return;
  }

  var accel = a_data.xyz;

  // Optional Post-Newtonian Relativistic Precession correction
  if (uniforms.enableRelativity == 1u) {
    let r_sq = dot(p.xyz, p.xyz);
    let r = sqrt(r_sq);
    if (r > 1.0) {
      let L = cross(p.xyz, v.xyz);
      let L_sq = dot(L, L);
      let c_light_sq = 90000.0; // Scaled speed of light
      let a_pn = (3.0 * L_sq) / (c_light_sq * r_sq * r_sq * r);
      accel += -normalize(p.xyz) * a_pn;
    }
  }

  let dt = uniforms.dt;
  let damping_factor = max(1.0 - uniforms.damping * dt, 0.0);

  if (uniforms.substepType == 0u) {
    // Verlet Kick 1 & Drift:
    // v += a * (dt * 0.5)
    // x += v * dt
    v.x += accel.x * (dt * 0.5);
    v.y += accel.y * (dt * 0.5);
    v.z += accel.z * (dt * 0.5);

    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
  } else if (uniforms.substepType == 1u) {
    // Verlet Kick 2:
    // v += a * (dt * 0.5)
    v.x += accel.x * (dt * 0.5);
    v.y += accel.y * (dt * 0.5);
    v.z += accel.z * (dt * 0.5);

    // Apply damping
    v.x *= damping_factor;
    v.y *= damping_factor;
    v.z *= damping_factor;
  } else if (uniforms.substepType == 2u) {
    // Yoshida 4th-Order Stage:
    // v += d_i * a * dt
    // x += c_i * v * dt
    v.x += uniforms.d_coeff * accel.x * dt;
    v.y += uniforms.d_coeff * accel.y * dt;
    v.z += uniforms.d_coeff * accel.z * dt;

    p.x += uniforms.c_coeff * v.x * dt;
    p.y += uniforms.c_coeff * v.y * dt;
    p.z += uniforms.c_coeff * v.z * dt;

    v.x *= damping_factor;
    v.y *= damping_factor;
    v.z *= damping_factor;
  }

  posMass[idx] = p;
  velType[idx] = v;
}
`;
