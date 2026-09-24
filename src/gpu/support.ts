/** What the page learned when it asked the browser for a GPU. */
export type GpuSupport =
  | { kind: 'ready'; adapter: string }
  | { kind: 'no-webgpu' }
  | { kind: 'no-adapter' }
  | { kind: 'failed'; reason: string };

/** Ask for a WebGPU adapter without throwing: every outcome becomes a GpuSupport the page can explain. */
export async function probeWebGpu(gpu: GPU | undefined): Promise<GpuSupport> {
  if (!gpu) return { kind: 'no-webgpu' };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { kind: 'no-adapter' };
    const info = adapter.info;
    const name = [info?.vendor, info?.architecture].filter(Boolean).join(' ');
    return { kind: 'ready', adapter: name || 'an unnamed adapter' };
  } catch (err) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** The words shown for each outcome. A browser without WebGPU gets an explanation, never a blank page. */
export function describeGpuSupport(support: GpuSupport): { title: string; body: string } {
  switch (support.kind) {
    case 'ready':
      return { title: 'WebGPU is ready', body: `Your browser offered a GPU adapter (${support.adapter}).` };
    case 'no-webgpu':
      return {
        title: 'Wormlight needs WebGPU',
        body:
          "The worm's nervous system and body are simulated on your graphics card through WebGPU, " +
          'which this browser does not provide. Recent versions of Chrome and Edge support it, as does Safari 26 or later.',
      };
    case 'no-adapter':
      return {
        title: 'No graphics adapter available',
        body:
          'This browser supports WebGPU but did not offer a graphics adapter. Hardware acceleration may be ' +
          'switched off, or the GPU may be blocked; try enabling acceleration or another browser.',
      };
    case 'failed':
      return { title: 'WebGPU failed to start', body: `The browser reported: ${support.reason}` };
  }
}
