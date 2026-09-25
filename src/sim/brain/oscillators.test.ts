import { describe, expect, it } from 'vitest';
import { Brain } from './brain.ts';
import { chemicalRows, gapRows, type Network } from './network.ts';

// A lone neuron in production units (nF, nS, mV, s, pA), its threshold at the leak potential so the leak
// adds no bias, carrying one oscillator.
const lone: Network = {
  names: ['N'],
  capacitance: 0.001,
  leak: 0.01,
  leakPotential: -35,
  rise: 1,
  decay: 5,
  slope: 0.125,
  gap: gapRows(1, []),
  chemical: chemicalRows(1, []),
};
const V0 = 1 / (2 * lone.slope);
const GAIN = 2; // nS: over three times the solve's 1.5 C/dt at 2.5 ms, so the fast jumps are stiff there
const RECOVERY = 1; // s

function oscillator(shift: number, bias: number): Brain {
  const brain = new Brain(lone, Float64Array.of(-35));
  brain.setOscillators({ neurons: Int32Array.of(0), shift: Float64Array.of(shift), gain: GAIN, recovery: RECOVERY });
  brain.input[0] = bias;
  return brain;
}

// Times at which x = (V − V_th − shift)/v₀ crosses 0 upwards, after the first 5 s.
function upCrossings(step: () => number, dt: number, duration: number): number[] {
  const times: number[] = [];
  let previous = step();
  for (let k = 2; k <= Math.round(duration / dt); k++) {
    const x = step();
    if (k * dt > 5 && previous < 0 && x >= 0) times.push(k * dt);
    previous = x;
  }
  return times;
}

const period = (times: number[]): number => (times[times.length - 1] - times[0]) / (times.length - 1);

// The same neuron as a two-variable ODE in x and w, integrated independently by RK4 at a fine step:
// C v₀ dx/dt = −G_c v₀ x + I + g v₀ (x − x³/3 − w), τ_w dw/dt = x + 0.7 − 0.8 w.
// `offset` is the neuron's threshold less its leak potential, the leak's pull in units of x.
function referencePeriod(bias: number, offset = 0): number {
  const dt = 1e-5;
  let x = 0;
  let w = 0.7 / 0.8;
  const f = (xx: number, ww: number): [number, number] => [
    (-lone.leak * (V0 * xx + offset) + bias + GAIN * V0 * (xx - (xx * xx * xx) / 3 - ww)) / (lone.capacitance * V0),
    (xx + 0.7 - 0.8 * ww) / RECOVERY,
  ];
  return period(
    upCrossings(
      () => {
        const k1 = f(x, w);
        const k2 = f(x + (dt / 2) * k1[0], w + (dt / 2) * k1[1]);
        const k3 = f(x + (dt / 2) * k2[0], w + (dt / 2) * k2[1]);
        const k4 = f(x + dt * k3[0], w + dt * k3[1]);
        x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        w += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        return x;
      },
      dt,
      30,
    ),
  );
}

describe('the oscillators', () => {
  // A bias of 0.8 g v₀ puts the fixed point on the middle branch of FitzHugh's cubic: a relaxation cycle.
  const bias = 0.8 * GAIN * V0;
  const reference = referencePeriod(bias);

  it('cycle with the period of the FitzHugh–Nagumo equations they implement', () => {
    for (const [dt, tolerance] of [
      [0.0025, 0.015],
      [0.0005, 0.005],
    ]) {
      const brain = oscillator(0, bias);
      const measured = period(upCrossings(() => (brain.step(dt), (brain.voltage[0] + 35) / V0), dt, 30));
      expect(Math.abs(measured / reference - 1), `dt ${dt}`).toBeLessThan(tolerance);
    }
  });

  it('keep the voltage solve positive definite through the fast jumps', () => {
    // Twelve gap-coupled oscillators; after every step, each row of the solve's own matrix must stay
    // diagonally dominant, which the stabilising-only linearisation guarantees.
    const n = 12;
    const chain: Network = {
      ...lone,
      names: Array.from({ length: n }, (_, i) => `N${i}`),
      leak: 0.3,
      gap: gapRows(
        n,
        Array.from({ length: n - 1 }, (_, i): [number, number, number] => [i, i + 1, 0.05]),
      ),
      chemical: chemicalRows(n, []),
    };
    const brain = new Brain(chain, new Float64Array(n).fill(-35));
    brain.setOscillators({
      neurons: Int32Array.from({ length: n }, (_, i) => i),
      shift: Float64Array.from({ length: n }, (_, i) => -6 - (i % 3)),
      gain: GAIN,
      recovery: RECOVERY,
    });
    const diagonal = (brain as unknown as { d: Float64Array }).d;
    let margin = Infinity;
    for (let k = 0; k < 4000; k++) {
      brain.step(0.0025);
      for (let i = 0; i < n; i++) {
        const offDiagonal = (i > 0 ? 0.05 : 0) + (i < n - 1 ? 0.05 : 0);
        margin = Math.min(margin, diagonal[i] - offDiagonal);
      }
    }
    expect(margin).toBeGreaterThan(0);
    expect(brain.unconverged).toBe(0);
  });

  it('read each neuron by its own index, threshold and shift', () => {
    // Three neurons; the oscillator sits on the third, whose threshold is 15 mV above the leak potential.
    const three: Network = {
      ...lone,
      names: ['A', 'B', 'C'],
      gap: gapRows(3, []),
      chemical: chemicalRows(3, []),
    };
    const threshold = -20;
    const shift = -3;
    // Oscillator 0 sits on neuron 2 and oscillator 1 on neuron 0, which cycles at another bias.
    const brain = new Brain(three, Float64Array.of(-35, -35, threshold));
    brain.setOscillators({
      neurons: Int32Array.of(2, 0),
      shift: Float64Array.of(shift, 0),
      gain: GAIN,
      recovery: RECOVERY,
    });
    brain.input[2] = bias;
    brain.input[0] = 1.2 * GAIN * V0;
    const x2 = (): number => (brain.voltage[2] - threshold - shift) / V0;
    const x0 = (): number => (brain.voltage[0] + 35) / V0;
    const times2: number[] = [];
    const times0: number[] = [];
    let p2 = x2();
    let p0 = x0();
    for (let k = 1; k <= 12000; k++) {
      brain.step(0.0025);
      if (k * 0.0025 > 5 && p2 < 0 && x2() >= 0) times2.push(k * 0.0025);
      if (k * 0.0025 > 5 && p0 < 0 && x0() >= 0) times0.push(k * 0.0025);
      p2 = x2();
      p0 = x0();
    }
    // In x, the leak pulls towards (E_c − V_th − shift)/v₀.
    expect(Math.abs(period(times2) / referencePeriod(bias, threshold + shift + 35) - 1)).toBeLessThan(0.015);
    expect(Math.abs(period(times0) / referencePeriod(1.2 * GAIN * V0) - 1)).toBeLessThan(0.015);
  });

  it('step the recovery variable by implicit Euler first, then BDF2, at the new voltage', () => {
    const brain = oscillator(0, bias);
    const w0 = brain.recovery[0];
    const dt = 0.0025;
    const h = dt / RECOVERY;
    brain.step(dt);
    const x1 = (brain.voltage[0] + 35) / V0;
    const w1 = (w0 + h * (x1 + 0.7)) / (1 + h * 0.8);
    expect(brain.recovery[0]).toBeCloseTo(w1, 14);
    brain.step(dt);
    const x2 = (brain.voltage[0] + 35) / V0;
    expect(brain.recovery[0]).toBeCloseTo((2 * w1 - 0.5 * w0 + h * (x2 + 0.7)) / (1.5 + h * 0.8), 14);
  });

  it('reset with the rest of the state', () => {
    const brain = oscillator(0, bias);
    for (let k = 0; k < 400; k++) brain.step(0.0025);
    // Rest puts every oscillator back on its w-nullcline.
    brain.rest();
    expect(brain.recovery[0]).toBeCloseTo(0.7 / 0.8, 12);
    // The nullcline at the neuron's own x: shifted 4 mV, it rests at x = 1, w = (1 + 0.7)/0.8.
    const shifted = oscillator(-4, 0);
    expect(shifted.recovery[0]).toBeCloseTo(1.7 / 0.8, 12);
    // setState can restore w, and the next step starts afresh (implicit Euler) from it.
    brain.setState([-30], [0], 0, [0.2]);
    expect(brain.recovery[0]).toBe(0.2);
    brain.step(0.0025);
    const x = (brain.voltage[0] + 35) / V0;
    expect(brain.recovery[0]).toBeCloseTo(
      (0.2 + (0.0025 / RECOVERY) * (x + 0.7)) / (1 + (0.0025 / RECOVERY) * 0.8),
      14,
    );
    // So does setOscillators, after steps have built a history.
    for (let k = 0; k < 10; k++) brain.step(0.0025);
    brain.setOscillators(brain.oscillators);
    const w = brain.recovery[0];
    brain.step(0.0025);
    const x2 = (brain.voltage[0] + 35) / V0;
    expect(brain.recovery[0]).toBeCloseTo((w + (0.0025 / RECOVERY) * (x2 + 0.7)) / (1 + (0.0025 / RECOVERY) * 0.8), 14);
  });

  it('cycle only within a window of drive above their threshold', () => {
    // A neuron held at its threshold by 1 nS of other conductance, as the network holds a motor neuron,
    // cycles when that rest sits 2–12 mV above its drive threshold: below the window it rests on the lower
    // branch, above it the cubic's upper branch holds it depolarised.
    const held: Network = { ...lone, leak: 1 };
    const cycles = (shift: number): number => {
      const brain = new Brain(held, Float64Array.of(-35));
      brain.setOscillators({
        neurons: Int32Array.of(0),
        shift: Float64Array.of(shift),
        gain: GAIN,
        recovery: RECOVERY,
      });
      return upCrossings(() => (brain.step(0.0025), (brain.voltage[0] + 35 - shift) / V0), 0.0025, 30).length;
    };
    expect(cycles(8)).toBe(0);
    expect(cycles(0)).toBe(0);
    expect(cycles(-6)).toBeGreaterThan(20);
    expect(cycles(-16)).toBe(0);
  });

  it('start on their w-nullcline, and at rest a neuron without bias is excitable, not oscillating', () => {
    const brain = oscillator(0, 0);
    expect(brain.recovery[0]).toBeCloseTo(0.7 / 0.8, 12);
    let crossings = 0;
    let previous = 0;
    for (let k = 0; k < 8000; k++) {
      brain.step(0.0025);
      const x = (brain.voltage[0] + 35) / V0;
      if (k > 2000 && previous < 0 && x >= 0) crossings++;
      previous = x;
    }
    // FitzHugh's textbook constants rest near x = −1.2 with no bias: the network must supply one.
    expect(crossings).toBe(0);
    expect((brain.voltage[0] + 35) / V0).toBeCloseTo(-1.199, 2);
  });
});
