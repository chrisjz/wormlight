// data/sources.json: the pinned inputs the data build reads, and the datasets Wormlight credits.
// Downloads are cached in data/cache/ under their SHA-256, and every byte read is checked against its pin.

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FilePin {
  // A file in this repository, or a URL to download.
  path?: string;
  url?: string;
  sha256: string;
}

export interface Pin {
  id: string;
  description: string;
  files?: FilePin[];
  // A pin covering many files: a manifest of `sha256  file` lines, each fetched from the URL template.
  manifest?: { path: string; sha256: string; urlTemplate: string };
  origin?: { repository: string; commit: string; command?: string };
  retrieved: string;
}

export interface Notice {
  title: string;
  attribution: string;
  copyright: string;
  licence: string;
  spdx: string;
}

export interface Dataset {
  id: string;
  use: 'shipped' | 'tests' | 'consulted';
  pins?: string[];
  planned?: string;
  dataset: string;
  takes: string;
  route?: string;
  licence?: string;
  // A licence text, from `licenceTexts`, that must travel with anything reproduced from the dataset.
  licenceText?: string;
  notice?: Notice;
}

export interface Sources {
  // A short reference for every citation id the runtime file uses.
  citations: Record<string, string>;
  // Full licence texts that notices and reports must reproduce, by key.
  licenceTexts: Record<string, string>;
  pins: Pin[];
  datasets: Dataset[];
}

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CACHE = join(ROOT, 'data', 'cache');
const USES: readonly string[] = ['shipped', 'tests', 'consulted'];

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Check the parsed file's cross-references, so that a typo fails the build instead of silently dropping
// a dataset, or its attribution, from the generated pages.
export function validateSources(sources: Sources): Sources {
  const pins = new Set(sources.pins.map((p) => p.id));
  for (const pin of sources.pins) {
    const digests = [...(pin.files ?? []).map((f) => f.sha256), ...(pin.manifest ? [pin.manifest.sha256] : [])];
    if (digests.length === 0) throw new Error(`pin ${pin.id} pins nothing`);
    for (const digest of digests)
      if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error(`pin ${pin.id}: bad digest ${digest}`);
  }
  for (const dataset of sources.datasets) {
    const where = `dataset ${dataset.id}`;
    if (!USES.includes(dataset.use)) throw new Error(`${where}: use "${dataset.use}" is not one of ${USES.join(', ')}`);
    for (const pin of dataset.pins ?? []) if (!pins.has(pin)) throw new Error(`${where} names unknown pin ${pin}`);
    if (dataset.licenceText && !(dataset.licenceText in sources.licenceTexts)) {
      throw new Error(`${where} names unknown licence text ${dataset.licenceText}`);
    }
    if (dataset.use === 'shipped') {
      const notice = dataset.notice;
      if (!dataset.licence || !notice) throw new Error(`${where} ships, so it needs a licence and a notice`);
      for (const field of ['title', 'attribution', 'copyright', 'licence', 'spdx'] as const) {
        if (!notice[field]) throw new Error(`${where}: notice has no ${field}`);
      }
      if (!dataset.pins?.length) throw new Error(`${where} ships, so it must name the pin it comes from`);
    }
  }
  return sources;
}

export function loadSources(): Sources {
  return validateSources(JSON.parse(readFileSync(join(ROOT, 'data', 'sources.json'), 'utf8')) as Sources);
}

class PinMismatch extends Error {
  override name = 'PinMismatch';
}

export function verify(bytes: Buffer, expected: string, what: string): Buffer {
  const actual = sha256(bytes);
  if (actual !== expected) throw new PinMismatch(`${what} has SHA-256 ${actual}, not the pinned ${expected}`);
  return bytes;
}

// A repository file, by a path relative to the repository root (or an absolute one).
export function readLocal(path: string, expected: string): Buffer {
  return verify(readFileSync(isAbsolute(path) ? path : join(ROOT, path)), expected, path);
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Download `url`, or read it from the cache. A cached file that fails its pin is deleted and downloaded
// again; a download that fails its pin is an error at once, since retrying cannot change the bytes.
// Other failures are retried with exponential backoff, honouring a server's Retry-After.
export async function download(url: string, expected: string, cache = CACHE, backoffMs = 1000): Promise<Buffer> {
  const cached = join(cache, expected);
  if (existsSync(cached)) {
    try {
      return verify(readFileSync(cached), expected, `cached ${url}`);
    } catch (error) {
      if (!(error instanceof PinMismatch)) throw error;
      rmSync(cached);
    }
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let delay = backoffMs * 2 ** (attempt - 1);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) delay = Math.min(retryAfter, 60) * 1000;
        throw new Error(`HTTP ${response.status}`);
      }
      const bytes = verify(Buffer.from(await response.arrayBuffer()), expected, url);
      mkdirSync(cache, { recursive: true });
      // Each writer uses its own temporary name, so two builds sharing a cache never publish a partial file.
      const partial = `${cached}.${process.pid}.${randomUUID()}.part`;
      writeFileSync(partial, bytes);
      renameSync(partial, cached);
      return bytes;
    } catch (error) {
      if (error instanceof PinMismatch) throw error;
      lastError = error;
      if (attempt < 4) await wait(delay);
    }
  }
  throw new Error(`could not download ${url}: ${String(lastError)}`);
}

export async function readFile(pin: FilePin): Promise<Buffer> {
  if (pin.path) return readLocal(pin.path, pin.sha256);
  if (pin.url) return download(pin.url, pin.sha256);
  throw new Error('a file pin needs a path or a URL');
}

// Every file a manifest pin covers, by file name, downloading up to eight at a time.
export async function readManifest(pin: Pin): Promise<Map<string, Buffer>> {
  const manifest = pin.manifest;
  if (!manifest) throw new Error(`pin ${pin.id} has no manifest`);
  const lines = readLocal(manifest.path, manifest.sha256).toString('utf8').trim().split('\n');
  const entries = lines.map((line) => {
    const match = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
    if (!match) throw new Error(`${manifest.path}: malformed line "${line}"`);
    return { sha256: match[1], file: match[2] };
  });
  const files = new Map<string, Buffer>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const { sha256: expected, file } = entries[next++];
      files.set(file, await download(manifest.urlTemplate.replace('{file}', file), expected));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return files;
}

export function pinById(sources: Sources, id: string): Pin {
  const pin = sources.pins.find((p) => p.id === id);
  if (!pin) throw new Error(`no pin ${id} in data/sources.json`);
  return pin;
}
