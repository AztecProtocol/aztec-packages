import { Rollup } from './rollup.js';
import { RollupSource } from './rollup_source.js';

const createMockRollup = (rollupId: number) => {
  return {
    rollupId,
    commitments: [Buffer.alloc(32)],
  } as Rollup;
};

export class MockRollupSource implements RollupSource {
  private currentRollupId: number;
  private rollups: Rollup[] = [];
  constructor(private startRollupId: number) {
    this.currentRollupId = startRollupId;
    if (this.currentRollupId >= 0) {
      this.rollups = [createMockRollup(this.currentRollupId)];
    }
  }
  public getRollups(from: number, take = 10): Promise<Rollup[]> {
    if (from < this.startRollupId || from > this.currentRollupId + 1) {
      throw new Error('Rollup not found');
    }
    if (from === this.currentRollupId + 1) {
      this.rollups.push(createMockRollup(this.currentRollupId));
      this.currentRollupId + 1;
    }
    return Promise.resolve(this.rollups.slice(from, take));
  }

  public getLatestRollupId(): Promise<number> {
    return Promise.resolve(this.currentRollupId);
  }
}
