import { z } from 'zod';

export class WorldStateRevision {
  constructor(
    public readonly forkId: number,
    public readonly blockNumber: number,
    public readonly includeUncommitted: boolean,
  ) {}

  public toString() {
    return `WorldStateRevision(forkId: ${this.forkId}, blockNumber: ${this.blockNumber}, includeUncommitted: ${this.includeUncommitted})`;
  }

  static empty() {
    return new WorldStateRevision(0, 0, false);
  }

  static get schema() {
    return z
      .object({
        forkId: z.number(),
        blockNumber: z.number(),
        includeUncommitted: z.boolean(),
      })
      .transform(
        ({ forkId, blockNumber, includeUncommitted }) =>
          new WorldStateRevision(forkId, blockNumber, includeUncommitted),
      );
  }
}
