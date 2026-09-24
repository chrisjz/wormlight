# Data sources

Every dataset Wormlight reads, what it's used for, and its licence. The data build (milestone 0) pins each file by URL, commit or DOI, retrieval date and SHA-256, and this page gains those columns then. Literature that supplies parameters rather than data is cited in `FIDELITY.md`.

## Shipped with the app

| Dataset                                                                               | What Wormlight takes                                                                                              | Route                                                                                             | Licence                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cook et al. 2019, _Nature_ 571:63, SI 5 "Connectome adjacency matrices"               | Hermaphrodite chemical synapses, gap junctions and neuromuscular connections, as EM serial-section counts         | Quantum Nematode export, which vendors the file from the OpenWorm ConnectomeToolbox (cect) mirror | _Nature_ supplementary information, redistributed by cect under MIT; see nematode's `data/connectome/PROVENANCE.md`. Cite Cook et al. 2019. |
| Wang et al. 2024, _eLife_ 13:RP95402, Supplementary File 2                            | Each neuron's neurotransmitter release identity                                                                   | Quantum Nematode export                                                                           | CC BY (eLife). Cite Wang et al. 2024.                                                                                                       |
| `openworm/c302`, `c302/NeuroML2/*.cell.nml`                                           | Soma positions, dendrite tips (where head sensory neurons sense) and process extents (touch receptive fields)     | Wormlight data build                                                                              | MIT (c302). The morphologies come from the WormBase Virtual Worm (Grove & Sternberg), released into the public domain.                      |
| Fenyves et al. 2020, _PLoS Comput Biol_ 16:e1007974, file `journal.pcbi.1007974.s007` | Synapse signs predicted from transmitter and receptor expression, on the Cook 2019 connectome ("NT+R" prediction) | Wormlight data build                                                                              | CC BY 4.0. Cite Fenyves et al. 2020.                                                                                                        |

## Used in tests only (not shipped)

| Dataset                                                                                                                    | Use                                                                                                          | Licence      |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| Neural Interactome (Kim, Leahy & Shlizerman 2019), `shlizee/C-elegans-Neural-Interactome`: `Gg.npy`, `Gs.npy`, `emask.npy` | The port check: the CPU reference must reproduce Neural Interactome on its own Varshney et al. 2011 matrices | BSD-3-Clause |
| Creamer, Leifer & Pillow fitted weights (`Creamer_LDS_2026`, vendored in nematode)                                         | Sign cross-check on the head connections they cover; never used as strengths                                 | MIT          |

## Consulted, not bundled

| Source                                                                                        | Use                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Randi et al. 2023, _Nature_ 623:406, signal-propagation atlas                                 | Cited only. The OSF deposit states no licence, and the `wormneuroatlas` copy is GPL-3.0, so it can't be bundled with Apache-2.0 code. |
| Levy & Bargmann 2020, `LevySagi/Adaptive-Concentration-Threshold` (CC BY 4.0 per its LICENSE) | The adaptive-threshold constants K = 5.5 µM and τ = 17 s were read from `NoiseFilteringAnalysis_Fig6.m`. No code or data is bundled.  |
| Kim et al. 2025, `shlizee/modWorm` (BSD-3-Clause)                                             | Reviewed as prior art. Its muscle map is not used, because Wormlight takes neuromuscular connections straight from Cook et al. 2019.  |
