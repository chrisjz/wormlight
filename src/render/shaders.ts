// WGSL for the 3D graph: neurons as shaded sphere impostors, the glow's halos, and connections as lines of constant
// screen width.

import { GLOW_COLOUR, NEUTRAL, rgb } from './palette.ts';

// A palette colour as WGSL.
export const wgslColour = (hex: string): string =>
  `vec3f(${rgb(hex)
    .map((c) => c.toFixed(4))
    .join(', ')})`;

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

// Each neuron: its centre and radius; its colour; how strongly it is selected (mark.x) or hovered (mark.y), whether
// it is lesioned (mark.z) and its glow's halo (mark.w, which the halo shader draws); and a neutral rim's strength
// (style.x), which keeps a dim glowing neuron findable. A ring outside the sphere marks the first two; a lesioned
// neuron is drawn hollow.
const NEURON = /* wgsl */ `
struct Neuron {
  centre: vec3f,
  radius: f32,
  colour: vec4f,
  mark: vec4f,
  style: vec4f,
}`;

export const NEURON_SHADER = /* wgsl */ `
${FRAME}
${NEURON}
@group(0) @binding(1) var<storage, read> neurons: array<Neuron>;

const RING_OUTER = 1.7;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) colour: vec4f,
  @location(2) @interpolate(flat) mark: vec3f,
  @location(3) @interpolate(flat) fog: f32,
  @location(4) @interpolate(flat) rim: f32,
}

// The neutral rim, the palette's.
const RIM = ${wgslColour(NEUTRAL)};

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let n = neurons[i];
  let corner = CORNERS[v] * RING_OUTER;
  let centre = frame.view * vec4f(n.centre, 1.0);
  var out: Out;
  out.clip = frame.projection * (centre + vec4f(corner * n.radius, 0.0, 0.0));
  out.uv = corner;
  out.colour = n.colour;
  out.mark = n.mark.xyz;
  out.fog = fogAt(-centre.z);
  out.rim = n.style.x;
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
  let edge = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  // Hollow: a dark disc inside an outline in its colour, faded by the fog like the rest.
  if (in.mark.z > 0.5) {
    let outline = smoothstep(0.8 - aa, 0.8, r);
    let hollow = in.colour.rgb * mix(0.18, 1.0, outline);
    return vec4f(mix(hollow, BACKGROUND, in.fog), edge * in.colour.a);
  }
  let normal = vec3f(in.uv, sqrt(max(1.0 - r * r, 0.0)));
  let light = normalize(vec3f(-0.45, 0.65, 0.62));
  let diffuse = max(dot(normal, light), 0.0);
  // (1 − n.z)^2.5, written without pow, which WGSL leaves undefined for a base of 0, as at the centre.
  let e = 1.0 - normal.z;
  let rim = e * e * sqrt(e);
  let shade = in.colour.rgb * (0.42 + 0.58 * diffuse) + vec3f(0.10) * rim;
  // The neutral rim, a thin band inside the sphere's edge.
  let outline = in.rim * smoothstep(0.74, 0.94, r);
  return vec4f(mix(mix(shade, RIM, outline), BACKGROUND, in.fog), edge * in.colour.a);
}
`;

// Each glowing neuron's halo (PLAN §1): a soft disc of GCaMP green reaching 3.2 of its radii from its centre, as
// strong as its glow above rest (the neuron's mark.w), faded by the fog and added to what lies behind it. It shares
// its sphere's depth, so the depth test, less-equal, lets it over its own sphere and hides it behind nearer ones. A
// neuron without a halo is culled before any fragment, its quad collapsed to a point.
export const HALO_SHADER = /* wgsl */ `
${FRAME}
${NEURON}
@group(0) @binding(1) var<storage, read> neurons: array<Neuron>;

const HALO = 3.2; // the halo's reach, in the neuron's radii
const GLOW = ${wgslColour(GLOW_COLOUR)};

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) strength: f32,
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let n = neurons[i];
  var out: Out;
  if (n.mark.w <= 0.0) {
    out.clip = vec4f(0.0, 0.0, 0.0, 1.0);
    return out;
  }
  let corner = CORNERS[v] * HALO;
  let centre = frame.view * vec4f(n.centre, 1.0);
  out.clip = frame.projection * (centre + vec4f(corner * n.radius, 0.0, 0.0));
  out.uv = corner / HALO;
  out.strength = n.mark.w * (1.0 - fogAt(-centre.z));
  return out;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  if (in.strength <= 0.0) { discard; }
  let r = length(in.uv);
  let a = 0.5 * in.strength * exp(-5.0 * r * r) * (1.0 - smoothstep(0.75, 1.0, r));
  return vec4f(GLOW * a, 0.0);
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
