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

// What makes two records' machines the same: the platform, architecture, processor and its count of cores. The kernel
// and the operating system's version may be updated during a run of days, and WSL may be given more or less memory,
// without making it another machine (DECISIONS.md, 2026-10-03). Null if the same, or what differs.
export const IDENTITY = ['platform', 'arch', 'cpu', 'cores'] as const;
export function machineDiffers(was: Record<string, unknown>, now: Record<string, unknown>): string | null {
  const key = IDENTITY.find((k) => was[k] !== now[k]);
  return key === undefined ? null : `its ${key} was ${String(was[key])}, not ${String(now[key])}`;
}
