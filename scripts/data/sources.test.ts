import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { download, loadSources, readLocal, sha256, validateSources, type Sources } from './sources.ts';

const bytes = Buffer.from('pinned bytes');
const digest = sha256(bytes);

describe('the committed sources file', () => {
  it('passes its own validation', () => {
    expect(loadSources().datasets.filter((d) => d.use === 'shipped')).toHaveLength(5);
  });
});

describe('validateSources', () => {
  const sources = (): Sources => ({
    licenceTexts: { mit: 'MIT' },
    pins: [
      { id: 'p', description: 'd', files: [{ url: 'https://example.invalid/x', sha256: digest }], retrieved: 'r' },
    ],
    datasets: [
      {
        id: 'd',
        use: 'shipped',
        pins: ['p'],
        dataset: 'D',
        takes: 'T',
        licence: 'MIT',
        licenceText: 'mit',
        notice: { title: 't', attribution: 'a', copyright: 'c', licence: 'l', spdx: 'MIT' },
      },
    ],
  });

  it('accepts a consistent file', () => {
    expect(() => validateSources(sources())).not.toThrow();
  });

  const broken: [string, (s: Sources) => void, RegExp][] = [
    ['a mistyped use', (s) => ((s.datasets[0] as { use: string }).use = 'Shipped'), /use "Shipped"/],
    ['a shipped dataset without a notice', (s) => delete s.datasets[0].notice, /needs a licence and a notice/],
    [
      'a notice without a copyright line',
      (s) => s.datasets[0].notice && (s.datasets[0].notice.copyright = ''),
      /copyright/,
    ],
    ['an unknown pin', (s) => (s.datasets[0].pins = ['q']), /unknown pin q/],
    ['an unknown licence text', (s) => (s.datasets[0].licenceText = 'gpl'), /unknown licence text/],
    ['a malformed digest', (s) => s.pins[0].files && (s.pins[0].files[0].sha256 = 'abc'), /bad digest/],
  ];
  it.each(broken)('refuses %s', (_, breakIt, message) => {
    const s = sources();
    breakIt(s);
    expect(() => validateSources(s)).toThrow(message);
  });
});

describe('readLocal', () => {
  it('returns bytes that match their pin and refuses bytes that do not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wormlight-'));
    writeFileSync(join(dir, 'f'), bytes);
    expect(readLocal(join(dir, 'f'), digest)).toEqual(bytes);
    expect(() => readLocal(join(dir, 'f'), sha256(Buffer.from('other')))).toThrow(/not the pinned/);
  });
});

describe('download', () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: Buffer, status = 200) => new Response(new Uint8Array(body), { status });

  it('fetches, verifies and caches a file, then serves it from the cache', async () => {
    const cache = mkdtempSync(join(tmpdir(), 'wormlight-'));
    const fetch = vi.fn(() => Promise.resolve(respond(bytes)));
    vi.stubGlobal('fetch', fetch);
    expect(await download('https://example.invalid/x', digest, cache, 0)).toEqual(bytes);
    expect(await download('https://example.invalid/x', digest, cache, 0)).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cache, digest))).toEqual(bytes);
  });

  it('replaces a corrupt cached file instead of failing on it forever', async () => {
    const cache = mkdtempSync(join(tmpdir(), 'wormlight-'));
    writeFileSync(join(cache, digest), 'corrupt');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respond(bytes))),
    );
    expect(await download('https://example.invalid/x', digest, cache, 0)).toEqual(bytes);
    expect(readFileSync(join(cache, digest))).toEqual(bytes);
  });

  it('fails at once when the server sends the wrong bytes, since retrying cannot help', async () => {
    const fetch = vi.fn(() => Promise.resolve(respond(Buffer.from('other'))));
    vi.stubGlobal('fetch', fetch);
    await expect(
      download('https://example.invalid/x', digest, mkdtempSync(join(tmpdir(), 'wormlight-')), 0),
    ).rejects.toThrow(/not the pinned/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a failed request, and gives up after four attempts', async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(respond(Buffer.from(''), 503))
      .mockResolvedValue(respond(bytes));
    vi.stubGlobal('fetch', flaky);
    expect(await download('https://example.invalid/x', digest, mkdtempSync(join(tmpdir(), 'wormlight-')), 0)).toEqual(
      bytes,
    );
    const down = vi.fn(() => Promise.resolve(respond(Buffer.from(''), 500)));
    vi.stubGlobal('fetch', down);
    await expect(
      download('https://example.invalid/y', digest, mkdtempSync(join(tmpdir(), 'wormlight-')), 0),
    ).rejects.toThrow(/could not download/);
    expect(down).toHaveBeenCalledTimes(4);
  });
});
