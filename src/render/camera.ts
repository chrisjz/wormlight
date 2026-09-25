// An orbit camera for the 3D graph: it circles a target at some distance, turned by yaw about the vertical
// and tilted by pitch. Matrices are column-major Float32Arrays, as WGSL reads them, with WebGPU's clip
// depth from 0 (near) to 1 (far).

export type Vec3 = [number, number, number];

export interface Orbit {
  target: Vec3;
  yaw: number; // radians; 0 looks along −z
  pitch: number; // radians; positive looks down from above
  distance: number;
}

export const FIELD_OF_VIEW = (32 * Math.PI) / 180;
export const PITCH_LIMIT = 1.45;

export function eye(o: Orbit): Vec3 {
  const c = Math.cos(o.pitch);
  return [
    o.target[0] + o.distance * c * Math.sin(o.yaw),
    o.target[1] + o.distance * Math.sin(o.pitch),
    o.target[2] + o.distance * c * Math.cos(o.yaw),
  ];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};

// The camera's right, up and back axes in world space.
export function basis(o: Orbit): { right: Vec3; up: Vec3; back: Vec3 } {
  const back = normalise(sub(eye(o), o.target));
  const right = normalise(cross([0, 1, 0], back));
  return { right, up: cross(back, right), back };
}

export function viewMatrix(o: Orbit): Float32Array {
  const e = eye(o);
  const { right, up, back } = basis(o);
  // prettier-ignore
  return new Float32Array([
    right[0], up[0], back[0], 0,
    right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0,
    -dot(right, e), -dot(up, e), -dot(back, e), 1,
  ]);
}

export function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * range, -1,
    0, 0, near * far * range, 0,
  ]);
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

// A world point in CSS pixels from the canvas's top left, with its clip-space w (its distance in front of
// the camera), or null if it is behind the camera.
export function project(
  viewProjection: Float32Array,
  p: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number; w: number } | null {
  const m = viewProjection;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w <= 1e-6) return null;
  return { x: (x / w + 1) * 0.5 * width, y: (1 - y / w) * 0.5 * height, w };
}
