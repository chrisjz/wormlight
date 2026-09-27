// One explicit sub-step of the odour field in WGSL (PLAN §5.2), mirroring OdourField.step in
// src/sim/env/odour.ts: each cell inside the dish moves by dt·(source − (k·c − (D/h²)·flux)), the flux taken
// from its four neighbours inside the dish only, so no odour crosses the wall. Cells outside hold OUTSIDE, as the
// brain's texture has them; the grid's outermost ring lies outside, so every inside cell has its four
// neighbours on the grid. One invocation a cell, reading one texture and writing the other.

import { OUTSIDE } from './brainShader.ts';

export const FIELD_WORKGROUP = 16;

export const FIELD_SHADER = /* wgsl */ `
struct Step {
  dt: f32,
  diffusion: f32,
  loss: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Step;
@group(0) @binding(1) var field_in: texture_2d<f32>;
@group(0) @binding(2) var sources: texture_2d<f32>;
@group(0) @binding(3) var field_out: texture_storage_2d<r32float, write>;

const OUTSIDE: f32 = ${OUTSIDE.toFixed(1)};

@compute @workgroup_size(${FIELD_WORKGROUP}, ${FIELD_WORKGROUP})
fn advance(@builtin(global_invocation_id) id: vec3<u32>) {
  let n = textureDimensions(field_in);
  if (id.x >= n.x || id.y >= n.y) {
    return;
  }
  let p = vec2<i32>(id.xy);
  let here = textureLoad(field_in, p, 0).r;
  if (here == OUTSIDE) {
    textureStore(field_out, p, vec4<f32>(OUTSIDE, 0.0, 0.0, 0.0));
    return;
  }
  // In OdourField.apply's order: the cells before and after in the row, then the rows below and above.
  var flux = 0.0;
  let left = textureLoad(field_in, p - vec2<i32>(1, 0), 0).r;
  if (left != OUTSIDE) {
    flux += left - here;
  }
  let right = textureLoad(field_in, p + vec2<i32>(1, 0), 0).r;
  if (right != OUTSIDE) {
    flux += right - here;
  }
  let below = textureLoad(field_in, p - vec2<i32>(0, 1), 0).r;
  if (below != OUTSIDE) {
    flux += below - here;
  }
  let above = textureLoad(field_in, p + vec2<i32>(0, 1), 0).r;
  if (above != OUTSIDE) {
    flux += above - here;
  }
  let change = params.loss * here - params.diffusion * flux;
  textureStore(field_out, p, vec4<f32>(here + params.dt * (textureLoad(sources, p, 0).r - change), 0.0, 0.0, 0.0));
}
`;
