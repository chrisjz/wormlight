# Wormlight

A living _C. elegans_ in the browser. The worm's full connectome runs on the GPU and drives a physically simulated body on an agar plate, and its neurons glow as they activate, in the style of calcium imaging.

**Status:** planning. The build spec is [WORMLIGHT_SPEC.md](WORMLIGHT_SPEC.md); nothing is simulated yet.

## Run it

Needs Node 22.12 or later, and a browser with WebGPU (recent Chrome or Edge, or Safari 26 or later).

```sh
npm install
npm run dev
```

## Credits

Connectome: Cook et al. 2019, _Nature_ 571:63. Neurotransmitter identities: Wang et al. 2024, _eLife_ 13:RP95402. Exported via [Quantum Nematode](https://github.com/SyntheticBrains/nematode).

## Licence

The code is Apache-2.0 (see [LICENSE](LICENSE)). Bundled data keeps its original licences and attribution requirements, which will be listed in `DATA_SOURCES.md`.
