import { CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import type { L2BlockSource } from '@aztec/stdlib/block';

import type { WorldStateStatusSummary } from '../native/message.js';
import type { WorldStateConfig } from './config.js';

/** Returns the fixed checkpoint boundary, or undefined for a rolling checkpoint window. */
export function getWorldStateHistoryStartCheckpoint(
  config: Pick<WorldStateConfig, 'worldStatePruneBeforeCheckpoint' | 'worldStateCheckpointHistory'>,
): CheckpointNumber | undefined {
  if (config.worldStatePruneBeforeCheckpoint !== undefined) {
    return CheckpointNumberSchema.parse(config.worldStatePruneBeforeCheckpoint);
  }
  return config.worldStateCheckpointHistory < 1 ? CheckpointNumber.ZERO : undefined;
}

/** Rejects a database whose retained history cannot satisfy the configured pruning policy. */
export async function validateWorldStateHistory(
  config: Pick<WorldStateConfig, 'worldStatePruneBeforeCheckpoint' | 'worldStateCheckpointHistory'>,
  summary: WorldStateStatusSummary,
  blockSource?: Pick<L2BlockSource, 'getBlockData'>,
): Promise<void> {
  const startCheckpoint = getWorldStateHistoryStartCheckpoint(config);
  const { oldestHistoricalBlock, unfinalizedBlockNumber, finalizedBlockNumber } = summary;
  if (oldestHistoricalBlock <= 1) {
    return;
  }
  const available = `World state retains blocks ${oldestHistoricalBlock} to ${unfinalizedBlockNumber}`;
  const recovery = 'Use a fresh world-state database to rebuild the required history from a snapshot or genesis.';
  if (startCheckpoint === CheckpointNumber.ZERO) {
    throw new Error(`${available}, but all checkpoint history is required. ${recovery}`);
  }

  const oldest = await blockSource?.getBlockData({ number: oldestHistoricalBlock });
  let requiredCheckpoint = startCheckpoint;
  if (requiredCheckpoint === undefined) {
    const finalized = await blockSource?.getBlockData({ number: finalizedBlockNumber });
    if (finalized) {
      requiredCheckpoint = CheckpointNumber(
        Math.max(1, finalized.checkpointNumber - config.worldStateCheckpointHistory + 1),
      );
    }
  }
  if (!oldest || requiredCheckpoint === undefined) {
    throw new Error(`${available}, but its checkpoint history could not be verified against the archiver.`);
  }
  if (
    oldest.checkpointNumber > requiredCheckpoint ||
    (oldest.checkpointNumber === requiredCheckpoint && oldest.indexWithinCheckpoint !== 0)
  ) {
    throw new Error(
      `${available}, but history is required from the start of checkpoint ${requiredCheckpoint}. ${recovery}`,
    );
  }
}
