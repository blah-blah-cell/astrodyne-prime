export const barnesHutShader = /* wgsl */ `
struct SimulationUniforms {
  count: u32,
  gravityG: f32,
  softeningSq: f32,
  theta: f32,
  mouseTool: u32,       // 0: none, 1: attractor, 2: repulsor
  mouseStrength: f32,
  pad0: f32,
  pad1: f32,
  mousePos: vec4<f32>,  // xyz = pos, w = active (1.0 or 0.0)
};

struct BVHNode {
  com_mass: vec4<f32>,       // Center of mass (xyz) + total mass (w)
  bounds_radius: vec4<f32>,  // Half-extent (xyz) + bounding sphere radius (w)
  children_meta: vec4<u32>,  // leftChild, rightChild, parent, isLeaf
};

@group(0) @binding(0) var<uniform> uniforms: SimulationUniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> internalNodes: array<BVHNode>;
@group(0) @binding(3) var<storage, read> leafNodes: array<BVHNode>;
@group(0) @binding(4) var<storage, read_write> accelerations: array<vec4<f32>>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  let count = uniforms.count;
  if (idx >= count) {
    return;
  }

  let my_pos = posMass[idx].xyz;
  let my_mass = posMass[idx].w;

  // Inactive or consumed particle
  if (my_mass <= 0.0) {
    accelerations[idx] = vec4<f32>(0.0);
    return;
  }

  var accel = vec3<f32>(0.0);
  var potential: f32 = 0.0;
  let G = uniforms.gravityG;
  let epsSq = uniforms.softeningSq;
  let theta = uniforms.theta;

  // Fixed-size traversal stack
  var stack: array<u32, 64>;
  var stack_ptr: u32 = 0u;

  if (count > 1u) {
    stack[stack_ptr] = 0u; // Root internal node
    stack_ptr++;
  }

  while (stack_ptr > 0u) {
    stack_ptr--;
    let node_id = stack[stack_ptr];

    // Check if leaf node
    if ((node_id & 0x80000000u) != 0u) {
      let leaf_idx = node_id & 0x7FFFFFFFu;
      let leaf = leafNodes[leaf_idx];
      let orig_idx = leaf.children_meta.x;

      if (orig_idx != idx && leaf.com_mass.w > 0.0) {
        let r_diff = leaf.com_mass.xyz - my_pos;
        let distSq = dot(r_diff, r_diff) + epsSq;
        let invDist = inverseSqrt(distSq);
        let invDist3 = invDist * invDist * invDist;
        let f = G * leaf.com_mass.w * invDist3;
        accel += r_diff * f;
        potential -= G * leaf.com_mass.w * invDist;
      }
    } else {
      let node = internalNodes[node_id];
      let r_diff = node.com_mass.xyz - my_pos;
      let distSq = dot(r_diff, r_diff);
      let dist = sqrt(distSq);
      let size = node.bounds_radius.w;

      // Barnes-Hut Multipole Acceptance Criterion (MAC): size / dist < theta
      if (size < theta * dist || (node.children_meta.x == 0u && node.children_meta.y == 0u)) {
        if (node.com_mass.w > 0.0) {
          let effDistSq = distSq + epsSq;
          let invDist = inverseSqrt(effDistSq);
          let invDist3 = invDist * invDist * invDist;
          let f = G * node.com_mass.w * invDist3;
          accel += r_diff * f;
          potential -= G * node.com_mass.w * invDist;
        }
      } else {
        // Push children onto stack
        let left_child = node.children_meta.x;
        let right_child = node.children_meta.y;

        if (stack_ptr < 62u) {
          stack[stack_ptr] = left_child;
          stack_ptr++;
          stack[stack_ptr] = right_child;
          stack_ptr++;
        }
      }
    }
  }

  // Mouse interaction (Attractor / Repulsor)
  if (uniforms.mousePos.w > 0.5) {
    let mouse_r = uniforms.mousePos.xyz - my_pos;
    let mDistSq = dot(mouse_r, mouse_r) + 25.0;
    let mInvDist = inverseSqrt(mDistSq);
    let mInvDist3 = mInvDist * mInvDist * mInvDist;
    var sign: f32 = 1.0;
    if (uniforms.mouseTool == 2u) {
      sign = -1.0; // Repulsor
    }
    let mForce = sign * uniforms.mouseStrength * mInvDist3;
    accel += mouse_r * mForce;
  }

  accelerations[idx] = vec4<f32>(accel, potential);
}
`;
