// The harness's results as VALIDATION.md shows them: each checkpoint's section, written between its markers
// so the prose around it stays hand-written.

import { grouped } from '../../src/science/facts.ts';
import { PARAMS, type Param } from '../../src/science/params.ts';
import { CAPTURE_RADIUS, SPOT } from '../../src/sim/env/dish.ts';
import { CALIBRATED } from '../../src/sim/world.ts';
import {
  CHECKPOINT_0_CHEMOTAXIS,
  CHECKPOINT_0_TOUCH,
  CHECKPOINT_1,
  touchSchedule,
  type Checkpoint0,
  type Checkpoint1,
  type Diagnostics,
  type Clause,
  type TrialSummary,
} from '../../src/validation/checkpoints.ts';
import { table } from '../data/render.ts';
import { formatNumber } from '../docs/page.ts';

export interface RunInfo {
  date: string;
  commit: string;
  // Whether the run used the calibrated parameters, or the provisional ones.
  calibrated: boolean;
  trials: number;
  seconds: number;
  // Checkpoint 0's assay runs: how many worms, each for up to how long (s).
  worms?: number;
  wormSeconds?: number;
}

// The parameters a run used: the calibrated ones, to three significant figures, as FIDELITY.md shows them, or
// the provisional ones.
export function parameterText(calibrated: boolean): string {
  if (calibrated && CALIBRATED.some((id) => PARAMS[id].value === null)) {
    throw new Error("a run on calibrated parameters, but the registry's aren't calibrated");
  }
  const values = CALIBRATED.map((id) => {
    const p: Param = PARAMS[id];
    const v = calibrated ? Number((p.value as number).toPrecision(3)) : (p.provisional as number);
    return `${p.symbol} = ${formatNumber(v)}${p.unit ? ` ${p.unit}` : ''}`;
  });
  return calibrated
    ? `the calibrated parameters (PLAN §7.3), here to three significant figures: ${values.join(', ')}`
    : `the provisional parameters, not calibrated (PLAN §6.2): ${values.join(', ')}`;
}

// "1 trial", "2 trials".
const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;
// "1 touch", "2 touches".
const plural = (n: number, one: string, more: string): string => `${n} ${n === 1 ? one : more}`;
// A signed figure, with a true minus sign, and none on a value that rounds to zero.
const fixed = (x: number, digits: number): string => {
  const text = x.toFixed(digits);
  return /^-0\.0*$/.test(text) ? text.slice(1) : text.replace(/^-/, '−');
};
const percent = (x: number): string => `${(100 * x).toFixed(0)}%`;
// Shares as whole percentages that add up to 100, by largest remainder.
export function shares(parts: readonly number[]): string[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total <= 0) return parts.map(() => '0%');
  const exact = parts.map((p) => (100 * p) / total);
  const whole = exact.map(Math.floor);
  const order = exact.map((e, i) => [e - whole[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < 100 - whole.reduce((a, b) => a + b, 0); k++) whole[order[k][1]]++;
  return whole.map((w) => `${w}%`);
}
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
      shares([t.forward, t.paused, t.backward]).join(' / '),
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
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${info.trials === 1 ? 'seed 1' : `seeds 1 to ${info.trials}`}, on ${parameterText(info.calibrated)}.`,
    `Every measure starts after each trial's first 10 s. ${infinite === 0 ? 'Every trial stayed finite' : `${count(infinite, 'trial')} left the finite numbers`}, and ${unconverged === 0 ? 'no brain solve failed to converge' : `${count(unconverged, 'brain solve')} failed to converge`}.`,
  ].join(' ');
}

const GRADE = { pass: '**Pass**', partial: '**Partial**', fail: '**Fail**' } as const;

// A p-value to two significant figures, or a bound below 0.001.
const pValue = (p: number): string => (p >= 0.001 ? `p = ${p.toPrecision(2)}` : 'p < 0.001');
// "seed 1", "seeds 1 to 20".
const seeds = (n: number): string => (n === 1 ? 'seed 1' : `seeds 1 to ${n}`);
const mm = (metres: number, digits = 2): string => (1000 * metres).toFixed(digits);
// A small number as "2.7 × 10⁻⁷", or 0.
export function scientific(x: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const [mantissa, exponent] = x.toExponential(1).split('e');
  const superscript = exponent.replace(/^\+/, '').replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
  return `${mantissa.replace('-', '−')} × 10${superscript}`;
}
// Backward activity, reported and not graded: reversals of 1 s or more, and how often.
function backward(trials: readonly TrialSummary[]): string {
  const reversals = trials.reduce((n, t) => n + t.reversals, 0);
  const minutes = trials.reduce((n, t) => n + t.measured, 0) / 60;
  return `${count(reversals, 'reversal')} of 1 s or more${minutes > 0 ? `, ${(reversals / minutes).toFixed(2)} a minute` : ''}`;
}

export function checkpoint0Section(result: Checkpoint0, info: RunInfo): string {
  const { crawling, touch, chemotaxis } = result;
  const { anterior, posterior } = touch;
  const worms = chemotaxis.runs;
  const trials = [...crawling.trials, ...touch.trials];
  const unconverged = trials.reduce((n, t) => n + t.unconverged, 0) + worms.reduce((n, w) => n + w.unconverged, 0);
  const infinite = trials.filter((t) => !t.finite).length + worms.filter((w) => !w.finite).length;
  const minutes = (info.wormSeconds ?? CHECKPOINT_0_CHEMOTAXIS.seconds) / 60;
  const run = [
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${seeds(info.trials)}, each run untouched and touched, and ${count(worms.length, 'worm')} in the assay for up to ${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min, ${seeds(worms.length)}, on ${parameterText(info.calibrated)}.`,
    `Every trial's measures start after its first 10 s. ${infinite === 0 ? 'Every trial and worm stayed finite' : `${plural(infinite, 'trial or worm', 'trials or worms')} left the finite numbers`}, and ${unconverged === 0 ? 'no brain solve failed to converge' : `${count(unconverged, 'brain solve')} failed to converge`}.`,
  ].join(' ');
  const { front, back, window, anteriorPartial, first, every } = CHECKPOINT_0_TOUCH;
  const backs = touch.touches.filter((t) => t.place === 'posterior');
  const rose = backs.filter((t) => t.after > t.before).length;
  const rise = backs.length > 0 ? backs.reduce((sum, t) => sum + t.after - t.before, 0) / backs.length : 0;
  // Why a reflex went unmeasured, if it did.
  const unmeasured = (touches: number, place: string): string =>
    `unmeasured: ${!touch.finite ? 'no touched trials, or one left the finite numbers' : touches === 0 ? `no ${place} touch` : 'a touch reached no receptor'}`;
  const clauses = table(
    ['Clause', 'Measured', 'Passes if', 'Grade'],
    [
      [
        'Crawling',
        `${count(crawling.bouts, 'forward bout')} of 10 s or more`,
        'None in any trial',
        GRADE[crawling.grade],
      ],
      [
        'Anterior touch',
        anterior.measured
          ? `A reversal within ${window} s after ${anterior.followed} of ${plural(anterior.touches, 'touch', 'touches')} (${percent(anterior.share)}), and in ${anterior.matched} of the matched windows; ${pValue(anterior.p)}`
          : unmeasured(anterior.touches, 'anterior'),
        `Under ${percent(anteriorPartial)}, or not more often than in the matched windows (Fisher's exact test, one-sided)`,
        GRADE[anterior.grade],
      ],
      [
        'Posterior touch',
        posterior.measured
          ? `Forward velocity ${fixed(posterior.before, 4)} before, ${fixed(posterior.after, 4)} after (body lengths/s), rising after ${rose} of ${plural(posterior.touches, 'touch', 'touches')} by ${scientific(rise)} on average; ${pValue(posterior.p)}`
          : unmeasured(posterior.touches, 'posterior'),
        "No significant rise (Wilcoxon's signed-rank test, one-sided)",
        GRADE[posterior.grade],
      ],
      [
        'Chemotaxis',
        `CI ${fixed(chemotaxis.index, 2)}: ${chemotaxis.odour} of ${chemotaxis.worms} at the odour, ${chemotaxis.control} at the control`,
        `Within ±${CHECKPOINT_0_CHEMOTAXIS.within} of zero`,
        GRADE[chemotaxis.grade],
      ],
    ],
  );
  const longest = Math.max(0, ...crawling.trials.map((t) => t.longestBout));
  // The receptors each place's touches reached, or null if none was made there.
  const reach = (place: 'anterior' | 'posterior'): string | null => {
    const sets = [...new Set(touch.touches.filter((t) => t.place === place).map((t) => t.reached.join(', ')))];
    if (sets.length === 0) return null;
    return sets.length === 1 ? sets[0] : sets.map((set) => `(${set})`).join(' or ');
  };
  const reached = (['anterior', 'posterior'] as const)
    .map((place) => {
      const where = place === 'anterior' ? 'front' : 'back';
      const r = reach(place);
      return r === null ? `no ${where} touch was made` : `each ${where} touch reached ${r}`;
    })
    .join('; ');
  const perTrial = touchSchedule(1, info.seconds).length;
  const schedule =
    perTrial === 1
      ? `each touched once, at t = ${first} s, at the front (F, s = ${front}) on odd seeds and the back (B, s = ${back}) on even ones`
      : `each touched ${perTrial} times, ${every} s apart from t = ${first} s, alternating front (F, s = ${front}) and back (B, s = ${back}), odd seeds starting at the front`;
  const bySeed = touch.trials.map((t) => {
    const mine = touch.touches.filter((o) => o.seed === t.seed);
    const ahead = mine.filter((o) => o.place === 'anterior');
    const behind = mine.filter((o) => o.place === 'posterior');
    const mean = (x: number[]): number => x.reduce((sum, v) => sum + v, 0) / x.length;
    return [
      String(t.seed),
      mine.map((o) => (o.place === 'anterior' ? 'F' : 'B')).join(' '),
      ahead.length > 0 ? `${ahead.filter((o) => o.reversal).length} of ${ahead.length}` : '—',
      ahead.length > 0 ? `${ahead.filter((o) => o.matched).length} of ${ahead.length}` : '—',
      behind.length > 0
        ? `${fixed(mean(behind.map((o) => o.before)), 4)} → ${fixed(mean(behind.map((o) => o.after)), 4)}`
        : '—',
      String(t.reversals),
    ];
  });
  const nearest = (spot: 'odour' | 'control'): number => Math.min(...worms.map((w) => w.closest[spot]));
  const farthest = Math.max(0, ...worms.map((w) => w.farthest));
  const neither = worms.filter((w) => w.reached === null).length;
  return [
    `### Checkpoint 0: the silenced network — ${GRADE[result.grade]}`,
    run,
    clauses,
    'Every clause is predicted, since nothing is calibrated to it: each passes if a behaviour that should need the connectome is absent without it.',
    '#### Crawling',
    `There ${crawling.bouts === 1 ? 'was 1 forward bout' : `were ${crawling.bouts} forward bouts`} of 10 s or more; the longest forward run lasted ${longest.toFixed(1)} s. Backward activity, reported and not graded: ${backward(crawling.trials)}.`,
    trialTable(crawling.trials),
    '#### Touch',
    `The same trials ran again, ${schedule}: ${plural(anterior.touches, 'anterior touch', 'anterior touches')} and ${posterior.touches} posterior. ${reached[0].toUpperCase()}${reached.slice(1)}. The matched windows are the untouched trials', at the same seed and time. The signed-rank test takes the ${plural(posterior.pairs, 'posterior touch', 'posterior touches')} whose forward velocity changed at all, with a rank sum of ${posterior.positive} for those after which it rose. Reported, not graded: over the same windows in the untouched trials, the same test gives a rank sum of ${posterior.twin.positive}, ${pValue(posterior.twin.p)}, and no velocity sample of a touched trial differs from its twin's by more than ${scientific(touch.largestChange)} body lengths per second. Backward activity in the touched trials, reported and not graded: ${backward(touch.trials)}.`,
    table(
      [
        'Seed',
        'Touches',
        'Anterior touches followed by a reversal',
        'Matched windows with one',
        'Posterior touches: forward velocity before → after (body lengths/s)',
        'Reversals',
      ],
      bySeed,
    ),
    '#### Chemotaxis',
    `Each worm ran alone in checkpoint 4's assay: the butanone spot's steady field, the worm's centroid starting at the dish's centre, ${mm(SPOT[0], 0)} mm from each spot, and the run stopping when any part of its body came within ${mm(CAPTURE_RADIUS, 0)} mm of a spot's centre. ${count(chemotaxis.odour, 'worm')} reached the odour, ${chemotaxis.control} the control and ${neither} neither. ${worms.length > 0 ? `The nearest any worm came was ${mm(nearest('odour'))} mm from the odour spot's centre and ${mm(nearest('control'))} mm from the control's; the farthest any centroid got from its start was ${mm(farthest, 3)} mm.` : ''}`,
    table(
      [
        'Seed',
        'Posture',
        'AWC-ON',
        'Reached',
        'Nearest the odour spot (mm)',
        'Nearest the control (mm)',
        'Farthest from the start (mm)',
      ],
      worms.map((w) => [
        String(w.seed),
        String(w.posture + 1),
        w.awcSide,
        w.reached === null ? 'Neither' : `The ${w.reached} at ${(w.time ?? 0).toFixed(1)} s`,
        mm(w.closest.odour),
        mm(w.closest.control),
        mm(w.farthest, 3),
      ]),
    ),
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
    c.value === null ? `unmeasured: ${c.reason ?? 'no value'}` : d.show(c.value),
    d.pass,
    d.partial,
    GRADE[c.grade],
    d.kind,
  ];
};

// Checkpoint 1's diagnostics, reported and not graded (PLAN §7.4).
export function diagnosticsText(d: Diagnostics): string {
  const parts = [
    d.peak === null || d.share === null
      ? 'the mid-body curvature has no spectrum to report'
      : `the mid-body curvature's spectrum peaks at ${d.peak.toFixed(3)} Hz, with ${percent(d.share)} of its power between 0.2 and 0.45 Hz`,
    `${d.afterFlip} of ${plural(d.reversals, 'reversal', 'reversals')} started within 3 s after a flip of the head switch`,
    d.avaChange === null || d.avaSpread === null
      ? "AVA's activation has no reversal to report"
      : `over reversals AVA's activation changed by ${scientific(d.avaChange)} on average, against a standard deviation of ${scientific(d.avaSpread)}`,
  ];
  return `Diagnostics, reported and not graded (PLAN §7.4): ${parts.join('; ')}.`;
}

export function checkpoint1Section(result: Checkpoint1, info: RunInfo): string {
  const k = result.kinematics;
  const selfIntersecting = result.trials.reduce((n, t) => n + t.selfIntersecting, 0);
  const kinematics =
    k.bouts === 0
      ? 'No trial had a forward bout of 10 s or more, so the kinematics are unmeasured.'
      : [
          `The kinematics come from ${count(k.bouts, 'forward bout')} of 10 s or more, ${k.duration.toFixed(1)} s in all.`,
          `Over them the mid-body curvature crossed its mean ${count(k.crossings, 'time')}, ${(k.crossings / k.bouts).toFixed(1)} a bout; a full undulation crosses twice.`,
          k.lag === null
            ? ''
            : `The rear rod's curvature correlated best with the front's at a lag of ${fixed(k.lag, 2)} s (correlation ${fixed(k.correlation ?? 0, 2)})${k.wavelength === null ? `: ${k.unmeasured}` : ''}.`,
        ]
          .filter(Boolean)
          .join(' ');
  const left =
    selfIntersecting === 1
      ? '1 self-intersecting posture was'
      : `${grouped(selfIntersecting)} self-intersecting postures were`;
  return [
    `### Checkpoint 1: crawling — ${GRADE[result.grade]}`,
    runLine(info, result.trials),
    table(['Clause', 'Measured', 'Pass', 'Partial', 'Grade', 'Kind'], result.clauses.map(clauseRow)),
    `${kinematics} The eigenworm clause pools ${grouped(result.postures)} postures sampled at 4 Hz; ${left} left out. The kinematic clauses are calibration targets, ${info.calibrated ? 'which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020' : 'but the parameters are provisional, not calibrated'}.`,
    diagnosticsText(result.diagnostics),
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
  if (page.indexOf(start, a + 1) >= 0 || page.indexOf(end, b + 1) >= 0) {
    throw new Error(`VALIDATION.md has checkpoint ${checkpoint}'s markers more than once`);
  }
  return `${page.slice(0, a + start.length)}\n\n${section}\n\n${page.slice(b)}`;
}
