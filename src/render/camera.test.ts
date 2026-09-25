import { describe, expect, it } from 'vitest';
import { basis, eye, FIELD_OF_VIEW, multiply, perspective, project, viewMatrix, type Orbit } from './camera';

const orbit: Orbit = { target: [1, 2, 3], yaw: 0.7, pitch: 0.3, distance: 5 };

const apply = (m: Float32Array, p: [number, number, number]): number[] =>
  [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

describe('the orbit camera', () => {
  it('sits at its distance from the target', () => {
    const e = eye(orbit);
    expect(Math.hypot(e[0] - 1, e[1] - 2, e[2] - 3)).toBeCloseTo(5, 10);
  });

  it('looks along −z at yaw 0 and pitch 0, from above at positive pitch', () => {
    expect(eye({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 2 })).toEqual([0, 0, 2]);
    expect(eye({ target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 2 })[1]).toBeGreaterThan(0);
  });

  it('has an orthonormal basis with up tilted towards world up', () => {
    const { right, up, back } = basis(orbit);
    const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const v of [right, up, back]) expect(dot(v, v)).toBeCloseTo(1, 12);
    expect(dot(right, up)).toBeCloseTo(0, 12);
    expect(dot(right, back)).toBeCloseTo(0, 12);
    expect(dot(up, back)).toBeCloseTo(0, 12);
    expect(up[1]).toBeGreaterThan(0);
  });

  it('puts the target on the view axis, the distance in front', () => {
    const [x, y, z] = apply(viewMatrix(orbit), orbit.target);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(-5, 5);
  });

  it('maps the near and far planes to depths 0 and 1', () => {
    const p = perspective(FIELD_OF_VIEW, 1.5, 0.5, 40);
    const depth = (distance: number): number => {
      const [, , z, w] = apply(p, [0, 0, -distance]);
      return z / w;
    };
    expect(depth(0.5)).toBeCloseTo(0, 6);
    expect(depth(40)).toBeCloseTo(1, 6);
  });

  it('projects the target to the canvas centre, and a point to its right to the right', () => {
    const vp = multiply(perspective(FIELD_OF_VIEW, 800 / 500, 0.1, 100), viewMatrix(orbit));
    const centre = project(vp, orbit.target, 800, 500);
    expect(centre?.x).toBeCloseTo(400, 3);
    expect(centre?.y).toBeCloseTo(250, 3);
    expect(centre?.w).toBeCloseTo(5, 5);
    const { right, up } = basis(orbit);
    const t = orbit.target;
    const r = project(vp, [t[0] + right[0], t[1] + right[1], t[2] + right[2]], 800, 500);
    const u = project(vp, [t[0] + up[0], t[1] + up[1], t[2] + up[2]], 800, 500);
    expect(r!.x).toBeGreaterThan(400);
    expect(u!.y).toBeLessThan(250);
  });

  it('does not project points behind the camera', () => {
    const vp = multiply(perspective(FIELD_OF_VIEW, 1, 0.1, 100), viewMatrix(orbit));
    const e = eye(orbit);
    const { back } = basis(orbit);
    expect(project(vp, [e[0] + back[0], e[1] + back[1], e[2] + back[2]], 800, 500)).toBeNull();
  });
});
