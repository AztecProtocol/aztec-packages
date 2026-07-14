import type { RollupCheatCodes } from '@aztec/ethereum/test';
import type { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { computeEpochOutHash } from '@aztec/stdlib/messaging';

/** Arguments for {@link settleEpochOutbox}. */
export type SettleEpochOutboxArgs = {
  /** Cheat codes used to write the computed out hash directly into the L1 Outbox storage. */
  rollupCheatCodes: RollupCheatCodes;
  /** Source of checkpointed L2 blocks for the epoch being settled. */
  l2BlockSource: L2BlockSource;
  /** Epoch to settle. */
  epoch: EpochNumber;
  /**
   * When set, only checkpoints up to and including this number are covered. Used to settle a partial
   * epoch (the AZIP-14 Outbox keeps one root per `numCheckpointsInEpoch`, so a prefix of an epoch can
   * be settled and consumed before the epoch completes). When omitted, every checkpointed block in the
   * epoch is covered.
   */
  maxCheckpoint?: CheckpointNumber;
  log: Logger;
};

/**
 * Computes the epoch out hash over the checkpointed blocks of an epoch (optionally only up to
 * `maxCheckpoint`) and writes it into the L1 Outbox via cheat codes. This is the synthetic,
 * no-prover equivalent of an epoch root proof landing on L1: it makes the L2-to-L1 messages in the
 * covered checkpoints consumable. It does NOT advance the rollup's proven tip — callers
 * `markAsProven` separately so a single prove call can settle multiple epochs before marking proven.
 *
 * Used by the test-only proving drivers: the `AutomineSequencer`'s auto-settle loop and the standalone
 * `EpochTestSettler`. Lives here (rather than in either consumer) so both share one implementation.
 *
 * @returns The last checkpoint number covered by the settled range, or `undefined` if the epoch has
 * no checkpointed blocks (within the `maxCheckpoint` bound).
 */
export async function settleEpochOutbox({
  rollupCheatCodes,
  l2BlockSource,
  epoch,
  maxCheckpoint,
  log,
}: SettleEpochOutboxArgs): Promise<CheckpointNumber | undefined> {
  let blocks = await l2BlockSource.getBlocks({ epoch, onlyCheckpointed: true });
  if (maxCheckpoint !== undefined) {
    blocks = blocks.filter(block => block.checkpointNumber <= maxCheckpoint);
  }
  if (blocks.length === 0) {
    return undefined;
  }

  log.info(
    `Settling epoch ${epoch}${maxCheckpoint !== undefined ? ` up to checkpoint ${maxCheckpoint}` : ''} with blocks ${blocks[0]?.header.getBlockNumber()} to ${blocks.at(-1)?.header.getBlockNumber()}`,
    { epoch, maxCheckpoint, blocks: blocks.map(block => block.toBlockInfo()) },
  );

  const messagesInEpoch: Fr[][][][] = [];
  // Undefined (not SlotNumber.ZERO) so a first checkpointed block at slot 0 still opens checkpoint 0.
  let previousSlotNumber: SlotNumber | undefined;
  let checkpointIndex = -1;

  for (const block of blocks) {
    const slotNumber = block.header.globalVariables.slotNumber;
    if (slotNumber !== previousSlotNumber) {
      checkpointIndex++;
      messagesInEpoch[checkpointIndex] = [];
      previousSlotNumber = slotNumber;
    }
    messagesInEpoch[checkpointIndex].push(block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs));
  }

  const outHash = computeEpochOutHash(messagesInEpoch);
  if (!outHash.isZero()) {
    await rollupCheatCodes.insertOutbox(epoch, messagesInEpoch.length, outHash.toBigInt());
  } else {
    log.info(`No L2 to L1 messages in epoch ${epoch}`, { epoch });
  }

  return blocks.at(-1)?.checkpointNumber;
}
