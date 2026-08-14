import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';

import { AztecAddress } from '../aztec-address/index.js';
import { MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT, MAX_CAPACITY_BLOCKS_PER_CHECKPOINT } from '../deserialization/index.js';
import { GasFees } from '../gas/index.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { Checkpoint } from './checkpoint.js';
import { CheckpointValidationError, validateCheckpoint, validateCheckpointStructure } from './validate.js';

describe('validateCheckpointStructure', () => {
  const checkpointNumber = CheckpointNumber(1);

  const fixedSlot = SlotNumber(42);
  const fixedCoinbase = EthAddress.random();
  const fixedFeeRecipient = AztecAddress.fromFieldUnsafe(Fr.random());
  const fixedGasFees = GasFees.random();
  const fixedTimestamp = BigInt(Math.floor(Date.now() / 1000));

  /** Builds a valid random checkpoint with the given number of blocks. All blocks share the same slot,
   * coinbase, feeRecipient, gasFees, and timestamp, and the checkpoint header's lastArchiveRoot is
   * aligned with the first block. */
  async function makeValidCheckpoint(numBlocks = 2): Promise<Checkpoint> {
    const checkpoint = await Checkpoint.random(checkpointNumber, {
      numBlocks,
      startBlockNumber: 1,
      slotNumber: fixedSlot,
      coinbase: fixedCoinbase,
      feeRecipient: fixedFeeRecipient,
      gasFees: fixedGasFees,
      timestamp: fixedTimestamp,
    });
    // Align checkpoint header's lastArchiveRoot with the first block.
    checkpoint.header.lastArchiveRoot = checkpoint.blocks[0].header.lastArchive.root;
    return checkpoint;
  }

  it('passes on a valid single-block checkpoint', async () => {
    const checkpoint = await makeValidCheckpoint(1);
    expect(() => validateCheckpointStructure(checkpoint)).not.toThrow();
  });

  it('passes on a valid multi-block checkpoint', async () => {
    const checkpoint = await makeValidCheckpoint(3);
    expect(() => validateCheckpointStructure(checkpoint)).not.toThrow();
  });

  it('throws when checkpoint slot does not match first block slot', async () => {
    const checkpoint = await makeValidCheckpoint(1);
    checkpoint.header.slotNumber = SlotNumber(checkpoint.blocks[0].slot + 1);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/all blocks must share the same slot/);
  });

  it('throws when checkpoint lastArchiveRoot does not match first block lastArchive root', async () => {
    const checkpoint = await makeValidCheckpoint(1);
    checkpoint.header.lastArchiveRoot = AppendOnlyTreeSnapshot.random().root;
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/lastArchiveRoot does not match first block/);
  });

  it('throws on empty block list', async () => {
    const checkpoint = await makeValidCheckpoint(1);
    checkpoint.blocks = [];
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow('Checkpoint has no blocks');
  });

  it('throws when block count exceeds the attestable limit (the default)', async () => {
    // Build MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT + 1 (= 73) blocks; the default limit is the attestable one.
    const checkpoint = await makeValidCheckpoint(1);
    // Reuse the single block to fill up the slots (the count check happens before archive chaining in loop)
    const block = checkpoint.blocks[0];
    checkpoint.blocks = Array.from({ length: MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT + 1 }, (_, i) => {
      const cloned = Object.create(Object.getPrototypeOf(block), Object.getOwnPropertyDescriptors(block));
      cloned.indexWithinCheckpoint = IndexWithinCheckpoint(i);
      return cloned;
    });
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(
      new RegExp(`exceeding limit of ${MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT}`),
    );
  });

  it('accepts more than the attestable limit when given the capacity ceiling (L1-ingest path)', async () => {
    const checkpoint = await makeValidCheckpoint(MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT + 1);
    // The default (attestable) limit rejects it...
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(
      new RegExp(`exceeding limit of ${MAX_ATTESTABLE_BLOCKS_PER_CHECKPOINT}`),
    );
    // ...but the capacity ceiling used when ingesting L1 checkpoints accepts it.
    expect(() =>
      validateCheckpointStructure(checkpoint, { maxBlocksPerCheckpoint: MAX_CAPACITY_BLOCKS_PER_CHECKPOINT }),
    ).not.toThrow();
  });

  it('respects an explicit maxBlocksPerCheckpoint', async () => {
    const checkpoint = await makeValidCheckpoint(3);
    expect(() => validateCheckpointStructure(checkpoint, { maxBlocksPerCheckpoint: 2 })).toThrow(
      /exceeding limit of 2/,
    );
    expect(() => validateCheckpointStructure(checkpoint, { maxBlocksPerCheckpoint: 5 })).not.toThrow();
  });

  it('throws when indexWithinCheckpoint is wrong', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    // Swap the indices
    const block0 = checkpoint.blocks[0];
    block0.indexWithinCheckpoint = IndexWithinCheckpoint(1);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/indexWithinCheckpoint/);
  });

  it('throws when a block after the first has no txs', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    checkpoint.blocks[1].body.txEffects = [];
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(
      /only the first block of a checkpoint may be empty/,
    );
  });

  it('accepts an empty block after the first when allowEmptyNonFirstBlocks is set (L1-ingest path)', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    checkpoint.blocks[1].body.txEffects = [];
    expect(() => validateCheckpointStructure(checkpoint, { allowEmptyNonFirstBlocks: true })).not.toThrow();
  });

  it('passes when only the first block of a checkpoint has no txs', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    checkpoint.blocks[0].body.txEffects = [];
    expect(() => validateCheckpointStructure(checkpoint)).not.toThrow();
  });

  it('passes on a single-block checkpoint with no txs', async () => {
    const checkpoint = await makeValidCheckpoint(1);
    checkpoint.blocks[0].body.txEffects = [];
    expect(() => validateCheckpointStructure(checkpoint)).not.toThrow();
  });

  it('throws when block numbers are not sequential', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    // Manually set block[1] to a non-sequential number (block[0].number + 2)
    const block1 = checkpoint.blocks[1];
    // Override block number via header globalVariables
    const gv = block1.header.globalVariables;
    gv.blockNumber = BlockNumber(gv.blockNumber + 2);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/not sequential/);
  });

  it('throws when archive roots are not chained', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    // Break chaining: replace block[1]'s header with a new one that has a random lastArchive
    const block1 = checkpoint.blocks[1];
    block1.header = BlockHeader.from({ ...block1.header, lastArchive: AppendOnlyTreeSnapshot.random() });
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/lastArchive root does not match/);
  });

  it('throws when blocks have different slot numbers', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    // Change block[1]'s slot to something different
    const block1 = checkpoint.blocks[1];
    block1.header.globalVariables.slotNumber = SlotNumber(block1.slot + 1);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/all blocks must share the same slot/);
  });

  it('throws when a block global variables do not match checkpoint header', async () => {
    const checkpoint = await makeValidCheckpoint(2);
    // Mutate coinbase on block[1] to something different from the checkpoint header
    checkpoint.blocks[1].header.globalVariables.coinbase = EthAddress.random();
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpointStructure(checkpoint)).toThrow(/global variables.*do not match checkpoint header/);
  });
});

describe('validateCheckpoint — limits', () => {
  const checkpointNumber = CheckpointNumber(1);
  const fixedSlot = SlotNumber(42);
  const fixedCoinbase = EthAddress.random();
  const fixedFeeRecipient = AztecAddress.fromFieldUnsafe(Fr.random());
  const fixedGasFees = GasFees.random();
  const fixedTimestamp = BigInt(Math.floor(Date.now() / 1000));

  /** A known mana value injected into every block, making assertions deterministic. */
  const specificMana = 1_000_000;

  /** Opts that leave all limits wide open so structural validity is tested in isolation. */
  const validOpts = {
    rollupManaLimit: Number.MAX_SAFE_INTEGER,
    maxL2BlockGas: undefined as number | undefined,
    maxDABlockGas: undefined as number | undefined,
  };

  /** Builds a structurally valid single-block checkpoint with a known mana value. */
  async function makeCheckpoint(): Promise<Checkpoint> {
    const checkpoint = await Checkpoint.random(checkpointNumber, {
      numBlocks: 1,
      startBlockNumber: 1,
      slotNumber: fixedSlot,
      coinbase: fixedCoinbase,
      feeRecipient: fixedFeeRecipient,
      gasFees: fixedGasFees,
      timestamp: fixedTimestamp,
      totalManaUsed: new Fr(specificMana),
    });
    checkpoint.header.lastArchiveRoot = checkpoint.blocks[0].header.lastArchive.root;
    return checkpoint;
  }

  it('passes when all limits are within bounds', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, validOpts)).not.toThrow();
  });

  it('throws when checkpoint mana exceeds rollupManaLimit', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, rollupManaLimit: specificMana - 1 })).toThrow(
      CheckpointValidationError,
    );
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, rollupManaLimit: specificMana - 1 })).toThrow(
      /mana cost.*exceeds rollup limit/,
    );
  });

  it('passes when checkpoint mana equals rollupManaLimit', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, rollupManaLimit: specificMana })).not.toThrow();
  });

  it('throws when checkpoint DA gas exceeds MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT', async () => {
    const checkpoint = await makeCheckpoint();
    jest.spyOn(checkpoint.blocks[0], 'computeDAGasUsed').mockReturnValue(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT + 1);
    expect(() => validateCheckpoint(checkpoint, validOpts)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpoint(checkpoint, validOpts)).toThrow(/DA gas cost.*exceeds limit/);
  });

  it('throws when checkpoint blob field count exceeds limit', async () => {
    const checkpoint = await makeCheckpoint();
    const maxBlobFields = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;
    jest.spyOn(checkpoint, 'toBlobFields').mockReturnValue(new Array(maxBlobFields + 1).fill(Fr.ZERO));
    expect(() => validateCheckpoint(checkpoint, validOpts)).toThrow(CheckpointValidationError);
    expect(() => validateCheckpoint(checkpoint, validOpts)).toThrow(/blob field count.*exceeds limit/);
  });

  it('throws when a block L2 gas exceeds maxL2BlockGas', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxL2BlockGas: specificMana - 1 })).toThrow(
      CheckpointValidationError,
    );
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxL2BlockGas: specificMana - 1 })).toThrow(
      /L2 gas used.*exceeding limit/,
    );
  });

  it('skips per-block L2 gas check when maxL2BlockGas is undefined', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxL2BlockGas: undefined })).not.toThrow();
  });

  it('throws when a block DA gas exceeds maxDABlockGas', async () => {
    const checkpoint = await makeCheckpoint();
    jest.spyOn(checkpoint.blocks[0], 'computeDAGasUsed').mockReturnValue(1000);
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxDABlockGas: 999 })).toThrow(
      CheckpointValidationError,
    );
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxDABlockGas: 999 })).toThrow(
      /DA gas used.*exceeding limit/,
    );
  });

  it('skips per-block DA gas check when maxDABlockGas is undefined', async () => {
    const checkpoint = await makeCheckpoint();
    expect(() => validateCheckpoint(checkpoint, { ...validOpts, maxDABlockGas: undefined })).not.toThrow();
  });
});
