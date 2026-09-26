// The graph's view as URL parameters, so a view can be linked and the visual tests can pin one:
// ?neuron=AVAL selects a neuron; yaw, pitch (degrees) and dist place the camera, and tx, ty, tz its target.
// ?norender=1 draws nothing to the screen, leaving the GPU to snapshots (the visual tests on CI).

import { PITCH_LIMIT, type Vec3 } from '../render/camera.ts';

export interface ViewParams {
  neuron: string | null;
  yaw: number | null;
  pitch: number | null;
  distance: number | null;
  target: Partial<Record<0 | 1 | 2, number>>;
  noRender: boolean;
}

export function readParams(search: string): ViewParams {
  const p = new URLSearchParams(search);
  const num = (key: string): number | null => {
    const raw = p.get(key);
    if (raw === null || raw.trim() === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const radians = (key: string): number | null => {
    const v = num(key);
    return v === null ? null : (v * Math.PI) / 180;
  };
  const target: ViewParams['target'] = {};
  (['tx', 'ty', 'tz'] as const).forEach((key, axis) => {
    const v = num(key);
    if (v !== null) target[axis as 0 | 1 | 2] = v;
  });
  const distance = num('dist');
  const pitch = radians('pitch');
  const neuron = p.get('neuron')?.trim();
  return {
    neuron: neuron ? neuron : null,
    yaw: radians('yaw'),
    pitch: pitch === null ? null : Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)),
    distance: distance !== null && distance > 0 ? distance : null,
    target,
    noRender: p.get('norender') === '1',
  };
}

export function applyTarget(base: Vec3, target: ViewParams['target']): Vec3 {
  return [target[0] ?? base[0], target[1] ?? base[1], target[2] ?? base[2]];
}

// The app's layout and the plate's start, as URL parameters: ?view=plate or ?view=graph shows one view alone
// (split by default); ?seed= fixes the worm's seed (random per visit otherwise); ?t= runs the worm that
// many seconds before the first frame; ?paused=1 starts it paused; ?speed= sets how many times real time it
// runs (up to 100, for benchmarks); ?span= sets the plate's field of view across its shorter side, in
// millimetres; ?stats=1 shows the frame rate and the simulation's speed.
export type Layout = 'split' | 'plate' | 'graph';

export interface PlateParams {
  layout: Layout;
  seed: number | null;
  time: number;
  paused: boolean;
  speed: number;
  span: number | null;
  stats: boolean;
}

export function readPlateParams(search: string): PlateParams {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  const seed = p.get('seed')?.trim() ?? '';
  const time = Number(p.get('t') ?? '');
  const span = Number(p.get('span') ?? '');
  const speed = Number(p.get('speed') ?? '');
  return {
    layout: view === 'plate' || view === 'graph' ? view : 'split',
    seed: /^\d+$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : null,
    time: p.get('t') !== null && Number.isFinite(time) && time > 0 ? Math.min(time, 600) : 0,
    paused: p.get('paused') === '1',
    speed: p.get('speed') !== null && Number.isFinite(speed) && speed > 0 ? Math.min(speed, 100) : 1,
    span: p.get('span') !== null && Number.isFinite(span) && span > 0 ? span / 1000 : null,
    stats: p.get('stats') === '1',
  };
}
