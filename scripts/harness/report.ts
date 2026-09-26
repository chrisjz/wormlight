// The harness's results as VALIDATION.md shows them: each checkpoint's section, written between its markers
// so the prose around it stays hand-written.

import { PARAMS, type Param } from '../../src/science/params.ts';
import { CALIBRATED } from '../../src/sim/world.ts';
import {
  CHECKPOINT_1,
  type Checkpoint0,
  type Checkpoint1,
  type Clause,
  type TrialSummary,
} from '../../src/validation/checkpoints.ts';
import { table } from '../data/render.ts';

export interface RunInfo {
  date: string;
  commit: string;
  trials: number;
  seconds: number;
}

export function parameterText(): string {
  const values = CALIBRATED.map((id) => {
    const p: Param = PARAMS[id];
    return `${p.symbol} = ${String(p.provisional).replace('-', '−')} ${p.unit}`;
  });
  return `the provisional parameters, not calibrated (PLAN §6.2): ${values.join(', ')}`;
}

// "1 trial", "2 trials".
const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;
// A signed figure, with a true minus sign, and none on a value that rounds to zero.
const fixed = (x: number, digits: number): string => {
  const text = x.toFixed(digits);
  return /^-0\.0*$/.test(text) ? text.slice(1) : text.replace(/^-/, '−');
};
const percent = (x: number): string => `${(100 * x).toFixed(0)}%`;
const band = ([lo, hi]: readonly [number, number]): string => `${lo.toFixed(2)}–${hi.toFixed(2)}`;

function trialTable(trials: readonly TrialSummary[]): string {
  return table(
    [
      'Seed',
      'Posture',
      'Forward / paused / backward',
      'Longest forward run (s)',
      'Reversals',
      'Mean velocity (body lengths/s)',
      'Self-intersecting postures',
    ],
    trials.map((t) => [
      String(t.seed),
      String(t.posture + 1),
      `${percent(t.forward)} / ${percent(t.paused)} / ${percent(t.backward)}`,
      t.longestBout.toFixed(1),
      String(t.reversals),
      fixed(t.meanVelocity, 4),
      String(t.selfIntersecting),
    ]),
  );
}

function runLine(info: RunInfo, trials: readonly TrialSummary[]): string {
  const unconverged = trials.reduce((n, t) => n + t.unconverged, 0);
  const infinite = trials.filter((t) => !t.finite).length;
  return [
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${info.trials === 1 ? 'seed 1' : `seeds 1 to ${info.trials}`}, on ${parameterText()}.`,
    `Every measure starts after each trial's first 10 s. ${infinite === 0 ? 'Every trial stayed finite' : `${count(infinite, 'trial')} left the finite numbers`}, and ${unconverged === 0 ? 'no brain solve failed to converge' : `${count(unconverged, 'brain solve')} failed to converge`}.`,
  ].join(' ');
}

const GRADE = { pass: '**Pass**', partial: '**Partial**', fail: '**Fail**' } as const;

export function checkpoint0Section(result: Checkpoint0, info: RunInfo): string {
  const reversals = result.trials.reduce((n, t) => n + t.reversals, 0);
  const minutes = result.trials.reduce((n, t) => n + t.measured, 0) / 60;
  const longest = Math.max(0, ...result.trials.map((t) => t.longestBout));
  return [
    `### Checkpoint 0: the silenced network, crawling clause — ${GRADE[result.grade]}`,
    runLine(info, result.trials),
    `No forward bout of 10 s or more in any trial is the pass. There ${result.bouts === 1 ? 'was 1' : `were ${result.bouts}`}; the longest forward run lasted ${longest.toFixed(1)} s. Backward activity, reported and not graded: ${count(reversals, 'reversal')} of 1 s or more, ${(reversals / minutes).toFixed(2)} a minute.`,
    trialTable(result.trials),
  ].join('\n\n');
}

const CLAUSES: Record<
  string,
  { label: string; kind: string; show: (x: number) => string; pass: string; partial: string }
> = {
  frequency: {
    label: 'Frequency (Hz)',
    kind: 'Calibration target',
    show: (x) => x.toFixed(3),
    pass: band(CHECKPOINT_1.frequency.pass),
    partial: band(CHECKPOINT_1.frequency.partial),
  },
  wavelength: {
    label: 'Wavelength (body lengths)',
    kind: 'Calibration target',
    show: (x) => x.toFixed(2),
    pass: band(CHECKPOINT_1.wavelength.pass),
    partial: band(CHECKPOINT_1.wavelength.partial),
  },
  speed: {
    label: 'Speed (body lengths/s)',
    kind: 'Calibration target',
    show: (x) => x.toFixed(3),
    pass: band(CHECKPOINT_1.speed.pass),
    partial: band(CHECKPOINT_1.speed.partial),
  },
  eigenworms: {
    label: 'Posture variance the four eigenworms capture',
    kind: 'Predicted',
    show: (x) => `${(100 * x).toFixed(1)}%`,
    pass: `≥ ${percent(CHECKPOINT_1.eigenworms.pass)}`,
    partial: `≥ ${percent(CHECKPOINT_1.eigenworms.partial)}`,
  },
  bout: {
    label: `Trials with a forward bout of ${CHECKPOINT_1.bout.seconds} s or more`,
    kind: 'Predicted',
    show: (x) => percent(x),
    pass: `≥ ${percent(CHECKPOINT_1.bout.pass)}`,
    partial: `≥ ${percent(CHECKPOINT_1.bout.partial)}`,
  },
};

const clauseRow = (c: Clause): string[] => {
  const d = CLAUSES[c.name];
  return [
    d.label,
    c.value === null ? 'unmeasured: no bout of 10 s' : d.show(c.value),
    d.pass,
    d.partial,
    GRADE[c.grade],
    d.kind,
  ];
};

export function checkpoint1Section(result: Checkpoint1, info: RunInfo): string {
  const k = result.kinematics;
  const selfIntersecting = result.trials.reduce((n, t) => n + t.selfIntersecting, 0);
  const wave =
    k.lag === null
      ? ''
      : ` The rear rod's curvature followed the front's best at a lag of ${k.lag.toFixed(2)} s, correlation ${k.correlation?.toFixed(2)}.`;
  return [
    `### Checkpoint 1: crawling — ${GRADE[result.grade]}`,
    runLine(info, result.trials),
    table(['Clause', 'Measured', 'Pass', 'Partial', 'Grade', 'Kind'], result.clauses.map(clauseRow)),
    `The kinematics come from ${count(k.bouts, 'forward bout')} of 10 s or more, ${k.duration.toFixed(1)} s in all.${wave} The eigenworm clause pools ${result.postures.toLocaleString('en-GB')} postures sampled at 4 Hz; ${selfIntersecting} self-intersecting ones were left out. The kinematic clauses are calibration targets, but the parameters are provisional, not calibrated.`,
    trialTable(result.trials),
  ].join('\n\n');
}

// Replace the text between a checkpoint's markers in the page.
export function replaceSection(page: string, checkpoint: number, section: string): string {
  const start = `<!-- harness:checkpoint-${checkpoint} -->`;
  const end = `<!-- /harness:checkpoint-${checkpoint} -->`;
  const a = page.indexOf(start);
  const b = page.indexOf(end);
  if (a < 0 || b < a) throw new Error(`VALIDATION.md has no markers for checkpoint ${checkpoint}`);
  return `${page.slice(0, a + start.length)}\n\n${section}\n\n${page.slice(b)}`;
}
