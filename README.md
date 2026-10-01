# Wormlight

A living _C. elegans_ in the browser. The worm's full connectome runs on the GPU and drives a physically simulated body on an agar plate, and its neurons glow as they activate, in the style of calcium imaging.

**Live:** https://chrisjz.github.io/wormlight/ (needs a browser with WebGPU: recent Chrome or Edge, or Safari 26 or later).

![The app: on the left the worm on its dish, paused 45 seconds into a run; on the right the connectome's 3D graph, its neurons glowing with their simulated activity, the interneuron AVAL selected and its connections listed with where each sign comes from.](docs/images/app.png)

## Where it stands

**The worm does not yet crawl as the project's first behavioural checkpoint asks.** That is the result, and the project reports it as one.

The rule Wormlight was built under is that behaviour must emerge from the connectome: nothing scripts the worm, and the few layers allowed outside the wiring are fixed in advance and blind to what the worm is doing. Its thresholds for each behaviour were fixed in advance too, from published measurements. Against them:

- **Crawling (checkpoint 1) fails.** On the chosen fit, the calibrated values the app runs, the worm moves forward about four fifths of the time, at about an eighth of a real worm's speed, in runs that end at about ten seconds. Its wavelength and its postures fall within a real worm's range, but it is paced by a slow rhythm in its head, not by a wave it sustains: its undulation frequency, its speed and its sustained runs all fail.
- **No fit the rules could choose does better.** A research track, R, rebuilt and recalibrated the model in three rounds, under rules set before each ran. It found crawlers, one of them at about half a real worm's speed, but none that the rules let it choose: each came from a search outside the chosen procedure, or changed when the simulation's time step was halved. One set of values, found by exploring and graded on the seeds it was picked on, even passes every clause of checkpoint 1; it never reverses, drives some neurons far outside the range any synapse could take them to, and no rule could choose it. The third round's crawl, the one taken apart, is paced by the head's rhythm, relayed along the body by proprioception, and largely indifferent to the chemical wiring: it still moves forward, at about half its speed, with every chemical synapse cut. So with its anatomical weights, gains set per class of neuron and the layers the rule allows, the connectome doesn't crawl at the level set in advance.
- **The later checkpoints were not reached.** The touch reflexes, chemotaxis and the lesion effects (checkpoints 2 to 5) need a worm that crawls. The test of whether the real wiring matters (checkpoint 6) doesn't strictly, but the project chose not to tune rewired brains to a crawl the real wiring's own fit doesn't have. All five are specified, and unrun.
- **The silenced network (checkpoint 0) passes**, which says little: with its synapses cut the worm barely moves, as it should, but the fit moves by its head's rhythm alone, so the pass follows from a bound on that rhythm, not from the wiring. With the uncertain synapse signs drawn at random instead, the silenced worm's head rhythm is free to run, now and then on the noise, and in two of ten draws the worm drifts forward for ten seconds.
- **The uncertain signs don't rescue the crawl.** With the chosen fit's values held and nothing tuned again, setting them all excitatory, all silent or at random, or rescaling the connections, leaves crawling failing every time.

What is built and checked: a CPU reference of the whole loop, which reproduces the published network model it starts from; the same loop on the GPU, matching the reference in Chrome, in Safari and on CI; the app, with touch, food, lesions and a rewired contrast brain, at 60 frames a second up to at least 20 times real time in Chrome and Safari on an Apple M5 Max; and a ledger of how well biology supports every part. [VALIDATION.md](VALIDATION.md) has the results in full, and [DECISIONS.md](DECISIONS.md) how each was reached.

## The science in brief

**The hypothesis.** That the measured wiring of the worm's nervous system, run through a standard model of its neurons and a small, documented set of mechanisms the wiring can't supply, is enough for its behaviour to emerge. The app lets a viewer test the wiring's part of that, though on the chosen fit little of the worm's motion comes from the wiring: lesion a neuron, or swap the real wiring for one rewired at random, and watch what changes.

**The model.**

- **The wiring** is the adult hermaphrodite's: 302 neurons, 3,709 chemical connections and 1,095 gap-junction pairs, with 956 connections onto 95 body-wall muscles, from serial-section electron microscopy (Cook et al. 2019, as corrected in Emmons 2024).
- **The neurons** are graded, not spiking, as most of the worm's are: leaky membranes joined by gap junctions and by chemical synapses with a sigmoidal activation (Kunert et al. 2014). A synapse's strength is taken as proportional to its size in the micrographs. Its sign is inferred, not measured: from transmitter and receptor expression for 46% of connections (Fenyves et al. 2020), from the transmitter alone for 39%, and with no basis, so no fast effect, for 14%; seven rest on physiology.
- **Five layers sit outside the wiring**, the only ones the rule allows, each set by one rule for every cell of a class and shared by every brain:
  1. sensing: one olfactory neuron, AWC-ON, smelling butanone with an adapting threshold, and the gentle-touch receptors;
  2. proprioception: the body's curvature fed back to the motor neurons the literature names;
  3. intrinsic rhythm: oscillators in the A- and B-type motor neurons, and a relaxation switch in the head. Which cells generate the worm's rhythm is unsettled, and this is one documented hypothesis, not a finding (Ji et al. 2021; Fouad et al. 2018; Gao et al. 2018; Wen et al. 2012);
  4. the step from motor neurons to muscle activation;
  5. seeded noise in each neuron.
- **The body** is two-dimensional: 49 rods joined by springs and dampers and bent by dorsal and ventral muscles, pushing against agar by anisotropic drag (Boyle, Berri & Cohen 2012). Nothing moves the worm but that.
- **The dish** is a 10 cm plate. Food lawns release butanone, which spreads through the air above the agar by diffusion.

**What the model leaves out.** Neuromodulation and all signalling outside synapses: dopamine, serotonin, tyramine, octopamine and the neuropeptides. With them go the food behaviours that depend on them, so the worm smells food but will not slow on it (Sawin, Ranganathan & Horvitz 2000) or dwell there (Flavell et al. 2013). Also left out: every sense but butanone and gentle touch; the pharynx and feeding; spikes, plateaus and differences between cell types; rectifying gap junctions; variation between animals, development and learning.

**The guards against faking it.**

- With every connection between neurons cut, crawling, the touch reflexes and chemotaxis must all disappear (checkpoint 0).
- Parameters are global or set by one rule per class of neuron, never tuned neuron by neuron: 18 are free, 12 of them calibrated, and only against crawling and the rate of spontaneous reversals. The other checkpoints are held out.
- Every threshold was fixed before its results, and every change since is logged and marked.
- Every graded quantity is labelled as a calibration target or a prediction.

[FIDELITY.md](FIDELITY.md), and "About the science" in the app, grade every part from measured in the worm down to assumed.

## Using the app

- **The plate.** Play and pause, and run at ¼×, 1×, 4× or 10× real time. Restart runs the same worm again, and New worm draws another. Click the worm, or use Touch's Front and Back, to touch it. Food's Add drops a lawn where you next click. Zoom out until a lawn looks small to move it: drag it, or click it to pick it up and click again to put it down; dragged off the dish, it is removed. Closer in, a drag pans. Clear removes them all. Scroll to zoom; double-click to follow the worm again.
- **The connectome.** Drag to turn it, scroll to zoom, and click a neuron, or find one by name, to see its connections, its simulated activity and where each fact comes from. Ablate lesions the neuron, live; Restore brings it back, and Restore all every one. Colour by switches between the glow and the neurons' classes.
- **Brain** swaps the real wiring for one of ten random rewirings of its chemical synapses, live and untuned: the contrast brain.
- **Copy link** copies a link to the setup: the worm's seed, the food, the brain and the lesions, with the versions of the model and data it was made with. A link reproduces the setup, not the path: on another GPU the worm's path can differ.

A link's main parameters, all optional:

| Parameter               | What it sets                                                                   |
| ----------------------- | ------------------------------------------------------------------------------ |
| `seed=4`                | The worm: its heading, its noise, and which AWC is ON                          |
| `food=10,0;-20,5`       | The lawns, in millimetres from the dish's centre; empty for none               |
| `brain=rewired-3`       | The contrast brain's rewiring, 1 to 10                                         |
| `lesions=AVAL+AVAR`     | The neurons lesioned                                                           |
| `model=1&data=4dc6ffca` | The versions the link was made with; the app says so if its own differ         |
| `view=plate`, `graph`   | One view alone                                                                 |
| `t=30`, `paused=1`      | Run the worm this many seconds before the first frame, up to 600; start paused |
| `speed=20`              | How many times real time the worm runs, up to 100; the buttons stop at 10×     |
| `neuron=AVAL`           | The neuron selected                                                            |
| `colour=class`          | The graph coloured by class, not by the glow                                   |
| `about=science`         | "About the science" open                                                       |
| `stats=1`               | The frame rate and the worm's speed, shown                                     |

## Run it

Needs Node 22.22.1 or later (or 23.6 or later), and a browser with WebGPU.

```sh
npm install
npm run dev        # the app, at the address it prints
npm test           # unit tests
npm run build      # typecheck and bundle into dist/
```

The rest, from the data build to the behavioural harness and GPU parity, is listed with what each does in [CLAUDE.md](CLAUDE.md).

## The documents

| Document                                 | What it holds                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| [WORMLIGHT_SPEC.md](WORMLIGHT_SPEC.md)   | The contract the project was built to                                        |
| [PLAN.md](PLAN.md)                       | The design, with every threshold fixed in advance                            |
| [VALIDATION.md](VALIDATION.md)           | The checkpoints' results, their methods and the known simplifications        |
| [FIDELITY.md](FIDELITY.md)               | How well biology supports each part, generated from the registry in the code |
| [DATA_SOURCES.md](DATA_SOURCES.md)       | Every dataset, with its citation and licence                                 |
| [DECISIONS.md](DECISIONS.md)             | The log of every significant choice, its reasons and what it found           |
| [docs/sign-audit.md](docs/sign-audit.md) | An audit of the command circuit's synapse signs against the literature       |
| [docs/spec-audit.md](docs/spec-audit.md) | An audit of the repository against the spec, requirement by requirement      |

## Citing

Wormlight's releases are numbered, the first 0.1.0, and listed under the repository's [Releases](https://github.com/chrisjz/wormlight/releases); the live site runs `main`, which can be ahead of the latest, and About the science names the version and commit it runs. To cite Wormlight, use "Cite this repository" on its GitHub page, which reads [CITATION.cff](CITATION.cff), and give the version you used. Please cite the connectome too: Cook et al. 2019, as released in Emmons 2024.

## Credits

Connectome: [Cook et al. 2019](https://doi.org/10.1038/s41586-019-1352-7), _Nature_ 571:63, as released in [Emmons 2024](https://doi.org/10.1371/journal.pbio.3002939), _PLoS Biol_ 22:e3002939 (CC BY 4.0). Neurotransmitter identities: [Wang et al. 2024](https://doi.org/10.7554/eLife.95402), _eLife_ 13:RP95402. Exported via [Quantum Nematode](https://github.com/SyntheticBrains/nematode). Synapse signs: [Fenyves et al. 2020](https://doi.org/10.1371/journal.pcbi.1007974), joined by Wormlight's own data build.

## Licence

The code is Apache-2.0 (see [LICENSE](LICENSE)). Bundled data keeps its original licences and attribution requirements: see [DATA_SOURCES.md](DATA_SOURCES.md), and [public/data/NOTICE.md](public/data/NOTICE.md), which ships with the site.
