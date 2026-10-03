// A stand-in for the calibration's worker, for the pool's tests (tests/wiring-test.test.ts): by its job's seed it
// answers (1), reports an error a trial threw (2), exits (3) or never answers (4).
process.on('disconnect', () => process.exit());
process.on('message', (job: { seed: number }) => {
  if (job.seed === 1) process.send?.({ job, record: { seed: 1 } });
  else if (job.seed === 2) process.send?.({ job, error: "the rectifier's gates cycle at rest" });
  else if (job.seed === 3) process.exit(1);
  else setInterval(() => undefined, 1000);
});
