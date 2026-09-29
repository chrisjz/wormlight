# Sign audit: the command circuit and its neighbours

> **Recorded 2026-09-30** (DECISIONS.md). This is the audit's report as it was made on 2026-09-29, kept as its record. No sign it discusses has been adopted: track R ended below partial on 2026-09-29, and the negative result stands as the headline. Adopting any of them would go through the route in §7. Its working files stayed local (§9), so the paths it names below, such as `crossref/` and `receptors/`, are to that folder, not to the repository.

2026-09-29. A data investigation for the maintainer, as DECISIONS.md (2026-09-29) asked: it reports what the evidence supports and changes nothing. No repository file was modified. The probe in §6 is **exploratory**: it ran on scratch copies of the runtime data, outside every checkpoint protocol, on exploration seeds 7001–7010.

The audit built on an earlier run that stopped part-way. Its work was checked before use:

- its CeNGEN files match its recorded SHA-256s;
- its receptor table was recomputed from those files (`cengen_check.py`);
- its quotes were spot-checked against the full texts (Piggott, Wang 2020, Huo, Lin, Kumar 2024, Kaplan, Hendricks, Liu 2018, Pirri);
- its Randi et al. orientation was re-derived from the paper's own examples;
- its earlier probe variants were decoded from their data files.

Its earlier probe flipped every cross-module link before the audit was done; it is superseded by §6.

## 1. Summary

**Contradicted signs.** The evidence contradicts the current sign of these connections. Sections are Cook's, summed over left and right.

| Connection         | Sections | Now (source)   | Evidence supports                      | Strength                                                             |
| ------------------ | -------- | -------------- | -------------------------------------- | -------------------------------------------------------------------- |
| AIB→RIM            | 109      | + (rule)       | −                                      | Direct physiology: IPSP at E_Cl, AVR-14 needed and rescued in RIM    |
| PVP→AVA            | 13       | + (rule)       | −                                      | Direct physiology: IPSPs in AVA, ACC-1/ACC-4 needed and rescued      |
| AVB→AVA            | 47       | + (rule)       | −                                      | Direct physiology, functional (maybe polysynaptic); one null result  |
| AVA→AVB            | 9        | + (rule)       | − fast, + slow                         | Direct physiology, functional; timescale-dependent                   |
| AIB→RIB            | 27       | + (rule)       | −                                      | Calcium imaging, eat-4-dependent; AVR-15 in RIB                      |
| SAA→RIM            | 121      | + (rule)       | −                                      | Calcium imaging (SAA not isolated) and cell-specific receptor rescue |
| RIM→AVB            | 41       | + (expression) | − (tyramine via LGC-55; GluCl-leaning) | Receptor-specific genetics and behaviour; expression                 |
| RIM→AVA (chemical) | 16       | + (expression) | − (glutamate via AVR-14)               | Receptor genetics and behaviour; the RIM–AVA gap junction excites    |
| AVA→PVC            | 77       | + (rule)       | − (leaning)                            | Receptor expression only, plus model inference                       |
| AIB→AVB            | 34       | + (expression) | − (leaning)                            | Receptor expression only (CeNGEN 2021)                               |
| AVM→AVB            | 22       | + (expression) | − (leaning)                            | Expression and model inference; Chalfie 1985 reads it the other way  |
| AIB→SMD            | 44       | + (expression) | − (leaning)                            | Cell-specific silencing and calcium; not shown to be direct          |
| SMD→RIA            | 121      | − (expression) | + net, through muscarinic GAR-3        | Calcium and receptor genetics, but metabotropic                      |
| AVA→AVE            | 8        | − (expression) | +                                      | Functional atlas only (effective connection)                         |
| AVD→PVC, AVE→PVC   | 3, 3     | + (expression) | − (leaning)                            | Receptor expression only                                             |

The last seven rows are weak (expression or inference only). AIB→SMD and SMD→RIA are head-circuit rows.

**Supported as they stand:**

- AVA→A-types + (Liu et al. 2017, patch clamp);
- AIY→AIZ −, AIY→RIB +, AIY→RIA − and AIZ→RIA + (Li 2014; Liu 2018; Lin 2024);
- PVP→AVB + and DVC→AVA + (Zhang 2025);
- AVE→AVA + (Randi 2023);
- PVC→AVB + (Chalfie 1985 and Wicks 1996, by inference).

**Unresolved,** with no contradiction established:

- PVC→AVA, AVD→AVA and SAA→AVA;
- the touch neurons' chemical synapses onto the opposite module: ALM→PVC, AVM→PVC, PLM→AVA and PLM→AVD;
- the small cross links onto motor neurons: AVA→B-types and AVB→A-types;
- RIA→SMD and RIA→RMD, RIM→SMD and RIM→RMD, and AIZ→RIM.

**Backward mode: no.** The evidence-supported signs give direct AVA⇄AVB inhibition, and by expression AVA⊣PVC and RIM⊣AVB. That is mutual inhibition on paper, but it has almost no leverage in the model:

- The command neurons' voltages are set by their gap junctions. AVBL has 2.7 nS of gap conductance, while AVA→AVBL's chemical synapse gives at most about 29 pS.
- The 52-section AVA–PVC gap junction yokes the two modules.

In the exploratory probe at R's refit, no audited sign set produced backward locomotion when AVA was driven, and AVB still rose rather than fell. Nor did holding AVB and PVC down, or driving the A-types directly with the B-types held down. With the head switch off, the worm does not move at all. So the model's missing backward mode lies downstream of the command interneurons, in the motor layer. The signs are a fidelity question, not the fix.

**Adoption.** The physiology rows fit the existing cited-override path (`data/sign-overrides.csv` plus `citations.ts`, level 5). Spec §2.3 anticipates that path, so it is not a deviation. Three kinds need the maintainer's decision:

- Receptor-genetics rows (RIM→AVB, RIM→AVA) have no fitting level or sign source in the schema.
- RIM→AVB rests on tyramine, which spec §2.4 and FIDELITY list as out of scope.
- A CeNGEN-based expression rule would replace the source spec §2.3 names.

Any change also invalidates R's refit, which was calibrated on the current signs.

## 2. What the pipeline did

`scripts/data/signs.ts` (`signChemical`) takes each chemical connection's sign from the first step that gives one (PLAN §2.4):

1. **Physiology** (`signSource: 'physiology'`, level 5) comes from `data/sign-overrides.csv`. Today it holds the seven AWC→AIY and AWC→AIB rows from Chalasani et al. 2007.
2. **Expression** (level 4) is Fenyves et al. 2020's "+" or "−", from S1 and S5 Data. It is used only where the transmitter Fenyves rests the prediction on is one of the cell's Wang et al. 2024 identities. Fenyves's receptor data are WormBase and WormAtlas plus the 2019 CeNGEN preprint, not the 2021 release.
3. **Rule** (level 0): ACh and Glu +, GABA −. It reads the nematode export's `ruleSign`, from the first-listed identity. Tyramine is never read, so RIM is signed on glutamate alone.
4. **None**: no fast effect.

How the audited connections got their signs:

- **AVA and AVB outputs are "complex" in Fenyves.** Fenyves gives AVA and AVB GABA as a second transmitter (row example: `AVAL, ACh, GABA → AVBL … complex`). Wang et al. 2024 record uptake only. The pipeline keeps a "complex" call from falling to the rule, so AVA→AVB, AVA→PVC, AVB→AVA and AVA→A-types all take the rule's +. Recomputed on ACh alone with Fenyves's own receptor flags, AVA→AVB and AVA→PVC come out "+" and AVB→AVA "complex". Fenyves would not have given inhibition here either.
- **RIM→AVB, AIB→AVB and AVM→AVB are "+" in Fenyves** because its AVB had only cationic glutamate receptors. CeNGEN 2021 puts GluCl subunits in AVB at threshold 4: avr-14 at 166 TPM and glc-4 at 92. Its only cationic glutamate receptors are glr-4 (86, threshold 4) and glr-5 (89, threshold 3); glr-1 reaches threshold 1 only.
- **PVC→AVA, PVP→AVA, SAA→RIM, AIB→RIM and AIB→RIB are "complex" in Fenyves** and take the rule's +. Each has a more specific source (§4).
- **PLM→AVA and PLM→AVD** are absent from Fenyves's rows and take the rule.

What the pipeline missed:

- **Specific physiology:** Roberts 2016, Zhang 2025, Piggott 2011, Wang 2020, Huo 2024 and Kumar 2024.
- **Receptor-specific genetics:** Pirri 2009 and Li 2023.
- **The newer expression data:** CeNGEN 2021 (Taylor et al.) and its polarity successor, Hardege et al. 2023.

## 3. Sources

Every DOI below was checked on Crossref with anonymous requests (`crossref/check.sh`; responses cached in `crossref/`) against first author, year, journal, volume and pages. "FT" means I read the full text (PMC, eLife or PLOS XML, or the publisher's PDF converted to text); "Abs" means the abstract only.

| Id             | Citation                                                                          | DOI                                | Read                                        |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| roberts2016    | Roberts WM … Lockery SR (2016) _eLife_ 5:e12572                                   | 10.7554/eLife.12572                | FT                                          |
| meng2024       | Meng J … Zhen M (2024) _Sci Adv_ 10:eadk0002                                      | 10.1126/sciadv.adk0002             | FT                                          |
| zhang2025      | Zhang Y … Gao S (2025) _Nat Commun_ 16:4405, "Hierarchical competing inhibition…" | 10.1038/s41467-025-59668-4         | FT                                          |
| pirri2009      | Pirri JK … Alkema MJ (2009) _Neuron_ 62:526–538                                   | 10.1016/j.neuron.2009.04.013       | FT                                          |
| piggott2011    | Piggott BJ … Xu XZS (2011) _Cell_ 147:922–933                                     | 10.1016/j.cell.2011.08.053         | FT                                          |
| wang2020       | Wang Y … Wen Q (2020) _eLife_ 9:e56942                                            | 10.7554/eLife.56942                | FT                                          |
| huo2024        | Huo J … Wen Q (2024) _PNAS_ 121:e2410789121                                       | 10.1073/pnas.2410789121            | FT                                          |
| kumar2024      | Kumar S … Leifer AM (2024) _iScience_ 27:110776                                   | 10.1016/j.isci.2024.110776         | FT                                          |
| kumar2023      | Kumar S … Leifer AM (2023) _PLoS Biol_ 21:e3002280                                | 10.1371/journal.pbio.3002280       | FT                                          |
| li2023         | Li Z … Xu XZS (2023) _Front Mol Neurosci_ 16:1228980                              | 10.3389/fnmol.2023.1228980         | FT                                          |
| liu2017        | Liu P, Chen B, Mailler R, Wang ZW (2017) _Nat Commun_ 8:14818                     | 10.1038/ncomms14818                | FT (already in `citations.ts`)              |
| kawano2011     | Kawano T … Zhen M (2011) _Neuron_ 72:572–586                                      | 10.1016/j.neuron.2011.09.005       | FT (PDF)                                    |
| chalfie1985    | Chalfie M … Brenner S (1985) _J Neurosci_ 5:956–964                               | 10.1523/JNEUROSCI.05-04-00956.1985 | FT (PDF; in `citations.ts`)                 |
| wicks1996      | Wicks SR, Roehrig CJ, Rankin CH (1996) _J Neurosci_ 16:4017–4031                  | 10.1523/JNEUROSCI.16-12-04017.1996 | FT (PDF; in `citations.ts`)                 |
| rakowski2013   | Rakowski F … Karbowski J (2013) _Front Comput Neurosci_ 7:128                     | 10.3389/fncom.2013.00128           | FT                                          |
| li2014         | Li Z … Xu XZS (2014) _Cell_ 159:751–765                                           | 10.1016/j.cell.2014.09.056         | FT                                          |
| liu2018        | Liu H … Zhang Y (2018) _Neuron_ 97:390–405.e3                                     | 10.1016/j.neuron.2017.12.003       | FT                                          |
| lin2024        | Lin C … Guo X (2024) _Nat Commun_ 15:297                                          | 10.1038/s41467-023-44638-5         | FT                                          |
| hendricks2012  | Hendricks M … Zhang Y (2012) _Nature_ 487:99–103                                  | 10.1038/nature11081                | FT                                          |
| kaplan2020     | Kaplan HS … Zimmer M (2020) _Neuron_ 105:562–576.e9                               | 10.1016/j.neuron.2019.10.037       | FT                                          |
| fenyves2020    | Fenyves BG … Csermely P (2020) _PLoS Comput Biol_ 16:e1007974                     | 10.1371/journal.pcbi.1007974       | FT and S1/S5 data                           |
| hardege2023    | Hardege I, Morud J, Courtney A, Schafer WR (2023) _J Neurosci_ 43:1111–1124       | 10.1523/JNEUROSCI.1516-22.2022     | FT and Zenodo repo files                    |
| taylor2021     | Taylor SR … Miller DM (2021) _Cell_ 184:4329–4347.e23 (CeNGEN)                    | 10.1016/j.cell.2021.06.023         | FT and 021821 matrices (hashes §5)          |
| wang2024       | Wang C … Hobert O (2024) _eLife_ 13:RP95402                                       | 10.7554/eLife.95402                | FT                                          |
| randi2023      | Randi F … Leifer AM (2023) _Nature_ 623:406–414                                   | 10.1038/s41586-023-06683-4         | FT, and the data via wormneuroatlas 0.0.7.3 |
| gordus2015     | Gordus A … Bargmann CI (2015) _Cell_ 161:215–227                                  | 10.1016/j.cell.2015.02.018         | FT (earlier run's notes)                    |
| kato2015       | Kato S … Zimmer M (2015) _Cell_ 163:656–669                                       | 10.1016/j.cell.2015.09.034         | Skimmed only                                |
| sordillo2021   | Sordillo A, Bargmann CI (2021) _eLife_ 10:e67723                                  | 10.7554/eLife.67723                | FT (earlier run's notes)                    |
| guo2009        | Guo ZV, Hart AC, Ramanathan S (2009) _Nat Methods_ 6:891–896                      | 10.1038/nmeth.1397                 | FT (earlier run's notes)                    |
| ringstad2009   | Ringstad N, Abe N, Horvitz HR (2009) _Science_ 325:96–100                         | 10.1126/science.1169243            | FT (earlier run)                            |
| takayanagi2016 | Takayanagi-Kiya S, Zhou K, Jin Y (2016) _eLife_ 5:e21734                          | 10.7554/eLife.21734                | FT (earlier run)                            |
| putrenko2005   | Putrenko I, Zakikhani M, Dent JA (2005) _J Biol Chem_ 280:6392–6398               | 10.1074/jbc.M412644200             | Abs                                         |
| dent2000       | Dent JA … Avery L (2000) _PNAS_ 97:2674–2679                                      | 10.1073/pnas.97.6.2674             | FT (earlier run)                            |
| pereira2015    | Pereira L … Hobert O (2015) _eLife_ 4:e12432                                      | 10.7554/eLife.12432                | FT (earlier run)                            |
| lindsay2011    | Lindsay TH, Thiele TR, Lockery SR (2011) _Nat Commun_ 2:306                       | 10.1038/ncomms1304                 | Skimmed (ASH→AVA only)                      |

The receptor-property sources, with their ion selectivities, are tabulated with quotes in `receptors/receptors.md` §3. That is the earlier run's work; its DOIs are in `receptors/sources_table.md`, and the ones cited here were re-checked.

## 4. Connection by connection

Notation: "AVB ACh−: …" lists ACh-gated anion channels in AVB from CeNGEN 2021, with TPM and the highest threshold passed (§5).

### 4.1 Between the forward and backward command modules

**AVA→AVB: 9 sections, + by the rule. Evidence supports fast inhibition; the synaptic mechanism is unknown.**

- **Roberts et al. 2016 (direct physiology).**
  - They photoactivated AVA (Prig-3::ChR2) and patch-clamped AVB. "The reversal potential of optically induced synaptic currents in AVA and AVB was more negative than the zero-current potential in these neurons … indicating synaptic inhibition" (AVA to AVB p = 0.043, n = 9).
  - The authors call it "likely to be monosynaptic", but that is not shown.
  - rig-3 is not AVA-specific, and the eLife reviewer noted that differences in ChR2 expression could complicate it.
- **Meng et al. 2024 (calcium imaging, behaviour and a model).**
  - "While AVA phasically inhibits the forward promoting interneuron AVB at a fast timescale, it maintains a tonic, extrasynaptic excitation on AVB over the longer timescale."
  - "AVA-mediated phasic inhibition of AVB also requires acetylcholine release; however, the precise mechanism remains unknown."
- **Receptors in AVB.**
  - ACh anion channels at threshold ≥2: none characterised. There are lgc-47 (343, threshold 4; an orphan with no current alone) and acc-4 (35, threshold 3; a subunit only). acc-1 and lgc-46 reach threshold 1 only.
  - ACh cation channels: acr-15 (164), acr-12 (87), unc-38 (59) and acr-16 (58).
  - Zhang et al. 2025 show that PVP excites AVB through ACR-15.
  - So a monosynaptic ionotropic inhibition of AVB by ACh has no clear receptor. The inhibition may be polysynaptic, for example through AVA–RIM gap junctions and RIM's tyramine, as Kawano 2011 proposed.
- **Randi 2023:** AVA→AVB not significant (5 stimulations).
- **Ambiguity:** one sign cannot carry Meng's two timescales. The fast component is the one the model's synapse represents.

**AVB→AVA: 47 sections, + by the rule. Evidence supports inhibition, with one conflicting result.**

- **Roberts 2016 (direct physiology).** They photoactivated AVB (Psra-11::ChR2, which also labels AIY and weakly AIA) and recorded AVA: inhibition, p = 0.019, n = 17. "The connection from AVB to AVA appeared to be stronger" than AVA→AVB.
- **AVA has functional ACh-gated chloride receptors.** Zhang 2025 show PVP's cholinergic inhibition of AVA by patch clamp, and "ACC-4 and ACC-1 [are] crucial components of the inhibitory ACh receptors in AVA", with rescue in AVA. CeNGEN adds lgc-39 (1831, the largest LGC in AVA; an anion channel gated by ACh, tyramine and octopamine), acc-4 (59), lgc-46 (45) and acc-1 (42, threshold 2).
- **The conflict.** Meng 2024: "Inactivation of AVB … did not lead to consistent changes in AVA calcium dynamics", and "communication is predominantly from AVA to AVB, instead of a strict reciprocal inhibition". Randi 2023: not significant (7 stimulations).
- **Model inference:** Rakowski 2013 found AVB's overall polarity 50/50.
- **Ambiguity:** AVA's receptor mix is near balance (Hardege-style sums of 2034 cationic against 2567 anionic TPM at threshold 4, flipping to cationic without lgc-46 and lgc-47). Expression therefore cannot tell AVA's presynaptic partners apart. AVE→AVA is excitatory in Randi 2023, significant on three of four pairs.

**AVA→PVC: 77 sections, + by the rule. Expression leans inhibitory; there is no physiology.**

- PVC ACh−: lgc-49 (398), the measured ACh-gated anion channel (Hardege 2023), plus acc-4 (118), lgc-47 (151) and lgc-46 (64). PVC ACh+: acr-12 (131), unc-38 (74), acr-5 (41) and unc-63 (17).
- The Hardege-style sum is − with or without lgc-46 and lgc-47 (613 against 340).
- Rakowski 2013's fit makes AVA inhibitory with probability 0.875; that is a per-neuron sign, and weak.
- Randi 2023 did not measure it.
- **Ambiguity:** AVA and PVC also share a 52-section gap junction in Cook's data. AVD→PVC and AVE→PVC (3 sections each, + by expression) lean − for the same reason.

**PVC→AVA: 27 sections, + by the rule. Unresolved.**

- AVA's receptor mix is ambiguous (above).
- Rakowski 2013 make PVC inhibitory (p = 0.719); Wicks 1996 make it excitatory, robustly across their runs. Both are per-neuron model inferences.
- Randi 2023: not significant (2 stimulations).

**PVC→AVB (69, + by expression), AVB→AVD (7, +) and PVC→AVD (40, + by the rule).** PVC→AVB + fits Chalfie 1985's posterior-touch pathway and Wicks 1996's excitatory PVC. For the other two I found no physiology.

### 4.2 Inputs that bias the modules

**RIM→AVB: 41 sections, + by expression. Evidence supports inhibition.**

- **Pirri et al. 2009** (receptor-specific genetics and behaviour; receptor selectivity measured):
  - LGC-55 is a tyramine-gated chloride channel, shown by reversal shifts in oocytes and in muscle.
  - "We have identified these neurons as the AVB, RMD, SMDD, SMDV …", and "the AVB … [is] postsynaptic to the tyraminergic RIM".
  - lgc-55 mutants back up less far and make more short reversals. "lgc-55 expression in the AVB neurons (sra-11::lgc-55) restored normal reversal behavior".
  - "Our data support the hypothesis that tyramine inhibits forward locomotion by activating lgc-55 and hyperpolarizing the AVB forward locomotion command neurons."
  - AVB's voltage was not recorded, and sra-11 also labels AIY and weakly AIA.
- **Receptors.** CeNGEN places lgc-55 in AVB (80, threshold 4). AVB's glutamate receptors lean anionic (§2), so RIM's glutamate probably also inhibits AVB; that is expression only.
- **Other support.** Kawano 2011 proposes the AVA→RIM (gap)→AVB tyramine route. Creamer et al.'s fitted weights, already in `data/reports/sign-crosscheck.md`, are negative for RIML→AVBL and RIML→AVBR.
- **Randi 2023:** not significant (13 stimulations, mean +0.09).

**RIM→AVA, chemical: 16 sections, + by expression. Evidence supports inhibition by glutamate.**

- **Li et al. 2023** (receptor genetics and behaviour):
  - avr-14 mutants reverse too often, and expressing avr-14 in AVA and AVE and the A-types rescues it; the AVA-only rescue gave p = 0.001.
  - Blocking glutamate release from RIM (RIM::eat-4 RNAi) abolishes the rescue.
  - "RIM also chronically inhibits AVA/AVE-A type motor neurons via an inhibitory glutamate pathway."
  - The authors allow "synaptically and/or extrasynaptically". RIM's gap junctions excite AVA (their Figure 4 and Guo 2009).
- **Conflicting reading.** Sordillo 2021 note that AVA and AIB express AMPA receptors and read RIM's glutamate as depolarising.
- **Other data.** Creamer's weights are negative (RIMR→AVAL). Randi 2023: not significant in wild type.

**PVP→AVA: 13 sections, + by the rule. Evidence supports inhibition, strongly.** PVP isn't on the audit's list, but it is AVA's input with the best evidence.

- **Zhang et al. 2025** (direct physiology and receptor genetics):
  - "PVP activation inhibited AVA by inducing inhibitory postsynaptic potentials (IPSPs) in AVA."
  - "whole-cell patch-clamp recordings demonstrated that the absence of ACC-1 and ACC-4 significantly reduced the IPSP in AVA … transgenic expression of wild-type acc-4 and acc-1 in AVA restored this IPSP."
- PVP→AVB + (through ACR-15) and DVC→AVA + are supported as they stand.

**AIB→AVB: 34 sections, + by expression. Expression leans inhibitory; there is no physiology.** AVB's glutamate receptors lean anionic (§2), and Randi 2023 didn't measure it. AIB drives reversals (Gordus 2015; Wang 2020), which an inhibitory AIB→AVB would fit, but that is inference.

**The touch neurons' chemical synapses onto the opposite module:** ALM→PVC 25, AVM→PVC 27, AVM→AVB 22, PLM→AVA 17 and PLM→AVD 18, all +.

- **Chalfie et al. 1985** (ablation, and speculation):
  - The gap junctions ALM–AVD and PLM–PVC carry the reflexes. "These chemical synapses could inactivate the inappropriate neural pathway."
  - But for AVM→AVB: "the chemical synapses seen in the electron micrographs between AVM and AVB must be functional", and "the principal pathway from AVB to the class A motor neurons for the touch reflex is via AVA". That is an excitatory reading.
- **Wicks et al. 1996** (a model fitted to ablation behaviour, one sign per presynaptic cell):
  - AVM is inhibitory, significant in every experiment.
  - ALM and PLM are inhibitory only weakly and not in every run.
  - PVC and AVD are excitatory.
- **Expression.** PVC's and AVA's and AVD's glutamate receptors are dominated by AMPA and NMDA subunits, which leans +: PVC glr-1 538, glr-2 580, nmr-1 378, nmr-2 710, against GluCl avr-14 106, glc-3 52 and glc-4 160. AVB's lean − (above).
- **Randi 2023:** PLM→AVA and PLM→AVD not significant (1–2 stimulations); the others were not measured.
- **Verdict.** AVM→AVB leans −, weakly: expression and Wicks, against Chalfie's relay reading. ALM→PVC, AVM→PVC, PLM→AVA and PLM→AVD stay unresolved: expression leans +, and the inference −.

### 4.3 AIB, RIM, RIB, AIY, AIZ, SAA

- **AIB→RIM: 109 sections, + by the rule. Evidence supports inhibition, strongly.**
  - Piggott et al. 2011, by patch clamp: "AIB stimulation by ChR2 led to a hyperpolarizing response (IPSP) in RIM". It was absent in eat-4 mutants, and "the IPSP response in RIM reversed its sign around −50 mV, close to the equilibrium potential of Cl−". Of the GluCl mutants, "mutations in avr-14 abolished such currents", and avr-14 expressed in RIM rescued them.
  - Lin et al. 2024 confirm with calcium and optogenetics: "the calcium activity of RIM was reduced after stimulation of AIB", with RIM-specific avr-14 rescue.
  - Co-activity of AIB and RIM during reversals (Gordus 2015; Kato 2015) reflects network state, not the synapse.
- **AIB→RIB: 27 sections, + by the rule. Evidence supports inhibition.** Wang et al. 2020: "RIB calcium activity … significantly reduced upon optogenetic activation of AIB in immobilized animals, which was not observed in … eat-4 animals". An iGluSnFR signal on RIB rises on AIB stimulation, avr-15 is in RIB (CeNGEN 2633 TPM), and restoring avr-15 in RIB rescued the behaviour.
- **SAA→RIM: 121 sections, + by the rule. Evidence supports inhibition.**
  - Huo et al. 2024: "we directly observed a significant decrease in RIM calcium activity … immediately after optogenetic activation of SAA". The legend says the activation also reached SMB and RIV.
  - Restoring ACC channels or LGC-47 in RIM alone shortens the reversals.
  - Kumar et al. 2024: "Only animals that expressed LGC-47 in RIM recapitulated the WT gating behavior". SAA as the source is inferred from wiring.
  - Creamer's weights are negative for SAA→RIM, in all four listed pairs. Randi 2023: not significant.
- **SAA→AVA: 139 sections, + by the rule. It stands.** Randi 2023 found SAAV→AVAR excitatory, significant on two pairs. Creamer's weights are negative. Huo 2024 place SAA's reversal-ending inhibition at RIM.
- **AIY→AIZ (−), AIY→RIB (+), AIY→RIA (−) and AIZ→RIA (+) all stand.**
  - Li 2014: ACh evokes a Cl⁻ current in AIZ through ACC-2, and an inward current in RIB through UNC-29 and ACR-16.
  - Liu 2018: ACC-2 in RIA.
  - Lin 2024: GLR-3 and GLR-6 in RIA.
- **AIZ→RIM: 69 sections, + by the rule. Unresolved.** Lin 2024: "the RIM calcium activities did not change after inhibition of AIZ".
- **RIM→AIB: 38 sections, + by expression. Unresolved.** Gordus 2015 show RIM's chemical synapses antagonising AIB's odour responses; Sordillo 2021 read RIM's glutamate as excitatory.

### 4.4 Head motor neurons: SMD, RMD, SMB, RIA, SAA

- **SMD→RIA: 121 sections, − by expression. The measured net effect is excitatory, but through a metabotropic receptor.**
  - Hendricks et al. 2012: RIA's compartmental calcium "is dependent on cholinergic input from head motor neurons". TeTx in SMD abolishes it, and "the muscarinic acetylcholine receptor (mAchR) GAR-3 acts in RIA".
  - RIA also expresses the ionotropic anion channel ACC-2 (197), which is what Fenyves's − rests on.
  - The model's synapse is fast and ionotropic, so this row is a modelling question rather than a clear error. Creamer's weights are positive for SMDV→RIA.
- **RIA→SMD and RIA→RMD: 228 and 471 sections, + by expression. Unresolved.**
  - Behaviour points to negative feedback. Liu 2018: blocking nrV release biases head undulation ventrally. Hendricks 2012 and 2013 find the same.
  - Ouellette 2018 suggest the RIA→SMD and RIA→RMD synapses "may be of opposite valence", and that settling it "will require identification of postsynaptic receptors".
  - Randi 2023 have RIAL→SMDVL excitatory (q < 0.001). Kaplan 2020 found silencing RIA had no effect on SMD's relation to head bending.
- **AIB→SMD: 44 sections, + by expression. Leans inhibitory.** Kaplan et al. 2020: "AIB inhibition abolished the forward/reverse locomotion modulation of SMDD frequency, SMDV frequency, and SMDD amplitude". Their hypothesis is that AIB and/or RIM inhibit SMD during reversals. The effect need not be monosynaptic.
- **RIM→SMD and RIM→RMD: 64 and 57 sections, + by expression. Mixed.**
  - Tyramine acts through LGC-55 and LGC-52, both anion channels, in SMD and RMD.
  - Pirri found that lgc-55 in neck muscle is necessary and sufficient for suppressing head oscillations. Kaplan found "a specific role for tyramine in SMDD frequency only".
  - Glutamate leans + by expression. Randi 2023 have RIML→SMDDL +, small but significant.
- **The rest have no physiology found:** RMD→RMD −, SMD→SMD +, SMB→SAA +, SAA→SMD + and AIZ→SMB +. Randi 2023 have AIZL→SMBDR + (significant).

### 4.5 Command interneurons onto motor neurons

- **AVA→DA, VA and AS: 363 sections, + by the rule. It stands, on direct physiology.**
  - Liu et al. 2017: "AVA excites A-MNs by releasing acetylcholine and activating a postsynaptic receptor containing LGC-46". That comes from patch clamp of VA5, AVA-specific unc-17 knockdown, and A-MN-specific lgc-46 knockdown and rescue.
  - LGC-46 is an anion-selective channel (Hardege 2023; Takayanagi-Kiya 2016), so an "inhibitory" receptor family mediates excitation here.
  - That is a caution against any blanket receptor-polarity rule. Note also that DECISIONS.md (2026-09-29) counted AVA→A-types among the cross-module links; they are within the backward pathway, and + is right.
- **AVA→DB/VB (10), AVB→DA/VA/AS (28), PVC→DA/AS (10), AVE→DB (3) and AVD→DB (2): all + and unresolved.** Expression leans + because A and B motor neurons are dominated by cationic AChRs. No physiology was found.
- **AVB→B-types** runs almost entirely through gap junctions: 156 sections, against 3 chemical.

## 5. Receptor expression, verified

The data are CeNGEN 021821's thresholded matrices (Taylor et al. 2021). Their SHA-256s were recomputed here and match the earlier run's table:

- threshold 1: `74ac7e40…`
- threshold 2: `de03fc03…`
- threshold 3: `2454624b…`
- threshold 4: `478791be…`

Full per-class calls, including the metabotropic receptors, are in `cengen_check_out.txt`. The earlier run's per-class tables are in `receptors/compact_by_class.md`. The ion selectivities come from the earlier run's `receptors/receptors.md` §3, where they are sourced:

- ACC-1, ACC-2, LGC-46, LGC-49, LGC-39, LGC-40, LGC-57 and LGC-58 are anion channels.
- LGC-55 is a tyramine-gated anion channel.
- AVR-14, AVR-15, GLC-1, GLC-2 and GLC-3 are anion channels; GLC-4 is inferred to be one.
- GLR and NMR subunits, and ACR-2R, ACR-16 and the L-AChR subunits, are cation channels.

Two cautions for any expression-based sign:

1. **An anion channel is not always inhibitory.** It depends on E_Cl against the membrane potential. LGC-46 mediates AVA's excitation of A-type motor neurons (Liu 2017), and LGC-55's reversal in muscle was about −30 mV (Pirri 2009). The model's inhibitory reversal is −48 mV.
2. **Expression is per class, not per synapse.** Every cholinergic input to AVA sees the same mix, yet PVP→AVA is inhibitory (Zhang 2025) while AVE→AVA is excitatory (Randi 2023).

The metabotropic receptors are listed but not used for signs. They include gar-2 in AVA (383), ser-2 in AVB (257), and gar-3 in RIA (1122), the receptor of Hendricks's SMD→RIA effect.

## 6. Would the supported signs give mutual inhibition? An exploratory probe

**On paper, partly.** With the supported signs, AVA and AVB inhibit each other directly: AVA→AVB 9 sections, AVB→AVA 47. RIM inhibits AVB, and by expression AVA inhibits PVC. Two things stay excitatory between the modules:

- the AVA–PVC gap junction (52 sections);
- the chemical links PVC→AVA (27) and PVC→AVD (40).

**In the model, the chemical cross links have little leverage.**

- A chemical synapse's conductance per EM section is at most 34.44 pS × a_r/(a_r + a_d) = 5.7 pS, and about 2.4 pS at a typical activation of 0.07. A gap junction's is 20.55 pS, always on.
- The command neurons are heavily coupled: AVAL and AVAR carry 4.7 and 5.1 nS of gap conductance, AVBL and AVBR 2.7 and 2.7 nS, and PVCL and PVCR 3.4 and 4.4 nS. Leak is 0.01 nS.
- AVA→AVBL's chemical synapse is therefore at most about 29 pS, around 1% of AVBL's gap conductance, and AVB→AVAL's (19 sections) about 110 pS.

**Method.** The repository's own modules ran on scratch copies of `public/data/wormlight.v1.json` with chosen signs changed. Each changed edge was marked `physiology` with a placeholder citation `audit` declared in `meta`, and the data passed `validateWormlightData`. The world was `startingWorld` at `currentParams()`, R's refit. Calibrated check: g_osc 5, g_osc,B 3.90, g_sw 312 pA and σ_n 0.059.

- **Stimulus:** 20 s of warm-up, then 5 s of current into both AVAs (0, 100, 200 or 400 pA) or both AVBs (200 or 400 pA), then 10 s after. The integrator restarts at each switch.
- **Seeds:** 7001–7010.
- **Resources:** 4 worker processes, each with `--max-old-space-size=2048`, a 5-minute timeout per trial, and a `memory_pressure` guard that stops below 50% free. It never triggered: memory stayed at 96% free.
- **Records:** every record is in `probe2/results*`, with summaries in `probe2/summary*.txt`. Each 35 s trial took about 1 s. No worker or wait loop was left running.

The variants are cumulative:

| Variant                   | Flipped to −                                                                                                                                  | Connections (sections) |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A-physiology              | AVA→AVB, AVB→AVA, PVP→AVA, AIB→RIM, AIB→RIB, SAA→RIM                                                                                          | 25 (326)               |
| B-genetics                | A plus RIM→AVB and RIM→AVA                                                                                                                    | 32 (383)               |
| C-expression              | B plus AVA→PVC, AVD→PVC, AVE→PVC, AIB→AVB and AVM→AVB                                                                                         | 44 (522)               |
| D-maximal                 | C plus every other cross-module link: the touch cells onto the opposite module, PVC→AVA, PVC→AVD, AVB↔AVD, and command→opposite motor neurons | 102 (737)              |
| C without the AVA–PVC gap | C, with the AVA–PVC gap junction removed. A diagnostic, not evidence                                                                          | 44 (522)               |

**Results** (10 trials each; means). "Reversal" means a backward run of at least 1 s starting within the stimulus or the 2 s after it. Velocity is in body lengths per second. Δ is the change in mean synaptic activation, stimulus window against the 5 s before; activation tops out at 0.167.

| Variant           | Drive      | Reversals | v before | v during | Backward share | ΔAVA   | ΔAVB   | ΔPVC   | ΔA-types |
| ----------------- | ---------- | --------- | -------- | -------- | -------------- | ------ | ------ | ------ | -------- |
| current           | AVA 0      | 2         | +0.021   | +0.029   | 0.04           | +0.001 | −0.000 | −0.003 | +0.000   |
| current           | AVA 400 pA | 1         | +0.021   | +0.011   | 0.00           | +0.092 | +0.011 | +0.066 | +0.024   |
| current           | AVB 400 pA | 0         | +0.021   | +0.025   | 0.02           | +0.016 | +0.143 | +0.017 | +0.007   |
| A-physiology      | AVA 400 pA | 1         | +0.020   | +0.011   | 0.00           | +0.089 | +0.010 | +0.066 | +0.024   |
| A-physiology      | AVB 400 pA | 2         | +0.020   | +0.026   | 0.02           | +0.010 | +0.143 | +0.016 | +0.007   |
| B-genetics        | AVA 400 pA | 1         | +0.020   | +0.011   | 0.00           | +0.090 | +0.010 | +0.066 | +0.024   |
| C-expression      | AVA 400 pA | 1         | +0.019   | +0.012   | 0.00           | +0.090 | +0.010 | +0.061 | +0.024   |
| D-maximal         | AVA 400 pA | 1         | +0.018   | +0.012   | 0.00           | +0.089 | +0.010 | +0.060 | +0.024   |
| D-maximal         | AVB 400 pA | 3         | +0.018   | +0.027   | 0.00           | +0.010 | +0.144 | +0.014 | +0.007   |
| C, no AVA–PVC gap | AVA 400 pA | 1         | +0.019   | +0.012   | 0.00           | +0.089 | +0.008 | +0.020 | +0.024   |

At 100 and 200 pA, and for AVB at 200 pA, the pattern is the same (`probe2/summary.txt`).

- **No sign set produced backward locomotion.** Driving AVA slows the worm but never reverses it: the backward share in the stimulus window is 0.00 in every variant at every amplitude. Evoked "reversals" (0–1 of 10 at 400 pA) are no more common than without drive (2–5 of 10 at 0 pA), which are the head switch's dithering.
- **No sign set made the modules inhibit each other at the neural level.** Driving AVA still raises AVB (+0.010) and PVC (+0.060 or more) in every variant, and driving AVB still raises AVA.
- **The AVA–PVC gap junction dominates PVC's response.** Removing it cuts PVC's rise from +0.061 to +0.020.
- **The drive itself is out of range.** The injected current takes AVA to about +55 mV, outside the model's reversal range (−48 to 0 mV), which exaggerates the gap-junction currents. It is the same issue as the head switch's unbounded current. A bounded conductance drive was not tried: the brain has no per-neuron conductance hook, and an explicit one would be unstable against AVA's roughly 5 nS of gap coupling at a 2.5 ms step.

**Diagnostics of the motor layer** (`probe2/summary-diag*.txt`, 10 trials each, current and C variants alike):

| Drive, 5 s                                            | Reversals | v during     | Backward share | ΔA-types   |
| ----------------------------------------------------- | --------- | ------------ | -------------- | ---------- |
| AVA +400 pA with AVB and PVC held at −200 pA          | 0–1       | +0.019–0.020 | 0.00           | +0.017     |
| A-types (DA, VA) +50 to +200 pA                       | 8–9       | +0.012–0.014 | 0.00           | +0.06–0.08 |
| A-types +200 pA with B-types (DB, VB) held at −200 pA | 1–2       | +0.013       | 0.00           | +0.076     |
| Head switch off (g_sw 0), no drive                    | 0         | −0.001       | 0.00           | 0          |
| Head switch off, AVA +400 pA                          | 0         | −0.003       | 0.00           | +0.024     |
| Head switch off, A-types +200 pA, B-types −200 pA     | 0         | −0.001       | 0.00           | +0.076     |

The A-type "reversals" are single runs of about 1 s at the stimulus's edges; the window's backward share is 0.

Even with the forward command neurons held down, or with the backward motor neurons driven directly, the refit makes no sustained backward locomotion. Without its head switch it doesn't move. So at R's refit the missing backward mode is not a sign problem: the motor layer produces no backward wave. The PLAN §10 risk table already notes that the A-types don't cycle on their own. On top of that, the head switch keeps pacing forward undulation whatever the command state. In the animal, head oscillations are suppressed during reversals, through RIM's tyramine on neck muscle (Pirri 2009) and through AIB on SMD (Kaplan 2020).

The supported signs are worth adopting for fidelity. They would matter behaviourally only once the motor layer can make a backward wave, and even then their leverage is small beside the gap junctions.

## 7. What adopting the signs would take

1. **Physiology rows go through the existing override path.** Spec §2.3 asks for "Sign overrides from the literature, each cited", so this is not a deviation.
   - Add rows to `data/sign-overrides.csv`, one per Cook edge with its left and right partners, each with a verbatim evidence quote.
   - Tier A in §6 is 25 rows: AVA→AVB 3, AVB→AVA 4, PVP→AVA 4, AIB→RIM 4, AIB→RIB 2 and SAA→RIM 8.
   - Add each citation to `src/science/citations.ts` once: roberts2016, zhang2025, piggott2011, wang2020, huo2024 and kumar2024. All six are checked on Crossref here; none is in the registry yet.
   - Rerun `npm run data:build` and `npm run docs:fidelity`, whose CI gates are `data:check` and `docs:check`. Add the new sources to the chemical-signs entry in `src/science/fidelity.ts`.
   - Update PLAN §2.4's hand-written counts: "a handful", the 1,716, 1,453 and 533, and the 1,986 connections in the sign-sensitivity set. `data/reports/data-build.md` regenerates.
   - Log it in DECISIONS.md.
2. **Level 5 overstates some of these rows.** PLAN names the override step "Cited physiology", and FIDELITY reads it as measured in the worm.
   - That fits the patch-clamp rows (Roberts, Zhang, Piggott) and, with a caveat, the calcium rows (Wang 2020; Huo 2024, where SAA was not isolated).
   - Roberts's result is functional, and possibly polysynaptic. Meng's two timescales mean one sign is a simplification.
   - Recording these caveats needs the evidence field, since the schema has no grade.
3. **Receptor-genetics rows need a decision.** RIM→AVB (Pirri 2009) and RIM→AVA (Li 2023) rest on receptor-specific rescue and behaviour, not on a measured synaptic response.
   - At level 5 through the override path they would overstate the evidence.
   - The alternative is a new sign source, say `genetics` at level 4 with a per-edge citation. That changes the runtime schema (`SignSource` in `src/data/schema.ts`), `countBySource`, the tests, the inspector's badges and FIDELITY's levels. It is a PLAN §2.3 and §2.4 change for the maintainer.
4. **Tyramine is a scope question.** RIM→AVB's strongest evidence is tyramine through LGC-55, an ionotropic receptor at a wired RIM synapse.
   - Signing an existing edge adds no §1.1 layer, so it is not a major deviation under spec §10.4.
   - But spec §1.1 and §2.4 put monoamines out of scope, and FIDELITY says "Dopamine, serotonin, tyramine, octopamine and neuropeptides are all absent".
   - Adopting it means asking the maintainer, amending that text, and saying the model now represents tyramine's fast synaptic action at RIM's synapses and nothing else.
   - The transmitter rule, which reads only RIM's glutamate, needs no change if this goes through an override.
5. **An expression rule from CeNGEN 2021 needs sign-off,** following Hardege et al. 2023. This is the route for AVA→PVC, AIB→AVB, AVM→AVB, AVD→PVC and AVE→PVC.
   - It replaces or supplements the source spec §2.3 names (Fenyves 2020), which is sign-off territory, as the S1+S5 change was (PLAN §0).
   - It would re-sign hundreds of connections across the connectome, not these few.
   - It needs a pinned CeNGEN matrix in `data/sources.json`; I did not check its licence. It also needs a pinned ligand and ion table, a new rule in `scripts/data/signs.ts` with tests, and its own sensitivity runs.
   - Given §5's cautions, I would not adopt it for these edges alone: the evidence is weak and cuts both ways.
6. **Calibration and validation.**
   - R's refit was calibrated on the current signs, so any change makes it stale and calls for recalibration under the rules then in force.
   - The audit was prompted by stimulations outside the checkpoints' protocols, which foreshadow checkpoint 2. Say so in DECISIONS.md, marked changed after results.
   - To avoid selecting signs for their effect on reversals, adopt every verified physiology sign the search found, including those that don't help reversals, such as the SMD→RIA question and AVA→AVE. A systematic literature pass over all edges would be better still.
   - The WGSL kernels read signs from the runtime data, so no kernel or parity change is needed. The visual baselines may need refreshing if neuron activity in the fixed views changes.
7. **The free-parameter budget is unchanged.** Signs are data, not parameters.

## 8. What I couldn't verify, and caveats

- **Monosynaptic or not.** For AVA⇄AVB, only Roberts et al. record the synaptic current, and their promoters (rig-3, sra-11) are not cell-specific. Meng 2024 contradicts the AVB→AVA direction. Neither establishes a monosynaptic, ionotropic sign.
- **AVA's inhibition of AVB has no known receptor.** AVB has no characterised ACh-gated anion channel at CeNGEN threshold ≥2 (only the orphan lgc-47 and the subunit acc-4).
- **The touch cells' chemical synapses.** No physiology was found for ALM→PVC, AVM→PVC, AVM→AVB, PLM→AVA or PLM→AVD. Chalfie 1985 and Wicks 1996 are inference; I did not search beyond them and Randi 2023.
- **RIM→AVB.** Pirri 2009 did not record AVB, and sra-11 also labels AIY and AIA.
- **RIM→AVA.** Li 2023 may act extrasynaptically; I did not read their supplementary figures.
- **Read status.** Kato 2015 was skimmed only. Gordus 2015, Sordillo 2021, Guo 2009, Ringstad 2009 and Dent 2000 rest on the earlier run's full-text notes, spot-checked but not re-read. Putrenko 2005 (the ACC channels' selectivity) was abstract only. Alkema 2005 and Qi et al. 2012 were not read.
- **Randi 2023** comes from the `wormneuroatlas` 0.0.7.3 copy of `funatlas.h5` (SHA-256 `53a99055…`), used only as an external cross-check, as spec §2.3 allows. Its orientation was confirmed from the paper's own examples: AVER→AVAR + and SAADL→OLLR −. Most command pairs had 2–13 stimulations, too few to detect inhibition.
- **Creamer's fitted weights** were read from the repository's existing cross-check report, which lists disagreements only. Agreements, such as whether Creamer has AIB→RIM positive, weren't visible.
- **CeNGEN** is L4 hermaphrodite single-cell RNA, not protein and not synaptic localisation. The live CengenApp's 2025 tables could not be confirmed identical to the 021821 release.
- **The probe** is exploratory. It used one parameter set (R's refit), injected currents that take neurons outside the reversal range, 10 seeds, and 5 s stimuli. It says nothing about the bounded-current model now being designed.

## 9. Files

The audit's working folder stayed local and isn't committed. It holds retrieved full texts, which are the publishers' copyright, and third-party data files that aren't pinned in `data/sources.json`, such as the CeNGEN 2021 matrices and a copy of `funatlas.h5`, as well as scratch scripts that read them:

- `crossref/`: the Crossref checks (`check.sh` and the cached responses).
- `cengen_check.py` and its output: the verified receptor calls (§5).
- `randi_cmd.py` and its output: Randi 2023's pairs for the command circuit.
- `edges.py`, `hardege_rule.py` and its output: the in-scope edges, with the Fenyves and Hardege-style calls.
- `probe2/`: the exploratory probe of §6, its scratch variants of the runtime data, and its results.
- `lit-command/` and `lit-head/`: the retrieved full texts, and the earlier run's notes.
- `receptors/receptors.md`: the receptor-property sources, with quotes.
- `probe/`: the earlier run's probe, superseded by `probe2/`.
