import { NUM_CHECKPOINT_END_MARKER_FIELDS, getNumBlockEndBlobFields } from '@aztec/blob-lib/encoding';
import {
  BLOBS_PER_CHECKPOINT,
  DA_GAS_PER_FIELD,
  FIELDS_PER_BLOB,
  MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
} from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import type { PublicProcessor } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2Block } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type FullNodeBlockBuilderConfig,
  type MerkleTreeWriteOperations,
  NoValidTxsError,
  type PublicProcessorLimits,
  type PublicProcessorValidator,
} from '@aztec/stdlib/interfaces/server';
import type { CheckpointGlobalVariables, GlobalVariables, ProcessedTx, Tx } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { describe, expect, it } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointBuilder } from './checkpoint_builder.js';

describe('CheckpointBuilder', () => {
  let checkpointBuilder: CheckpointBuilder;
  let lightweightCheckpointBuilder: MockProxy<LightweightCheckpointBuilder>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  let config: FullNodeBlockBuilderConfig;
  let contractDataSource: MockProxy<ContractDataSource>;
  let dateProvider: TestDateProvider;
  let telemetryClient: MockProxy<TelemetryClient>;
  let processor!: MockProxy<PublicProcessor>;
  let validator!: MockProxy<PublicProcessorValidator>;

  const checkpointNumber = CheckpointNumber(1);
  const slotNumber = SlotNumber(10);
  const blockNumber = BlockNumber(5);

  const constants: CheckpointGlobalVariables = {
    chainId: new Fr(1),
    version: new Fr(1),
    slotNumber,
    timestamp: BigInt(Date.now()),
    coinbase: EthAddress.random(),
    feeRecipient: AztecAddress.fromField(Fr.random()),
    gasFees: GasFees.empty(),
  };

  class TestCheckpointBuilder extends CheckpointBuilder {
    public override makeBlockBuilderDeps(_globalVariables: GlobalVariables, _fork: MerkleTreeWriteOperations) {
      return Promise.resolve({ processor, validator });
    }

    /** Expose for testing */
    public testCapLimits(opts: PublicProcessorLimits) {
      return this.capLimitsByCheckpointBudgets(opts);
    }
  }

  /** Creates a mock block with the given mana, tx blob fields, and total block blob fields. */
  function createMockBlock(opts: { manaUsed: number; txBlobFields: number[]; blockBlobFieldCount: number }) {
    return {
      header: { totalManaUsed: { toNumber: () => opts.manaUsed } },
      body: {
        txEffects: opts.txBlobFields.map(n => ({ getNumBlobFields: () => n })),
      },
      toBlobFields: () => new Array(opts.blockBlobFieldCount).fill(Fr.ZERO),
      computeDAGasUsed: () => opts.txBlobFields.reduce((total, n) => total + n, 0) * DA_GAS_PER_FIELD,
    } as unknown as L2Block;
  }

  function setupBuilder(overrideConfig?: Partial<FullNodeBlockBuilderConfig>) {
    config = {
      l1GenesisTime: 0n,
      slotDuration: 24,
      l1ChainId: 1,
      rollupVersion: 1,
      rollupManaLimit: 200_000_000,
      redistributeCheckpointBudget: false,
      ...overrideConfig,
    };

    checkpointBuilder = new TestCheckpointBuilder(
      lightweightCheckpointBuilder as unknown as LightweightCheckpointBuilder,
      fork,
      config,
      contractDataSource,
      dateProvider,
      telemetryClient,
    );
  }

  beforeEach(() => {
    lightweightCheckpointBuilder = mock<LightweightCheckpointBuilder>({ checkpointNumber, constants });
    lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

    fork = mock<MerkleTreeWriteOperations>();
    contractDataSource = mock<ContractDataSource>();
    dateProvider = new TestDateProvider();
    telemetryClient = mock<TelemetryClient>();
    telemetryClient.getMeter.mockReturnValue(mock());
    telemetryClient.getTracer.mockReturnValue(mock());

    processor = mock<PublicProcessor>();
    validator = mock<PublicProcessorValidator>();

    setupBuilder();
  });

  describe('buildBlock', () => {
    it('builds a block successfully when transactions are processed', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(0);

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });

      processor.process.mockResolvedValue([
        [{ hash: Fr.random() } as unknown as ProcessedTx],
        [], // failedTxs
        [], // usedTxs
        [], // returnValues
        [], // debugLogs
      ]);

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n);

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(1);
      expect(result.failedTxs).toEqual([]);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('allows building an empty first block in a checkpoint', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(0);

      const expectedBlock = await L2Block.random(blockNumber, { txsPerBlock: 0 });
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });

      // No transactions processed
      processor.process.mockResolvedValue([
        [], // processedTxs - empty
        [], // failedTxs
        [], // usedTxs
        [], // returnValues
        [], // debugLogs
      ]);

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n);

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(0);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('throws NoValidTxsError when no valid transactions and not first block in checkpoint', async () => {
      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(1);

      const failedTx = { tx: { txHash: Fr.random() } as unknown as Tx, error: new Error('tx failed') };
      processor.process.mockResolvedValue([
        [], // processedTxs - empty
        [failedTx], // failedTxs
        [], // usedTxs
        [], // returnValues
        [], // debugLogs
      ]);

      await expect(checkpointBuilder.buildBlock([], blockNumber, 1000n)).rejects.toThrow(NoValidTxsError);

      expect(lightweightCheckpointBuilder.addBlock).not.toHaveBeenCalled();
    });
  });

  describe('capLimitsByCheckpointBudgets', () => {
    const totalBlobCapacity = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB - NUM_CHECKPOINT_END_MARKER_FIELDS;
    const firstBlockEndOverhead = getNumBlockEndBlobFields(true);
    const nonFirstBlockEndOverhead = getNumBlockEndBlobFields(false);

    it('caps L2 gas by remaining checkpoint mana', () => {
      const rollupManaLimit = 1_000_000;
      const priorManaUsed = 600_000;
      setupBuilder({ rollupManaLimit });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: priorManaUsed, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = { maxBlockGas: new Gas(Infinity, 800_000) };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining mana = 1_000_000 - 600_000 = 400_000. Per-block = 800_000. Capped to 400_000.
      expect(capped.maxBlockGas!.l2Gas).toBe(400_000);
    });

    it('uses per-block L2 gas limit when tighter than remaining mana', () => {
      const rollupManaLimit = 1_000_000;
      const priorManaUsed = 200_000;
      setupBuilder({ rollupManaLimit });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: priorManaUsed, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = { maxBlockGas: new Gas(Infinity, 500_000) };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining mana = 800_000. Per-block = 500_000. Uses 500_000.
      expect(capped.maxBlockGas!.l2Gas).toBe(500_000);
    });

    it('uses per-block L2 gas limit when remaining mana is larger', () => {
      setupBuilder(); // rollupManaLimit defaults to 200_000_000

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 100_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = { maxBlockGas: new Gas(Infinity, 500_000) };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining mana = 200_000_000 - 100_000 >> 500_000, so per-block limit is used
      expect(capped.maxBlockGas!.l2Gas).toBe(500_000);
    });

    it('caps DA gas by remaining checkpoint DA gas budget', () => {
      // Each prior tx blob field = DA_GAS_PER_FIELD DA gas
      const txBlobFields = [1000]; // 1000 fields * 32 = 32000 DA gas
      const priorDAGas = 1000 * DA_GAS_PER_FIELD;
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields, blockBlobFieldCount: 1010 }),
      ]);

      const perBlockDAGas = 500_000;
      const opts: PublicProcessorLimits = { maxBlockGas: new Gas(perBlockDAGas, Infinity) };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining DA gas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - priorDAGas
      const expectedRemainingDAGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - priorDAGas;
      expect(capped.maxBlockGas!.daGas).toBe(Math.min(perBlockDAGas, expectedRemainingDAGas));
    });

    it('sets maxBlockGas from remaining budgets when caller does not provide it', () => {
      const rollupManaLimit = 1_000_000;
      const priorManaUsed = 600_000;
      setupBuilder({ rollupManaLimit });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: priorManaUsed, txBlobFields: [100], blockBlobFieldCount: 110 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      expect(capped.maxBlockGas!.l2Gas).toBe(400_000);
      expect(capped.maxBlockGas!.daGas).toBe(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - 100 * DA_GAS_PER_FIELD);
    });

    it('caps blob fields by remaining checkpoint blob capacity', () => {
      const blockBlobFieldCount = 100; // Prior block used 100 blob fields
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [], blockBlobFieldCount }),
      ]);

      const opts: PublicProcessorLimits = { maxBlobFields: 99999 };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Second block: remaining = totalBlobCapacity - 100, minus non-first block end overhead
      const expectedMaxBlobFields = totalBlobCapacity - blockBlobFieldCount - nonFirstBlockEndOverhead;
      expect(capped.maxBlobFields).toBe(expectedMaxBlobFields);
    });

    it('sets blob fields from remaining capacity when caller does not set them', () => {
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // First block: full capacity minus first block end overhead
      const expectedMaxBlobFields = totalBlobCapacity - firstBlockEndOverhead;
      expect(capped.maxBlobFields).toBe(expectedMaxBlobFields);
    });

    it('accumulates limits across multiple prior blocks', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({ rollupManaLimit });

      const block1 = createMockBlock({ manaUsed: 300_000, txBlobFields: [200], blockBlobFieldCount: 210 });
      const block2 = createMockBlock({ manaUsed: 200_000, txBlobFields: [150], blockBlobFieldCount: 160 });
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([block1, block2]);

      const opts: PublicProcessorLimits = { maxBlockGas: new Gas(Infinity, Infinity) };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining mana = 1_000_000 - 300_000 - 200_000 = 500_000
      expect(capped.maxBlockGas!.l2Gas).toBe(500_000);

      // Remaining DA gas = MAX - (200 + 150) * DA_GAS_PER_FIELD
      const expectedRemainingDAGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - (200 + 150) * DA_GAS_PER_FIELD;
      expect(capped.maxBlockGas!.daGas).toBe(expectedRemainingDAGas);

      // Remaining blob fields = capacity - 210 - 160 - nonFirstBlockEndOverhead
      const expectedBlobFields = totalBlobCapacity - 210 - 160 - nonFirstBlockEndOverhead;
      expect(capped.maxBlobFields).toBe(expectedBlobFields);
    });

    it('tracks remaining blob field capacity across multiple blocks', () => {
      setupBuilder();

      const block1BlobFieldCount = 200;
      const block2BlobFieldCount = 150;

      // After one block has been built, remaining capacity should account for that block's usage
      const block1 = createMockBlock({ manaUsed: 0, txBlobFields: [], blockBlobFieldCount: block1BlobFieldCount });
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([block1]);

      const afterOneBlock = (checkpointBuilder as TestCheckpointBuilder).testCapLimits({});

      const expectedAfterOneBlock = totalBlobCapacity - block1BlobFieldCount - nonFirstBlockEndOverhead;
      expect(afterOneBlock.maxBlobFields).toBe(expectedAfterOneBlock);

      // After two blocks have been built, remaining capacity should further decrease
      const block2 = createMockBlock({ manaUsed: 0, txBlobFields: [], blockBlobFieldCount: block2BlobFieldCount });
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([block1, block2]);

      const afterTwoBlocks = (checkpointBuilder as TestCheckpointBuilder).testCapLimits({});

      const expectedAfterTwoBlocks =
        totalBlobCapacity - block1BlobFieldCount - block2BlobFieldCount - nonFirstBlockEndOverhead;
      expect(afterTwoBlocks.maxBlobFields).toBe(expectedAfterTwoBlocks);

      // Verify the limit actually decreased between calls
      expect(afterTwoBlocks.maxBlobFields).toBeLessThan(afterOneBlock.maxBlobFields!);
      expect(afterOneBlock.maxBlobFields! - afterTwoBlocks.maxBlobFields!).toBe(block2BlobFieldCount);
    });

    it('caps transaction count by remaining checkpoint tx budget', () => {
      setupBuilder({ maxTxsPerCheckpoint: 20 });

      // Prior block with 3 txs (each with 10 blob fields)
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [10, 10, 10], blockBlobFieldCount: 40 }),
      ]);

      const opts: PublicProcessorLimits = { maxTransactions: 15 };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining txs = 20 - 3 = 17. Per-block = 15. Capped to min(15, 17) = 15.
      expect(capped.maxTransactions).toBe(15);
    });

    it('caps transaction count when remaining budget is smaller than per-block limit', () => {
      setupBuilder({ maxTxsPerCheckpoint: 10 });

      // Two prior blocks with 4 txs each = 8 total
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [10, 10, 10, 10], blockBlobFieldCount: 50 }),
        createMockBlock({ manaUsed: 0, txBlobFields: [10, 10, 10, 10], blockBlobFieldCount: 50 }),
      ]);

      const opts: PublicProcessorLimits = { maxTransactions: 5 };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining txs = 10 - 8 = 2. Per-block = 5. Capped to min(5, 2) = 2.
      expect(capped.maxTransactions).toBe(2);
    });

    it('sets transaction count from remaining budget when caller does not provide it', () => {
      setupBuilder({ maxTxsPerCheckpoint: 15 });

      // Prior block with 5 txs
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [10, 10, 10, 10, 10], blockBlobFieldCount: 60 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Remaining txs = 15 - 5 = 10
      expect(capped.maxTransactions).toBe(10);
    });

    it('does not cap transaction count when maxTxsPerCheckpoint is not set', () => {
      setupBuilder(); // no maxTxsPerCheckpoint

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const opts: PublicProcessorLimits = { maxTransactions: 99 };
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Passthrough: maxTransactions = 99
      expect(capped.maxTransactions).toBe(99);
    });

    it('does not cap transaction count when maxTxsPerCheckpoint is not set and caller does not provide it', () => {
      setupBuilder(); // no maxTxsPerCheckpoint

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Neither config nor caller sets it, so it remains undefined
      expect(capped.maxTransactions).toBeUndefined();
    });
  });

  describe('redistributeCheckpointBudget', () => {
    it('evenly splits budget with multiplier=1', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({
        redistributeCheckpointBudget: true,
        perBlockAllocationMultiplier: 1,
        maxBlocksPerCheckpoint: 5,
        rollupManaLimit,
      });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Fair share = ceil(1_000_000 / 5 * 1) = 200_000
      expect(capped.maxBlockGas!.l2Gas).toBe(200_000);
    });

    it('computes fair share with multiplier=1.2, 5 max blocks, 2 existing', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({
        redistributeCheckpointBudget: true,
        perBlockAllocationMultiplier: 1.2,
        maxBlocksPerCheckpoint: 5,
        rollupManaLimit,
      });

      // 2 existing blocks used 400_000 mana total
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // remainingMana = 600_000, remainingBlocks = 3, multiplier = 1.2
      // fairShare = ceil(600_000 / 3 * 1.2) = ceil(240_000) = 240_000
      expect(capped.maxBlockGas!.l2Gas).toBe(240_000);
    });

    it('gives all remaining budget to last block (remainingBlocks=1)', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({
        redistributeCheckpointBudget: true,
        perBlockAllocationMultiplier: 1.2,
        maxBlocksPerCheckpoint: 3,
        rollupManaLimit,
      });

      // 2 existing blocks used 800_000 total
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 400_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        createMockBlock({ manaUsed: 400_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // remainingMana = 200_000, remainingBlocks = 1, multiplier = 1.2
      // fairShare = ceil(200_000 / 1 * 1.2) = 240_000. min(200_000, 240_000, 200_000) = 200_000
      expect(capped.maxBlockGas!.l2Gas).toBe(200_000);
    });

    it('uses old behavior when redistributeCheckpointBudget is false', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({
        redistributeCheckpointBudget: false,
        maxBlocksPerCheckpoint: 5,
        rollupManaLimit,
      });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // Old behavior: no fair share, just remaining budget = 800_000
      expect(capped.maxBlockGas!.l2Gas).toBe(800_000);
    });

    it('redistributes DA gas across remaining blocks', () => {
      setupBuilder({
        redistributeCheckpointBudget: true,
        perBlockAllocationMultiplier: 1,
        maxBlocksPerCheckpoint: 4,
      });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // fairShareDA = ceil(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 4 * 1)
      const expectedDA = Math.ceil(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 4);
      expect(capped.maxBlockGas!.daGas).toBe(expectedDA);
    });

    it('redistributes tx count across remaining blocks', () => {
      setupBuilder({
        redistributeCheckpointBudget: true,
        perBlockAllocationMultiplier: 1,
        maxBlocksPerCheckpoint: 4,
        maxTxsPerCheckpoint: 100,
      });

      // 1 existing block with 10 txs
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: new Array(10).fill(1), blockBlobFieldCount: 20 }),
      ]);

      const opts: PublicProcessorLimits = {};
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(opts);

      // remainingTxs = 90, remainingBlocks = 3, multiplier = 1
      // fairShareTxs = ceil(90 / 3 * 1) = 30
      expect(capped.maxTransactions).toBe(30);
    });
  });
});
