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

export class WorldStateRevisionWithHandle extends WorldStateRevision {
  constructor(
    forkId: number,
    blockNumber: number,
    includeUncommitted: boolean,
    public readonly handle: any,
  ) {
    super(forkId, blockNumber, includeUncommitted);
  }

  public toWorldStateRevision() {
    return new WorldStateRevision(this.forkId, this.blockNumber, this.includeUncommitted);
  }

  static fromWorldStateRevision(revision: WorldStateRevision, handle: any) {
    return new WorldStateRevisionWithHandle(revision.forkId, revision.blockNumber, revision.includeUncommitted, handle);
  }

  static override get schema() {
    return z
      .object({
        forkId: z.number(),
        blockNumber: z.number(),
        includeUncommitted: z.boolean(),
        handle: z.any(),
      })
      .transform(
        ({ forkId, blockNumber, includeUncommitted, handle }) =>
          new WorldStateRevisionWithHandle(forkId, blockNumber, includeUncommitted, handle),
      );
  }
}
