// Every source Wormlight cites, listed once. The fidelity registry, the parameters and the runtime data
// refer to these by id, and a test fails on an id that resolves to nothing. Each entry was checked
// against Crossref or the publisher; `note` records anything a reader should know about how it is used.

export interface Citation {
  // How the source is named in running text.
  short: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  doi?: string;
  url?: string;
  note?: string;
}

export const CITATIONS = {
  bargmann1993: {
    short: 'Bargmann, Hartwieg & Horvitz 1993',
    authors: 'Bargmann CI, Hartwieg E, Horvitz HR',
    year: 1993,
    title: 'Odorant-selective genes and neurons mediate olfaction in C. elegans',
    venue: 'Cell 74:515–527',
    doi: '10.1016/0092-8674(93)80053-H',
  },
  bentley2016: {
    short: 'Bentley et al. 2016',
    authors: 'Bentley B, Branicky R, Barnes CL, et al.',
    year: 2016,
    title: 'The multilayer connectome of Caenorhabditis elegans',
    venue: 'PLoS Computational Biology 12:e1005283',
    doi: '10.1371/journal.pcbi.1005283',
  },
  boyle2012: {
    short: 'Boyle, Berri & Cohen 2012',
    authors: 'Boyle JH, Berri S, Cohen N',
    year: 2012,
    title: 'Gait modulation in C. elegans: an integrated neuromechanical model',
    venue: 'Frontiers in Computational Neuroscience 6:10',
    doi: '10.3389/fncom.2012.00010',
  },
  broekmans2016: {
    short: 'Broekmans et al. 2016',
    authors: 'Broekmans OD, Rodgers JB, Ryu WS, Stephens GJ',
    year: 2016,
    title: 'Resolving coiled shapes reveals new reorientation behaviors in C. elegans',
    venue: 'eLife 5:e17227',
    doi: '10.7554/eLife.17227',
    note: 'Takes its eigenworms "from Stephens et al. (2008)".',
  },
  chalasani2007: {
    short: 'Chalasani et al. 2007',
    authors: 'Chalasani SH, Chronis N, Tsunozaki M, et al.',
    year: 2007,
    title: 'Dissecting a circuit for olfactory behaviour in Caenorhabditis elegans',
    venue: 'Nature 450:63–70',
    doi: '10.1038/nature06292',
    note: 'An erratum followed in 2008 (doi:10.1038/nature06540), and in 2016 a corrigendum (doi:10.1038/nature16515) regenerated the imaging figures after finding duplicated or mislabelled files. It reports "The properties of AWC ON, AIB and AIY neurons were fully supported"; five experiments, among them two AIB time points, are now considered preliminary.',
  },
  chalfie1985: {
    short: 'Chalfie et al. 1985',
    authors: 'Chalfie M, Sulston JE, White JG, et al.',
    year: 1985,
    title: 'The neural circuit for touch sensitivity in Caenorhabditis elegans',
    venue: 'Journal of Neuroscience 5:956–964',
    doi: '10.1523/JNEUROSCI.05-04-00956.1985',
  },
  chen2013: {
    short: 'Chen et al. 2013',
    authors: 'Chen TW, Wardill TJ, Sun Y, et al.',
    year: 2013,
    title: 'Ultrasensitive fluorescent proteins for imaging neuronal activity',
    venue: 'Nature 499:295–300',
    doi: '10.1038/nature12354',
  },
  cook2019: {
    short: 'Cook et al. 2019',
    authors: 'Cook SJ, Jarrell TA, Brittin CA, et al.',
    year: 2019,
    title: 'Whole-animal connectomes of both Caenorhabditis elegans sexes',
    venue: 'Nature 571:63–71',
    doi: '10.1038/s41586-019-1352-7',
    note: 'Wormlight reads its matrices as released under CC BY 4.0 in Emmons 2024.',
  },
  emmons2024: {
    short: 'Emmons 2024',
    authors: 'Emmons SW',
    year: 2024,
    title:
      'Comprehensive analysis of the C. elegans connectome reveals novel circuits and functions of previously unstudied neurons',
    venue: 'PLoS Biology 22:e3002939',
    doi: '10.1371/journal.pbio.3002939',
  },
  fenyves2020: {
    short: 'Fenyves et al. 2020',
    authors: 'Fenyves BG, Szilágyi GS, Vassy Z, Sőti C, Csermely P',
    year: 2020,
    title:
      'Synaptic polarity and sign-balance prediction using gene expression data in the Caenorhabditis elegans chemical synapse neuronal connectome network',
    venue: 'PLoS Computational Biology 16:e1007974',
    doi: '10.1371/journal.pcbi.1007974',
  },
  flavell2013: {
    short: 'Flavell et al. 2013',
    authors: 'Flavell SW, Pokala N, Macosko EZ, et al.',
    year: 2013,
    title: 'Serotonin and the neuropeptide PDF initiate and extend opposing behavioral states in C. elegans',
    venue: 'Cell 154:1023–1035',
    doi: '10.1016/j.cell.2013.08.001',
  },
  fitzhugh1961: {
    short: 'FitzHugh 1961',
    authors: 'FitzHugh R',
    year: 1961,
    title: 'Impulses and physiological states in theoretical models of nerve membrane',
    venue: 'Biophysical Journal 1:445–466',
    doi: '10.1016/S0006-3495(61)86902-6',
  },
  fouad2018: {
    short: 'Fouad et al. 2018',
    authors: 'Fouad AD, Teng S, Mark JR, et al.',
    year: 2018,
    title: 'Distributed rhythm generators underlie Caenorhabditis elegans forward locomotion',
    venue: 'eLife 7:e29913',
    doi: '10.7554/eLife.29913',
  },
  gao2018: {
    short: 'Gao et al. 2018',
    authors: 'Gao S, Guan SA, Fouad AD, et al.',
    year: 2018,
    title: 'Excitatory motor neurons are local oscillators for backward locomotion',
    venue: 'eLife 7:e29915',
    doi: '10.7554/eLife.29915',
  },
  gleeson2018: {
    short: 'Gleeson et al. 2018',
    authors: 'Gleeson P, Lung D, Grosu R, Hasani R, Larson SD',
    year: 2018,
    title: 'c302: a multiscale framework for modelling the nervous system of Caenorhabditis elegans',
    venue: 'Philosophical Transactions of the Royal Society B 373:20170379',
    doi: '10.1098/rstb.2017.0379',
    note: 'The c302 NeuroML2 cell morphologies (github.com/openworm/c302, MIT), converted from the WormBase Virtual Worm by Christian Grove and Paul Sternberg (Caltech), which they released into the public domain.',
  },
  gray2005: {
    short: 'Gray, Hill & Bargmann 2005',
    authors: 'Gray JM, Hill JJ, Bargmann CI',
    year: 2005,
    title: 'A circuit for navigation in Caenorhabditis elegans',
    venue: 'PNAS 102:3184–3191',
    doi: '10.1073/pnas.0409009101',
  },
  hebert2021: {
    short: 'Hebert et al. 2021',
    authors: "Hebert L, Ahamed T, Costa AC, O'Shaughnessy L, Stephens GJ",
    year: 2021,
    title: 'WormPose: image synthesis and convolutional networks for pose estimation in C. elegans',
    venue: 'PLoS Computational Biology 17:e1008914',
    doi: '10.1371/journal.pcbi.1008914',
    note: 'Its repository, iteal/wormpose, distributes the eigenworm basis the harness pins.',
  },
  ji2021: {
    short: 'Ji et al. 2021',
    authors: 'Ji H, Fouad AD, Teng S, et al.',
    year: 2021,
    title:
      'Phase response analyses support a relaxation oscillator model of locomotor rhythm generation in Caenorhabditis elegans',
    venue: 'eLife 10:e69905',
    doi: '10.7554/eLife.69905',
  },
  kim2019: {
    short: 'Kim, Leahy & Shlizerman 2019',
    authors: 'Kim J, Leahy W, Shlizerman E',
    year: 2019,
    title: 'Neural Interactome: interactive simulation of a neuronal system',
    venue: 'Frontiers in Computational Neuroscience 13:8',
    doi: '10.3389/fncom.2019.00008',
  },
  kunert2014: {
    short: 'Kunert, Shlizerman & Kutz 2014',
    authors: 'Kunert J, Shlizerman E, Kutz JN',
    year: 2014,
    title:
      'Low-dimensional functionality of complex network dynamics: neurosensory integration in the Caenorhabditis elegans connectome',
    venue: 'Physical Review E 89:052805',
    doi: '10.1103/PhysRevE.89.052805',
  },
  kunertgraf2017: {
    short: 'Kunert-Graf et al. 2017',
    authors: 'Kunert-Graf JM, Shlizerman E, Walker A, Kutz JN',
    year: 2017,
    title:
      'Multistability and long-timescale transients encoded by network structure in a model of C. elegans connectome dynamics',
    venue: 'Frontiers in Computational Neuroscience 11:53',
    doi: '10.3389/fncom.2017.00053',
  },
  levy2020: {
    short: 'Levy & Bargmann 2020',
    authors: 'Levy S, Bargmann CI',
    year: 2020,
    title: 'An adaptive-threshold mechanism for odor sensation and animal navigation',
    venue: 'Neuron 105:534–548',
    doi: '10.1016/j.neuron.2019.10.034',
  },
  lugg1968: {
    short: 'Lugg 1968',
    authors: 'Lugg GA',
    year: 1968,
    title: 'Diffusion coefficients of some organic and other vapors in air',
    venue: 'Analytical Chemistry 40:1072–1077',
    doi: '10.1021/ac60263a006',
  },
  nagumo1962: {
    short: 'Nagumo, Arimoto & Yoshizawa 1962',
    authors: 'Nagumo J, Arimoto S, Yoshizawa S',
    year: 1962,
    title: 'An active pulse transmission line simulating nerve axon',
    venue: 'Proceedings of the IRE 50:2061–2070',
    doi: '10.1109/JRPROC.1962.288235',
  },
  oist2025: {
    short: 'OIST Physics of Behavior tutorials 2025',
    authors:
      'OIST Physics of Behavior tutorials contributors (Zenodo creators: IrinaKorshok, a-beraud, Greg Stephens, AkiraK)',
    year: 2025,
    title: 'Physics of Behavior Tutorials, v1.0',
    venue: 'Zenodo (CC BY 4.0)',
    doi: '10.5281/zenodo.15099731',
    note: 'Its data/shapes.csv holds 6,655 real postures that the tutorial introduces as coming from the experiment of Stephens et al. 2008.',
  },
  randi2023: {
    short: 'Randi et al. 2023',
    authors: 'Randi F, Sharma AK, Dvali S, Leifer AM',
    year: 2023,
    title: 'Neural signal propagation atlas of Caenorhabditis elegans',
    venue: 'Nature 623:406–414',
    doi: '10.1038/s41586-023-06683-4',
  },
  richmond1999: {
    short: 'Richmond & Jorgensen 1999',
    authors: 'Richmond JE, Jorgensen EM',
    year: 1999,
    title: 'One GABA and two acetylcholine receptors function at the C. elegans neuromuscular junction',
    venue: 'Nature Neuroscience 2:791–797',
    doi: '10.1038/12160',
  },
  sawin2000: {
    short: 'Sawin, Ranganathan & Horvitz 2000',
    authors: 'Sawin ER, Ranganathan R, Horvitz HR',
    year: 2000,
    title:
      'C. elegans locomotory rate is modulated by the environment through a dopaminergic pathway and by experience through a serotonergic pathway',
    venue: 'Neuron 26:619–631',
    doi: '10.1016/S0896-6273(00)81199-X',
  },
  stephens2008: {
    short: 'Stephens et al. 2008',
    authors: 'Stephens GJ, Johnson-Kerner B, Bialek W, Ryu WS',
    year: 2008,
    title: 'Dimensionality and dynamics in the behavior of C. elegans',
    venue: 'PLoS Computational Biology 4:e1000028',
    doi: '10.1371/journal.pcbi.1000028',
  },
  tang2015: {
    short: 'Tang et al. 2015',
    authors: 'Tang MJ, Shiraiwa M, Pöschl U, Cox RA, Kalberer M',
    year: 2015,
    title:
      'Compilation and evaluation of gas phase diffusion coefficients of reactive trace gases in the atmosphere: Volume 2. Diffusivities of organic compounds, pressure-normalised mean free paths, and average Knudsen numbers for gas uptake calculations',
    venue: 'Atmospheric Chemistry and Physics 15:5585–5598',
    doi: '10.5194/acp-15-5585-2015',
  },
  tanimoto2017: {
    short: 'Tanimoto et al. 2017',
    authors: 'Tanimoto Y, Yamazoe-Umemoto A, Fujita K, et al.',
    year: 2017,
    title: 'Calcium dynamics regulating the timing of decision-making in C. elegans',
    venue: 'eLife 6:e21629',
    doi: '10.7554/eLife.21629',
  },
  troemel1999: {
    short: 'Troemel, Sagasti & Bargmann 1999',
    authors: 'Troemel ER, Sagasti A, Bargmann CI',
    year: 1999,
    title:
      'Lateral signaling mediated by axon contact and calcium entry regulates asymmetric odorant receptor expression in C. elegans',
    venue: 'Cell 99:387–398',
    doi: '10.1016/S0092-8674(00)81525-1',
  },
  varshney2011: {
    short: 'Varshney et al. 2011',
    authors: 'Varshney LR, Chen BL, Paniagua E, Hall DH, Chklovskii DB',
    year: 2011,
    title: 'Structural properties of the Caenorhabditis elegans neuronal network',
    venue: 'PLoS Computational Biology 7:e1001066',
    doi: '10.1371/journal.pcbi.1001066',
  },
  wang2024: {
    short: 'Wang et al. 2024',
    authors: 'Wang C, Vidal B, Sural S, et al.',
    year: 2024,
    title: 'A neurotransmitter atlas of C. elegans males and hermaphrodites',
    venue: 'eLife 13:RP95402',
    doi: '10.7554/eLife.95402',
  },
  wen2012: {
    short: 'Wen et al. 2012',
    authors: 'Wen Q, Po MD, Hulme E, et al.',
    year: 2012,
    title: 'Proprioceptive coupling within motor neurons drives C. elegans forward locomotion',
    venue: 'Neuron 76:750–761',
    doi: '10.1016/j.neuron.2012.08.039',
  },
  wes2001: {
    short: 'Wes & Bargmann 2001',
    authors: 'Wes PD, Bargmann CI',
    year: 2001,
    title: 'C. elegans odour discrimination requires asymmetric diversity in olfactory neurons',
    venue: 'Nature 410:698–701',
    doi: '10.1038/35070581',
  },
  white1986: {
    short: 'White et al. 1986',
    authors: 'White JG, Southgate E, Thomson JN, Brenner S',
    year: 1986,
    title: 'The structure of the nervous system of the nematode Caenorhabditis elegans',
    venue: 'Philosophical Transactions of the Royal Society of London B 314:1–340',
    doi: '10.1098/rstb.1986.0056',
  },
  wicks1996: {
    short: 'Wicks, Roehrig & Rankin 1996',
    authors: 'Wicks SR, Roehrig CJ, Rankin CH',
    year: 1996,
    title:
      'A dynamic network simulation of the nematode tap withdrawal circuit: predictions concerning synaptic function using behavioral criteria',
    venue: 'Journal of Neuroscience 16:4017–4031',
    doi: '10.1523/JNEUROSCI.16-12-04017.1996',
  },
  witvliet2021: {
    short: 'Witvliet et al. 2021',
    authors: 'Witvliet D, Mulcahy B, Mitchell JK, et al.',
    year: 2021,
    title: 'Connectomes across development reveal principles of brain maturation',
    venue: 'Nature 596:257–261',
    doi: '10.1038/s41586-021-03778-8',
  },
  xu2018: {
    short: 'Xu et al. 2018',
    authors: 'Xu T, Huo J, Shao S, et al.',
    year: 2018,
    title: 'Descending pathway facilitates undulatory wave propagation in Caenorhabditis elegans through gap junctions',
    venue: 'PNAS 115:E4493–E4502',
    doi: '10.1073/pnas.1717022115',
    note: 'Cited for its finding that some B-type motor neurons generate rhythmic activity; only the abstract has been checked.',
  },
  yeon2018: {
    short: 'Yeon et al. 2018',
    authors: 'Yeon J, Kim J, Kim DY, et al.',
    year: 2018,
    title:
      'A sensory-motor neuron type mediates proprioceptive coordination of steering in C. elegans via two TRPC channels',
    venue: 'PLoS Biology 16:e2004929',
    doi: '10.1371/journal.pbio.2004929',
  },
} as const satisfies Record<string, Citation>;

export type CitationId = keyof typeof CITATIONS;

export function citation(id: CitationId): Citation {
  return CITATIONS[id];
}

// A full reference in one line: authors, title, venue and year, then the DOI or URL.
export function reference(id: CitationId): string {
  const c: Citation = CITATIONS[id];
  const link = c.doi ? `doi:${c.doi}` : (c.url ?? '');
  const authors = c.authors.endsWith('.') ? c.authors : `${c.authors}.`;
  return `${authors} ${c.title}. ${c.venue} (${c.year}), ${link}`;
}
