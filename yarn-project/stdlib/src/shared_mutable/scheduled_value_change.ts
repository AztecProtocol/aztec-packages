import { Fr } from '@aztec/foundation/fields';

export class ScheduledValueChange {
  constructor(
    public previous: Fr[],
    public post: Fr[],
    public blockOfChange: number,
  ) {
    if (this.previous.length !== this.post.length) {
      throw new Error('Previous and post must have the same length');
    }
  }

  static empty(valueSize: number) {
    return new this(Array(valueSize).fill(new Fr(0)), Array(valueSize).fill(new Fr(0)), 0);
  }

  isEmpty(): boolean {
    return this.previous.every(v => v.isZero()) && this.post.every(v => v.isZero()) && this.blockOfChange === 0;
  }

  getCurrentAt(blockNumber: number) {
    if (blockNumber < this.blockOfChange) {
      return this.previous;
    } else {
      return this.post;
    }
  }
}
