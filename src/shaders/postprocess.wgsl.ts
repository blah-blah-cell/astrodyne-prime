export const postProcessShader = /* wgsl */ `
struct PostUniforms {
  exposure: f32,
  bloomIntensity: f32,
  vignetteStrength: f32,
  chromaticAberration: f32,
};

@group(0) @binding(0) var<uniform> uniforms: PostUniforms;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var postSampler: sampler;

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

// ACES Tone Mapping
fn tone_map_aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let center = vec2<f32>(0.5);
  let distFromCenter = length(uv - center);

  // Subtle Chromatic Aberration
  let ca_offset = (uv - center) * (uniforms.chromaticAberration * 0.005);
  let r = textureSample(sceneTexture, postSampler, uv - ca_offset).r;
  let g = textureSample(sceneTexture, postSampler, uv).g;
  let b = textureSample(sceneTexture, postSampler, uv + ca_offset).b;
  let sceneColor = vec3<f32>(r, g, b);

  let bloomColor = textureSample(bloomTexture, postSampler, uv).rgb;

  // Composite with exposure and bloom
  var combined = sceneColor * uniforms.exposure + bloomColor * uniforms.bloomIntensity;

  // Tone mapping
  var mapped = tone_map_aces(combined);

  // Vignette
  let vignette = clamp(1.0 - distFromCenter * uniforms.vignetteStrength, 0.0, 1.0);
  mapped *= vignette;

  // Gamma correction (sRGB approx)
  let srgb = pow(mapped, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(srgb, 1.0);
}
`;
