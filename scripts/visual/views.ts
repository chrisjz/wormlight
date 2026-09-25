// The views the visual tests pin, one per thing the graph draws. Their names are the baseline file names in
// tests/visual/baseline/, so keep them stable. Queries use the graph's URL parameters (src/ui/params.ts).

export const WIDTH = 800;
export const HEIGHT = 500;

export const VIEWS: readonly { name: string; query: string }[] = [
  // Every neuron, from the default camera: the layout, the impostors and their shading.
  { name: 'overview', query: '' },
  // The nerve ring and head ganglia up close, from above and in front.
  { name: 'head', query: 'tx=-3.3&ty=0.6&tz=0&dist=5&yaw=-35&pitch=25' },
  // AVAL selected: its connections as lines, signed and dashed, and every other neuron dimmed.
  { name: 'aval', query: 'neuron=AVAL' },
  // A ventral-cord motor neuron selected, whose connections run along the body.
  { name: 'vb6', query: 'neuron=VB6&yaw=-20&pitch=15' },
];
