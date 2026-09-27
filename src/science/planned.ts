// The planned model's parameters (PLAN §6.2, §9), kept since track R's model took the registry's place: its
// provisional values, the best of the go/no-go's draws of it, draw 46, to three significant figures with the noise
// off (DECISIONS.md, 2026-09-26); and its calibrated values, the final ones of its fit, which
// data/calibration/planned.json records and a test holds them to (DECISIONS.md, 2026-09-27). In the registry's
// units; the neuromuscular gain and threshold are per EM section and in EM sections, the planned model's raw drive.

export interface PlannedValues {
  oscillatorExcitability: number; // pS, shared by the A- and B-types in the planned model
  oscillatorRecoveryTime: number; // s
  oscillatorDriveThreshold: number; // mV
  headSwitchGain: number; // pA
  proprioceptiveGain: number; // pA
  neuromuscularGain: number; // per EM section
  neuromuscularThreshold: number; // EM sections
  noiseIntensity: number; // pA·√s
}

export const PLANNED: { provisional: PlannedValues; calibrated: PlannedValues } = {
  provisional: {
    oscillatorExcitability: 798,
    oscillatorRecoveryTime: 1.53,
    oscillatorDriveThreshold: -11.5,
    headSwitchGain: 258,
    proprioceptiveGain: 16.7,
    neuromuscularGain: 2.45,
    neuromuscularThreshold: 3.48,
    noiseIntensity: 0,
  },
  calibrated: {
    oscillatorExcitability: 2135.222828203875,
    oscillatorRecoveryTime: 2.5061031374385916,
    oscillatorDriveThreshold: -12.882325367708441,
    headSwitchGain: 371.2328520506383,
    proprioceptiveGain: 0.3083730736997604,
    neuromuscularGain: 5,
    neuromuscularThreshold: 3.7377259379130763,
    noiseIntensity: 0.08342308722948755,
  },
};
