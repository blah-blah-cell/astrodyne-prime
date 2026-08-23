export const collisionShader = /* wgsl */ `
struct CollisionUniforms {
  count: u32,
  mergeRadiusSq: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: CollisionUniforms;
@group(0) @binding(1) var<storage, read_write> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velType: array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  let count = uniforms.count;
  if (idx >= count) {
    return;
  }

  let p1 = posMass[idx];
  let m1 = p1.w;
  if (m1 <= 0.0) {
    return;
  }

  let v1 = velType[idx];
  let mergeR2 = uniforms.mergeRadiusSq;

  // Check against other particles (focus on heavy bodies or local window)
  // For high performance, we check against heavy bodies (type == 3 / mass > threshold)
  // and local neighboring indices
  let check_range = min(32u, count);

  for (var k = 1u; k <= check_range; k++) {
    let other_idx = (idx + k) % count;
    let p2 = posMass[other_idx];
    let m2 = p2.w;

    if (m2 > 0.0) {
      let diff = p2.xyz - p1.xyz;
      let distSq = dot(diff, diff);

      if (distSq < mergeR2 && distSq > 0.00001) {
        // Inelastic merge into the more massive particle
        if (m1 >= m2) {
          let totalMass = m1 + m2;
          let newVel = (v1.xyz * m1 + velType[other_idx].xyz * m2) / totalMass;
          
          posMass[idx].w = totalMass;
          velType[idx] = vec4<f32>(newVel, v1.w);

          // Deactivate smaller particle
          posMass[other_idx] = vec4<f32>(1e10, 1e10, 1e10, 0.0);
          velType[other_idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
      }
    }
  }
}
`;
