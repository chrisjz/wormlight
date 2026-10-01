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
  TOUCH_NEEDS,
  touchSchedule,
  type Checkpoint0,
  type Checkpoint1,
  type Crawling,
  type Diagnostics,
  type Clause,
  type Grade,
  type TrialSummary,
} from '../../src/validation/checkpoints.ts';
import type { Measure, StepComparison } from '../../src/validation/equivalence.ts';
import { FREQUENCY_BAND } from '../../src/validation/motion.ts';
import { FAR_OUTSIDE } from '../../src/validation/trial.ts';
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
  // The registry the run's parameters came from, if not PARAMS itself.
  registry?: Record<string, Param>;
}

// The parameters a run used: the calibrated ones, to three significant figures, as FIDELITY.md shows them, or
// the provisional ones, from the registry or one standing in for it.
export function parameterText(calibrated: boolean, registry: Record<string, Param> = PARAMS): string {
  if (calibrated && CALIBRATED.some((id) => registry[id].value === null)) {
    throw new Error("a run on calibrated parameters, but the registry's aren't calibrated");
  }
  const values = CALIBRATED.map((id) => {
    const p: Param = registry[id];
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
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text.replace(/^-/, '−');
};
const percent = (x: number): string => `${(100 * x).toFixed(0)}%`;
// A share that may be small, as a percentage: two significant figures below 10%, whole ones above.
const small = (x: number): string => `${100 * x < 10 ? (100 * x).toPrecision(2) : (100 * x).toFixed(0)}%`;
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
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${info.trials === 1 ? 'seed 1' : `seeds 1 to ${info.trials}`}, on ${parameterText(info.calibrated, info.registry)}.`,
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
  // The touched trials' sham twins count with the trials and worms.
  const unconverged =
    trials.reduce((n, t) => n + t.unconverged, 0) +
    worms.reduce((n, w) => n + w.unconverged, 0) +
    touch.twins.unconverged;
  const infinite = trials.filter((t) => !t.finite).length + worms.filter((w) => !w.finite).length + touch.twins.broken;
  const minutes = (info.wormSeconds ?? CHECKPOINT_0_CHEMOTAXIS.seconds) / 60;
  const run = [
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${seeds(info.trials)}, each run untouched and touched, and ${count(worms.length, 'worm')} in the assay for up to ${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min, ${seeds(worms.length)}, on ${parameterText(info.calibrated, info.registry)}.`,
    `Every trial's measures start after its first 10 s. ${infinite === 0 ? `Every trial, ${touch.twins.count > 0 ? 'sham twin ' : ''}and worm stayed finite` : `${plural(infinite, 'trial, twin or worm', 'trials, twins or worms')} left the finite numbers`}, and ${unconverged === 0 ? 'no brain solve failed to converge' : `${count(unconverged, 'brain solve')} failed to converge`}.`,
  ].join(' ');
  const { front, back, window, anteriorPartial, posteriorFloor, first, every } = CHECKPOINT_0_TOUCH;
  // Why a reflex went unmeasured, if it did.
  const unmeasured = (touches: number, place: string): string =>
    `unmeasured: ${!touch.finite ? 'no touched trials, or one or its sham twin left the finite numbers' : touches === 0 ? `no ${place} touch` : 'a touch reached no receptor'}`;
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
          ? `A reversal within ${window} s after ${anterior.followed} of ${plural(anterior.touches, 'touch', 'touches')} (${percent(anterior.share)}), and after ${anterior.shams} of their sham twins; ${anterior.touchedOnly} ${anterior.touchedOnly === 1 ? 'pair' : 'pairs'} with the touched copy's alone and ${anterior.shamOnly} with the twin's alone, ${pValue(anterior.p)}`
          : unmeasured(anterior.touches, 'anterior'),
        `Under ${percent(anteriorPartial)}, or not more often than after the sham twins (McNemar's exact test, one-sided)`,
        GRADE[anterior.grade],
      ],
      [
        'Posterior touch',
        posterior.measured
          ? `Forward velocity over the ${window} s after ${plural(posterior.touches, 'touch', 'touches')}: ${fixed(posterior.after, 4)} touched, ${fixed(posterior.shamAfter, 4)} in the sham twins (body lengths/s), a difference of ${scientific(posterior.difference)} on average; ${pValue(posterior.p)}`
          : unmeasured(posterior.touches, 'posterior'),
        `Not significantly faster than the sham twins (Wilcoxon's signed-rank test, one-sided, paired), or by under ${fixed(posteriorFloor, 4)} body lengths/s on average`,
        GRADE[posterior.grade],
      ],
      [
        'Chemotaxis',
        `${plural(chemotaxis.odour + chemotaxis.control, 'arrival', 'arrivals')}: ${chemotaxis.odour} of ${plural(chemotaxis.worms, 'worm', 'worms')} at the odour, ${chemotaxis.control} at the control (CI ${fixed(chemotaxis.index, 2)}); ${pValue(chemotaxis.p)}`,
        "Neither spot reached significantly more often than the other (the exact binomial test, two-sided, over the worms that reached either); with 5 arrivals or fewer it can't fail",
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
      ahead.length > 0 ? `${ahead.filter((o) => o.sham).length} of ${ahead.length}` : '—',
      behind.length > 0
        ? `${fixed(mean(behind.map((o) => o.after)), 4)} / ${fixed(mean(behind.map((o) => o.shamAfter)), 4)}`
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
    "Every clause is predicted, since no parameter is tuned to it: each passes if a behaviour that should need the connectome is absent without it. Two of the calibration's bounds were set with the silenced network in view, θ_osc's floor and σ_n's ceiling (PLAN §7.3), so that within them it stays still.",
    '#### Crawling',
    `There ${crawling.bouts === 1 ? 'was 1 forward bout' : `were ${crawling.bouts} forward bouts`} of 10 s or more; the longest forward run lasted ${longest.toFixed(1)} s. Backward activity, reported and not graded: ${backward(crawling.trials)}.`,
    trialTable(crawling.trials),
    '#### Touch',
    `The same trials ran again, ${schedule}: ${plural(anterior.touches, 'anterior touch', 'anterior touches')} and ${posterior.touches} posterior. ${reached[0].toUpperCase()}${reached.slice(1)}. At each touch the world forked a sham twin, which took a sham touch in its place, restarting the integrator where the touch's current switched, with no current of its own, and ran ${TOUCH_NEEDS} s on while the touched line ran on; each touch is graded against its twin over the same samples (PLAN §7.4). The signed-rank test takes the ${plural(posterior.pairs, 'posterior touch', 'posterior touches')} whose speed after differed from their twins' at all, with a rank sum of ${posterior.positive} for those the touched copy led; where the touch reaches no muscle, those differences are rounding, and the floor decides. Reported, not graded: the forward velocity before and after the posterior touches, ${fixed(posterior.before, 4)} and ${fixed(posterior.after, 4)} body lengths per second, a rank sum of ${posterior.rise.positive} over ${plural(posterior.rise.n, 'pair', 'pairs')}, ${pValue(posterior.rise.p)}, by the before-and-after test the first run graded by. Backward activity in the touched trials, reported and not graded: ${backward(touch.trials)}.`,
    table(
      [
        'Seed',
        'Touches',
        'Anterior touches followed by a reversal',
        'Sham twins with one',
        'Posterior touches: forward velocity after, touched / sham (body lengths/s)',
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
    ...(d.outside === null
      ? []
      : [
          `${d.outside.mean.toFixed(1)} neurons on average sat outside the model's reversal range, ${fixed(PARAMS.reversalInhibitory.value, 0)} to ${fixed(PARAMS.reversalExcitatory.value, 0)} mV, at each sample, and ${d.outside.max} at most`,
          `${d.outside.far.mean.toFixed(1)} on average, and ${d.outside.far.max} at most, sat more than ${FAR_OUTSIDE} mV outside it`,
          `the voltages ran from ${fixed(d.outside.lowest, 1)} to ${fixed(d.outside.highest, 1)} mV over every step of the measured windows`,
        ]),
    ...(d.shunt === null
      ? []
      : [
          `in the conductance form, ${d.shunt.switch === null ? 'the head switch had no SMD left' : `the head switch's conductance came to ${small(d.shunt.switch)} of its targets' passive loads`} and ${d.shunt.proprioception === null ? 'proprioception no field left' : `proprioception's to ${small(d.shunt.proprioception)}`}, each shunt the mean of per-target ratios, and the switch's gate turned on or off ${d.shunt.gateToggles.toFixed(1)} times a second`,
        ]),
    ...(d.pacing === null
      ? []
      : [
          `the head switch's gate was open on ${(100 * d.pacing.open).toFixed(1)}% of the measured steps, the head-switch drive sat ${fixed(Math.abs(d.pacing.margin.mean), 1)} mV ${d.pacing.margin.mean < 0 ? 'below' : 'above'} θ_osc on average, with a standard deviation of ${fixed(d.pacing.margin.sd, 1)} mV, and the switch cycled at ${d.pacing.cycleRate.toFixed(3)} Hz, half its flips a second${d.peak === null ? '' : `, beside the spectrum's peak at ${d.peak.toFixed(3)} Hz`}`,
        ]),
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
          `Over them the mid-body curvature crossed its mean ${count(k.crossings, 'time')}, ${(k.crossings / k.bouts).toFixed(1)} a bout, counting a crossing once the curvature left ±${FREQUENCY_BAND} κL about the mean on the far side; a full undulation crosses twice. By the plain count it replaced (PLAN §7.4, changed after results 2026-10-01), it crossed ${count(k.meanCrossings, 'time')}, for a frequency of ${(k.meanCrossings / 2 / k.duration).toFixed(3)} Hz.`,
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

// A sensitivity setting's runs (spec §2.4; PLAN §2.4, §3.2): checkpoint 1 on the setting's brain, and checkpoint 0's
// crawling clause on it silenced.
export interface SensitivityRow {
  label: string;
  checkpoint1: Checkpoint1;
  silenced: Crawling;
  // What paces the silenced network: the head switch's gate and its flips (null with none read), and how far its
  // neurons' voltages reach.
  silencedPacing: Diagnostics['pacing'];
  silencedVoltages: Diagnostics['outside'];
}

// The sensitivity runs' section: one row a setting, each reported and none graded, for checkpoint 1 and then for the
// silenced network.
export function sensitivitySection(rows: readonly SensitivityRow[], info: RunInfo): string {
  const value = (row: SensitivityRow, name: string): string => {
    const c = row.checkpoint1.clauses.find((clause) => clause.name === name);
    return !c || c.value === null ? '–' : CLAUSES[name].show(c.value);
  };
  // The share of the measured time spent in one way of moving, over a setting's trials.
  const share = (t: readonly TrialSummary[], way: 'forward' | 'backward'): string => {
    const all = t.reduce((n, x) => n + x.forward + x.paused + x.backward, 0);
    return all > 0 ? small(t.reduce((n, x) => n + x[way], 0) / all) : '–';
  };
  const velocity = (t: readonly TrialSummary[]): string =>
    t.length > 0 ? fixed(t.reduce((n, x) => n + x.meanVelocity, 0) / t.length, 3) : '–';
  const trials = rows.flatMap((row) => [...row.checkpoint1.trials, ...row.silenced.trials]);
  const unconverged = trials.reduce((n, t) => n + t.unconverged, 0);
  const infinite = trials.filter((t) => !t.finite).length;
  return [
    '### Sensitivity: the uncertain signs, and the scales',
    [
      `Run on ${info.date} at \`${info.commit}\`: under each setting, checkpoint 1's ${count(info.trials, 'trial')} of ${info.seconds} s and the same trials of the silenced network, ${seeds(info.trials)}, on ${parameterText(info.calibrated, info.registry)}, none of them tuned again.`,
      `${infinite === 0 ? 'Every trial stayed finite' : `${count(infinite, 'trial')} left the finite numbers`}, and ${unconverged === 0 ? 'no brain solve failed to converge' : `${count(unconverged, 'brain solve')} failed to converge`}.`,
    ].join(' '),
    "Reported, not graded. First checkpoint 1's trials under each setting: the share of the measured time the worm moves forward, and its mean velocity towards its head, over all the trials; the kinematics, from forward bouts of 10 s or more, a dash where there is none to take them from; and the grade checkpoint 1 would give.",
    table(
      [
        'Setting',
        'Forward',
        'Mean velocity (body lengths/s)',
        'Frequency (Hz)',
        'Wavelength (body lengths)',
        'Speed (body lengths/s)',
        'Eigenworms',
        '20 s bouts',
        'Checkpoint 1 would grade',
      ],
      rows.map((row) => [
        row.label,
        share(row.checkpoint1.trials, 'forward'),
        velocity(row.checkpoint1.trials),
        value(row, 'frequency'),
        value(row, 'wavelength'),
        value(row, 'speed'),
        value(row, 'eigenworms'),
        value(row, 'bout'),
        GRADE[row.checkpoint1.grade],
      ]),
    ),
    "Then the same trials of the silenced network, which keeps each setting's intact thresholds: the shares of the time it moves forward and backward; the head switch's drive less θ_osc, averaged over the measured steps, the gate open when it is above 0; how many times a minute the switch flips; the lowest and highest voltage any neuron reaches; and its forward bouts of 10 s, where checkpoint 0 asks for none.",
    table(
      [
        'Setting',
        'Forward',
        'Backward',
        'Gate: drive less θ_osc (mV)',
        'Switch flips a minute',
        'Voltages (mV)',
        'Bouts of 10 s',
      ],
      rows.map((row) => [
        row.label,
        share(row.silenced.trials, 'forward'),
        share(row.silenced.trials, 'backward'),
        row.silencedPacing === null ? '–' : fixed(row.silencedPacing.margin.mean, 2),
        row.silencedPacing === null ? '–' : fixed(120 * row.silencedPacing.cycleRate, 2),
        row.silencedVoltages === null
          ? '–'
          : `${fixed(row.silencedVoltages.lowest, 0)} to ${fixed(row.silencedVoltages.highest, 0)}`,
        String(row.silenced.bouts),
      ]),
    ),
  ].join('\n\n');
}

// Round 3's chosen pick, the first of its four to pass §7.2's comparison, as data/calibration/r5-chosen.json records
// it (PLAN §7.4, §9): checkpoint 1 graded from the comparison's first 20 trials at dt, its speed's interval, and the
// runs that show what paces its crawl, each graded by checkpoint 1's grading.
export interface ChosenReport {
  pick: number;
  // The CMA-ES seed of the search the pick came from, and where in it.
  seed: number;
  from: string;
  values: Record<string, number>;
  date: string;
  commit: string;
  checkpoint1: Checkpoint1;
  speed: {
    value: number | null;
    interval: [number | null, number | null];
    unmeasured: number;
    // The pooled speed over the comparison's trials at dt/2.
    fine: number | null;
    // Whether a partial is at the speed floor; null for a grade other than partial.
    atFloor: boolean | null;
  };
  variants: {
    name: string;
    grade: Grade;
    clauses: Clause[];
    // The share of the measured windows moving forward, and the mean forward velocity over them, over all trials.
    forward: number;
    meanVelocity: number;
  }[];
}

export function chosenSection(r: ChosenReport): string {
  const c = r.checkpoint1;
  // An end the resamples with no bout reach lies below every measured speed.
  const [lower, upper] = r.speed.interval.map((x) => (x === null ? 'below every measured speed' : x.toFixed(4)));
  const speed = [
    `Its pooled speed is ${r.speed.value === null ? 'unmeasured' : `${r.speed.value.toFixed(4)} body lengths per second`}, with a 95% interval from ${lower} to ${upper} over 1,000 resamples of the 20 trials${r.speed.unmeasured > 0 ? `, ${grouped(r.speed.unmeasured)} of them with no bout` : ''}; over §7.2's trials at dt/2 it is ${r.speed.fine === null ? 'unmeasured' : r.speed.fine.toFixed(4)}.`,
    c.grade === 'partial'
      ? r.speed.atFloor
        ? 'So the partial is reported as partial at the speed floor: the interval, or the speed at dt/2, reaches below 0.06.'
        : 'The interval and the speed at dt/2 clear 0.06, so the partial is not at the speed floor.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const show = (v: ChosenReport['variants'][number], name: string): string => {
    const clause = v.clauses.find((k) => k.name === name);
    return clause === undefined || clause.value === null ? '—' : CLAUSES[name].show(clause.value);
  };
  const rows = r.variants.map((v) => [
    v.name,
    GRADE[v.grade],
    show(v, 'frequency'),
    show(v, 'speed'),
    show(v, 'bout'),
    percent(v.forward),
    v.meanVelocity.toFixed(4),
  ]);
  return [
    `### R's third round: pick ${r.pick}, from the search of CMA-ES seed ${r.seed} — ${GRADE[c.grade]}${c.grade === 'partial' && r.speed.atFloor ? ', at the speed floor' : ''}`,
    `Checkpoint 1 graded from the first 20 of §7.2's trials at dt, seeds 1 to 20, run on ${r.date} at \`${r.commit}\`, on the pick's values from data/calibration/r5.json (${r.from}), in the conductance form (PLAN §9).`,
    table(['Clause', 'Measured', 'Pass', 'Partial', 'Grade', 'Kind'], c.clauses.map(clauseRow)),
    speed,
    diagnosticsText(c.diagnostics),
    "What paces the crawl, reported and not graded (PLAN §7.4): checkpoint 1's trials run again with the head switch off, at its lower bound, and with classes lesioned, each graded by checkpoint 1's grading. The run with AVBL and AVBR lesioned previews checkpoint 5's held-out AVB + PVC row.",
    table(
      ['Run', 'Grade', 'Frequency (Hz)', 'Speed (body lengths/s)', '20 s bouts', 'Forward', 'Mean forward velocity'],
      rows,
    ),
    trialTable(c.trials),
  ].join('\n\n');
}

// A run of §7.2's comparison with the noise on, as data/equivalence/<fit>.json records it.
export interface EquivalenceRun {
  fit: 'refit' | 'round-2' | 'planned' | 'round-3';
  // Round 3's pick, from 1, in the order its picks take the comparison (PLAN §9).
  pick?: number;
  // An R fit's values, from its calibration record, so the result stays tied to what ran; null for the planned fit.
  // Runs before 2026-09-29 didn't record them.
  values?: Record<string, number> | null;
  date: string;
  commit: string;
  trials: number;
  seconds: number;
  // dt and dt/2 (s).
  steps: [number, number];
  resamples: number;
  // Checkpoint 1's grade over the trials at each step, reported and not compared.
  grades: [Grade, Grade];
  unconverged: [number, number];
  comparison: StepComparison;
}

const FITS = {
  refit: "R's refit",
  'round-2': "R's second round's fit",
  planned: "The planned model's fit",
  'round-3': "R's third round",
} as const;
const fitName = (run: EquivalenceRun): string =>
  run.fit === 'round-3' ? `${FITS[run.fit]}, pick ${run.pick ?? 1}` : FITS[run.fit];
const MEASURED: Record<Measure, { label: string; digits: number }> = {
  frequency: { label: 'Frequency (Hz)', digits: 4 },
  wavelength: { label: 'Wavelength (body lengths)', digits: 4 },
  speed: { label: 'Speed (body lengths/s)', digits: 4 },
  bout: { label: 'Share of trials with a 20 s bout', digits: 3 },
  reversals: { label: 'Reversals a minute', digits: 3 },
};

// The comparison's section: each fit's clauses, their intervals and margins, and its verdict.
export function equivalenceSection(runs: readonly EquivalenceRun[]): string {
  const parts = ["### The step: §7.2's comparison with the noise on"];
  if (runs.length === 0) return [...parts, 'Not yet run.'].join('\n\n');
  for (const run of runs) {
    const { comparison: c } = run;
    const rows = c.clauses.map((k) => {
      const { label, digits } = MEASURED[k.name];
      const value = (x: number | null): string => (x === null ? 'unmeasured' : fixed(x, digits));
      const signed = (x: number): string => (x > 0 ? `+${fixed(x, digits)}` : fixed(x, digits));
      // An end is null where the unmeasured resamples reach it, and unbounded.
      const end = (x: number | null, unbounded: string): string => (x === null ? unbounded : signed(x));
      const interval = k.interval === null ? '—' : `${end(k.interval[0], '−∞')} to ${end(k.interval[1], '+∞')}`;
      const note =
        k.unmeasured > 0
          ? `, ${grouped(k.unmeasured)} ${k.unmeasured === 1 ? 'resample' : 'resamples'} unmeasured`
          : '';
      return [
        label,
        value(k.coarse),
        value(k.fine),
        k.difference === null ? '—' : signed(k.difference),
        interval,
        k.margin === null ? '—' : `±${fixed(k.margin, digits)}`,
        `${k.pass ? '**Pass**' : '**Fail**'}${note}`,
      ];
    });
    const [dt, half] = run.steps.map((s) => formatNumber(s * 1000));
    parts.push(
      `#### ${fitName(run)} — ${c.pass ? '**Pass**' : '**Fail**'}`,
      `Run on ${run.date} at \`${run.commit}\`: ${count(run.trials, 'trial')} of ${run.seconds} s at each step, seeds 1 to ${run.trials}, at dt = ${dt} ms and dt/2 = ${half} ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from ${grouped(run.resamples)} resamples of the seeds, and must lie within its margin (PLAN §7.2).`,
      table(['Clause', 'dt', 'dt/2', 'Difference', '95% interval', 'Margin', 'Result'], rows),
      `Checkpoint 1's grade over these trials, reported and not compared: ${GRADE[run.grades[0]]} at dt and ${GRADE[run.grades[1]]} at dt/2. Solves that didn't converge: ${grouped(run.unconverged[0])} at dt and ${grouped(run.unconverged[1])} at dt/2. ${c.nonFinite === 0 ? 'Every trial stayed within the finite numbers.' : `${count(c.nonFinite, 'trial')} left the finite numbers, which fails the comparison.`}`,
    );
  }
  return parts.join('\n\n');
}

// Replace the text between a section's markers in the page: a checkpoint's, by its number, or the comparison's.
export function replaceSection(page: string, key: number | 'equivalence' | 'sensitivity', section: string): string {
  const name = typeof key === 'number' ? `checkpoint-${key}` : key;
  const what = typeof key === 'number' ? `checkpoint ${key}` : `the ${key} section`;
  const start = `<!-- harness:${name} -->`;
  const end = `<!-- /harness:${name} -->`;
  const a = page.indexOf(start);
  const b = page.indexOf(end);
  if (a < 0 || b < a) throw new Error(`VALIDATION.md has no markers for ${what}`);
  if (page.indexOf(start, a + 1) >= 0 || page.indexOf(end, b + 1) >= 0) {
    throw new Error(`VALIDATION.md has ${what}'s markers more than once`);
  }
  return `${page.slice(0, a + start.length)}\n\n${section}\n\n${page.slice(b)}`;
}
