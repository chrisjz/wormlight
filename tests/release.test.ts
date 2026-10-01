// The release version (PLAN §8, "Releases"): package.json, its lock file and CITATION.cff carry it, and must agree,
// so a release's tag, its citation and the app's About the science all name one version.

import { describe, expect, it } from 'vitest';
import { CITATIONS } from '../src/science/citations.ts';
import { readJson, readRepo } from './checks.ts';

interface Package {
  version: string;
  license: string;
}
interface Lock {
  version: string;
  packages: Record<string, { version?: string }>;
}

const pkg = readJson<Package>('package.json');
const lock = readJson<Lock>('package-lock.json');
const citation = readRepo('CITATION.cff').toString('utf8');

// A top-level field of the citation, which is YAML: one line, `key: value`, the value unquoted or quoted, and a
// comment after it allowed.
const field = (key: string): string | undefined =>
  citation.match(new RegExp(`^${key}:[ \\t]+(['"]?)([^'"#\\n]*?)\\1[ \\t]*(?:#.*)?$`, 'm'))?.[2];

describe('the release version', () => {
  it('is semantic, below 1.0.0 while the model can still change', () => {
    // 1.0.0 is the maintainer's to call, with the rules after it (PLAN §8): change this test when it is.
    expect(pkg.version, 'a release below 1.0.0, PLAN §8').toMatch(/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });

  it('is the same in package.json, its lock file and CITATION.cff', () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
    expect(field('version')).toBe(pkg.version);
  });

  it("gives the citation the package's licence, a real release date and the format GitHub reads", () => {
    expect(field('cff-version')).toBe('1.2.0');
    expect(field('license')).toBe(pkg.license);
    const date = field('date-released') ?? '';
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
  });

  it("cites only works the registry holds, by the registry's DOIs", () => {
    const dois = [...citation.matchAll(/^ +doi: *(\S+)$/gm)].map((m) => m[1].toLowerCase());
    const registry = new Set(Object.values(CITATIONS).flatMap((c) => (c.doi ? [c.doi.toLowerCase()] : [])));
    expect(dois.length).toBeGreaterThan(0);
    for (const doi of dois) expect(registry.has(doi), doi).toBe(true);
  });
});
