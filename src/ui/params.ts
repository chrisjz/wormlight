// The graph's view as URL parameters, so a view can be linked and the visual tests can pin one:
// ?neuron=AVAL selects a neuron; yaw, pitch (degrees) and dist place the camera, and tx, ty, tz its target.
// ?norender=1 draws nothing to the screen, leaving the GPU to snapshots (the visual tests on CI). ?colour=class
// colours the graph's neurons by their class to start with, not by their glow.

import { FIRST_LAWN, inDish, MAX_LAWNS, type Lawn } from '../sim/env/dish.ts';
import { PITCH_LIMIT, type Vec3 } from '../render/camera.ts';

export interface ViewParams {
  neuron: string | null;
  yaw: number | null;
  pitch: number | null;
  distance: number | null;
  target: Partial<Record<0 | 1 | 2, number>>;
  noRender: boolean;
  colour: 'activity' | 'class';
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
    colour: p.get('colour') === 'class' ? 'class' : 'activity',
  };
}

export function applyTarget(base: Vec3, target: ViewParams['target']): Vec3 {
  return [target[0] ?? base[0], target[1] ?? base[1], target[2] ?? base[2]];
}

// The app's layout and the plate's start, as URL parameters: ?view=plate or ?view=graph shows one view alone
// (split by default); ?seed= fixes the worm's seed (random per visit otherwise); ?t= runs the worm that
// many seconds before the first frame (up to 600); ?paused=1 starts it paused; ?speed= sets how many times
// real time it runs (up to 100, for benchmarks); ?span= sets the plate's field of view across its shorter
// side, in millimetres; ?cx= and ?cy= centre the plate's camera there, in millimetres from the dish's centre,
// instead of on the worm; ?stats=1 shows the frame rate and the simulation's speed; ?food= places the lawns
// (readFood), the app's first lawn without it.
export type Layout = 'split' | 'plate' | 'graph';

// How far from the dish's centre a URL may centre the camera: as far as the plate's widest view reaches.
export const REACH = 0.12; // m

export interface PlateParams {
  layout: Layout;
  seed: number | null;
  time: number;
  paused: boolean;
  speed: number;
  span: number | null;
  centre: [number, number] | null;
  stats: boolean;
  food: Lawn[] | null;
  // Whether the URL held food it couldn't read, so the app starts with its first lawn instead.
  foodIgnored: boolean;
}

// ?food= places the lawns (PLAN §5.2): x,y pairs in millimetres from the dish's centre, as plain decimals,
// separated by semicolons, at most MAX_LAWNS and each inside the dish; empty for none. Anything else is
// ignored, and the app starts with its first lawn.
export function readFood(value: string | null): Lawn[] | null {
  if (value === null) return null;
  const text = value.trim();
  if (text === '') return [];
  const decimal = String.raw`-?\d+(\.\d+)?`;
  const pair = new RegExp(`^(${decimal}),(${decimal})$`);
  const lawns: Lawn[] = [];
  for (const part of text.split(';')) {
    const m = pair.exec(part.trim());
    if (!m) return null;
    const lawn: Lawn = [Number(m[1]) / 1000, Number(m[3]) / 1000];
    if (!inDish(...lawn)) return null;
    lawns.push(lawn);
  }
  return lawns.length <= MAX_LAWNS ? lawns : null;
}

// The lawns as ?food= carries them, to a tenth of a millimetre.
export function writeFood(lawns: readonly Lawn[]): string {
  const mm = (v: number): string => String(Math.round(v * 1e4) / 10);
  return lawns.map(([x, y]) => `${mm(x)},${mm(y)}`).join(';');
}

// Where a lawn is placed: to a tenth of a millimetre, as the URL holds it exactly, and inside the dish, rounding
// towards its centre where rounding to the nearest tenth would push it past the wall. Null if it lies off the
// dish altogether.
export function snapLawn(at: readonly [number, number]): Lawn | null {
  if (!inDish(at[0], at[1])) return null;
  const nearest: Lawn = [Math.round(at[0] * 1e4) / 1e4, Math.round(at[1] * 1e4) / 1e4];
  if (inDish(...nearest)) return nearest;
  const inward: Lawn = [Math.trunc(at[0] * 1e4) / 1e4, Math.trunc(at[1] * 1e4) / 1e4];
  return inDish(...inward) ? inward : null;
}

// The page's URL with the setup a link reproduces: the worm's seed, and the lawns, left out while they are the
// app's first alone (PLAN §5.2). Its other parameters stay as they are.
export function plateUrl(href: string, seed: number, lawns: readonly Lawn[]): string {
  const url = new URL(href);
  url.searchParams.set('seed', String(seed));
  // Compared as the URL writes them: the first lawn's own place isn't a tenth of a millimetre exactly.
  if (writeFood(lawns) === writeFood([FIRST_LAWN])) url.searchParams.delete('food');
  else url.searchParams.set('food', writeFood(lawns));
  return url.toString();
}

export function readPlateParams(search: string): PlateParams {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  const seed = p.get('seed')?.trim() ?? '';
  const t = p.get('t')?.trim() ?? '';
  const time = /^\d+(\.\d+)?$/.test(t) ? Number(t) : 0;
  const span = Number(p.get('span') ?? '');
  const speed = Number(p.get('speed') ?? '');
  const cx = p.get('cx');
  const cy = p.get('cy');
  // Millimetres, as plain decimals, clamped to within REACH of the dish's centre.
  const mm = (v: string | null): number => {
    const text = v?.trim() ?? '';
    if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
    return Math.max(-REACH, Math.min(REACH, Number(text) / 1000));
  };
  const centre: [number, number] = [mm(cx), mm(cy)];
  return {
    layout: view === 'plate' || view === 'graph' ? view : 'split',
    seed: /^\d+$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : null,
    time: Math.min(time, 600),
    paused: p.get('paused') === '1',
    speed: p.get('speed') !== null && Number.isFinite(speed) && speed > 0 ? Math.min(speed, 100) : 1,
    span: p.get('span') !== null && Number.isFinite(span) && span > 0 ? span / 1000 : null,
    centre:
      Number.isFinite(centre[0]) || Number.isFinite(centre[1])
        ? [Number.isFinite(centre[0]) ? centre[0] : 0, Number.isFinite(centre[1]) ? centre[1] : 0]
        : null,
    stats: p.get('stats') === '1',
    food: readFood(p.get('food'))?.map((lawn) => snapLawn(lawn) ?? lawn) ?? null,
    foodIgnored: p.get('food') !== null && readFood(p.get('food')) === null,
  };
}
