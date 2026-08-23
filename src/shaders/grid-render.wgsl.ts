export const gridRenderShader = /* wgsl */ `
struct GridUniforms {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  eyePos: vec4<f32>,
  gridSize: f32,
  gridSubdivisions: f32,
  showAxes: f32,
  pad0: f32,
};

@group(0) @binding(0) var<uniform> uniforms: GridUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) nearPoint: vec3<f32>,
  @location(1) farPoint: vec3<f32>,
};

fn unproject_point(x: f32, y: f32, z: f32, invVP: mat4x4<f32>) -> vec3<f32> {
  let unp = invVP * vec4<f32>(x, y, z, 1.0);
  return unp.xyz / unp.w;
}

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
  var out: VertexOutput;
  // Full-screen quad spanning [-1, 1]
  let p = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let pos = p[v_idx];
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.nearPoint = unproject_point(pos.x, pos.y, 0.0, uniforms.invViewProj);
  out.farPoint = unproject_point(pos.x, pos.y, 1.0, uniforms.invViewProj);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let t = -in.nearPoint.y / (in.farPoint.y - in.nearPoint.y);
  if (t < 0.0) {
    discard;
  }

  let worldPos = in.nearPoint + t * (in.farPoint - in.nearPoint);
  let dist = length(worldPos.xz - uniforms.eyePos.xz);
  let maxDist = 2500.0;
  if (dist > maxDist) {
    discard;
  }

  // Grid coordinates
  let scale = uniforms.gridSize;
  let coord = worldPos.xz / scale;
  let derivative = fwidth(coord);
  let grid = abs(fract(coord - 0.5) - 0.5) / derivative;
  let line = min(grid.x, grid.y);
  let c = 1.0 - min(line, 1.0);

  // Sub-grid
  let subCoord = worldPos.xz / (scale / uniforms.gridSubdivisions);
  let subDerivative = fwidth(subCoord);
  let subGrid = abs(fract(subCoord - 0.5) - 0.5) / subDerivative;
  let subLine = min(subGrid.x, subGrid.y);
  let subC = 1.0 - min(subLine, 1.0);

  var color = vec3<f32>(0.15, 0.25, 0.4) * (c * 0.4 + subC * 0.15);

  // Coordinate axes (X: Red, Z: Blue)
  if (uniforms.showAxes > 0.5) {
    let axisX = 1.0 - min(abs(worldPos.z) / fwidth(worldPos.z), 1.0);
    let axisZ = 1.0 - min(abs(worldPos.x) / fwidth(worldPos.x), 1.0);
    if (axisX > 0.1) {
      color = mix(color, vec3<f32>(0.8, 0.2, 0.2), axisX);
    }
    if (axisZ > 0.1) {
      color = mix(color, vec3<f32>(0.2, 0.4, 0.9), axisZ);
    }
  }

  let alpha = (1.0 - dist / maxDist) * 0.6 * clamp(c + subC * 0.5, 0.0, 1.0);
  if (alpha < 0.005) {
    discard;
  }

  return vec4<f32>(color, alpha);
}
`;
