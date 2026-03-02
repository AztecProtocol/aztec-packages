import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import type { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { sum } from '@aztec/foundation/collection';

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
 * - Validates checkpoint blob field count against maxBlobFields limit
 * - Validates total L2 gas used by checkpoint blocks against the Rollup contract mana limit
 * - Validates total DA gas used by checkpoint blocks against MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT
 * - Validates individual block L2 gas and DA gas against maxL2BlockGas and maxDABlockGas limits
 */
export function validateCheckpoint(
  checkpoint: Checkpoint,
  opts: {
    rollupManaLimit: number;
    maxL2BlockGas: number | undefined;
    maxDABlockGas: number | undefined;
  },
): void {
  validateCheckpointLimits(checkpoint, opts);
  validateCheckpointBlocksGasLimits(checkpoint, opts);
}

/** Validates checkpoint blocks gas limits */
function validateCheckpointBlocksGasLimits(
  checkpoint: Checkpoint,
  opts: {
    maxL2BlockGas: number | undefined;
    maxDABlockGas: number | undefined;
  },
): void {
  const { maxL2BlockGas, maxDABlockGas } = opts;

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
}

/** Validates checkpoint max blob fields and gas limits */
function validateCheckpointLimits(
  checkpoint: Checkpoint,
  opts: {
    rollupManaLimit: number;
  },
): void {
  const { rollupManaLimit } = opts;

  const maxBlobFields = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;
  const maxDAGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;

  const checkpointMana = sum(checkpoint.blocks.map(block => block.header.totalManaUsed.toNumber()));
  if (checkpointMana > rollupManaLimit) {
    throw new CheckpointValidationError(
      `Checkpoint mana cost ${checkpointMana} exceeds rollup limit of ${rollupManaLimit}`,
      checkpoint.number,
      checkpoint.slot,
    );
  }

  const checkpointDAGas = sum(checkpoint.blocks.map(block => block.computeDAGasUsed()));
  if (checkpointDAGas > maxDAGas) {
    throw new CheckpointValidationError(
      `Checkpoint DA gas cost ${checkpointDAGas} exceeds limit of ${maxDAGas}`,
      checkpoint.number,
      checkpoint.slot,
    );
  }

  if (maxBlobFields !== undefined) {
    const checkpointBlobFields = checkpoint.toBlobFields().length;
    if (checkpointBlobFields > maxBlobFields) {
      throw new CheckpointValidationError(
        `Checkpoint blob field count ${checkpointBlobFields} exceeds limit of ${maxBlobFields}`,
        checkpoint.number,
        checkpoint.slot,
      );
    }
  }
}
