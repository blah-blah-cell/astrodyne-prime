export const mortonShader = /* wgsl */ `
struct Uniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  minBound: vec4<f32>,
  maxBound: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> mortonKeys: array<u32>;
@group(0) @binding(3) var<storage, read_write> particleIndices: array<u32>;

fn expand_bits_10(v_in: u32) -> u32 {
  var v = v_in & 0x000003ffu;
  v = (v | (v << 16u)) & 0x030000ffu;
  v = (v | (v << 8u))  & 0x0300f00fu;
  v = (v | (v << 4u))  & 0x030c30c3u;
  v = (v | (v << 2u))  & 0x09249249u;
  return v;
}

fn compute_morton_3d(norm_pos: vec3<f32>) -> u32 {
  let clamped = clamp(norm_pos, vec3<f32>(0.0), vec3<f32>(0.999999));
  let ux = u32(clamped.x * 1024.0);
  let uy = u32(clamped.y * 1024.0);
  let uz = u32(clamped.z * 1024.0);
  let xx = expand_bits_10(ux);
  let yy = expand_bits_10(uy);
  let zz = expand_bits_10(uz);
  return (xx << 2u) | (yy << 1u) | zz;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= uniforms.count) {
    return;
  }

  let pos = posMass[idx].xyz;
  let extent = uniforms.maxBound.xyz - uniforms.minBound.xyz;
  let safe_extent = max(extent, vec3<f32>(0.0001));
  let norm_pos = (pos - uniforms.minBound.xyz) / safe_extent;

  let key = compute_morton_3d(norm_pos);
  mortonKeys[idx] = key;
  particleIndices[idx] = idx;
}
`;

export const boundReductionShader = /* wgsl */ `
struct Uniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

struct BoundsResult {
  minBound: vec4<f32>,
  maxBound: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> boundsOut: BoundsResult;

var<workgroup> wg_min: array<vec3<f32>, 256>;
var<workgroup> wg_max: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  let lid = local_id.x;
  let gid = global_id.x;

  var my_min = vec3<f32>(1e20);
  var my_max = vec3<f32>(-1e20);

  // Stride loop across particles
  var idx = gid;
  while (idx < uniforms.count) {
    let p = posMass[idx].xyz;
    my_min = min(my_min, p);
    my_max = max(my_max, p);
    idx += 256u * 64u; // stride
  }

  wg_min[lid] = my_min;
  wg_max[lid] = my_max;
  workgroupBarrier();

  // Parallel reduction in workgroup
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (lid < s) {
      wg_min[lid] = min(wg_min[lid], wg_min[lid + s]);
      wg_max[lid] = max(wg_max[lid], wg_max[lid + s]);
    }
    workgroupBarrier();
  }

  if (lid == 0u) {
    // Add small margin to prevent zero extent
    let margin = max((wg_max[0] - wg_min[0]) * 0.02, vec3<f32>(1.0));
    boundsOut.minBound = vec4<f32>(wg_min[0] - margin, 0.0);
    boundsOut.maxBound = vec4<f32>(wg_max[0] + margin, 0.0);
  }
}
`;
