import { describe, expect, it } from 'vitest';
import { halfExtent, scaleBar, toScreen, toWorld, zoomAbout, type PlateCamera } from './plateCamera.ts';

const camera: PlateCamera = { centre: [0.001, -0.002], span: 0.003 };

describe('the plate camera', () => {
  it('shows its span across the shorter side', () => {
    const [w, h] = halfExtent(camera, 800, 500);
    expect([w, h].map((v) => v * 1e6)).toEqual([expect.closeTo(2400, 6), expect.closeTo(1500, 6)]);
    const [w2, h2] = halfExtent(camera, 400, 600);
    expect([w2, h2].map((v) => v * 1e6)).toEqual([expect.closeTo(1500, 6), expect.closeTo(2250, 6)]);
  });

  it('maps the centre to the middle of the canvas, with y up', () => {
    expect(toScreen(camera, camera.centre, 800, 500)).toEqual([400, 250]);
    const [x, y] = toScreen(camera, [0.001 + 0.0003, -0.002 + 0.0003], 800, 500);
    expect(x).toBeCloseTo(450, 9);
    expect(y).toBeCloseTo(200, 9);
    const back = toWorld(camera, x, y, 800, 500);
    expect(back[0]).toBeCloseTo(0.0013, 12);
    expect(back[1]).toBeCloseTo(-0.0017, 12);
  });

  it('zooms about a point, which stays put on screen', () => {
    const point = toWorld(camera, 100, 80, 800, 500);
    const zoomed = zoomAbout(camera, 2, 100, 80, 800, 500);
    expect(zoomed.span).toBeCloseTo(0.006, 12);
    const after = toScreen(zoomed, point, 800, 500);
    expect(after[0]).toBeCloseTo(100, 9);
    expect(after[1]).toBeCloseTo(80, 9);
  });

  it('draws a scale bar of a round length that fits', () => {
    // 3 µm a pixel: at most 360 µm fits in 120 px, so 200 µm.
    expect(scaleBar(3e-6, 120)).toMatchObject({ label: '200 µm' });
    expect(scaleBar(3e-6, 120).pixels).toBeCloseTo(66.67, 1);
    expect(scaleBar(1e-5, 120).label).toBe('1 mm');
    expect(scaleBar(2e-4, 120).label).toBe('2 cm');
    expect(scaleBar(5e-6, 100).label).toBe('500 µm');
  });
});
