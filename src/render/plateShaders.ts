// The plate view's shaders, lit as a dark-field microscope lights a dish: light scattered by the agar's
// specks and by the worm's edges, on dark. Positions are in metres from the camera's centre, which the
// frame holds, so f32 keeps sub-micrometre detail anywhere in the dish.

import { ROD_WORDS } from '../gpu/brainShader.ts';

// The frame: the camera's centre, split into a coarse part and a remainder as the body's coordinates are,
// the half extent shown (m), metres per device pixel, the dish's radius (m), the lawn's centre and radius
// (m), and the width of the odour field's grid (m).
const FRAME = /* wgsl */ `
struct Frame {
  centre_high: vec2<f32>,
  centre_low: vec2<f32>,
  half: vec2<f32>,
  pixel: f32,
  dish: f32,
  lawn: vec2<f32>,
  lawn_radius: f32,
  field_extent: f32,
}
@group(0) @binding(0) var<uniform> frame: Frame;
`;

// A hash of two integers to [0, 1), after the PCG hash the noise uses.
const HASH = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn hash2(c: vec2<i32>) -> f32 {
  return f32(pcg(bitcast<u32>(c.x) + pcg(bitcast<u32>(c.y)))) / 4294967296.0;
}
fn hash2b(c: vec2<i32>) -> f32 {
  return f32(pcg(bitcast<u32>(c.y) ^ pcg(bitcast<u32>(c.x) + 0x9e3779b9u))) / 4294967296.0;
}
// Smooth value noise on a unit grid.
fn noise(p: vec2<f32>) -> f32 {
  let c = floor(p);
  let f = p - c;
  let u = f * f * (3.0 - 2.0 * f);
  let i = vec2<i32>(c);
  return mix(
    mix(hash2(i), hash2(i + vec2<i32>(1, 0)), u.x),
    mix(hash2(i + vec2<i32>(0, 1)), hash2(i + vec2<i32>(1, 1)), u.x),
    u.y,
  );
}
`;

export const AGAR_SHADER = /* wgsl */ `
${FRAME}
${HASH}
// The odour field as log₂(C/K), on a grid centred on the dish, interpolated here in f32 between its four
// nearest cells, so it stays smooth, and its isolines narrow, at any zoom.
@group(0) @binding(1) var odour_map: texture_2d<f32>;

fn odour_level(q: vec2<f32>) -> f32 {
  let n = f32(textureDimensions(odour_map).x);
  let g = clamp((q / frame.field_extent + 0.5) * n - 0.5, vec2<f32>(0.0), vec2<f32>(n - 1.001));
  let c = floor(g);
  let f = g - c;
  let i = vec2<i32>(c);
  let a = textureLoad(odour_map, i, 0).r;
  let b = textureLoad(odour_map, i + vec2<i32>(1, 0), 0).r;
  let d = textureLoad(odour_map, i + vec2<i32>(0, 1), 0).r;
  let e = textureLoad(odour_map, i + vec2<i32>(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}

struct Out {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}

// One triangle over the whole canvas.
@vertex fn vs(@builtin(vertex_index) v: u32) -> Out {
  let xy = vec2<f32>(f32((v << 1u) & 2u), f32(v & 2u)) * 2.0 - 1.0;
  var out: Out;
  out.position = vec4<f32>(xy, 0.0, 1.0);
  out.ndc = xy;
  return out;
}

// A layer of specks: in each cell of \`size\` metres, perhaps one speck, whose light fades out as it shrinks
// below a pixel so a zoomed-out dish doesn't shimmer. q is the point in metres from the dish's centre.
fn specks(q: vec2<f32>, size: f32, chance: f32, radius: f32) -> f32 {
  let g = q / size;
  let c = floor(g);
  let i = vec2<i32>(c);
  if (hash2(i + vec2<i32>(7, 3)) > chance) { return 0.0; }
  let r = radius * (0.5 + hash2b(i));
  let soft = max(frame.pixel, 0.35 * r);
  // Kept far enough inside its cell that its soft edge isn't cut off.
  let margin = min((r + soft) / size, 0.45);
  let at = vec2<f32>(hash2(i + vec2<i32>(11, 5)), hash2b(i + vec2<i32>(2, 13))) * (1.0 - 2.0 * margin) + margin;
  let d = length(g - c - at) * size;
  let visible = smoothstep(0.4, 1.5, r / frame.pixel);
  return (0.35 + 0.65 * hash2(i + vec2<i32>(5, 17))) * (1.0 - smoothstep(r - soft, r + soft, d)) * visible;
}

@fragment fn fs(in: Out) -> @location(0) vec4<f32> {
  // The point in metres from the dish's centre, and from the camera's.
  let local = in.ndc * frame.half;
  let q = (frame.centre_high + local) + frame.centre_low;
  let r = length(q);
  let px = frame.pixel;
  // The odour: log₂ of the concentration over K, and how fast it changes across a pixel, for its isolines.
  let level = odour_level(q);
  let slope = max(fwidth(level), 1e-6);
  // Agar: dark, faintly mottled at two scales, with specks that scatter light.
  let mottle = noise(q / 1.1e-3) * 0.5 + noise(q / 3e-4) * 0.3 + noise(q / 9e-5) * 0.2;
  var light = 0.026 + 0.018 * mottle;
  light += 0.10 * specks(q + vec2<f32>(1e-4, 7e-5), 2.6e-4, 0.35, 7e-6);
  light += 0.16 * specks(q, 6e-5, 0.25, 2.2e-6) + 0.09 * specks(q + vec2<f32>(3e-5, 1e-5), 2.3e-5, 0.12, 1.1e-6);
  // The meniscus, bright where the agar climbs the wall.
  let inside = frame.dish - r;
  light += 0.22 * exp(-max(inside, 0.0) / 6e-4) * smoothstep(-px, px, inside);
  // The wall: a thin bright rim, then the dark beyond.
  let rim = exp(-abs(r - frame.dish - 4e-4) / max(1.5e-4, 1.5 * px));
  let outside = smoothstep(-px, px, -inside);
  light = mix(light, 0.012 + 0.18 * rim, outside);
  // The lawn: bacteria scatter light, most at its thicker rim.
  let from_lawn = length(q - frame.lawn);
  let on_lawn = (1.0 - smoothstep(frame.lawn_radius - px, frame.lawn_radius + px, from_lawn)) * (1.0 - outside);
  let rim_lawn = exp(-max(frame.lawn_radius - from_lawn, 0.0) / max(2.5e-4, 2.0 * px));
  let lawn_light = 0.075 + 0.035 * noise(q / 7e-5) + 0.02 * noise(q / 6e-4) + 0.16 * rim_lawn;
  light = mix(light, lawn_light, on_lawn);
  // Dark-field illumination falls off towards the frame's corners.
  let shade = 1.0 - 0.28 * dot(in.ndc, in.ndc) * 0.5;
  var colour = light * shade * mix(vec3<f32>(0.86, 1.0, 0.96), vec3<f32>(1.0, 0.94, 0.82), on_lawn);
  // The odour, drawn faintly in amber: a glow that grows towards K, and an isoline at every halving from K
  // down to 1/256 of it, each about a pixel wide.
  let amber = vec3<f32>(1.0, 0.72, 0.36);
  let band = abs(fract(level + 0.5) - 0.5) / slope;
  let shown = smoothstep(-8.5, -7.5, level) * (1.0 - smoothstep(0.25, 0.75, level)) * (1.0 - outside);
  let isoline = (1.0 - smoothstep(0.6, 1.4, band)) * shown;
  colour += amber * (0.05 * isoline + 0.035 * exp2(min(level, 0.0)) * (1.0 - outside)) * (1.0 - 0.7 * on_lawn);
  return vec4<f32>(colour, 1.0);
}
`;

// The worm, a strip along its midline through every rod, subdivided `sub` times between rods by a
// Catmull–Rom spline, as wide as the rods' diameters; instance 0 is a faint halo of scattered light around
// it, instance 1 the body. Squares are written as products: WGSL's pow is undefined for a base below zero.
export function wormShader(rods: number, sub: number, length: number): string {
  const sections = (rods - 1) * sub;
  return /* wgsl */ `
${FRAME}
${HASH}
@group(0) @binding(1) var<storage, read> body: array<f32>;
@group(0) @binding(2) var<storage, read> radius: array<f32>;

const RODS = ${rods}u;
const SUB = ${sub}u;
const SECTIONS = ${sections}u;
const HALO = 2.2;
// The body's length (m).
const LENGTH = ${length};

// Rod i's centre in metres from the camera's centre: the coarse parts differenced first, as the kernel does.
fn centre(i: u32) -> vec2<f32> {
  let at = ${ROD_WORDS}u * i;
  let high = vec2<f32>(body[at], body[at + 2u]) - frame.centre_high;
  let low = vec2<f32>(body[at + 1u], body[at + 3u]) - frame.centre_low;
  return high + low;
}

struct Out {
  @builtin(position) position: vec4<f32>,
  // Across the body, −1 on the ventral edge to 1 on the dorsal; along it, 0 at the head to 1 at the tail.
  @location(0) across: f32,
  @location(1) along: f32,
  // The body's half-width at mid-body, in device pixels, and here, in body lengths.
  @location(2) @interpolate(flat) pixels: f32,
  @location(3) @interpolate(flat) layer: u32,
  @location(4) width: f32,
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) layer: u32) -> Out {
  let k = min(v / 2u, SECTIONS);
  let side = f32(v & 1u) * 2.0 - 1.0;
  let m = min(k / SUB, RODS - 2u);
  let f = f32(k - m * SUB) / f32(SUB);
  let p1 = centre(m);
  let p2 = centre(m + 1u);
  // The spline's outer points, mirrored beyond the ends.
  var p0 = 2.0 * p1 - p2;
  if (m > 0u) { p0 = centre(m - 1u); }
  var p3 = 2.0 * p2 - p1;
  if (m + 2u < RODS) { p3 = centre(m + 2u); }
  let f2 = f * f;
  let f3 = f2 * f;
  let at = 0.5 * ((2.0 * p1) + (p2 - p0) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * f3);
  let d = 0.5 * ((p2 - p0) + 2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f + 3.0 * (3.0 * p1 - p0 - 3.0 * p2 + p3) * f2);
  let t = normalize(d);
  // The dorsal side is the head-to-tail direction turned anticlockwise, as the body model has it.
  let u = vec2<f32>(-t.y, t.x);
  let r = mix(radius[m], radius[m + 1u], f);
  let width = select(r, HALO * r + 2.0 * frame.pixel, layer == 0u);
  var out: Out;
  out.position = vec4<f32>((at + side * width * u) / frame.half, 0.0, 1.0);
  out.across = side;
  out.along = (f32(m) + f) / f32(RODS - 1u);
  out.pixels = max(radius[RODS / 2u], 1e-9) / frame.pixel;
  out.layer = layer;
  out.width = r / LENGTH;
  return out;
}

// A soft blob in the body's own coordinates, along (body lengths) and across (−1 to 1), with a faint rim.
fn bulb(along: f32, across: f32, at: f32, extent: f32, width: f32) -> f32 {
  let e = length(vec2<f32>((along - at) / extent, across / width));
  let edge = (e - 1.0) / 0.25;
  return 0.6 * exp(-e * e * 1.6) + 0.4 * exp(-edge * edge);
}

@fragment fn fs(in: Out) -> @location(0) vec4<f32> {
  let a = abs(in.across);
  if (in.layer == 0u) {
    // Around the body, a faint halo of scattered light that fades to nothing at its edge.
    let fade = 1.0 - smoothstep(0.3, 1.0, a);
    let glow = 0.07 * fade * fade;
    return vec4<f32>(vec3<f32>(0.62, 0.72, 0.68) * glow, glow);
  }
  // The body as a translucent tube: its edges scatter the most light, its core glows faintly.
  let z = sqrt(max(1.0 - a * a, 0.0));
  let a2 = a * a;
  let rim = a2 * a2;
  var light = 0.20 + 0.10 * z + 0.75 * rim;
  // Detail fades in as the body grows wider on screen than a few pixels.
  let detail = smoothstep(3.0, 12.0, in.pixels);
  // A point on the body in body lengths, with the same scale along and across it.
  let q = vec2<f32>(in.along, in.across * in.width);
  // The pharynx: a thin lumen down the middle, the metacorpus and the terminal bulb.
  let pharynx = 1.0 - smoothstep(0.10, 0.125, in.along);
  let off = in.across / 0.06;
  let lumen = exp(-off * off) * pharynx;
  let bulbs = bulb(in.along, in.across, 0.058, 0.013, 0.40) + bulb(in.along, in.across, 0.110, 0.015, 0.52);
  light += detail * (0.12 * lumen + 0.22 * bulbs);
  // The gut, from the pharynx back to near the tail, strongest in the core: a mottle at body scale, and its
  // granules, about 4 µm, once they span a pixel or two.
  let gut = smoothstep(0.12, 0.16, in.along) * (1.0 - smoothstep(0.86, 0.92, in.along)) * z;
  let px = frame.pixel / LENGTH;
  let mottle = noise(q / 0.012) - 0.5;
  let grains = noise(q / 0.004) * noise(q / 0.009 + vec2<f32>(9.0, 3.0)) - 0.25;
  light += detail * gut * (0.10 * mottle + 0.34 * grains * smoothstep(1.0, 3.0, 0.004 / px));
  // The tips thin to the rods' last radius; soften them so the strip's point doesn't read as a spike.
  let tips = smoothstep(0.0, 0.012, in.along) * smoothstep(0.0, 0.02, 1.0 - in.along);
  let colour = mix(vec3<f32>(0.58, 0.64, 0.62), vec3<f32>(0.90, 0.95, 0.93), rim) * light;
  let alpha = 0.94 * mix(0.6, 1.0, tips);
  return vec4<f32>(colour * alpha, alpha);
}
`;
}
