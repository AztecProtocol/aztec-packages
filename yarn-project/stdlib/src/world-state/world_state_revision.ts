import { z } from 'zod';

export class WorldStateRevision {
  /**
   * Sentinel `blockNumber` meaning "not pinned to any historical block; use the latest committed
   * state of the underlying tree". Mirrors the `WorldStateRevision::LATEST` constant on the C++
   * side (defined as `std::numeric_limits<uint32_t>::max()`). Distinct from `blockNumber === 0`,
   * which pins to the initial / genesis state.
   */
  public static readonly LATEST = 0xffffffff;

  constructor(
    public readonly forkId: number,
    public readonly blockNumber: number,
    public readonly includeUncommitted: boolean,
  ) {}

  public toString() {
    return `WorldStateRevision(forkId: ${this.forkId}, blockNumber: ${this.blockNumber}, includeUncommitted: ${this.includeUncommitted})`;
  }

  static empty() {
    return new WorldStateRevision(0, WorldStateRevision.LATEST, false);
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
