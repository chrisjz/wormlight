# Wormlight

A living _C. elegans_ in the browser. The worm's full connectome runs on the GPU and drives a physically simulated body on an agar plate, and its neurons glow as they activate, in the style of calcium imaging.

**Live:** https://chrisjz.github.io/wormlight/ (needs a browser with WebGPU).

**Status:** milestone 4, the environment, sensing and touch, is done. The CPU reference simulates the connectome, the layers outside it and the body, but crawling as checkpoint 1 asks for it does not yet emerge ([DECISIONS.md](DECISIONS.md), 2026-09-26). Research track R, the effort to change that, calibrated the planned model and then a model of its own, which the app now runs ([DECISIONS.md](DECISIONS.md), 2026-09-27). On it the worm crawls in bouts, a bend travelling from head to tail, within checkpoint 1's frequency and wavelength bands but at under a third of a real worm's speed, and in only 8 of 20 trials for 20 s. Its B-type motor neurons carry the crawl, and its reversals, which the A-types make at the head switch's flips, come from the simulation's time step: at finer steps it barely reverses ([VALIDATION.md](VALIDATION.md)). A convergence study traced this to two causes, the white-noise current and the oscillators' stiff dynamics. A second study found that, at R's fit, a coloured noise current keeps the results within chance across steps, so the model is adopting it, its correlation time to be calibrated, before track R fits again ([DECISIONS.md](DECISIONS.md), 2026-09-28). Checkpoint 1 fails R's fit at the simulation's 2.5 ms step but grades it partial at half that step, so track R is suspended until the coloured noise runs on the CPU and the GPU ([DECISIONS.md](DECISIONS.md), 2026-09-28). In the browser: the worm on a 10 cm agar dish whose wall stops it, beside a food lawn whose butanone field is drawn in faint isolines, and which the worm's AWC-ON neuron smells, adapting as Levy & Bargmann's threshold does. "Add food" drops more lawns, up to eight, which can be dragged, picked up and put down, or removed; their odour spreads and fades as the field is stepped on the GPU, and the URL carries them with the worm's seed, so a link reproduces the dish. The worm smells food but won't slow on it or dwell there: those need neuromodulation, which the model leaves out (spec §5). Clicking the worm, or the "Touch front" and "Touch back" buttons, touches it, holding the touch receptors whose fields cover that point 10 mV above rest for half a second. The worm's whole simulation, brain and body, is stepped on the GPU, where it matches the CPU reference in Chrome and in Safari ([DECISIONS.md](DECISIONS.md), 2026-09-27). Beside it, the connectome as a rotatable 3D graph, with any neuron's connections lit, and an inspector that gives every connection's sign with its source and fidelity level. You can pause the worm, slow it down or run it up to 10× faster. Its neurons don't glow yet (milestone 6). A behavioural harness runs checkpoint 0 on the CPU reference, which the silenced network passes in full, showing no crawling, touch reflex or chemotaxis (though that says little about the wiring, since on the values it ran on the intact worm didn't crawl either), and checkpoint 1, crawling, which fails at the 2.5 ms step and reaches partial at half of it; checkpoints 2 to 4, which need crawling, wait on it ([VALIDATION.md](VALIDATION.md)). The build spec is [WORMLIGHT_SPEC.md](WORMLIGHT_SPEC.md).

## Run it

Needs Node 22.22.1 or later (or 23.6 or later), and a browser with WebGPU (recent Chrome or Edge, or Safari 26 or later).

```sh
npm install
npm run dev
```

## Credits

Connectome: [Cook et al. 2019](https://doi.org/10.1038/s41586-019-1352-7), _Nature_ 571:63, as released in [Emmons 2024](https://doi.org/10.1371/journal.pbio.3002939), _PLoS Biol_ 22:e3002939 (CC BY 4.0). Neurotransmitter identities: [Wang et al. 2024](https://doi.org/10.7554/eLife.95402), _eLife_ 13:RP95402. Synapse signs: [Fenyves et al. 2020](https://doi.org/10.1371/journal.pcbi.1007974). Exported via [Quantum Nematode](https://github.com/SyntheticBrains/nematode).

## Licence

The code is Apache-2.0 (see [LICENSE](LICENSE)). Bundled data keeps its original licences and attribution requirements: see [DATA_SOURCES.md](DATA_SOURCES.md), and [public/data/NOTICE.md](public/data/NOTICE.md), which ships with the site.
