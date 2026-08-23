export const bvhBuildShader = /* wgsl */ `
struct BVHUniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

struct BVHNode {
  com_mass: vec4<f32>,       // Center of mass (xyz) + total mass (w)
  bounds_radius: vec4<f32>,  // Half-extent (xyz) + bounding sphere radius (w)
  children_meta: vec4<u32>,  // leftChild, rightChild, parent, isLeaf (1=leaf, 0=internal)
};

@group(0) @binding(0) var<uniform> uniforms: BVHUniforms;
@group(0) @binding(1) var<storage, read> sortedKeys: array<u32>;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(3) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> internalNodes: array<BVHNode>;
@group(0) @binding(5) var<storage, read_write> leafNodes: array<BVHNode>;
@group(0) @binding(6) var<storage, read_write> leafParents: array<u32>;
@group(0) @binding(7) var<storage, read_write> nodeVisited: array<atomic<u32>>;

// Bit manipulation for Longest Common Prefix (LCP)
fn delta(i: i32, j: i32, count: i32) -> i32 {
  if (j < 0 || j >= count) {
    return -1;
  }
  let key_i = sortedKeys[u32(i)];
  let key_j = sortedKeys[u32(j)];

  if (key_i != key_j) {
    return i32(countLeadingZeros(key_i ^ key_j));
  }
  // If keys are identical, use indices to disambiguate
  return 32 + i32(countLeadingZeros(u32(i) ^ u32(j)));
}

// Pass 1: Construct BVH Hierarchy Topology (Karras 2012)
@compute @workgroup_size(256)
fn build_topology(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = i32(global_id.x);
  let count = i32(uniforms.count);

  if (i >= count - 1 || count < 2) {
    return;
  }

  // 1. Determine direction of range (+1 or -1)
  let d_prev = delta(i, i - 1, count);
  let d_next = delta(i, i + 1, count);
  let d = select(-1, 1, d_next >= d_prev);

  // 2. Compute minimum prefix length
  let min_delta = delta(i, i - d, count);

  // 3. Search for other end of range
  var l_max = 2;
  while (delta(i, i + l_max * d, count) > min_delta) {
    l_max <<= 1;
  }

  var l = 0;
  var t = l_max >> 1;
  while (t > 0) {
    if (delta(i, i + (l + t) * d, count) > min_delta) {
      l += t;
    }
    t >>= 1;
  }
  let j = i + l * d;

  // 4. Find split position
  let node_delta = delta(i, j, count);
  var s = 0;
  var step = l;
  loop {
    step = (step + 1) >> 1;
    if (delta(i, i + (s + step) * d, count) > node_delta) {
      s += step;
    }
    if (step <= 1) {
      break;
    }
  }
  let gamma = i + s * d + min(d, 0);

  // 5. Output children
  let first = min(i, j);
  let last = max(i, j);

  var left_child: u32 = 0u;
  var right_child: u32 = 0u;

  // Left child
  if (first == gamma) {
    left_child = u32(gamma) | 0x80000000u; // Leaf flag MSB
    leafParents[gamma] = u32(i);
  } else {
    left_child = u32(gamma);
    internalNodes[gamma].children_meta.z = u32(i); // set parent
  }

  // Right child
  if (last == gamma + 1) {
    right_child = u32(gamma + 1) | 0x80000000u; // Leaf flag MSB
    leafParents[gamma + 1] = u32(i);
  } else {
    right_child = u32(gamma + 1);
    internalNodes[gamma + 1].children_meta.z = u32(i); // set parent
  }

  internalNodes[u32(i)].children_meta = vec4<u32>(left_child, right_child, 0u, 0u);
}

// Pass 2: Initialize Leaf Nodes
@compute @workgroup_size(256)
fn init_leaves(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= uniforms.count) {
    return;
  }

  let original_idx = sortedIndices[idx];
  let p_data = posMass[original_idx];

  var leaf: BVHNode;
  leaf.com_mass = p_data; // xyz = pos, w = mass
  leaf.bounds_radius = vec4<f32>(0.1, 0.1, 0.1, 0.1);
  leaf.children_meta = vec4<u32>(original_idx, 0u, leafParents[idx], 1u);

  leafNodes[idx] = leaf;
  if (idx < uniforms.count - 1u) {
    atomicStore(&nodeVisited[idx], 0u);
  }
}

// Pass 3: Bottom-up Multipole Aggregation (Mass & Center of Mass)
@compute @workgroup_size(256)
fn aggregate_multipoles(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let leaf_idx = global_id.x;
  let count = uniforms.count;
  if (leaf_idx >= count || count < 2u) {
    return;
  }

  var curr = leafParents[leaf_idx];

  while (true) {
    let visited = atomicAdd(&nodeVisited[curr], 1u);
    // If we are the first thread to arrive at node curr, terminate.
    if (visited == 0u) {
      return;
    }

    // Both children are ready! Aggregate multipole data.
    let left_id = internalNodes[curr].children_meta.x;
    let right_id = internalNodes[curr].children_meta.y;

    var left_com = vec3<f32>(0.0);
    var left_mass = 0.0;
    var left_radius = 0.0;

    if ((left_id & 0x80000000u) != 0u) {
      let l_leaf = left_id & 0x7FFFFFFFu;
      left_com = leafNodes[l_leaf].com_mass.xyz;
      left_mass = leafNodes[l_leaf].com_mass.w;
      left_radius = leafNodes[l_leaf].bounds_radius.w;
    } else {
      left_com = internalNodes[left_id].com_mass.xyz;
      left_mass = internalNodes[left_id].com_mass.w;
      left_radius = internalNodes[left_id].bounds_radius.w;
    }

    var right_com = vec3<f32>(0.0);
    var right_mass = 0.0;
    var right_radius = 0.0;

    if ((right_id & 0x80000000u) != 0u) {
      let r_leaf = right_id & 0x7FFFFFFFu;
      right_com = leafNodes[r_leaf].com_mass.xyz;
      right_mass = leafNodes[r_leaf].com_mass.w;
      right_radius = leafNodes[r_leaf].bounds_radius.w;
    } else {
      right_com = internalNodes[right_id].com_mass.xyz;
      right_mass = internalNodes[right_id].com_mass.w;
      right_radius = internalNodes[right_id].bounds_radius.w;
    }

    let total_mass = left_mass + right_mass;
    let safe_mass = max(total_mass, 1e-8);
    let com = (left_com * left_mass + right_com * right_mass) / safe_mass;

    let d_left = length(com - left_com) + left_radius;
    let d_right = length(com - right_com) + right_radius;
    let radius = max(d_left, d_right);

    internalNodes[curr].com_mass = vec4<f32>(com, total_mass);
    internalNodes[curr].bounds_radius = vec4<f32>(radius, radius, radius, radius);

    // If we have reached root (internal node 0), stop
    if (curr == 0u) {
      break;
    }

    curr = internalNodes[curr].children_meta.z;
  }
}
`;
