// The views the visual tests pin, one per thing the graph and the plate draw. Their names are the baseline file
// names in tests/visual/baseline/, so keep them stable. Queries use the app's URL parameters (src/ui/params.ts).

export const WIDTH = 800;
export const HEIGHT = 500;

// Each view shows one pane alone, the whole window, and snapshots it. The plate's views compare at a stricter
// perceptual threshold (compare.ts): the odour field and the lawn are faint.
const PLATE = 0.05;
export const VIEWS: readonly { name: string; pane: 'graph' | 'plate'; query: string; threshold?: number }[] = [
  // Every neuron, from the default camera: the layout, the impostors and their shading.
  { name: 'overview', pane: 'graph', query: 'view=graph' },
  // The nerve ring and head ganglia up close, from above and in front.
  { name: 'head', pane: 'graph', query: 'view=graph&tx=-3.3&ty=0.6&tz=0&dist=5&yaw=-35&pitch=25' },
  // AVAL selected: its connections as lines, signed and dashed, and every other neuron dimmed.
  { name: 'aval', pane: 'graph', query: 'view=graph&neuron=AVAL' },
  // A ventral-cord motor neuron selected, whose connections run along the body.
  { name: 'vb6', pane: 'graph', query: 'view=graph&neuron=VB6&yaw=-20&pitch=15' },
  // The worm at its start, straight on the agar at the default field of view: the body, its shading and the
  // agar's texture.
  { name: 'plate', pane: 'plate', query: 'view=plate&seed=1&paused=1', threshold: PLATE },
  // The worm close up, showing the pharynx and the gut.
  { name: 'plate-close', pane: 'plate', query: 'view=plate&seed=1&paused=1&span=0.6', threshold: PLATE },
  // The whole dish, its wall and meniscus, the lawn near its edge and the odour's isolines, with the worm at
  // its centre.
  { name: 'dish', pane: 'plate', query: 'view=plate&seed=1&paused=1&span=110', threshold: PLATE },
  // The lawn close up: its rim, the isolines around it, and the wall and meniscus beside it.
  { name: 'lawn', pane: 'plate', query: 'view=plate&seed=1&paused=1&span=14&cx=43&cy=0', threshold: PLATE },
];
