// The views the visual tests pin, one per thing the graph and the plate draw. Their names are the baseline file
// names in tests/visual/baseline/, so keep them stable. Queries use the app's URL parameters (src/ui/params.ts).

export const WIDTH = 800;
export const HEIGHT = 500;

// Each view shows one pane alone, the whole window, and snapshots it. The graph's views colour its neurons by class,
// but for the glow's own. The plate's views compare at a stricter perceptual threshold (compare.ts): the odour
// field and the lawn are faint.
const PLATE = 0.05;
export const VIEWS: readonly { name: string; pane: 'graph' | 'plate'; query: string; threshold?: number }[] = [
  // Every neuron, from the default camera: the layout, the impostors and their shading.
  { name: 'overview', pane: 'graph', query: 'view=graph&colour=class' },
  // The nerve ring and head ganglia up close, from above and in front.
  { name: 'head', pane: 'graph', query: 'view=graph&colour=class&tx=-3.3&ty=0.6&tz=0&dist=5&yaw=-35&pitch=25' },
  // AVAL selected: its connections as lines, signed and dashed, and every other neuron dimmed.
  { name: 'aval', pane: 'graph', query: 'view=graph&colour=class&neuron=AVAL' },
  // A ventral-cord motor neuron selected, whose connections run along the body.
  { name: 'vb6', pane: 'graph', query: 'view=graph&colour=class&neuron=VB6&yaw=-20&pitch=15' },
  // An experiment (spec §6): VB6 selected on the contrast brain's first rewiring. Its gap-junction partners VB5 and
  // VB7 and its rewired partner DB4 are lesioned, drawn hollow with their links to it faint; so is DD3, which isn't
  // its partner, hollow and dimmed.
  {
    name: 'experiment',
    pane: 'graph',
    query:
      'view=graph&colour=class&neuron=VB6&brain=rewired-1&lesions=VB5+VB7+DB4+DD3&tx=1.15&ty=0&tz=0&dist=2&yaw=-25&pitch=30',
  },

  // The glow (PLAN §1): every neuron coloured by its simulated activity, from a worm run 4 s and paused, unseen, with
  // the halos of the most active and their synapses faintly lit.
  { name: 'glow', pane: 'graph', query: 'view=graph&seed=1&t=4&paused=1' },
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
  // Food the URL places: three lawns and their steady field together, one near the dish's wall.
  {
    name: 'food',
    pane: 'plate',
    query: 'view=plate&seed=1&paused=1&span=110&food=45,0;-20,-20;-5,40',
    threshold: PLATE,
  },
];
