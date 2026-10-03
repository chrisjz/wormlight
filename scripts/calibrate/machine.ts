// The machine a record was made on, for checkpoint 6's "one machine and one version of Node" (DECISIONS.md,
// 2026-10-03): its platform and processor, not its name. Its own module, since the runner's workers and the preview's
// share the --worker flag.

import { arch, cpus, platform, release, totalmem, version } from 'node:os';

export function machine(): Record<string, string | number> {
  const cores = cpus();
  return {
    platform: platform(),
    release: release(),
    os: version(),
    arch: arch(),
    cpu: cores[0]?.model.trim() ?? 'unknown',
    cores: cores.length,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
  };
}
