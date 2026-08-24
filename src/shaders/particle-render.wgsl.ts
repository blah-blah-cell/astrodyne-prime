export const particleRenderShader = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  invView: mat4x4<f32>,
  eyePos: vec4<f32>,
  screenSize: vec2<f32>,
  pointSize: f32,
  brightnessScale: f32,
  paletteType: u32,
  trailPersistence: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> posMass: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velType: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> accelerations: array<vec4<f32>>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) size: f32,
};

// Planck Blackbody Spectrum Approximation
fn blackbody(temp_norm: f32) -> vec3<f32> {
  let t = clamp(temp_norm, 0.0, 1.0);
  // Red -> Orange -> Yellow -> White -> Blue -> Violet
  let c1 = vec3<f32>(0.9, 0.15, 0.02); // Cool infrared / red
  let c2 = vec3<f32>(1.0, 0.55, 0.1);  // Amber
  let c3 = vec3<f32>(1.0, 0.95, 0.8);  // White solar
  let c4 = vec3<f32>(0.4, 0.7, 1.0);   // Blue giant
  let c5 = vec3<f32>(0.7, 0.85, 1.3);  // Hyper-relativistic

  if (t < 0.25) {
    return mix(c1, c2, t / 0.25);
  } else if (t < 0.5) {
    return mix(c2, c3, (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    return mix(c3, c4, (t - 0.5) / 0.25);
  } else {
    return mix(c4, c5, (t - 0.75) / 0.25);
  }
}

// Cosmic Nebula Palette
fn cosmic_nebula(val: f32) -> vec3<f32> {
  let t = clamp(val, 0.0, 1.0);
  let c1 = vec3<f32>(0.1, 0.05, 0.3); // Deep cosmic indigo
  let c2 = vec3<f32>(0.0, 0.8, 0.9);  // Cyan gas
  let c3 = vec3<f32>(0.9, 0.1, 0.6);  // Magenta ionization
  let c4 = vec3<f32>(1.0, 0.9, 0.4);  // Starburst gold

  if (t < 0.33) {
    return mix(c1, c2, t / 0.33);
  } else if (t < 0.66) {
    return mix(c2, c3, (t - 0.33) / 0.33);
  } else {
    return mix(c3, c4, (t - 0.66) / 0.34);
  }
}

// Velocity Heatmap Palette
fn velocity_heatmap(v_norm: f32) -> vec3<f32> {
  let t = clamp(v_norm, 0.0, 1.0);
  let c1 = vec3<f32>(0.05, 0.2, 0.8);
  let c2 = vec3<f32>(0.1, 0.9, 0.3);
  let c3 = vec3<f32>(1.0, 0.8, 0.0);
  let c4 = vec3<f32>(1.0, 0.1, 0.0);
  let c5 = vec3<f32>(1.0, 1.0, 1.0);

  if (t < 0.25) {
    return mix(c1, c2, t / 0.25);
  } else if (t < 0.5) {
    return mix(c2, c3, (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    return mix(c3, c4, (t - 0.5) / 0.25);
  } else {
    return mix(c4, c5, (t - 0.75) / 0.25);
  }
}

// Particle Type Palette
fn type_palette(p_type: u32) -> vec3<f32> {
  switch (p_type) {
    case 0u: { return vec3<f32>(1.0, 0.85, 0.6); }   // Regular star
    case 1u: { return vec3<f32>(0.4, 0.2, 0.9); }    // Dark matter
    case 2u: { return vec3<f32>(0.1, 0.9, 0.8); }    // Gas / Accretion disc
    case 3u: { return vec3<f32>(1.2, 0.4, 0.05); }   // Black hole
    case 4u: { return vec3<f32>(1.0, 0.7, 0.0); }    // Trojan / Tracer
    case 6u: { return vec3<f32>(0.82, 0.88, 0.94); } // Spacecraft
    case 7u: { return vec3<f32>(0.95, 0.48, 0.12); } // Exhaust plume
    case 8u: { return vec3<f32>(0.18, 0.48, 0.86); } // Planet
    case 9u: { return vec3<f32>(0.58, 0.62, 0.68); } // Moon
    default: { return vec3<f32>(0.8, 0.8, 0.9); }    // Debris
  }
}

@vertex
fn vs_main(
  @builtin(vertex_index) v_idx: u32,
  @builtin(instance_index) inst_idx: u32
) -> VertexOutput {
  var out: VertexOutput;

  let p_data = posMass[inst_idx];
  let v_data = velType[inst_idx];
  let a_data = accelerations[inst_idx];

  let mass = p_data.w;
  if (mass <= 0.0) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0); // Degenerate / culled
    return out;
  }

  let pos = p_data.xyz;
  let vel = v_data.xyz;
  let speed = length(vel);
  let p_type = u32(v_data.w);

  // Billboard quad offsets: 0: (-1,-1), 1: (1,-1), 2: (-1,1), 3: (1,1)
  let quad_uv = vec2<f32>(
    f32((v_idx & 1u) * 2u) - 1.0,
    f32((v_idx >> 1u) * 2u) - 1.0
  );

  let cam_right = camera.invView[0].xyz;
  let cam_up = camera.invView[1].xyz;

  // Base size scaling
  var base_size = camera.pointSize;
  if (p_type == 3u) {
    base_size *= 3.5; // Black holes larger
  } else if (p_type == 8u) {
    base_size *= 1.8; // Planets remain legible without filling the viewport
  } else if (p_type == 9u) {
    base_size *= 1.2;
  } else if (p_type == 1u) {
    base_size *= 0.8; // Dark matter smaller
  }
  
  // Logarithmic mass boost
  let mass_scale = clamp(log(mass + 1.0) * 0.4 + 1.0, 0.5, 4.0);
  let world_size = base_size * mass_scale;

  let vertex_world = pos + (cam_right * quad_uv.x + cam_up * quad_uv.y) * world_size;
  out.position = camera.viewProj * vec4<f32>(vertex_world, 1.0);
  out.uv = quad_uv;
  out.size = world_size;

  // Compute Color
  var rgb = vec3<f32>(1.0);
  let v_norm = clamp(speed * 0.08, 0.0, 1.0);
  let pot_norm = clamp((-a_data.w) * 0.02, 0.0, 1.0);

  switch (camera.paletteType) {
    case 0u: { // Blackbody Planck
      rgb = blackbody(v_norm);
    }
    case 1u: { // Cosmic Nebula
      rgb = cosmic_nebula(v_norm);
    }
    case 2u: { // Velocity Heatmap
      rgb = velocity_heatmap(v_norm);
    }
    case 3u: { // Potential
      rgb = blackbody(pot_norm);
    }
    case 4u: { // Particle Type
      rgb = type_palette(p_type);
    }
    case 5u: { // Electric Cyan
      rgb = mix(vec3<f32>(0.05, 0.6, 1.0), vec3<f32>(1.0, 0.3, 0.9), v_norm);
    }
    default: {
      rgb = blackbody(v_norm);
    }
  }

  // Black hole extra glow & event horizon silhouette
  var intensity = camera.brightnessScale;
  if (p_type == 3u) {
    intensity *= 2.5;
  }

  out.color = vec4<f32>(rgb * intensity, 1.0);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let r_sq = dot(in.uv, in.uv);
  if (r_sq > 1.0) {
    discard;
  }

  // Soft Gaussian point glow with high-intensity central Airy core
  let core = exp(-24.0 * r_sq);
  let glow = exp(-4.5 * r_sq);
  let alpha = clamp(core * 1.5 + glow * 0.6, 0.0, 1.0);

  let final_color = in.color.rgb * alpha;
  return vec4<f32>(final_color, alpha);
}
`;
