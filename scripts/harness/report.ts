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
import { asRun } from '../../src/science/ledger.ts';
import type { Model } from '../../src/sim/trackS.ts';
import { formatNumber } from '../docs/page.ts';
import { BACK, FRONT } from '../../src/sim/touch.ts';
import { CHECKPOINT_4, type ChemotaxisRecord, type Checkpoint4 } from '../../src/validation/chemotaxis.ts';
import type { MechanismRecord, MechanismResult } from '../../src/validation/mechanism.ts';
import type { Checkpoint5, LesionClause } from '../../src/validation/lesions.ts';
import {
  CHECKPOINT_2,
  CHECKPOINT_3,
  type Checkpoint2,
  type Checkpoint3,
  type TouchPair,
  type TouchRun,
} from '../../src/validation/touch.ts';

export interface RunInfo {
  date: string;
  commit: string;
  // Whether the run used the calibrated parameters, or the provisional ones.
  calibrated: boolean;
  // The model the run's fit runs: track R's when absent, as on every run before track S's fit was chosen.
  model?: Model;
  trials: number;
  seconds: number;
  // Checkpoint 0's assay runs: how many worms, each for up to how long (s).
  worms?: number;
  wormSeconds?: number;
  // The registry the run's parameters came from, if not PARAMS itself.
  registry?: Record<string, Param>;
}

// The parameters a run used: the calibrated ones, to three significant figures, as FIDELITY.md shows them, or
// the provisional ones, from the registry or one standing in for it, each in the form the chosen fit runs (asRun).
export function parameterText(
  calibrated: boolean,
  registry: Record<string, Param> = PARAMS,
  model: Model = 'track R',
): string {
  const run = CALIBRATED.map((id): Param => asRun(registry[id]));
  if (calibrated && run.some((p) => p.value === null)) {
    throw new Error("a run on calibrated parameters, but the registry's aren't calibrated");
  }
  const values = run.map((p) => {
    const v = calibrated ? Number((p.value as number).toPrecision(3)) : (p.provisional as number);
    return `${p.symbol} = ${formatNumber(v)}${p.unit ? ` ${p.unit}` : ''}`;
  });
  // Track S's model says what it adds to track R's, as the chosen pick's section does.
  const on =
    model === 'track S'
      ? "track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with "
      : '';
  return calibrated
    ? `${on}the calibrated parameters (PLAN §7.3), here to three significant figures: ${values.join(', ')}`
    : `${on}the provisional parameters, not calibrated (PLAN §6.2): ${values.join(', ')}`;
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
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${info.trials === 1 ? 'seed 1' : `seeds 1 to ${info.trials}`}, on ${parameterText(info.calibrated, info.registry, info.model)}.`,
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
    `Run on ${info.date} at \`${info.commit}\`: ${count(info.trials, 'trial')} of ${info.seconds} s, ${seeds(info.trials)}, each run untouched and touched, and ${count(worms.length, 'worm')} in the assay for up to ${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min, ${seeds(worms.length)}, on ${parameterText(info.calibrated, info.registry, info.model)}.`,
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

// The touch trials' run, which checkpoints 2 and 3 share (PLAN §7.4): how many seeds it took for its touches, and
// whether they stayed sound.
function touchRunLine(r: TouchRun, info: RunInfo): string {
  return [
    `Run on ${info.date} at \`${info.commit}\`: trials of ${info.seconds} s from real postures, seed 1 upwards, each touched once during forward crawling, at the first 0.1 s sample from an earliest time its seed draws between 20 and 100 s at which the 2 s before were forward, the world forking there into a copy touched at the front (s = ${FRONT}), one at the back (s = ${BACK}) and a sham twin, each run 3.5 s on; ${plural(r.touches, 'touch', 'touches')} from ${count(r.seeds, 'seed')}, on ${parameterText(info.calibrated, info.registry, info.model)}.`,
    r.unmeasured === null
      ? `Every trial and copy stayed finite, and ${r.unconverged === 0 ? 'no brain solve failed to converge' : `${count(r.unconverged, 'brain solve')} failed to converge`}.`
      : `Unmeasured: ${r.unmeasured}, so the checkpoint fails.`,
  ].join(' ');
}

// What the investigation of 2026-09-29 previewed, outside the protocols, which every report of checkpoints 2 to 5 names
// (PLAN §10).
const PREVIEWS =
  "Previewed outside the protocol (PLAN §10): an investigation on 2026-09-29 stimulated and lesioned the real wiring at another fit, the second round's probe crawler, on exploration seeds; it pointed to checkpoint 2 failing, with no reversal, and checkpoint 3 likely failing, since stimulating PLM slowed the worm (DECISIONS.md, 2026-09-29).";

export function checkpoint2Section(r: Checkpoint2, info: RunInfo): string {
  const fitted = info.model === 'track S';
  const share = (x: number): string => `${(100 * x).toFixed(0)}%`;
  return [
    `### Checkpoint 2: anterior touch — ${GRADE[r.grade]}${fitted ? ', reported as fitted' : ''}`,
    touchRunLine(r, info),
    table(
      ['Clause', 'Measured', 'Pass', 'Partial'],
      [
        [
          'Touches followed by a reversal within 2 s',
          `${r.followed} of ${r.touches} (${share(r.share)})`,
          `≥ ${share(CHECKPOINT_2.pass)}`,
          `${share(CHECKPOINT_2.partial)}–${share(CHECKPOINT_2.pass)}`,
        ],
        [
          "Against the sham twins (McNemar's exact test, one-sided)",
          `${r.shams} twins reversed (${share(r.shamShare)}); ${r.touchedOnly} ${r.touchedOnly === 1 ? 'pair' : 'pairs'} with the touched copy's alone and ${r.shamOnly} with the twin's alone; ${pValue(r.p)}`,
          `Significant, and at least ${CHECKPOINT_2.ratio}× the twins' share`,
          'Significant (DECISIONS.md, 2026-10-02)',
        ],
      ],
    ),
    [
      `The response, the touched copies' share of reversals less the twins', is ${fixed(r.response, 2)}: what checkpoint 5's touch rows read.`,
      r.latency === null
        ? 'No touch was followed by a reversal, so there is no latency to report.'
        : `Reported, not graded: from the touch to the first backward sample, ${r.latency.mean.toFixed(1)} s on average, ${r.latency.median.toFixed(1)} s the median.`,
      fitted
        ? 'Every clause would be predicted, since checkpoint 2 is held out of the calibration (spec §1.2), but it is reported as fitted: track S, whose fit this is, was proposed after the previews below, and its measured signs came from an audit the missing backward mode prompted (PLAN §10; DECISIONS.md, 2026-10-01).'
        : 'Every clause is predicted, since checkpoint 2 is held out of the calibration (spec §1.2).',
      PREVIEWS,
    ]
      .filter(Boolean)
      .join(' '),
    touchTable(r.pairs),
  ].join('\n\n');
}

export function checkpoint3Section(r: Checkpoint3, info: RunInfo): string {
  const response =
    r.response === null ? 'unmeasured' : `${r.response >= 0 ? '+' : '−'}${(100 * Math.abs(r.response)).toFixed(1)}%`;
  return [
    `### Checkpoint 3: posterior touch — ${GRADE[r.grade]}`,
    touchRunLine(r, info),
    table(
      ['Clause', 'Measured', 'Pass', 'Partial'],
      [
        [
          "Mean forward speed over the 2 s after the touch, over the sham twins' (the signed-rank test, one-sided, paired)",
          `${fixed(r.after, 4)} touched, ${fixed(r.shamAfter, 4)} in the twins (body lengths/s): ${response}; a rank sum of ${r.test.positive} for the touches that led, over ${plural(r.test.n, 'pair', 'pairs')} that differed, ${pValue(r.test.p)}`,
          `≥ ${(100 * CHECKPOINT_3.pass).toFixed(0)}% above, and significant`,
          `Significantly above, by ${(100 * CHECKPOINT_3.partial).toFixed(0)}% to ${(100 * CHECKPOINT_3.pass).toFixed(0)}%`,
        ],
      ],
    ),
    [
      `The response, the touched copies' mean speed over the twins' less one, is ${response}: what checkpoint 5's touch rows read. The clause is predicted, since checkpoint 3 is held out of the calibration (spec §1.2).`,
      `Reported, not graded: the forward velocity over the 2 s before the touches, ${fixed(r.before, 4)} body lengths per second, against ${fixed(r.after, 4)} after, by the before-and-after test the cited papers use, a rank sum of ${r.rise.positive} over ${plural(r.rise.n, 'pair', 'pairs')}, ${pValue(r.rise.p)}.`,
      PREVIEWS,
    ].join(' '),
    touchTable(r.pairs),
  ].join('\n\n');
}

// Each touch: its trial, when and what it reached, and the touched copy against its sham twin.
function touchTable(pairs: readonly TouchPair[]): string {
  return table(
    [
      'Seed',
      'Posture',
      'Touch at (s)',
      'Reached',
      'Reversal: touched / sham',
      'Speed before (body lengths/s)',
      'Speed after: touched / sham (body lengths/s)',
    ],
    pairs.map((t) => [
      String(t.seed),
      String(t.posture + 1),
      t.time.toFixed(1),
      t.reached.join(', ') || 'None',
      `${t.touched ? 'Yes' : 'No'} / ${t.sham ? 'Yes' : 'No'}`,
      fixed(t.before, 4),
      `${fixed(t.after, 4)} / ${fixed(t.shamAfter, 4)}`,
    ]),
  );
}

const MECHANISM_GRADE = { reproduced: '**Reproduced**', partial: '**Partial**', absent: '**Absent**' } as const;

export function checkpoint4Section(r: Checkpoint4, info: RunInfo): string {
  const minutes = (info.wormSeconds ?? 3600) / 60;
  const sum = (f: (m: MechanismRecord) => number): number =>
    r.runs.reduce((n, w) => n + (w.intact.mechanism ? f(w.intact.mechanism) : 0), 0);
  const reorientations = sum((m) => m.reversals + m.omegas);
  // Those klinokinesis attributes to a side: the rest began where dC/dt over the 3.3 s before was exactly zero.
  const attributed = sum((m) => m.reorientations.down + m.reorientations.up);
  const value = (x: number | null, digits: number): string => (x === null ? 'undefined' : fixed(x, digits));
  const interval = (i: [number | null, number | null], digits: number): string =>
    `${i[0] === null ? 'unbounded' : fixed(i[0], digits)} to ${i[1] === null ? 'unbounded' : fixed(i[1], digits)}`;
  const row = (name: string, m: MechanismResult | null, digits: number): string[] =>
    m === null
      ? [name, 'unmeasured', '—', '—', '—', '—', MECHANISM_GRADE.absent]
      : [
          name,
          `${value(m.intact.value, digits)} (${interval(m.intact.interval, digits)})`,
          value(m.control, digits),
          `${value(m.difference.value, digits)} (${interval(m.difference.interval, digits)})`,
          m.clears ? 'Yes' : 'No',
          m.differs ? 'Yes' : 'No',
          MECHANISM_GRADE[m.grade],
        ];
  const fitted = info.model === 'track S';
  const reach = (w: ChemotaxisRecord): string =>
    w.reached === null ? 'Neither' : `The ${w.reached} at ${((w.time ?? 0) / 60).toFixed(1)} min`;
  return [
    `### Checkpoint 4: chemotaxis — ${GRADE[r.grade]}`,
    [
      `Run on ${info.date} at \`${info.commit}\`: ${count(r.worms, 'worm')}, ${seeds(r.worms)}, each alone for up to ${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min in the butanone spot's steady field, its centroid starting at the dish's centre, ${mm(SPOT[0], 0)} mm from each spot, and stopped when any part of its body came within ${mm(CAPTURE_RADIUS, 0)} mm of a spot's centre; and each again as its control, with AWC-ON's input off, the world sensing no odour; on ${parameterText(info.calibrated, info.registry, info.model)}.`,
      r.unmeasured === null
        ? `Every run stayed finite, and ${r.unconverged === 0 ? 'no brain solve failed to converge' : `${count(r.unconverged, 'brain solve')} failed to converge`}.`
        : `Unmeasured: ${r.unmeasured}, so the checkpoint fails.`,
    ].join(' '),
    table(
      ['Clause', 'Measured', 'Pass', 'Partial'],
      [
        [
          'Chemotaxis index, (at odour − at control) / every worm',
          `${fixed(r.intact.index, 2)}: ${r.intact.odour} at the odour, ${r.intact.control} at the control, ${r.intact.neither} neither`,
          `≥ ${CHECKPOINT_4.pass}`,
          `${CHECKPOINT_4.partial} to ${CHECKPOINT_4.pass}`,
        ],
        [
          "Above the control (Fisher's exact test, one-sided, on the worms reaching the odour)",
          `${r.intact.odour} intact worms reached the odour, against ${r.control.odour} controls (the controls' index ${fixed(r.control.index, 2)}: ${r.control.odour} at the odour, ${r.control.control} at the control, ${r.control.neither} neither); ${pValue(r.p)}`,
          'Significant',
          'Significant',
        ],
      ],
    ),
    'Every clause is predicted, since checkpoint 4 is held out of the calibration (spec §1.2).',
    `The mechanism, reported and never gating (PLAN §7.4; DECISIONS.md, 2026-10-02): each statistic over every worm with its 80% interval over 1,000 resamples of the worms, the control's, and the intact-minus-control difference over paired resamples. Klinokinesis is the ratio of reorientation rates heading down the gradient to up it, its null 1; weathervaning is the slope of the curving rate (rad/mm) against the bearing (rad), over transitions between 3.3 s blocks with no reorientation or backward sample, strides under a quarter of the median left out, its null 0. Each is reproduced when its interval clears its null above it and the difference's lies above 0, partial with one of those. Over the intact runs there ${reorientations === 1 ? 'was 1 reorientation' : `were ${grouped(reorientations)} reorientations`}, ${grouped(sum((m) => m.reversals))} reversals and ${grouped(sum((m) => m.omegas))} omega turns, of which klinokinesis attributes ${grouped(attributed)} to a side: the others began where dC/dt over the 3.3 s before was exactly zero, as it reads where the field is flat, and count on neither.`,
    table(
      [
        'Mechanism',
        'Intact (80% interval)',
        'Control',
        'Intact − control (80% interval)',
        'Clears its null',
        'Above the control',
        'Grade',
      ],
      [row('Klinokinesis', r.klinokinesis, 2), row('Weathervaning', r.weathervaning, 4)],
    ),
    [
      r.companions.length > 0
        ? `Reported beside them: ${r.companions
            .map(
              (c) =>
                `${c.name === 'turning' ? "klinokinesis's companion, the ratio of the mean absolute change in heading from one block to the next, down the gradient over up it" : c.name === 'every transition' ? "weathervaning's slope over every transition, reorientations included, the floor kept" : 'its slope over the clean transitions with no floor'}, ${value(c.intact.value, c.name === 'turning' ? 2 : 4)} (${interval(c.intact.interval, c.name === 'turning' ? 2 : 4)}) intact and ${value(c.control, c.name === 'turning' ? 2 : 4)} in the controls`,
            )
            .join('; ')}.`
        : '',
      fitted
        ? "The klinokinesis row counts reversals as reorientations, so on track S's fit it is reported as fitted (PLAN §10; DECISIONS.md, 2026-10-01); weathervaning reads reversals only to leave their blocks out, and isn't marked."
        : '',
      "Previewed outside the protocol (PLAN §10): an investigation on 2026-09-29, on another fit, the second round's probe crawler, pointed to checkpoint 4 failing, the worm circling and AWC-ON's drive changing its speed by at most 0.6% (DECISIONS.md, 2026-09-29).",
    ]
      .filter(Boolean)
      .join(' '),
    table(
      ['Seed', 'AWC-ON', 'Intact: reached', 'Control: reached', 'Nearest the odour spot, intact / control (mm)'],
      r.runs.map((w) => [
        String(w.seed),
        w.awcSide,
        reach(w.intact),
        reach(w.control),
        `${mm(w.intact.closest.odour)} / ${mm(w.control.closest.odour)}`,
      ]),
    ),
  ].join('\n\n');
}

export function checkpoint5Section(r: Checkpoint5, info: RunInfo): string {
  const fitted = info.model === 'track S';
  // A clause's values, as its measure reads: checkpoint 3's response as a percentage, the speed to four places, the
  // rest to two.
  const show = (c: LesionClause, v: number | null): string =>
    v === null
      ? '—'
      : c.name.startsWith('The posterior')
        ? `${v >= 0 ? '+' : '−'}${(100 * Math.abs(v)).toFixed(1)}%`
        : c.name.startsWith('Forward speed')
          ? fixed(v, 4)
          : fixed(v, 2);
  const test = (c: LesionClause): string =>
    c.p === null
      ? '—'
      : `${pValue(c.p)}${c.direction === null ? '' : c.direction ? ', the reported way' : ', the other way'}`;
  const passed = r.rows.filter((row) => row.pass).length;
  const rows = r.rows.flatMap((row) =>
    row.clauses.map((c, k) => [
      k === 0 ? `${row.label}${fitted && row.readsReversals ? ' (fitted)' : ''}` : '',
      `${c.name}${fitted && c.readsReversals && !row.readsReversals ? ' (fitted)' : ''}`,
      show(c, c.intact),
      show(c, c.lesioned),
      c.asks,
      test(c),
      c.unmeasured ? `Unmeasured: ${c.unmeasured}` : c.pass ? '**Pass**' : '**Fail**',
    ]),
  );
  const avb = r.rows.find((row) => row.id === 'avb-pvc');
  const infinite = Object.values(r.trials).reduce((n, ts) => n + ts.filter((t) => !t.finite).length, 0);
  // Each lesion's spontaneous measures beside the intact worm's.
  const measures = (arms: Checkpoint5['secondary']): string =>
    table(
      ['Lesion', 'Measure', 'Intact', 'Lesioned', 'p'],
      arms.flatMap((l) =>
        l.measures.map((m, k) => [
          k === 0 ? `${l.label}${l.unmeasured ? ` (unmeasured: ${l.unmeasured})` : ''}` : '',
          m.name,
          fixed(m.intact, m.name.startsWith('Mean velocity') ? 4 : 2),
          fixed(m.lesioned, m.name.startsWith('Mean velocity') ? 4 : 2),
          m.p === null ? '—' : pValue(m.p),
        ]),
      ),
    );
  const bouts = (speed: number | null, trials: number): string =>
    speed === null ? 'unmeasured, with no bout' : `${fixed(speed, 4)} over the ${count(trials, 'trial')} with a bout`;
  return [
    `### Checkpoint 5: lesions — ${GRADE[r.grade]}${fitted ? ', reported as fitted' : ''}`,
    [
      `Run on ${info.date} at \`${info.commit}\`: for each lesion and the intact worm, ${count(info.trials, 'trial')} of ${info.seconds} s, ${seeds(info.trials)}, every arm on the same seeds, postures and noise, measured after each trial's first 10 s; and checkpoints 2 and 3's touch trials for the intact worm and for the lesions whose rows read touches, AVA + AVD and PVC; on ${parameterText(info.calibrated, info.registry, info.model)}.`,
      `${infinite === 0 ? 'Every spontaneous trial stayed finite' : `${count(infinite, 'spontaneous trial')} left the finite numbers`}; ${r.unconverged === 0 ? 'no brain solve failed to converge' : `${count(r.unconverged, 'brain solve')} failed to converge`} in them or in the touch runs' graded touches.`,
    ].join(' '),
    `${passed} of the five primary rows ${passed === 1 ? 'passes' : 'pass'}; the checkpoint needs all five to pass, and three or four to be partial (PLAN §7.4). A row needs every clause, and a clause the effect and the test: its pooled measure moves the way it asks by the amount it names, and its test, two-sided at α = 0.05, is significant the reported way. A fall, or PVC's "stays", needs a measured, positive intact measure, checkpoint 3's response at least its 1% floor; RIM's rise counts from zero (DECISIONS.md, 2026-10-02).`,
    table(['Lesion', 'Clause', 'Intact', 'Lesioned', 'Asks', 'Test', 'Result'], rows),
    [
      fitted
        ? "Every clause would be predicted, since checkpoint 5 is held out of the calibration (spec §1.2), but those that read reversals, AVA + AVD's, AVA's, RIM's and PVC's on checkpoint 2, are reported as fitted, and so is the checkpoint's grade: track S, whose fit this is, was proposed after the previews below (PLAN §10; DECISIONS.md, 2026-10-01)."
        : 'Every clause is predicted, since checkpoint 5 is held out of the calibration (spec §1.2).',
      avb
        ? `Reported beside AVB + PVC's row, not graded: checkpoint 1's speed over forward bouts of 10 s or more, pooled as checkpoint 1 pools it, ${bouts(r.boutSpeed.intact, r.boutSpeed.intactTrials)} intact and ${bouts(r.boutSpeed.lesioned, r.boutSpeed.lesionedTrials)} lesioned (body lengths/s); the row reads the mean velocity, set knowing the preview below (DECISIONS.md, 2026-10-02).`
        : '',
      "Previewed outside the protocol (PLAN §10): AVB + PVC's row by the chosen pick's diagnostics with AVBL and AVBR lesioned, its mean velocity falling 91% (DECISIONS.md, 2026-10-02), by round 3's pick 1's, and by the investigation of 2026-09-29 on the probe crawler's corner; and the checkpoint by that investigation, which pointed to checkpoint 5 passing at most one row, and by the refit's AVA lesion, which raised its reversals from 1.42 to 5.41 a minute (DECISIONS.md, 2026-09-28 and 2026-09-29).",
    ]
      .filter(Boolean)
      .join(' '),
    "Every primary lesion's spontaneous measures, reported beside the rows and not graded, whichever its rows read: each measure pooled over its trials, beside the intact worm's, with Mann–Whitney's two-sided p.",
    measures(r.primaryMeasures),
    'The secondary lesions, reported and not graded, since Gray et al. describe their effects through time off food, which depends on neuromodulation the model lacks (PLAN §7.4), in the same way.',
    measures(r.secondary),
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
    '### Sensitivity: the uncertain signs, the scales and the rest offsets',
    [
      `Run on ${info.date} at \`${info.commit}\`: under each setting, checkpoint 1's ${count(info.trials, 'trial')} of ${info.seconds} s and the same trials of the silenced network, ${seeds(info.trials)}, on ${parameterText(info.calibrated, info.registry, info.model)}, none of them tuned again.`,
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

// Round 3's or track S's chosen pick, the first of its four to pass §7.2's comparison, as r5-chosen.json or
// s1-chosen.json in data/calibration/ records it (PLAN §7.4, §9): checkpoint 1 graded from the comparison's first 20 trials at dt, its
// speed's interval, and the runs that show what paces its crawl, each graded by checkpoint 1's grading.
export interface ChosenReport {
  // Track S's, or round 3's when absent, as round 3's record was written before track S.
  fit?: 'track-s';
  // Checkpoint 1's frequency band (κL), which the grading counts crossings past; absent in records made before it.
  frequencyBand?: number;
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
  const [title, record, model] =
    r.fit === 'track-s'
      ? [
          'Track S',
          'data/calibration/s1.json',
          "on track S's model, its measured signs, the D-types' offset and its rectifier, ",
        ]
      : ["R's third round", 'data/calibration/r5.json', ''];
  const band = r.frequencyBand === undefined ? '' : `, its frequency counting crossings past ±${r.frequencyBand} κL`;
  return [
    `### ${title}: pick ${r.pick}, from the search of CMA-ES seed ${r.seed} — ${GRADE[c.grade]}${c.grade === 'partial' && r.speed.atFloor ? ', at the speed floor' : ''}`,
    `Checkpoint 1 graded from the first 20 of §7.2's trials at dt, seeds 1 to 20, run on ${r.date} at \`${r.commit}\`, on the pick's values from ${record} (${r.from}), ${model}in the conductance form (PLAN §9)${band}.`,
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
  fit: 'refit' | 'round-2' | 'planned' | 'round-3' | 'track-s';
  // Round 3's or track S's pick, from 1, in the order its picks take the comparison (PLAN §9).
  pick?: number;
  // Checkpoint 1's frequency band (κL), which the grades and the frequency's clause count crossings past; runs before
  // it was named (2026-10-02), all made before the band (2026-10-01), used the plain count of crossings.
  frequencyBand?: number;
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
  'track-s': 'Track S',
} as const;
const fitName = (run: EquivalenceRun): string =>
  run.fit === 'round-3' || run.fit === 'track-s' ? `${FITS[run.fit]}, pick ${run.pick ?? 1}` : FITS[run.fit];
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
      `Run on ${run.date} at \`${run.commit}\`: ${count(run.trials, 'trial')} of ${run.seconds} s at each step, seeds 1 to ${run.trials}, at dt = ${dt} ms and dt/2 = ${half} ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from ${grouped(run.resamples)} resamples of the seeds, and must lie within its margin (PLAN §7.2).${run.frequencyBand === undefined ? '' : ` The frequency counts crossings past a band of ±${run.frequencyBand} κL (PLAN §7.4).`}`,
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
