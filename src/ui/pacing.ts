// How many simulation steps each frame runs (PLAN §1: pause, slow motion and fast forward only change that
// number). A frame owes the wall time since the last one, times the speed, in simulated seconds, and runs the
// whole steps it owes. A frame's gap counts for at most a tenth of a second, so a hidden tab doesn't come
// back to a burst of work; and while the GPU is still busy with earlier frames, the frame runs nothing and
// the debt stops growing past a tenth of a second's worth, so a GPU that can't keep up runs slower than asked
// rather than falling ever further behind. A frame runs at most a cap of steps, the rest staying owed: a whole
// debt run at once takes a slow GPU several frames' time, and Safari then draws no frame until it is done, a few
// frames a second where capped batches between idle frames keep the display's pace (DECISIONS.md, 2026-09-30,
// "Performance and the Safari check"). The cap is also a ceiling: at 60 frames a second it allows FRAME_CAP × 60
// steps a second, 38.4 times real time, whatever the GPU.

export const MAX_GAP = 0.1; // s
export const FRAME_CAP = 256; // steps

export class Pacer {
  readonly step: number;
  readonly cap: number;
  private owed = 0;

  constructor(step: number, cap = Infinity) {
    this.step = step;
    this.cap = cap;
  }

  // The steps to run for `wall` seconds of wall time at `speed` times real time.
  advance(wall: number, speed: number, running: boolean, busy: boolean): number {
    if (!running || !(speed > 0)) {
      this.owed = 0;
      return 0;
    }
    this.owed = Math.min(this.owed + Math.min(Math.max(wall, 0), MAX_GAP) * speed, MAX_GAP * speed + this.step);
    if (busy) return 0;
    const steps = Math.min(Math.floor(this.owed / this.step + 1e-9), this.cap);
    this.owed -= steps * this.step;
    return steps;
  }

  reset(): void {
    this.owed = 0;
  }
}

// Frames and simulated time over the last second or so, for the frame rate and the speed achieved.
export class Rates {
  private readonly frames: number[] = [];
  private readonly simulated: number[] = [];

  record(now: number, seconds: number): void {
    this.frames.push(now);
    this.simulated.push(seconds);
    while (this.frames.length > 2 && now - this.frames[0] > 1000) {
      this.frames.shift();
      this.simulated.shift();
    }
  }

  // Frames a second, and simulated seconds a wall second, over the window.
  get(): { fps: number; speed: number } {
    const n = this.frames.length;
    if (n < 2) return { fps: 0, speed: 0 };
    const wall = (this.frames[n - 1] - this.frames[0]) / 1000;
    const sim = this.simulated.slice(1).reduce((a, b) => a + b, 0);
    return { fps: (n - 1) / wall, speed: sim / wall };
  }
}
