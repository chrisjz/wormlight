# Wormlight

A living _C. elegans_ in the browser. The worm's full connectome runs on the GPU and drives a physically simulated body on an agar plate, and its neurons glow as they activate, in the style of calcium imaging.

**Live:** https://chrisjz.github.io/wormlight/ (needs a browser with WebGPU).

**Status:** milestone 0c is done. The CPU reference simulates the connectome, the layers outside it and the body, but crawling does not yet emerge ([DECISIONS.md](DECISIONS.md), 2026-09-26). In the browser so far: the connectome as a rotatable 3D graph, with any neuron's connections lit. The build spec is [WORMLIGHT_SPEC.md](WORMLIGHT_SPEC.md).

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
