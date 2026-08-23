export const bitonicSortShader = /* wgsl */ `
struct SortUniforms {
  count: u32,
  k: u32,       // Current stage length (e.g. 2, 4, 8, 16...)
  j: u32,       // Substage distance (e.g. k/2, k/4... down to 1)
  pad0: u32,
};

@group(0) @binding(0) var<uniform> uniforms: SortUniforms;
@group(0) @binding(1) var<storage, read_write> keys: array<u32>;
@group(0) @binding(2) var<storage, read_write> values: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  let count = uniforms.count;
  let k = uniforms.k;
  let j = uniforms.j;

  let l = i ^ j;

  if (l > i) {
    let key_i = select(0xFFFFFFFFu, keys[i], i < count);
    let key_l = select(0xFFFFFFFFu, keys[l], l < count);

    let ascending = ((i & k) == 0u);

    let should_swap = select(key_i < key_l, key_i > key_l, ascending);

    if (should_swap) {
      if (i < count && l < count) {
        let temp_k = keys[i];
        keys[i] = keys[l];
        keys[l] = temp_k;

        let temp_v = values[i];
        values[i] = values[l];
        values[l] = temp_v;
      }
    }
  }
}
`;

export const bitonicLocalSortShader = /* wgsl */ `
struct LocalSortUniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

@group(0) @binding(0) var<uniform> uniforms: LocalSortUniforms;
@group(0) @binding(1) var<storage, read_write> keys: array<u32>;
@group(0) @binding(2) var<storage, read_write> values: array<u32>;

var<workgroup> shared_keys: array<u32, 512>;
var<workgroup> shared_values: array<u32, 512>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  let t = local_id.x;
  let offset = group_id.x * 512u;
  let idx0 = offset + t;
  let idx1 = offset + t + 256u;
  let count = uniforms.count;

  // Load into shared memory
  shared_keys[t] = select(0xFFFFFFFFu, keys[idx0], idx0 < count);
  shared_values[t] = select(idx0, values[idx0], idx0 < count);
  shared_keys[t + 256u] = select(0xFFFFFFFFu, keys[idx1], idx1 < count);
  shared_values[t + 256u] = select(idx1, values[idx1], idx1 < count);

  workgroupBarrier();

  // Local bitonic sort for lengths up to 512
  for (var k = 2u; k <= 512u; k <<= 1u) {
    for (var j = k >> 1u; j > 0u; j >>= 1u) {
      let l0 = t ^ j;
      if (l0 > t) {
        let ascending0 = ((t & k) == 0u);
        let key_a = shared_keys[t];
        let key_b = shared_keys[l0];
        let swap0 = select(key_a < key_b, key_a > key_b, ascending0);
        if (swap0) {
          shared_keys[t] = key_b;
          shared_keys[l0] = key_a;
          let val_a = shared_values[t];
          let val_b = shared_values[l0];
          shared_values[t] = val_b;
          shared_values[l0] = val_a;
        }
      }

      let t2 = t + 256u;
      let l1 = t2 ^ j;
      if (l1 > t2) {
        let ascending1 = ((t2 & k) == 0u);
        let key_a = shared_keys[t2];
        let key_b = shared_keys[l1];
        let swap1 = select(key_a < key_b, key_a > key_b, ascending1);
        if (swap1) {
          shared_keys[t2] = key_b;
          shared_keys[l1] = key_a;
          let val_a = shared_values[t2];
          let val_b = shared_values[l1];
          shared_values[t2] = val_b;
          shared_values[l1] = val_a;
        }
      }
      workgroupBarrier();
    }
  }

  // Write back sorted local block
  if (idx0 < count) {
    keys[idx0] = shared_keys[t];
    values[idx0] = shared_values[t];
  }
  if (idx1 < count) {
    keys[idx1] = shared_keys[t + 256u];
    values[idx1] = shared_values[t + 256u];
  }
}
`;
