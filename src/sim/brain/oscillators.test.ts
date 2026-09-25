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
const GAIN = 2; // nS: twice the solve's 1.5 C/dt at 2.5 ms, so the fast jumps are stiff at that step
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
function referencePeriod(bias: number): number {
  const dt = 1e-5;
  let x = 0;
  let w = 0.7 / 0.8;
  const f = (xx: number, ww: number): [number, number] => [
    (-lone.leak * V0 * xx + bias + GAIN * V0 * (xx - (xx * xx * xx) / 3 - ww)) / (lone.capacitance * V0),
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
    const brain = oscillator(0, bias);
    for (let k = 0; k < 8000; k++) brain.step(0.0025);
    expect(brain.unconverged).toBe(0);
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
