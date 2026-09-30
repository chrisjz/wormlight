import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../data/sources.ts';
import { JOBS, USES, jobsFor, needs, reachable, traced, type Job } from './changes.ts';

const code = traced();
const only = (...jobs: Job[]): Record<Job, boolean> =>
  Object.fromEntries(JOBS.map((job) => [job, jobs.includes(job)])) as Record<Job, boolean>;

describe('tracing a job’s code', () => {
  it('follows imports, re-exports, literal dynamic imports and an HTML page’s scripts and stylesheets', () => {
    const root = mkdtempSync(join(tmpdir(), 'wormlight-ci-'));
    const files: Record<string, string> = {
      'page.html': '<link rel="stylesheet" href="/src/style.css"><script type="module" src="/src/main.ts"></script>',
      'src/style.css': 'body {}',
      'src/main.ts': "import { a } from './a.ts';\nimport './side';\nexport * from './lib/index.ts';",
      'src/a.ts': "const b = await import('./b.ts');\nimport data from './shader.wgsl?raw';",
      'src/b.ts': "import { readFileSync } from 'node:fs';\nimport { x } from 'some-package';",
      'src/side.ts': '',
      'src/lib/index.ts': "export {\n  c,\n  d,\n} from '../c.ts';",
      'src/c.ts': '',
      'src/shader.wgsl': '',
      'src/unused.ts': "import './c.ts';",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    try {
      expect([...reachable(['page.html'], root)].sort()).toEqual(
        Object.keys(files)
          .filter((f) => f !== 'src/unused.ts')
          .sort(),
      );
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it('reaches each job’s own code in this repository', () => {
    expect(code.site.has('src/main.ts')).toBe(true);
    expect(code.site.has('src/sim/brain/brain.ts')).toBe(true);
    expect(code.gpu.has('src/gpu/parityPage.ts')).toBe(true);
    expect(code.gpu.has('scripts/browser.ts')).toBe(true);
    expect(code.visual.has('scripts/visual/views.ts')).toBe(true);
    expect(code.data.has('src/validation/posture.ts')).toBe(true);
    // No page or job script imports the trials or the unit tests. The ledger reaches the app, whose About the
    // science shows it, and so the jobs that build and capture it, but not the data build or GPU parity.
    for (const job of JOBS) {
      const stray = [...code[job]].filter((f) => f.startsWith('src/validation/trial') || f.endsWith('.test.ts'));
      expect(stray, job).toEqual([]);
    }
    expect(code.site.has('src/science/fidelity.ts')).toBe(true);
    expect(code.data.has('src/science/fidelity.ts')).toBe(false);
    expect(code.gpu.has('src/science/fidelity.ts')).toBe(false);
  });
});

describe("CI's jobs", () => {
  it('run for the files each reads without importing', () => {
    const baselines = readdirSync(join(ROOT, 'tests/visual/baseline')).map((f) => `tests/visual/baseline/${f}`);
    const reads: Record<Job, readonly string[]> = {
      site: ['public/data/wormlight.v1.json', 'public/favicon.svg', 'vite.config.ts'],
      visual: ['public/data/wormlight.v1.json', ...baselines],
      gpu: ['public/data/wormlight.v1.json', 'parity.html', 'vite.config.ts'],
      data: [
        'data/sources.json',
        'data/sign-overrides.csv',
        'data/vendor/nematode/connectome.v1.json',
        'DATA_SOURCES.md',
      ],
    };
    for (const job of JOBS) {
      for (const file of [...reads[job], ...USES[job].entries]) expect(needs(file, code), file).toContain(job);
    }
  });

  it('run checks alone for the docs, the ledger page, the trials and the unit tests', () => {
    expect(
      jobsFor(
        [
          'PLAN.md',
          'DECISIONS.md',
          'FIDELITY.md',
          'scripts/docs/page.ts',
          'src/validation/trial.ts',
          'scripts/harness/run.ts',
          'scripts/calibrate/run.ts',
          'data/calibration/r2.json',
          'data/equivalence/refit.json',
          'src/sim/world.test.ts',
          'tests/harness.test.ts',
          'tools/reference/ni_reference.py',
        ],
        code,
      ),
    ).toEqual(only());
    expect(jobsFor([], code)).toEqual(only());
  });

  it("run the site and the visual tests for the ledger, which the app's About the science shows", () => {
    expect(jobsFor(['src/science/fidelity.ts'], code)).toEqual(only('site', 'visual'));
    expect(jobsFor(['src/science/ledger.ts'], code)).toEqual(only('site', 'visual'));
  });

  it('run each job for its own code, and every job for the workflow, these rules or the dependencies', () => {
    expect(jobsFor(['src/ui/inspector.ts'], code)).toEqual(only('site', 'visual'));
    expect(jobsFor(['src/sim/brain/brain.ts'], code)).toEqual(only('site', 'visual', 'gpu'));
    expect(jobsFor(['src/science/citations.ts'], code)).toEqual(only('site', 'data', 'visual', 'gpu'));
    expect(jobsFor(['src/validation/posture.ts'], code)).toEqual(only('data'));
    expect(jobsFor(['tests/visual/baseline/plate.png'], code)).toEqual(only('visual'));
    for (const file of ['.github/workflows/ci.yml', 'scripts/ci/changes.ts', 'package-lock.json']) {
      expect(jobsFor([file], code), file).toEqual(only(...JOBS));
    }
  });
});
