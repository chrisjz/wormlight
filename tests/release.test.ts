// The release version (PLAN §8, "Releases"): package.json, its lock file and CITATION.cff carry it, and must agree,
// so a release's tag, its citation and the app's About the science all name one version.

import { describe, expect, it } from 'vitest';
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

// A top-level field of the citation, which is YAML: one line, `key: value`, unquoted or quoted.
const field = (key: string): string | undefined =>
  citation.match(new RegExp(`^${key}: *['"]?([^'"\\n]*?)['"]? *$`, 'm'))?.[1];

describe('the release version', () => {
  it('is semantic, below 1.0.0 while the model can still change', () => {
    expect(pkg.version).toMatch(/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
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
});
