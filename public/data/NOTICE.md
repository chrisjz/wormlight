# Data notices

<!-- Generated from data/sources.json by `npm run data:build`. Edit that file, not this one. -->

`wormlight.v1.json` combines the datasets below, and its `meta.licences` names each one's licence. Each keeps its own licence and attribution requirements, reproduced here. Wormlight's code is licensed separately, under Apache-2.0.

## Connectome

Cook SJ, Jarrell TA, Brittin CA, et al. Whole-animal connectomes of both Caenorhabditis elegans sexes. Nature 571:63–71 (2019), doi:10.1038/s41586-019-1352-7. As released in Emmons SW. Comprehensive analysis of the C. elegans connectome reveals novel circuits and functions of previously unstudied neurons. PLoS Biology 22(12):e3002939 (2024), doi:10.1371/journal.pbio.3002939, S1 File (doi:10.1371/journal.pbio.3002939.s001). Wormlight uses the hermaphrodite matrices' counts unchanged, restricted to the 302 neurons and the 95 body wall muscles, with the two directions of each gap junction folded into one pair and the 14 gap junctions between a neuron and itself omitted.

Copyright: © 2024 Scott W. Emmons

Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)

## Neurotransmitter identities

Wang C, Vidal B, Sural S, et al. A neurotransmitter atlas of C. elegans males and hermaphrodites. eLife 13:RP95402 (2024), doi:10.7554/eLife.95402, Supplementary File 2. Quantum Nematode reads each neuron's release identities from it, excluding orphan and unknown entries, uptake-only entries, the atlas's hedged entries and one precursor.

Copyright: © 2024, Wang et al.

Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)

## Neuron classes

Neuron classes from OpenWorm ConnectomeToolbox (cect) Cells.py v0.3.1, as curated in Quantum Nematode (https://github.com/SyntheticBrains/nematode, Apache-2.0).

Copyright: Copyright (c) 2024 OpenWorm

Licence: MIT (https://github.com/openworm/ConnectomeToolbox); licence text below

## Neuron positions

Neuron positions and process extents derived from the c302 NeuroML2 cell morphologies (OpenWorm, https://github.com/openworm/c302), which OpenWorm converted from the WormBase Virtual Worm, a 3D model of the worm made by Christian Grove and Paul Sternberg (Caltech).

Copyright: Copyright (c) 2024 OpenWorm

Licence: MIT; licence text below. The underlying WormBase Virtual Worm model is in the public domain

## Synapse signs

Fenyves BG, Szilágyi GS, Vassy Z, Sőti C, Csermely P. Synaptic polarity and sign-balance prediction using gene expression data in the Caenorhabditis elegans chemical synapse neuronal connectome network. PLoS Computational Biology 16(12):e1007974 (2020), doi:10.1371/journal.pcbi.1007974, S1 Data (doi:10.1371/journal.pcbi.1007974.s003) and S5 Data (doi:10.1371/journal.pcbi.1007974.s007). Wormlight takes the predicted polarity of each connection, and sets it aside where the presynaptic transmitter it rests on is not among the cell's identities in Wang et al. 2024.

Copyright: © 2020 Fenyves et al.

Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)

## Licence text (mit-openworm-2024)

```text
MIT License

Copyright (c) 2024 OpenWorm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
