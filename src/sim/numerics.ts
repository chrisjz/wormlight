// Numerical settings (PLAN §3.4). They set accuracy, not biology, so they are not parameters in the
// registry; the port check, the production check and the convergence tests are what justify them.

// The neural step, in seconds: the largest the port check passes at with room to spare (DECISIONS.md).
export const NEURAL_STEP = 0.0025;

// Conjugate gradients stop when the recursive residual falls below this fraction of ‖b‖ (f64, CPU).
export const CG_TOLERANCE = 1e-6;

// A solve that reaches this many iterations stops and sets a flag, so it can never spin.
export const CG_MAX_ITERATIONS = 64;
