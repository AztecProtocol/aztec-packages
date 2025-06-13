import type { UInt32, UInt64 } from '../types/shared.js';

export class ScheduledDelayChange {
  constructor(
    public pre: UInt32 | undefined,
    public post: UInt32 | undefined,
    public timestampOfChange: UInt64,
  ) {}

  static empty() {
    return new this(undefined, undefined, 0n);
  }

  isEmpty(): boolean {
    return this.pre === undefined && this.post === undefined && this.timestampOfChange === 0n;
  }
}
