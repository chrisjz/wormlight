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
