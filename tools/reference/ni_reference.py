"""Golden trajectories for the port check (PLAN.md §7.2, §8).

Runs Neural Interactome's own initialize.py, unmodified, with only its web-server imports stubbed, and
solves its own right-hand side and Jacobian with Radau at rtol = atol = 1e-10 for the ALM, PLM, AVA and
AVB presets over 5 s. Each preset is applied at t = 0 while the network runs, the path NI's "update"
event takes: its input ramps up over NI's 0.3 s tanh transition, with the thresholds recomputed from the
input throughout, as NI's code does. The start state is NI's own draw, 1e-4 * N(0, 0.94) for V and s,
from a seeded generator.

Writes tests/fixtures/ni/: network.json (the matrices, presets, constants and start state NI used, read
from its module), one <preset>.f32 file of V - Vth per preset (float32, samples x neurons), NI's BSD
licence, and manifest.json with this script's SHA-256 and every output's, so the tests can tell when the
goldens are stale or have been edited by hand.

    uv run --project tools/reference python tools/reference/ni_reference.py
"""

from __future__ import annotations

import ast
import contextlib
import importlib
import io
import json
import os
import platform
import shutil
import sys
import tempfile
import types
from pathlib import Path

import numpy as np
import scipy
from scipy.integrate import solve_ivp

from pins import ROOT, digest_of, pinned_files

OUT = ROOT / "tests" / "fixtures" / "ni"
PRESETS = ["ALM", "AVA", "AVB", "PLM"]
T_END = 5.0
SAMPLE = 0.01
SEED = 0
TOLERANCE = 1e-10


def stub_web_server() -> None:
    """Replace the imports initialize.py needs only to serve its web app."""

    class Anything:
        def __init__(self, *args, **kwargs):
            pass

        def __call__(self, *args, **kwargs):
            return self

        def __getattr__(self, name):
            return Anything()

        def on(self, *args, **kwargs):
            return lambda f: f

    eventlet = types.ModuleType("eventlet")
    eventlet.monkey_patch = lambda *a, **k: None
    flask = types.ModuleType("flask")

    class Flask:
        jinja_options: dict = {}

        def __init__(self, *args, **kwargs):
            self.config = {}
            self.debug = False

        def route(self, *args, **kwargs):
            return lambda f: f

    flask.Flask = Flask
    for name in ("render_template", "session", "request"):
        setattr(flask, name, Anything())
    socketio = types.ModuleType("flask_socketio")
    socketio.SocketIO = lambda *a, **k: Anything()
    for name in ("emit", "join_room", "leave_room", "close_room", "disconnect"):
        setattr(socketio, name, lambda *a, **k: None)
    sys.modules.update({"eventlet": eventlet, "flask": flask, "flask_socketio": socketio})


def load_neural_interactome(files: dict[str, Path], workdir: Path) -> types.ModuleType:
    for name in ("initialize.py", "Gg.npy", "Gs.npy", "emask.npy"):
        shutil.copy(files[name], workdir / name)
    stub_web_server()
    os.chdir(workdir)
    sys.path.insert(0, str(workdir))
    return importlib.import_module("initialize")  # runs EffVth(Gg_Static, Gs_Static), as NI does at start


def main() -> None:
    files = pinned_files("neural-interactome")
    names = ast.literal_eval(files["neuron_names.txt"].read_text())
    with tempfile.TemporaryDirectory() as tmp:
        ni = load_neural_interactome(files, Path(tmp))
        n = ni.N
        assert len(names) == n
        rng = np.random.default_rng(SEED)
        y0 = 1e-4 * rng.normal(0, 0.94, 2 * n)
        grid = np.round(np.arange(0.0, T_END + SAMPLE / 2, SAMPLE), 10)
        OUT.mkdir(parents=True, exist_ok=True)
        presets = {}
        transit_end = None
        for preset in PRESETS:
            spec = json.loads(files[f"presets/{preset}.json"].read_text())
            mask = np.array([float(spec[name]["inputCurrent"]) for name in names])
            presets[preset] = {names[i]: mask[i] for i in np.nonzero(mask)[0]}
            # NI's "update" event at t = 0 on a fresh network: transit_Mask records the switch time and the
            # ramp's end and sets the thresholds for the full input. Then a run from the start state.
            ni.t_Tracker = 0
            ni.transit_Mat = np.zeros((2, n))
            with contextlib.redirect_stdout(io.StringIO()):  # it prints the masks
                ni.transit_Mask(mask)
            assert ni.t_Switch == 0 and not ni.oldMask.any()
            transit_end = ni.transit_End - ni.t_Switch
            sol = solve_ivp(
                ni.membrane_voltageRHS,
                (0.0, T_END),
                y0,
                method="Radau",
                jac=ni.compute_jacobian,
                rtol=TOLERANCE,
                atol=TOLERANCE,
                t_eval=grid,
            )
            if not sol.success:
                raise SystemExit(f"{preset}: {sol.message}")
            rows = []
            for k, t in enumerate(sol.t):
                ni.membrane_voltageRHS(t, sol.y[:, k])  # sets NI's global Vth for time t
                rows.append(sol.y[:n, k] - ni.Vth)
            np.asarray(rows, dtype="<f4").tofile(OUT / f"{preset}.f32")
            print(f"{preset}: {len(sol.t)} samples, {sol.nfev} evaluations")

        gg = np.asarray(ni.Gg_Static)
        gs = np.asarray(ni.Gs_Static)
        reversal = np.asarray(ni.E).reshape(-1)  # -48 mV times emask, per presynaptic neuron
        network = {
            "names": names,
            "constants": {
                "Gc": ni.Gc,
                "C": ni.C,
                "Ec": ni.Ec,
                "ggap": ni.ggap,
                "gsyn": ni.gsyn,
                "ar": ni.ar,
                "ad": ni.ad,
                "B": ni.B,
                "Iext": ni.Iext,
                "rate": ni.rate,
                "offset": ni.offset,
                "inhibitoryReversal": float(np.unique(reversal[reversal != 0]).item()),
                # EffVth rounds s_eq to four places in a local variable, so it is restated here.
                "sEq": round(ni.ar / (ni.ar + 2 * ni.ad), 4),
                "transitEnd": transit_end,
            },
            # Gg is symmetric: each pair once, as [a, b, weight] with a < b.
            "gap": [[int(i), int(j), float(gg[i, j])] for i, j in zip(*np.nonzero(np.triu(gg, 1)))],
            # Gs is indexed [post, pre], so each row is [post, pre, weight].
            "chemical": [[int(i), int(j), float(gs[i, j])] for i, j in zip(*np.nonzero(gs))],
            # Presynaptic neurons whose synapses reverse at the inhibitory potential.
            "inhibitory": [int(i) for i in np.nonzero(reversal)[0]],
            "presets": presets,
            "start": [float(v) for v in y0],
        }
        assert np.allclose(gg, gg.T) and not np.diag(gg).any() and not np.diag(gs).any()
    shutil.copy(files["LICENSE"], OUT / "LICENSE")
    (OUT / "network.json").write_text(json.dumps(network, separators=(",", ":")) + "\n")
    manifest = {
        "generator": "tools/reference/ni_reference.py",
        "generatorSha256": digest_of(Path(__file__)),
        "helperSha256": digest_of(Path(__file__).with_name("pins.py")),
        "inputs": {name: digest_of(path) for name, path in sorted(files.items())},
        "outputs": {
            name: digest_of(OUT / name) for name in ["network.json", "LICENSE", *(f"{p}.f32" for p in PRESETS)]
        },
        "solver": {"method": "Radau", "rtol": TOLERANCE, "atol": TOLERANCE},
        "sample": SAMPLE,
        "end": T_END,
        "seed": SEED,
        "presets": PRESETS,
        "layout": "float32 little-endian, samples x neurons, V - Vth in mV, samples at 0, 0.01, ... 5 s",
        "versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
