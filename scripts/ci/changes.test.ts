import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../data/sources.ts';
import { JOBS, jobsFor, needs, type Job } from './changes.ts';

// Every repository file reachable from the entries by static imports, literal dynamic imports, and an HTML
// page's scripts and stylesheets.
function reachable(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const resolveSpec = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
    const path = spec.split('?')[0];
    const base = path.startsWith('/') ? join(ROOT, path) : resolve(dirname(from), path);
    return [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
  };
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!/\.(ts|html)$/.test(file)) return;
    const text = readFileSync(file, 'utf8');
    const patterns = [
      /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
      /import\s*['"]([^'"]+)['"]/g,
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,
      /<script[^>]*\ssrc="([^"]+)"/g,
      /<link[^>]*\shref="([^"]+)"/g,
    ];
    for (const pattern of patterns) {
      for (const [, spec] of text.matchAll(pattern)) {
        const next = resolveSpec(file, spec);
        if (next) visit(next);
      }
    }
  };
  for (const entry of entries) visit(join(ROOT, entry));
  return [...seen].map((f) => relative(ROOT, f)).sort();
}

// What each job runs: its pages and scripts, and the files they read at run time.
const ENTRIES: Record<Job, readonly string[]> = {
  site: ['index.html'],
  visual: ['index.html', 'scripts/visual/capture.ts', 'scripts/visual/compare.ts'],
  gpu: ['parity.html', 'scripts/gpu/parity.ts'],
  data: ['scripts/data/build.ts'],
};
const READ: Record<Job, readonly string[]> = {
  site: ['public/data/wormlight.v1.json', 'public/favicon.svg'],
  visual: [
    'public/data/wormlight.v1.json',
    ...readdirSync(join(ROOT, 'tests/visual/baseline')).map((f) => `tests/visual/baseline/${f}`),
  ],
  gpu: ['public/data/wormlight.v1.json'],
  data: [
    'data/sources.json',
    'data/sign-overrides.csv',
    'data/c302-cells.sha256',
    'data/vendor/nematode/connectome.v1.json',
  ],
};

describe("CI's jobs", () => {
  for (const job of JOBS) {
    it(`run ${job} when anything it imports or reads changes`, () => {
      const files = [...reachable(ENTRIES[job]), ...READ[job]];
      expect(files.length).toBeGreaterThan(ENTRIES[job].length);
      expect(files.filter((f) => !needs(f).includes(job))).toEqual([]);
    });
  }

  it('run checks alone for the docs, the trials and the unit tests', () => {
    const none = { site: false, data: false, visual: false, gpu: false };
    expect(jobsFor(['PLAN.md', 'DECISIONS.md', 'VALIDATION.md', 'README.md', 'FIDELITY.md'])).toEqual(none);
    expect(
      jobsFor([
        'src/validation/trial.ts',
        'scripts/harness/run.ts',
        'scripts/calibrate/run.ts',
        'data/calibration/r2.json',
        'data/equivalence/refit.json',
        'src/sim/world.test.ts',
        'tests/harness.test.ts',
        'tools/reference/ni_reference.py',
      ]),
    ).toEqual(none);
    expect(jobsFor([])).toEqual(none);
  });

  it('run each job for its own files, and every job for the workflow, these rules or the dependencies', () => {
    expect(jobsFor(['src/ui/panel.ts'])).toEqual({ site: true, data: false, visual: true, gpu: false });
    expect(jobsFor(['src/sim/brain/brain.ts'])).toEqual({ site: true, data: false, visual: true, gpu: true });
    expect(jobsFor(['src/science/citations.ts'])).toEqual({ site: true, data: true, visual: true, gpu: true });
    expect(jobsFor(['src/validation/posture.ts'])).toEqual({ site: false, data: true, visual: false, gpu: false });
    expect(jobsFor(['DATA_SOURCES.md'])).toEqual({ site: false, data: true, visual: false, gpu: false });
    expect(jobsFor(['tests/visual/baseline/plate.png'])).toEqual({
      site: false,
      data: false,
      visual: true,
      gpu: false,
    });
    for (const file of ['.github/workflows/ci.yml', 'scripts/ci/changes.ts', 'package-lock.json']) {
      expect(jobsFor([file]), file).toEqual({ site: true, data: true, visual: true, gpu: true });
    }
  });
});
