// The ledger as the app writes it (spec §1.3): the marks its text carries, and the status it opens with.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { countFacts } from '../src/science/facts.ts';
import { COMPONENTS, OMITTED, PRESENTATION, render, SUBSYSTEMS } from '../src/science/fidelity.ts';
import { ledgerStatus, paramNote, tokens } from '../src/science/ledger.ts';
import { SCALE } from '../src/science/levels.ts';
import { PARAMS, type Param } from '../src/science/params.ts';
import { CALIBRATION_TARGETS, REFERENCE_DATA } from '../src/science/validation.ts';
import { readJson } from './checks.ts';

const facts = countFacts(validateWormlightData(readJson('public/data/wormlight.v1.json')));

// Every text About the science renders through its marks.
const texts = (): string[] => [
  ledgerStatus(),
  ...SCALE.flatMap((s) => [s.meaning, s.example]),
  ...Object.values(SUBSYSTEMS).flatMap((s) => [s.solid, s.notSolid, s.upgrade].map((t) => render(t, facts))),
  ...COMPONENTS.flatMap((c) => [c.name, c.basis, c.caveats, c.upgrade].map((t) => render(t, facts))),
  ...[...OMITTED, ...PRESENTATION].map((item) => item.text),
  ...CALIBRATION_TARGETS.map((t) => t.use),
  ...REFERENCE_DATA.map((r) => r.use),
  ...(Object.values(PARAMS) as Param[]).flatMap((p) => [paramNote(p), p.upgrade]),
];

describe("the marks in the ledger's text", () => {
  it('reads **strong**, _emphasis_ and `code`, and leaves the rest as text', () => {
    expect(tokens('A **bold** _C. elegans_ `data/r1.json` end')).toEqual([
      { mark: 'text', text: 'A ' },
      { mark: 'strong', text: 'bold' },
      { mark: 'text', text: ' ' },
      { mark: 'em', text: 'C. elegans' },
      { mark: 'text', text: ' ' },
      { mark: 'code', text: 'data/r1.json' },
      { mark: 'text', text: ' end' },
    ]);
    expect(tokens('')).toEqual([]);
    expect(tokens('plain')).toEqual([{ mark: 'text', text: 'plain' }]);
  });

  it('leaves an underscore inside a symbol alone, in any script', () => {
    for (const symbol of ['κ_gap,B and κ_SMD', 'θ_osc', 'σ_n²/2τ_n', 'V_th and G_c', 'κ_x then y_ρ', 'a_b_c']) {
      expect(tokens(symbol), symbol).toEqual([{ mark: 'text', text: symbol }]);
    }
  });

  it('finds no stray mark in any text the view shows, and emphasis only on names meant to be set apart', () => {
    for (const text of texts()) {
      for (const t of tokens(text)) {
        if (t.mark === 'text') {
          expect(t.text, text).not.toContain('**');
          expect(t.text, text).not.toContain('`');
        }
        if (t.mark === 'em') expect(['C. elegans'], text).toContain(t.text);
      }
    }
  });
});

describe("the ledger's components", () => {
  it('each say what would raise them, or that nothing needs to', () => {
    for (const c of COMPONENTS) expect(render(c.upgrade, facts).trim(), render(c.name, facts)).not.toBe('');
  });
});

describe('the status', () => {
  const status = ledgerStatus();

  it("says the worm crawls at partial on track S's fit, what paces it, and that R reached no fit it could choose", () => {
    expect(status).toContain("**The worm crawls at checkpoint 1's partial grade, paced by its head switch.**");
    expect(status).toContain('no fit its rules could choose reached partial');
    expect(status).toContain('holds at half the time step and grades partial on checkpoint 1 on its own trials');
    expect(status).toContain("The rhythm is not the network's own");
  });

  it('warns that "Tested by" lists planned checks, and names the calibrated values it runs on', () => {
    expect(status).toContain(
      'Only checkpoints 0 to 3 and the sensitivity runs have run, so "Tested by" lists the checks planned',
    );
    expect(status).toMatch(
      /The calibrated parameters are track S's fit's, shown below rounded from its fit, 3 of them on a bound/,
    );
  });
});
