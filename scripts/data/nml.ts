// Reads what the data build needs from a NeuroML2 cell morphology: the soma's position, and every
// point along the cell, from which its anterior and posterior extent follow.

export type Point = [x: number, y: number, z: number];

export interface Morphology {
  soma: Point;
  points: Point[];
}

function point(tag: string, where: string): Point {
  const coordinate = (axis: string): number => {
    const value = Number(new RegExp(`\\s${axis}="([^"]+)"`).exec(tag)?.[1]);
    if (!Number.isFinite(value)) throw new Error(`${where}: missing or bad ${axis}`);
    return value;
  };
  return [coordinate('x'), coordinate('y'), coordinate('z')];
}

export function parseMorphology(xml: string, cell: string): Morphology {
  const segments = new Map<string, { proximal?: Point; distal: Point }>();
  const points: Point[] = [];
  for (const segment of xml.matchAll(/<segment\s[^>]*?id="(\d+)"[^>]*>([\s\S]*?)<\/segment>/g)) {
    const [, id, body] = segment;
    const where = `${cell} segment ${id}`;
    const proximalTag = /<proximal\s[^>]*\/?>/.exec(body)?.[0];
    const distalTag = /<distal\s[^>]*\/?>/.exec(body)?.[0];
    if (!distalTag) throw new Error(`${where}: no distal point`);
    const entry = { proximal: proximalTag ? point(proximalTag, where) : undefined, distal: point(distalTag, where) };
    segments.set(id, entry);
    if (entry.proximal) points.push(entry.proximal);
    points.push(entry.distal);
  }
  if (segments.size === 0) throw new Error(`${cell}: no segments`);

  // The soma is the first member of the "Soma" segment group; a segment's position is its proximal end.
  const somaGroup = /<segmentGroup\s[^>]*id="Soma"[^>]*>([\s\S]*?)<\/segmentGroup>/.exec(xml)?.[1];
  const somaId = somaGroup ? /<member\s+segment="(\d+)"/.exec(somaGroup)?.[1] : undefined;
  const soma = somaId === undefined ? undefined : segments.get(somaId);
  if (!soma) throw new Error(`${cell}: no soma segment`);
  return { soma: soma.proximal ?? soma.distal, points };
}
