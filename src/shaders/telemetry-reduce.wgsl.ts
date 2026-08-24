export const telemetryReduceShader = /* wgsl */ `
struct TelemetryUniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

// Layout of summary result buffer (16 floats):
// [0] Total Mass
// [1] Total Kinetic Energy
// [2] Total Potential Energy
// [3] Total Energy (T + V)
// [4..6] Angular Momentum L (x, y, z)
// [7] Angular Momentum Magnitude |L|
// [8..10] Center of Mass (x, y, z)
// [11] Active particle count
// [12..15] reserved / padding

@group(0) @binding(0) var<uniform> uniforms: TelemetryUniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velType: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> accelerations: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> telemetryOut: array<f32, 16>;

var<workgroup> wg_mass: array<f32, 256>;
var<workgroup> wg_ke: array<f32, 256>;
var<workgroup> wg_pe: array<f32, 256>;
var<workgroup> wg_lx: array<f32, 256>;
var<workgroup> wg_ly: array<f32, 256>;
var<workgroup> wg_lz: array<f32, 256>;
var<workgroup> wg_com_x: array<f32, 256>;
var<workgroup> wg_com_y: array<f32, 256>;
var<workgroup> wg_com_z: array<f32, 256>;
var<workgroup> wg_active: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  let lid = local_id.x;
  let count = uniforms.count;

  var my_mass: f32 = 0.0;
  var my_ke: f32 = 0.0;
  var my_pe: f32 = 0.0;
  var my_L = vec3<f32>(0.0);
  var my_com = vec3<f32>(0.0);
  var my_active: f32 = 0.0;

  // Stride loop across particles
  var idx = global_id.x;
  // One workgroup performs a strided reduction across the complete buffer.
  // The previous 16,384 stride sampled only 256 particles out of each block.
  let stride = 256u;

  while (idx < count) {
    let p = posMass[idx];
    let m = p.w;

    if (m > 0.0) {
      let v = velType[idx].xyz;
      let phi = accelerations[idx].w; // Local potential

      my_mass += m;
      my_ke += 0.5 * m * dot(v, v);
      my_pe += 0.5 * m * phi; // 1/2 factor for pair potential
      
      let L = cross(p.xyz, v) * m;
      my_L += L;
      my_com += p.xyz * m;
      my_active += 1.0;
    }

    idx += stride;
  }

  wg_mass[lid] = my_mass;
  wg_ke[lid] = my_ke;
  wg_pe[lid] = my_pe;
  wg_lx[lid] = my_L.x;
  wg_ly[lid] = my_L.y;
  wg_lz[lid] = my_L.z;
  wg_com_x[lid] = my_com.x;
  wg_com_y[lid] = my_com.y;
  wg_com_z[lid] = my_com.z;
  wg_active[lid] = my_active;

  workgroupBarrier();

  // Workgroup reduction tree
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (lid < s) {
      wg_mass[lid] += wg_mass[lid + s];
      wg_ke[lid] += wg_ke[lid + s];
      wg_pe[lid] += wg_pe[lid + s];
      wg_lx[lid] += wg_lx[lid + s];
      wg_ly[lid] += wg_ly[lid + s];
      wg_lz[lid] += wg_lz[lid + s];
      wg_com_x[lid] += wg_com_x[lid + s];
      wg_com_y[lid] += wg_com_y[lid + s];
      wg_com_z[lid] += wg_com_z[lid + s];
      wg_active[lid] += wg_active[lid + s];
    }
    workgroupBarrier();
  }

  if (lid == 0u) {
    let tot_mass = max(wg_mass[0], 1e-6);
    let com = vec3<f32>(wg_com_x[0], wg_com_y[0], wg_com_z[0]) / tot_mass;
    let L_tot = vec3<f32>(wg_lx[0], wg_ly[0], wg_lz[0]);
    let L_mag = length(L_tot);
    let total_E = wg_ke[0] + wg_pe[0];

    telemetryOut[0] = wg_mass[0];
    telemetryOut[1] = wg_ke[0];
    telemetryOut[2] = wg_pe[0];
    telemetryOut[3] = total_E;
    telemetryOut[4] = L_tot.x;
    telemetryOut[5] = L_tot.y;
    telemetryOut[6] = L_tot.z;
    telemetryOut[7] = L_mag;
    telemetryOut[8] = com.x;
    telemetryOut[9] = com.y;
    telemetryOut[10] = com.z;
    telemetryOut[11] = wg_active[0];
  }
}
`;
