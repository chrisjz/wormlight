// Numerical settings (PLAN §3.4). They set accuracy, not biology, so they are not parameters in the
// registry; the port check, the production check and the convergence tests are what justify them.

// The neural step, in seconds: PLAN's target. Both checks pass at it with room to spare, and at 3.33 ms
// with less; the port check fails at 5 ms (DECISIONS.md).
export const NEURAL_STEP = 0.0025;

// Conjugate gradients stop when the recursive residual falls below this fraction of ‖b‖ (f64, CPU).
export const CG_TOLERANCE = 1e-6;

// A solve that reaches this many iterations stops and sets a flag, so it can never spin.
export const CG_MAX_ITERATIONS = 64;

// The GPU's conjugate gradients stop at this fraction of ‖b‖ instead: f32, safely above the ~10⁻⁶ floor the
// review measured for f32 on this system (PLAN §3.4).
export const CG_TOLERANCE_GPU = 1e-5;

// The odour field's grid (PLAN §5.2): 256 × 256 cells 0.4 mm wide, covering the 10 cm dish, stepped explicitly
// in sub-steps of at most 4 ms, under the scheme's limit of h²/4D ≈ 4.4 ms. Its steady state is solved by
// conjugate gradients to this fraction of the source's norm.
export const ODOUR_CELLS = 256;
export const ODOUR_CELL = 4e-4; // m
export const ODOUR_SUBSTEP = 0.004; // s
export const ODOUR_TOLERANCE = 1e-10;

// The dish wall's damper engages over this much penetration, so the contact force and its damping both grow
// continuously from zero and the CPU and the GPU can't disagree about a rod that only grazes the wall.
export const WALL_SOFTENING = 1e-7; // m
