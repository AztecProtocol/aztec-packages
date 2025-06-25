import type { UInt64 } from '../types/shared.js';

export class ScheduledDelayChange {
  constructor(
    public pre: UInt64 | undefined,
    public post: UInt64 | undefined,
    public timestampOfChange: UInt64,
  ) {}

  static empty() {
    return new this(undefined, undefined, 0n);
  }

  isEmpty(): boolean {
    return this.pre === undefined && this.post === undefined && this.timestampOfChange === 0n;
  }
}
