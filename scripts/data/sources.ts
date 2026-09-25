// data/sources.json: the pinned inputs the data build reads, and the datasets Wormlight credits.
// Downloads are cached in data/cache/ under their SHA-256, and every byte read is checked against its pin.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

export interface Dataset {
  id: string;
  use: 'shipped' | 'tests' | 'consulted';
  pins?: string[];
  planned?: string;
  dataset: string;
  takes: string;
  route?: string;
  licence?: string;
  notice?: { title: string; licence: string; attribution: string; licenceText?: string };
}

export interface Sources {
  // Full licence texts that a notice must reproduce, by key.
  licenceTexts: Record<string, string>;
  pins: Pin[];
  datasets: Dataset[];
}

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CACHE = join(ROOT, 'data', 'cache');

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function loadSources(): Sources {
  const sources = JSON.parse(readFileSync(join(ROOT, 'data', 'sources.json'), 'utf8')) as Sources;
  const pins = new Set(sources.pins.map((p) => p.id));
  for (const dataset of sources.datasets) {
    for (const pin of dataset.pins ?? []) {
      if (!pins.has(pin)) throw new Error(`dataset ${dataset.id} names unknown pin ${pin}`);
    }
    const text = dataset.notice?.licenceText;
    if (text && !(text in sources.licenceTexts))
      throw new Error(`dataset ${dataset.id} names unknown licence text ${text}`);
  }
  return sources;
}

function checked(bytes: Buffer, expected: string, what: string): Buffer {
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${what} has SHA-256 ${actual}, not the pinned ${expected}`);
  return bytes;
}

export function readLocal(path: string, expected: string): Buffer {
  return checked(readFileSync(join(ROOT, path)), expected, path);
}

async function download(url: string, expected: string): Promise<Buffer> {
  const cached = join(CACHE, expected);
  if (existsSync(cached)) return checked(readFileSync(cached), expected, `cached ${url}`);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = checked(Buffer.from(await response.arrayBuffer()), expected, url);
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(`${cached}.part`, bytes);
      renameSync(`${cached}.part`, cached);
      return bytes;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.includes('not the pinned')) throw error;
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
