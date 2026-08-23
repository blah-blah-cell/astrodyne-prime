export const bloomExtractShader = /* wgsl */ `
struct BloomUniforms {
  threshold: f32,
  softKnee: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: BloomUniforms;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
  var out: VertexOutput;
  // Full-screen triangle: ( -1, -1 ), ( 3, -1 ), ( -1, 3 )
  let u = f32((v_idx << 1u) & 2u);
  let v = f32(v_idx & 2u);
  out.position = vec4<f32>(u * 2.0 - 1.0, 1.0 - v * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(u, v);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let color = textureSample(sceneTexture, sceneSampler, in.uv).rgb;
  let brightness = max(color.r, max(color.g, color.b));
  
  // Soft threshold curve
  let threshold = uniforms.threshold;
  let knee = threshold * uniforms.softKnee;
  var soft = brightness - threshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 0.00001);
  
  var contribution = max(soft, brightness - threshold);
  contribution /= max(brightness, 0.00001);
  
  return vec4<f32>(color * max(contribution, 0.0), 1.0);
}
`;

export const bloomBlurShader = /* wgsl */ `
struct BlurUniforms {
  direction: vec2<f32>,
  resolution: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: BlurUniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
  var out: VertexOutput;
  let u = f32((v_idx << 1u) & 2u);
  let v = f32(v_idx & 2u);
  out.position = vec4<f32>(u * 2.0 - 1.0, 1.0 - v * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(u, v);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let texel = uniforms.direction / uniforms.resolution;
  
  // 9-tap Gaussian filter
  let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  var result = textureSample(inputTexture, inputSampler, in.uv).rgb * weights[0];
  
  for (var i = 1; i < 5; i++) {
    let offset = texel * f32(i) * 1.5;
    result += textureSample(inputTexture, inputSampler, in.uv + offset).rgb * weights[i];
    result += textureSample(inputTexture, inputSampler, in.uv - offset).rgb * weights[i];
  }
  
  return vec4<f32>(result, 1.0);
}
`;
