// WGSL for the 3D graph: neurons as shaded sphere impostors, connections as lines of constant screen width.

const FRAME = /* wgsl */ `
struct Frame {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  viewport: vec2f, // device pixels
  pixelRatio: f32,
  _pad: f32,
  fog: vec2f, // view depths where fog starts and is fullest
}
@group(0) @binding(0) var<uniform> frame: Frame;

const BACKGROUND = vec3f(0.027, 0.035, 0.039);
const FOG_MOST = 0.7;

// How far towards the background something at this view-space depth fades.
fn fogAt(depth: f32) -> f32 {
  return FOG_MOST * smoothstep(frame.fog.x, frame.fog.y, depth);
}

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
);
`;

// Each neuron: its centre and radius, its colour, and how strongly it is selected (x) or hovered (y). A
// ring outside the sphere marks either.
export const NEURON_SHADER = /* wgsl */ `
${FRAME}
struct Neuron {
  centre: vec3f,
  radius: f32,
  colour: vec4f,
  mark: vec4f,
}
@group(0) @binding(1) var<storage, read> neurons: array<Neuron>;

const RING_OUTER = 1.7;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) colour: vec4f,
  @location(2) @interpolate(flat) mark: vec2f,
  @location(3) @interpolate(flat) fog: f32,
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let n = neurons[i];
  let corner = CORNERS[v] * RING_OUTER;
  let centre = frame.view * vec4f(n.centre, 1.0);
  var out: Out;
  out.clip = frame.projection * (centre + vec4f(corner * n.radius, 0.0, 0.0));
  out.uv = corner;
  out.colour = n.colour;
  out.mark = n.mark.xy;
  out.fog = fogAt(-centre.z);
  return out;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  let r = length(in.uv);
  let aa = max(fwidth(r), 1e-4);
  let ring = max(in.mark.x, in.mark.y * 0.6);
  // The ring: a thin band just outside the sphere.
  let band = smoothstep(1.28 - aa, 1.28, r) * (1.0 - smoothstep(1.48, 1.48 + aa, r));
  if (r > 1.0) {
    let a = band * ring;
    if (a < 0.02) { discard; }
    return vec4f(vec3f(0.93, 0.95, 0.94), a);
  }
  let normal = vec3f(in.uv, sqrt(max(1.0 - r * r, 0.0)));
  let light = normalize(vec3f(-0.45, 0.65, 0.62));
  let diffuse = max(dot(normal, light), 0.0);
  // (1 − n.z)^2.5, written without pow, which WGSL leaves undefined for a base of 0, as at the centre.
  let e = 1.0 - normal.z;
  let rim = e * e * sqrt(e);
  let shade = in.colour.rgb * (0.42 + 0.58 * diffuse) + vec3f(0.10) * rim;
  let edge = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  return vec4f(mix(shade, BACKGROUND, in.fog), edge * in.colour.a);
}
`;

// Each connection: its two ends, its width in CSS pixels, a dash period (0 for solid) and its colour. The
// segment is clipped to the near plane before projection, so an end behind the camera can't fold the quad.
// Width and dashes are measured in screen space, so they interpolate linearly, and each fragment's alpha is
// its coverage of the line: the quad reaches a pixel past the line's edge for the antialiasing to fall in.
export const LINK_SHADER = /* wgsl */ `
${FRAME}
struct Link {
  a: vec3f,
  width: f32,
  b: vec3f,
  dash: f32,
  colour: vec4f,
}
@group(0) @binding(1) var<storage, read> links: array<Link>;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) @interpolate(flat) colour: vec4f,
  @location(1) @interpolate(linear) side: f32, // device pixels from the centreline
  @location(2) @interpolate(linear) along: f32, // CSS pixels from the first end
  @location(3) @interpolate(flat) dash: f32,
  @location(4) @interpolate(flat) halfWidth: f32, // device pixels
  @location(5) fog: f32,
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let l = links[i];
  let c = CORNERS[v];
  let ca = frame.viewProjection * vec4f(l.a, 1.0);
  let cb = frame.viewProjection * vec4f(l.b, 1.0);
  var out: Out;
  out.colour = l.colour;
  out.dash = l.dash;
  out.halfWidth = l.width * 0.5 * frame.pixelRatio;
  if (ca.z < 0.0 && cb.z < 0.0) {
    // Wholly behind the near plane: a degenerate quad outside the view.
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  // Clip space is linear along the segment, so the near plane (z = 0) cuts it at one parameter.
  let cut = ca.z / (ca.z - cb.z);
  let ta = select(0.0, cut, ca.z < 0.0);
  let tb = select(1.0, cut, cb.z < 0.0);
  let pa = mix(ca, cb, ta);
  let pb = mix(ca, cb, tb);
  let half = frame.viewport * 0.5;
  let span = pb.xy / pb.w * half - pa.xy / pa.w * half;
  let len = max(length(span), 1e-4);
  let normal = vec2f(-span.y, span.x) / len;
  let t = (c.x + 1.0) * 0.5;
  let clip = mix(pa, pb, t);
  let reach = out.halfWidth + 1.0;
  out.clip = vec4f(clip.xy + normal * c.y * reach / half * clip.w, clip.zw);
  out.side = c.y * reach;
  out.along = t * len / frame.pixelRatio;
  out.fog = fogAt(-(frame.view * vec4f(mix(l.a, l.b, mix(ta, tb, t)), 1.0)).z);
  return out;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  let coverage = clamp(in.halfWidth + 0.5 - abs(in.side), 0.0, 1.0);
  var a = in.colour.a * coverage * (1.0 - in.fog);
  if (in.dash > 0.0 && fract(in.along / in.dash) > 0.55) { a = 0.0; }
  if (a < 0.004) { discard; }
  return vec4f(in.colour.rgb * a, a);
}
`;
