import { describe, expect, it } from 'vitest';
import { describeGpuSupport, probeWebGpu } from './support';

// Only requestAdapter and requestDevice are exercised, so a partial GPU is enough for these fakes.
const fakeGpu = (requestAdapter: () => Promise<unknown>): GPU => ({ requestAdapter }) as unknown as GPU;

describe('probeWebGpu', () => {
  it('reports a browser without WebGPU', async () => {
    expect(await probeWebGpu(undefined)).toEqual({ kind: 'no-webgpu' });
  });

  it('reports a browser that offers no adapter', async () => {
    expect(await probeWebGpu(fakeGpu(() => Promise.resolve(null)))).toEqual({ kind: 'no-adapter' });
  });

  it('names the adapter it was given, and opens its device', async () => {
    const device = { label: 'fake device' };
    const adapter = {
      info: { vendor: 'apple', architecture: 'metal-3' },
      requestDevice: () => Promise.resolve(device),
    };
    expect(await probeWebGpu(fakeGpu(() => Promise.resolve(adapter)))).toEqual({
      kind: 'ready',
      adapter: 'apple metal-3',
      device,
    });
  });

  it('reports an adapter that will not open a device', async () => {
    const adapter = { info: {}, requestDevice: () => Promise.reject(new Error('limits exceeded')) };
    expect(await probeWebGpu(fakeGpu(() => Promise.resolve(adapter)))).toEqual({
      kind: 'failed',
      reason: 'limits exceeded',
    });
  });

  it('turns a thrown error into a failure it can explain', async () => {
    const result = await probeWebGpu(fakeGpu(() => Promise.reject(new Error('device lost'))));
    expect(result).toEqual({ kind: 'failed', reason: 'device lost' });
  });
});

describe('describeGpuSupport', () => {
  it('explains every outcome in words', () => {
    const outcomes = [
      { kind: 'ready', adapter: 'x' },
      { kind: 'no-webgpu' },
      { kind: 'no-adapter' },
      { kind: 'failed', reason: 'y' },
    ] as const;
    for (const outcome of outcomes) {
      const { title, body } = describeGpuSupport(outcome);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });
});
