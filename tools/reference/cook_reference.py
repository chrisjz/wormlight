"""Golden trajectories for the production check (PLAN.md §7.2).

An independent, dense implementation of the production model: Cook's wiring from the runtime data file,
rest thresholds, a reversal potential per connection from its sign, no conductance for an unsigned one,
autapses as ordinary connections, and oscillators off. It starts at rest, the model's fixed point, and
Radau solves it at rtol = atol = 1e-10 for two stimuli: a pulse into PLML and PLMR from 0.5 to 1 s, and a
step into AVBL and AVBR from 0.5 s, over 3 s. Each stimulated neuron gets 10 mV times its input
conductance at rest, the current that would hold it 10 mV above rest with every activation fixed.

Writes tests/fixtures/cook/: one <stimulus>.f32 file of V - Vth per stimulus (float32, samples x neurons)
and manifest.json, which records the constants used (the tests check them against src/science/params.ts),
the amplitudes, a digest of the wiring read, and this script's SHA-256.

    uv run --project tools/reference python tools/reference/cook_reference.py
"""

from __future__ import annotations

import hashlib
import json
import platform
from pathlib import Path

import numpy as np
import scipy
from scipy.integrate import solve_ivp

from pins import ROOT, digest_of

DATA = ROOT / "public" / "data" / "wormlight.v1.json"
OUT = ROOT / "tests" / "fixtures" / "cook"
TOLERANCE = 1e-10
SAMPLE = 0.01
T_END = 3.0
DEPOLARISATION = 10.0  # mV

# The production constants, in nF, nS, mV, s and pA.
CONSTANTS = {
    "capacitance": 0.001,
    "leak": 0.01,
    "leakPotential": -35.0,
    "reversalExcitatory": 0.0,
    "reversalInhibitory": -48.0,
    "rise": 1.0,
    "decay": 5.0,
    "slope": 0.125,
    "conductancePerSynapse": 0.1,
    "cookToVarshneyChemical": 0.3444,
    "cookToVarshneyGap": 0.2055,
}

STIMULI = {
    "PLM-pulse": {"neurons": ["PLML", "PLMR"], "on": 0.5, "off": 1.0},
    "AVB-step": {"neurons": ["AVBL", "AVBR"], "on": 0.5, "off": None},
}


def wiring_digest(data: dict) -> str:
    """SHA-256 of the wiring alone, in a form the TypeScript test rebuilds byte for byte."""
    wiring = {
        "neurons": [n["name"] for n in data["neurons"]],
        "chemical": [[c["pre"], c["post"], c["sections"], c["sign"]] for c in data["chemical"]],
        "gap": [[g["a"], g["b"], g["sections"]] for g in data["gap"]],
    }
    return hashlib.sha256(json.dumps(wiring, separators=(",", ":")).encode()).hexdigest()


def main() -> None:
    data = json.loads(DATA.read_text())
    k = CONSTANTS
    names = [n["name"] for n in data["neurons"]]
    n = len(names)
    at = {name: i for i, name in enumerate(names)}
    per = k["conductancePerSynapse"]

    gap = np.zeros((n, n))
    for g in data["gap"]:
        a, b = at[g["a"]], at[g["b"]]
        gap[a, b] += g["sections"] * k["cookToVarshneyGap"] * per
        gap[b, a] += g["sections"] * k["cookToVarshneyGap"] * per
    syn = np.zeros((n, n))  # [post, pre]
    rev = np.zeros((n, n))
    for c in data["chemical"]:
        if c["sign"] == 0:
            continue
        post, pre = at[c["post"]], at[c["pre"]]
        syn[post, pre] = c["sections"] * k["cookToVarshneyChemical"] * per
        rev[post, pre] = k["reversalExcitatory"] if c["sign"] > 0 else k["reversalInhibitory"]
    laplacian = np.diag(gap.sum(1)) - gap

    s_eq = k["rise"] / (k["rise"] + 2 * k["decay"])
    held = k["leak"] * np.eye(n) + laplacian + np.diag(s_eq * syn.sum(1))
    vth = np.linalg.solve(held, k["leak"] * k["leakPotential"] + s_eq * (syn * rev).sum(1))
    input_conductance = 1 / np.diag(np.linalg.inv(held))

    def rhs(current: np.ndarray):
        def f(_t: float, y: np.ndarray) -> np.ndarray:
            v, s = y[:n], y[n:]
            synaptic = (syn * s[None, :] * (v[:, None] - rev)).sum(1)
            dv = (-k["leak"] * (v - k["leakPotential"]) - laplacian @ v - synaptic + current) / k["capacitance"]
            phi = 1 / (1 + np.exp(-k["slope"] * (v - vth)))
            return np.concatenate([dv, k["rise"] * phi * (1 - s) - k["decay"] * s])

        return f

    def jacobian(_t: float, y: np.ndarray) -> np.ndarray:
        v, s = y[:n], y[n:]
        phi = 1 / (1 + np.exp(-k["slope"] * (v - vth)))
        jvv = (-k["leak"] * np.eye(n) - laplacian - np.diag(syn @ s)) / k["capacitance"]
        jvs = syn * (rev - v[:, None]) / k["capacitance"]
        jsv = np.diag(k["rise"] * (1 - s) * k["slope"] * phi * (1 - phi))
        jss = np.diag(-k["rise"] * phi - k["decay"])
        return np.block([[jvv, jvs], [jsv, jss]])

    rest = np.concatenate([vth, np.full(n, s_eq)])
    assert np.abs(rhs(np.zeros(n))(0, rest)).max() < 1e-9, "rest is not a fixed point"

    grid = np.round(np.arange(0.0, T_END + SAMPLE / 2, SAMPLE), 10)
    OUT.mkdir(parents=True, exist_ok=True)
    stimuli = {}
    for name, stimulus in STIMULI.items():
        amplitudes = {cell: DEPOLARISATION * input_conductance[at[cell]] for cell in stimulus["neurons"]}
        stimuli[name] = {**stimulus, "amplitudes": amplitudes}
        current = np.zeros(n)
        for cell, amount in amplitudes.items():
            current[at[cell]] = amount
        # Integrate piecewise, so no step straddles a switch: the input is on for on < t <= off.
        edges = [0.0, stimulus["on"], *([stimulus["off"]] if stimulus["off"] else []), T_END]
        y = rest
        samples = [rest[:n] - vth]
        for a, b in zip(edges, edges[1:]):
            on = stimulus["on"] <= a and (stimulus["off"] is None or b <= stimulus["off"])
            inside = grid[(grid > a) & (grid <= b)]
            sol = solve_ivp(
                rhs(current if on else np.zeros(n)),
                (a, b),
                y,
                method="Radau",
                jac=jacobian,
                rtol=TOLERANCE,
                atol=TOLERANCE,
                t_eval=inside,
            )
            if not sol.success:
                raise SystemExit(f"{name}: {sol.message}")
            samples.extend(sol.y[:n, i] - vth for i in range(len(sol.t)))
            y = sol.y[:, -1]
        assert len(samples) == len(grid)
        np.asarray(samples, dtype="<f4").tofile(OUT / f"{name}.f32")
        print(f"{name}: {len(samples)} samples, largest |V - Vth| {np.abs(samples).max():.3f} mV")

    manifest = {
        "generator": "tools/reference/cook_reference.py",
        "generatorSha256": digest_of(Path(__file__)),
        "helperSha256": digest_of(Path(__file__).with_name("pins.py")),
        "wiringSha256": wiring_digest(data),
        "constants": CONSTANTS,
        "depolarisation": DEPOLARISATION,
        "stimuli": stimuli,
        "solver": {"method": "Radau", "rtol": TOLERANCE, "atol": TOLERANCE},
        "sample": SAMPLE,
        "end": T_END,
        "layout": "float32 little-endian, samples x neurons in the data file's order, V - Vth in mV, samples at 0, 0.01, ... 3 s",
        "versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
