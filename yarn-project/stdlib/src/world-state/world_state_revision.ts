import { z } from 'zod';

export class WorldStateRevision {
  constructor(
    public readonly forkId: number,
    public readonly blockNumber: number,
    public readonly includeUncommitted: boolean,
  ) {}

  static empty() {
    return new WorldStateRevision(0, 0, false);
  }

  static get schema() {
    return z.object({
      forkId: z.number(),
      blockNumber: z.number(),
      includeUncommitted: z.boolean(),
    });
  }
}

// TODO(dbanks12): consider moving back to world-state module
export function worldStateRevision(
  includeUncommitted: boolean,
  forkId: number | undefined,
  blockNumber: number | undefined,
): WorldStateRevision {
  return {
    forkId: forkId ?? 0,
    blockNumber: blockNumber ?? 0,
    includeUncommitted,
  };
}
