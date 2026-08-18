import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import type { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { sum } from '@aztec/foundation/collection';

import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import type { Checkpoint } from './checkpoint.js';

export class CheckpointValidationError extends Error {
  constructor(
    message: string,
    public readonly checkpointNumber: CheckpointNumber,
    public readonly slot: SlotNumber,
  ) {
    super(message);
    this.name = 'CheckpointValidationError';
  }
}

/**
 * Validates a checkpoint. Throws a CheckpointValidationError if any validation fails.
 * - Validates structural integrity (non-empty, block count, sequential numbers, archive chaining, slot consistency)
 * - Validates checkpoint blob field count against maxBlobFields limit
 * - Validates total L2 gas used by checkpoint blocks against the Rollup contract mana limit
 * - Validates total DA gas used by checkpoint blocks against MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT
 * - Validates individual block L2 gas and DA gas against maxL2BlockGas and maxDABlockGas limits
 */
export function validateCheckpoint(
  checkpoint: Checkpoint,
  opts: {
    rollupManaLimit?: number;
    maxL2BlockGas?: number;
    maxDABlockGas?: number;
    maxTxsPerCheckpoint?: number;
    maxTxsPerBlock?: number;
    /**
     * Max blocks per checkpoint. Defaults to {@link MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT}; the L1-sync
     * ingest path passes `MAX_CAPACITY_BLOCKS_PER_CHECKPOINT` to tolerate larger checkpoints already
     * accepted by L1.
     */
    maxBlocksPerCheckpoint?: number;
    /**
     * Whether to tolerate a zero-tx block after the first one. Defaults to false; the L1-sync ingest path
     * passes true for the same reason it raises `maxBlocksPerCheckpoint` — such a checkpoint is already on
     * L1, and refusing to ingest it would stall sync rather than undo it.
     */
    allowEmptyNonFirstBlocks?: boolean;
  },
): void {
  validateCheckpointStructure(checkpoint, {
    maxBlocksPerCheckpoint: opts.maxBlocksPerCheckpoint,
    allowEmptyNonFirstBlocks: opts.allowEmptyNonFirstBlocks,
  });
  validateCheckpointLimits(checkpoint, opts);
  validateCheckpointBlocksLimits(checkpoint, opts);
}

/**
 * Validates structural integrity of a checkpoint.
 * - Non-empty block list
 * - Block count within `maxBlocksPerCheckpoint` (default {@link MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT})
 * - Checkpoint slot matches the first block's slot
 * - Checkpoint lastArchiveRoot matches the first block's lastArchive root
 * - Sequential block numbers without gaps
 * - Sequential indexWithinCheckpoint starting at 0
 * - Every block after the first carries at least one tx, unless `allowEmptyNonFirstBlocks` is set
 * - Archive root chaining between consecutive blocks
 * - Consistent slot number across all blocks
 * - Global variables (slot, timestamp, coinbase, feeRecipient, gasFees) match checkpoint header for each block
 */
export function validateCheckpointStructure(
  checkpoint: Checkpoint,
  opts: { maxBlocksPerCheckpoint?: number; allowEmptyNonFirstBlocks?: boolean } = {},
): void {
  const { maxBlocksPerCheckpoint = MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT, allowEmptyNonFirstBlocks = false } = opts;
  const { blocks, number, slot } = checkpoint;

  if (blocks.length === 0) {
    throw new CheckpointValidationError('Checkpoint has no blocks', number, slot);
  }

  if (blocks.length > maxBlocksPerCheckpoint) {
    throw new CheckpointValidationError(
      `Checkpoint has ${blocks.length} blocks, exceeding limit of ${maxBlocksPerCheckpoint}`,
      number,
      slot,
    );
  }

  const firstBlock = blocks[0];

  if (!checkpoint.header.lastArchiveRoot.equals(firstBlock.header.lastArchive.root)) {
    throw new CheckpointValidationError(
      `Checkpoint lastArchiveRoot does not match first block's lastArchive root`,
      number,
      slot,
    );
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.indexWithinCheckpoint !== i) {
      throw new CheckpointValidationError(
        `Block at index ${i} has indexWithinCheckpoint ${block.indexWithinCheckpoint}, expected ${i}`,
        number,
        slot,
      );
    }

    if (block.slot !== slot) {
      throw new CheckpointValidationError(
        `Block ${block.number} has slot ${block.slot}, expected ${slot} (all blocks must share the same slot)`,
        number,
        slot,
      );
    }

    if (!checkpoint.header.matchesGlobalVariables(block.header.globalVariables)) {
      throw new CheckpointValidationError(
        `Block ${block.number} global variables (slot, timestamp, coinbase, feeRecipient, gasFees) do not match checkpoint header`,
        number,
        slot,
      );
    }

    if (i > 0) {
      // The only block-root circuit that proves a zero-tx block is `rollup_block_root_first_empty_tx`, which is
      // pinned to index 0 of a checkpoint: it starts a fresh sponge blob and carries a non-zero in_hash, both of
      // which the block-merge continuity checks forbid at any later index. An empty block past the first would
      // therefore have no circuit able to prove it.
      if (!allowEmptyNonFirstBlocks && block.body.txEffects.length === 0) {
        throw new CheckpointValidationError(
          `Block ${block.number} at index ${i} has no txs; only the first block of a checkpoint may be empty`,
          number,
          slot,
        );
      }

      const prev = blocks[i - 1];
      if (block.number !== prev.number + 1) {
        throw new CheckpointValidationError(
          `Block numbers are not sequential: block at index ${i - 1} has number ${prev.number}, block at index ${i} has number ${block.number}`,
          number,
          slot,
        );
      }

      if (!block.header.lastArchive.root.equals(prev.archive.root)) {
        throw new CheckpointValidationError(
          `Block ${block.number} lastArchive root does not match archive root of block ${prev.number}`,
          number,
          slot,
        );
      }
    }
  }
}

/** Validates checkpoint blocks gas limits */
function validateCheckpointBlocksLimits(
  checkpoint: Checkpoint,
  opts: {
    maxL2BlockGas?: number;
    maxDABlockGas?: number;
    maxTxsPerBlock?: number;
  },
): void {
  const { maxL2BlockGas, maxDABlockGas, maxTxsPerBlock } = opts;

  if (maxL2BlockGas !== undefined) {
    for (const block of checkpoint.blocks) {
      const blockL2Gas = block.header.totalManaUsed.toNumber();
      if (blockL2Gas > maxL2BlockGas) {
        throw new CheckpointValidationError(
          `Block ${block.number} in checkpoint has L2 gas used ${blockL2Gas} exceeding limit of ${maxL2BlockGas}`,
          checkpoint.number,
          checkpoint.slot,
        );
      }
    }
  }

  if (maxDABlockGas !== undefined) {
    for (const block of checkpoint.blocks) {
      const blockDAGas = block.computeDAGasUsed();
      if (blockDAGas > maxDABlockGas) {
        throw new CheckpointValidationError(
          `Block ${block.number} in checkpoint has DA gas used ${blockDAGas} exceeding limit of ${maxDABlockGas}`,
          checkpoint.number,
          checkpoint.slot,
        );
      }
    }
  }

  if (maxTxsPerBlock !== undefined) {
    for (const block of checkpoint.blocks) {
      const blockTxCount = block.body.txEffects.length;
      if (blockTxCount > maxTxsPerBlock) {
        throw new CheckpointValidationError(
          `Block ${block.number} in checkpoint has ${blockTxCount} txs exceeding limit of ${maxTxsPerBlock}`,
          checkpoint.number,
          checkpoint.slot,
        );
      }
    }
  }
}

/** Validates checkpoint max blob fields, gas limits, and tx limits */
function validateCheckpointLimits(
  checkpoint: Checkpoint,
  opts: {
    rollupManaLimit?: number;
    maxTxsPerCheckpoint?: number;
  },
): void {
  const { rollupManaLimit, maxTxsPerCheckpoint } = opts;

  const maxBlobFields = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;
  const maxDAGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;

  if (rollupManaLimit !== undefined) {
    const checkpointMana = sum(checkpoint.blocks.map(block => block.header.totalManaUsed.toNumber()));
    if (checkpointMana > rollupManaLimit) {
      throw new CheckpointValidationError(
        `Checkpoint mana cost ${checkpointMana} exceeds rollup limit of ${rollupManaLimit}`,
        checkpoint.number,
        checkpoint.slot,
      );
    }
  }

  const checkpointDAGas = sum(checkpoint.blocks.map(block => block.computeDAGasUsed()));
  if (checkpointDAGas > maxDAGas) {
    throw new CheckpointValidationError(
      `Checkpoint DA gas cost ${checkpointDAGas} exceeds limit of ${maxDAGas}`,
      checkpoint.number,
      checkpoint.slot,
    );
  }

  const checkpointBlobFields = checkpoint.toBlobFields().length;
  if (checkpointBlobFields > maxBlobFields) {
    throw new CheckpointValidationError(
      `Checkpoint blob field count ${checkpointBlobFields} exceeds limit of ${maxBlobFields}`,
      checkpoint.number,
      checkpoint.slot,
    );
  }

  if (maxTxsPerCheckpoint !== undefined) {
    const checkpointTxCount = sum(checkpoint.blocks.map(block => block.body.txEffects.length));
    if (checkpointTxCount > maxTxsPerCheckpoint) {
      throw new CheckpointValidationError(
        `Checkpoint tx count ${checkpointTxCount} exceeds limit of ${maxTxsPerCheckpoint}`,
        checkpoint.number,
        checkpoint.slot,
      );
    }
  }
}
