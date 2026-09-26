// The plate view's camera: looking straight down on the dish, in metres, with the dish's centre at the origin
// and y up. It shows `span` metres across the canvas's shorter side, centred on `centre`.

export interface PlateCamera {
  centre: [number, number];
  span: number;
}

// Half the width and height the canvas shows, in metres.
export function halfExtent(camera: PlateCamera, width: number, height: number): [number, number] {
  const short = Math.max(Math.min(width, height), 1);
  const perPixel = camera.span / short;
  return [(perPixel * width) / 2, (perPixel * height) / 2];
}

// Metres per pixel, in whatever pixels width and height are given in.
export const metresPerPixel = (camera: PlateCamera, width: number, height: number): number =>
  camera.span / Math.max(Math.min(width, height), 1);

// A world point in pixels from the canvas's top left, and back.
export function toScreen(
  camera: PlateCamera,
  p: readonly [number, number],
  width: number,
  height: number,
): [number, number] {
  const m = metresPerPixel(camera, width, height);
  return [width / 2 + (p[0] - camera.centre[0]) / m, height / 2 - (p[1] - camera.centre[1]) / m];
}

export function toWorld(camera: PlateCamera, x: number, y: number, width: number, height: number): [number, number] {
  const m = metresPerPixel(camera, width, height);
  return [camera.centre[0] + (x - width / 2) * m, camera.centre[1] - (y - height / 2) * m];
}

// Zoom by `factor` (above 1 shows more) about a point on the canvas, which stays where it is on screen.
export function zoomAbout(
  camera: PlateCamera,
  factor: number,
  x: number,
  y: number,
  width: number,
  height: number,
): PlateCamera {
  const before = toWorld(camera, x, y, width, height);
  const span = camera.span * factor;
  const after = toWorld({ ...camera, span }, x, y, width, height);
  return { span, centre: [camera.centre[0] + before[0] - after[0], camera.centre[1] + before[1] - after[1]] };
}

// A scale bar of a round length (1, 2 or 5 × a power of ten, in metres) at most `most` pixels long.
export function scaleBar(metresPerPx: number, most: number): { metres: number; pixels: number; label: string } {
  const limit = metresPerPx * most;
  let metres = 10 ** Math.floor(Math.log10(limit));
  for (const k of [5, 2]) {
    if (metres * k <= limit) {
      metres *= k;
      break;
    }
  }
  const micrometres = Math.round(metres * 1e6);
  const label =
    micrometres >= 10000
      ? `${micrometres / 10000} cm`
      : micrometres >= 1000
        ? `${micrometres / 1000} mm`
        : `${micrometres} µm`;
  return { metres, pixels: metres / metresPerPx, label };
}
