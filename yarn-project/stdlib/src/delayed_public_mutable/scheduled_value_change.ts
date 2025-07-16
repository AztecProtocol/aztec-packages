import { Fr } from '@aztec/foundation/fields';

import type { UInt64 } from '../types/shared.js';

export class ScheduledValueChange {
  constructor(
    public previous: Fr[],
    public post: Fr[],
    public timestampOfChange: UInt64,
  ) {
    if (this.previous.length !== this.post.length) {
      throw new Error('Previous and post must have the same length');
    }
  }

  static empty(valueSize: number) {
    return new this(Array(valueSize).fill(new Fr(0)), Array(valueSize).fill(new Fr(0)), 0n);
  }

  isEmpty(): boolean {
    return this.previous.every(v => v.isZero()) && this.post.every(v => v.isZero()) && this.timestampOfChange === 0n;
  }

  getCurrentAt(timestamp: UInt64) {
    if (timestamp < this.timestampOfChange) {
      return this.previous;
    } else {
      return this.post;
    }
  }
}
