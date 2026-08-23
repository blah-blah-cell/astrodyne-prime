export const directForceShader = /* wgsl */ `
struct SimulationUniforms {
  count: u32,
  gravityG: f32,
  softeningSq: f32,
  theta: f32,
  mouseTool: u32,       // 0: none, 1: attractor, 2: repulsor
  mouseStrength: f32,
  pad0: f32,
  pad1: f32,
  mousePos: vec4<f32>,  // xyz = pos, w = active
};

@group(0) @binding(0) var<uniform> uniforms: SimulationUniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> accelerations: array<vec4<f32>>;

var<workgroup> tile_pos: array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>
) {
  let idx = global_id.x;
  let lid = local_id.x;
  let count = uniforms.count;

  var my_pos = vec3<f32>(0.0);
  var my_mass: f32 = 0.0;
  if (idx < count) {
    let p_data = posMass[idx];
    my_pos = p_data.xyz;
    my_mass = p_data.w;
  }

  var accel = vec3<f32>(0.0);
  var potential: f32 = 0.0;
  let G = uniforms.gravityG;
  let epsSq = uniforms.softeningSq;

  let numTiles = (count + 255u) / 256u;

  for (var t = 0u; t < numTiles; t++) {
    let load_idx = t * 256u + lid;
    if (load_idx < count) {
      tile_pos[lid] = posMass[load_idx];
    } else {
      tile_pos[lid] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    workgroupBarrier();

    if (idx < count && my_mass > 0.0) {
      for (var j = 0u; j < 256u; j++) {
        let other_idx = t * 256u + j;
        let other_data = tile_pos[j];
        let other_mass = other_data.w;

        if (other_idx != idx && other_mass > 0.0) {
          let r_diff = other_data.xyz - my_pos;
          let distSq = dot(r_diff, r_diff) + epsSq;
          let invDist = inverseSqrt(distSq);
          let invDist3 = invDist * invDist * invDist;
          let f = G * other_mass * invDist3;
          accel += r_diff * f;
          potential -= G * other_mass * invDist;
        }
      }
    }
    workgroupBarrier();
  }

  // Mouse interaction
  if (idx < count && my_mass > 0.0 && uniforms.mousePos.w > 0.5) {
    let mouse_r = uniforms.mousePos.xyz - my_pos;
    let mDistSq = dot(mouse_r, mouse_r) + 25.0;
    let mInvDist = inverseSqrt(mDistSq);
    let mInvDist3 = mInvDist * mInvDist * mInvDist;
    var sign: f32 = 1.0;
    if (uniforms.mouseTool == 2u) {
      sign = -1.0;
    }
    let mForce = sign * uniforms.mouseStrength * mInvDist3;
    accel += mouse_r * mForce;
  }

  if (idx < count) {
    accelerations[idx] = vec4<f32>(accel, potential);
  }
}
`;
