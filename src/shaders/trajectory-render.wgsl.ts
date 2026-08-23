export const trajectoryRenderShader = /* wgsl */ `
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

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = camera.viewProj * vec4<f32>(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;
