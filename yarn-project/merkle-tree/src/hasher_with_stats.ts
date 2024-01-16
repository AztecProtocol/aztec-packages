import { Hasher } from '@aztec/types/interfaces';

import { createHistogram, performance } from 'perf_hooks';

/**
 * A helper class to track stats for a Hasher
 */
export class HasherWithStats implements Hasher {
  hashCount = 0;
  hashHistogram = createHistogram();

  hash: Hasher['hash'];
  hashInputs: Hasher['hashInputs'];

  constructor(hasher: Hasher) {
    this.hash = performance.timerify((lhs, rhs) => {
      this.hashCount++;
      return hasher.hash(lhs, rhs);
    });
    this.hashInputs = performance.timerify((inputs: Buffer[]) => {
      this.hashCount++;
      return hasher.hashInputs(inputs);
    });
  }

  stats() {
    return {
      count: this.hashCount,
      averageDuration: this.hashHistogram.mean,
    };
  }

  reset() {
    this.hashCount = 0;
    this.hashHistogram.reset();
  }
}
