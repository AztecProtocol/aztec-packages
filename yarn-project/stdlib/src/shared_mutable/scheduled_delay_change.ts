import type { UInt32 } from '../types/shared.js';

export class ScheduledDelayChange {
  constructor(
    public pre: UInt32 | undefined,
    public post: UInt32 | undefined,
    public blockOfChange: UInt32,
  ) {}

  static empty() {
    return new this(undefined, undefined, 0);
  }

  isEmpty(): boolean {
    return this.pre === undefined && this.post === undefined && this.blockOfChange === 0;
  }
}
