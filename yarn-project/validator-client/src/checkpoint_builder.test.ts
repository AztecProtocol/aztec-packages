import { NUM_CHECKPOINT_END_MARKER_FIELDS, getNumBlockEndBlobFields } from '@aztec/blob-lib/encoding';
import {
  BLOBS_PER_CHECKPOINT,
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  DA_GAS_PER_FIELD,
  FIELDS_PER_BLOB,
  MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import type { AvmSimulator, PublicContractsDB, PublicProcessor } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, L2Block } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import {
  type BlockBuilderOptions,
  type FullNodeBlockBuilderConfig,
  InsufficientValidTxsError,
  type MerkleTreeWriteOperations,
  type PublicProcessorLimits,
  type PublicProcessorValidator,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { InboxMessageBundle } from '@aztec/stdlib/messaging';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type CheckpointGlobalVariables,
  type GlobalVariables,
  type ProcessedTx,
  type Tx,
  TxHash,
} from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointBuilder, FullNodeCheckpointsBuilder } from './checkpoint_builder.js';

describe('CheckpointBuilder', () => {
  let checkpointBuilder: TestCheckpointBuilder;
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
    feeRecipient: AztecAddress.fromFieldUnsafe(Fr.random()),
    gasFees: GasFees.empty(),
  };

  class TestCheckpointBuilder extends CheckpointBuilder {
    declare public contractsDB: PublicContractsDB;

    public override makeBlockBuilderDeps(_globalVariables: GlobalVariables, _fork: MerkleTreeWriteOperations) {
      return Promise.resolve({ processor, validator, wsdbForkId: 0 });
    }

    /** Expose for testing */
    public testCapLimits(opts: BlockBuilderOptions) {
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
      ...overrideConfig,
    };

    checkpointBuilder = new TestCheckpointBuilder(
      lightweightCheckpointBuilder as unknown as LightweightCheckpointBuilder,
      fork,
      config,
      contractDataSource,
      dateProvider,
      telemetryClient,
      // TestCheckpointBuilder overrides makeBlockBuilderDeps, so this is never exercised.
      mock<AvmSimulator>(),
    );
  }

  /** Default opts for validator-mode tests (no redistribution). */
  function validatorOpts(overrides?: Partial<PublicProcessorLimits> & { minValidTxs?: number }): BlockBuilderOptions {
    return { ...overrides, isBuildingProposal: false, minValidTxs: overrides?.minValidTxs ?? 0 };
  }

  /** Default opts for proposer-mode tests (with redistribution). */
  function proposerOpts(
    overrides?: Partial<PublicProcessorLimits> & {
      minValidTxs?: number;
      maxBlocksPerCheckpoint?: number;
      perBlockAllocationMultiplier?: number;
      perBlockDAAllocationMultiplier?: number;
    },
  ): BlockBuilderOptions {
    return {
      ...overrides,
      isBuildingProposal: true,
      maxBlocksPerCheckpoint: overrides?.maxBlocksPerCheckpoint ?? 5,
      perBlockAllocationMultiplier: overrides?.perBlockAllocationMultiplier ?? 1.2,
      perBlockDAAllocationMultiplier: overrides?.perBlockDAAllocationMultiplier,
      minValidTxs: overrides?.minValidTxs ?? 0,
    };
  }

  beforeEach(() => {
    lightweightCheckpointBuilder = mock<LightweightCheckpointBuilder>();
    Object.defineProperty(lightweightCheckpointBuilder, 'checkpointNumber', { value: checkpointNumber });
    Object.defineProperty(lightweightCheckpointBuilder, 'constants', { value: constants });
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

  describe('contractsDB checkpointing', () => {
    let createCheckpointSpy: jest.SpiedFunction<() => void>;
    let commitCheckpointSpy: jest.SpiedFunction<() => void>;
    let revertCheckpointSpy: jest.SpiedFunction<() => void>;

    beforeEach(() => {
      const db = checkpointBuilder.contractsDB;
      createCheckpointSpy = jest.spyOn(db, 'createCheckpoint');
      commitCheckpointSpy = jest.spyOn(db, 'commitCheckpoint');
      revertCheckpointSpy = jest.spyOn(db, 'revertCheckpoint');

      lightweightCheckpointBuilder.getBlockCount.mockReturnValue(0);
    });

    async function mockSuccessfulBlock() {
      const block = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block, timings: {} });
      processor.process.mockResolvedValue([[{ hash: TxHash.random() } as ProcessedTx], [], [], [], []]);
      return block;
    }

    it('uses the same contractsDB across multiple block builds', async () => {
      await mockSuccessfulBlock();
      await checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts());

      await mockSuccessfulBlock();
      await checkpointBuilder.buildBlock([], BlockNumber(blockNumber + 1), 1001n, validatorOpts());

      expect(createCheckpointSpy).toHaveBeenCalledTimes(2);
      expect(commitCheckpointSpy).toHaveBeenCalledTimes(2);
      expect(revertCheckpointSpy).not.toHaveBeenCalled();
    });

    it('calls revertCheckpoint when public processor fails', async () => {
      processor.process.mockRejectedValue(new Error('processor failure'));

      await expect(checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts())).rejects.toThrow(
        'processor failure',
      );

      expect(createCheckpointSpy).toHaveBeenCalledTimes(1);
      expect(commitCheckpointSpy).not.toHaveBeenCalled();
      expect(revertCheckpointSpy).toHaveBeenCalledTimes(1);
    });
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

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts());

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(1);
      expect(result.failedTxs).toEqual([]);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('allows building an empty block when minValidTxs is 0', async () => {
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

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts({ minValidTxs: 0 }));

      expect(result.block).toBe(expectedBlock);
      expect(result.numTxs).toBe(0);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });

    it('throws InsufficientValidTxsError when fewer txs than minValidTxs', async () => {
      const failedTx = { tx: { txHash: Fr.random() } as unknown as Tx, error: new Error('tx failed') };
      processor.process.mockResolvedValue([
        [], // processedTxs - empty
        [failedTx], // failedTxs
        [], // usedTxs
        [], // returnValues
        [], // debugLogs
      ]);

      await expect(
        checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts({ minValidTxs: 1 })),
      ).rejects.toThrow(InsufficientValidTxsError);

      expect(lightweightCheckpointBuilder.addBlock).not.toHaveBeenCalled();
    });

    it('does not update state when some txs succeed but below minValidTxs', async () => {
      const processedTx = mock<ProcessedTx>();
      processedTx.hash = TxHash.random();
      const failedTx = { tx: { txHash: Fr.random() } as unknown as Tx, error: new Error('tx failed') };
      processor.process.mockResolvedValue([
        [processedTx], // processedTxs - 1 succeeded
        [failedTx], // failedTxs - 1 failed
        [], // usedTxs
        [], // returnValues
        [], // debugLogs
      ]);

      const err = await checkpointBuilder
        .buildBlock([], blockNumber, 1000n, validatorOpts({ minValidTxs: 2 }))
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InsufficientValidTxsError);
      expect((err as InsufficientValidTxsError).processedCount).toBe(1);
      expect((err as InsufficientValidTxsError).minRequired).toBe(2);
      expect(lightweightCheckpointBuilder.addBlock).not.toHaveBeenCalled();
    });

    it('defaults to minValidTxs=0 when not specified, allowing empty blocks', async () => {
      const expectedBlock = await L2Block.random(blockNumber, { txsPerBlock: 0 });
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });

      processor.process.mockResolvedValue([[], [], [], [], []]);

      const result = await checkpointBuilder.buildBlock([], blockNumber, 1000n, validatorOpts());

      expect(result.numTxs).toBe(0);
      expect(lightweightCheckpointBuilder.addBlock).toHaveBeenCalled();
    });
  });

  describe('capLimitsByCheckpointBudgets (validator mode)', () => {
    const totalBlobCapacity = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB - NUM_CHECKPOINT_END_MARKER_FIELDS;
    const firstBlockEndOverhead = getNumBlockEndBlobFields();
    const nonFirstBlockEndOverhead = getNumBlockEndBlobFields();

    it('caps L2 gas by remaining checkpoint mana', () => {
      const rollupManaLimit = 1_000_000;
      const priorManaUsed = 600_000;
      setupBuilder({ rollupManaLimit });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: priorManaUsed, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlockGas: new Gas(Infinity, 800_000) }),
      );

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

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlockGas: new Gas(Infinity, 500_000) }),
      );

      // Remaining mana = 800_000. Per-block = 500_000. Uses 500_000.
      expect(capped.maxBlockGas!.l2Gas).toBe(500_000);
    });

    it('uses per-block L2 gas limit when remaining mana is larger', () => {
      setupBuilder(); // rollupManaLimit defaults to 200_000_000

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 100_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlockGas: new Gas(Infinity, 500_000) }),
      );

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
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlockGas: new Gas(perBlockDAGas, Infinity) }),
      );

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

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

      expect(capped.maxBlockGas!.l2Gas).toBe(400_000);
      expect(capped.maxBlockGas!.daGas).toBe(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT - 100 * DA_GAS_PER_FIELD);
    });

    it('caps blob fields by remaining checkpoint blob capacity', () => {
      const blockBlobFieldCount = 100; // Prior block used 100 blob fields
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [], blockBlobFieldCount }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlobFields: 99999 }),
      );

      // Second block: remaining = totalBlobCapacity - 100, minus non-first block end overhead
      const expectedMaxBlobFields = totalBlobCapacity - blockBlobFieldCount - nonFirstBlockEndOverhead;
      expect(capped.maxBlobFields).toBe(expectedMaxBlobFields);
    });

    it('sets blob fields from remaining capacity when caller does not set them', () => {
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

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

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        validatorOpts({ maxBlockGas: new Gas(Infinity, Infinity) }),
      );

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

      const afterOneBlock = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

      const expectedAfterOneBlock = totalBlobCapacity - block1BlobFieldCount - nonFirstBlockEndOverhead;
      expect(afterOneBlock.maxBlobFields).toBe(expectedAfterOneBlock);

      // After two blocks have been built, remaining capacity should further decrease
      const block2 = createMockBlock({ manaUsed: 0, txBlobFields: [], blockBlobFieldCount: block2BlobFieldCount });
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([block1, block2]);

      const afterTwoBlocks = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

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

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts({ maxTransactions: 15 }));

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

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts({ maxTransactions: 5 }));

      // Remaining txs = 10 - 8 = 2. Per-block = 5. Capped to min(5, 2) = 2.
      expect(capped.maxTransactions).toBe(2);
    });

    it('sets transaction count from remaining budget when caller does not provide it', () => {
      setupBuilder({ maxTxsPerCheckpoint: 15 });

      // Prior block with 5 txs
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: [10, 10, 10, 10, 10], blockBlobFieldCount: 60 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

      // Remaining txs = 15 - 5 = 10
      expect(capped.maxTransactions).toBe(10);
    });

    it('does not cap transaction count when maxTxsPerCheckpoint is not set', () => {
      setupBuilder(); // no maxTxsPerCheckpoint

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts({ maxTransactions: 99 }));

      // Passthrough: maxTransactions = 99
      expect(capped.maxTransactions).toBe(99);
    });

    it('does not cap transaction count when maxTxsPerCheckpoint is not set and caller does not provide it', () => {
      setupBuilder(); // no maxTxsPerCheckpoint

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

      // Neither config nor caller sets it, so it remains undefined
      expect(capped.maxTransactions).toBeUndefined();
    });

    it('does not apply redistribution multiplier in validator mode', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({ rollupManaLimit });

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      // Validator mode should not redistribute — just remaining budget
      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(validatorOpts());

      // No fair share, just remaining budget = 800_000
      expect(capped.maxBlockGas!.l2Gas).toBe(800_000);
    });
  });

  describe('multi-block gas redistribution through buildBlock', () => {
    // This test exercises the production code path where:
    // 1. CheckpointProposalJob passes maxBlocksPerCheckpoint and perBlockAllocationMultiplier via opts
    // 2. CheckpointBuilder.capLimitsByCheckpointBudgets redistributes remaining budget across remaining blocks

    const rollupManaLimit = 1_000_000;
    const maxBlocks = 5;
    const multiplier = 1.2;

    // Opts that mimic what CheckpointProposalJob passes: operator per-block gas limit + redistribution params
    const staticPerBlockL2Gas = Math.min(rollupManaLimit, Math.ceil((rollupManaLimit / maxBlocks) * multiplier));
    // = min(1_000_000, 240_000) = 240_000

    const blockBuilderOpts: BlockBuilderOptions = proposerOpts({
      maxBlockGas: new Gas(Infinity, staticPerBlockL2Gas),
      maxBlocksPerCheckpoint: maxBlocks,
      perBlockAllocationMultiplier: multiplier,
    });

    it('tightens per-block L2 gas limit when prior blocks consumed more than their even share', async () => {
      setupBuilder({ rollupManaLimit });

      // Simulate: blocks 0 and 1 already built, each using 300k mana (above even share of 200k)
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 300_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        createMockBlock({ manaUsed: 300_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });
      processor.process.mockResolvedValue([[{ hash: Fr.random() } as unknown as ProcessedTx], [], [], [], []]);

      // Build block 2
      await checkpointBuilder.buildBlock([], blockNumber, 1000n, blockBuilderOpts);

      // Remaining mana = 1M - 600k = 400k, with 3 blocks remaining (out of 5).
      // Expected fair share = ceil(400k / 3 * 1.2) = ceil(160_000) = 160_000
      // Expected cap = min(staticPerBlockL2Gas=240k, fairShare=160k, remaining=400k) = 160_000
      const processCall = processor.process.mock.calls[0];
      const limitsPassedToProcessor = processCall[1] as PublicProcessorLimits;
      expect(limitsPassedToProcessor.maxBlockGas!.l2Gas).toBe(160_000);
    });

    it('progressively tightens limits across all blocks in checkpoint', async () => {
      setupBuilder({ rollupManaLimit });

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });
      processor.process.mockResolvedValue([[{ hash: Fr.random() } as unknown as ProcessedTx], [], [], [], []]);

      const capturedL2GasLimits: number[] = [];

      // Build 5 blocks. Each block uses 200k mana (its even share).
      for (let i = 0; i < maxBlocks; i++) {
        // Set up prior blocks (each used 200k mana)
        const priorBlocks = Array.from({ length: i }, () =>
          createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        );
        lightweightCheckpointBuilder.getBlocks.mockReturnValue(priorBlocks);

        await checkpointBuilder.buildBlock([], BlockNumber(blockNumber + i), 1000n, blockBuilderOpts);

        const processCall = processor.process.mock.calls[i];
        const limits = processCall[1] as PublicProcessorLimits;
        capturedL2GasLimits.push(limits.maxBlockGas!.l2Gas);
      }

      // With correct redistribution (5 blocks, each using 200k mana):
      // Block 0: remaining=1M,   remainingBlocks=5, fairShare=ceil(1M/5*1.2)=240k,   cap=min(240k,240k,1M)=240k
      // Block 1: remaining=800k, remainingBlocks=4, fairShare=ceil(800k/4*1.2)=240k,  cap=min(240k,240k,800k)=240k
      // Block 2: remaining=600k, remainingBlocks=3, fairShare=ceil(600k/3*1.2)=240k,  cap=min(240k,240k,600k)=240k
      // Block 3: remaining=400k, remainingBlocks=2, fairShare=ceil(400k/2*1.2)=240k,  cap=min(240k,240k,400k)=240k
      // Block 4: remaining=200k, remainingBlocks=1, fairShare=ceil(200k/1*1.2)=240k,  cap=min(240k,240k,200k)=200k
      expect(capturedL2GasLimits).toEqual([240_000, 240_000, 240_000, 240_000, 200_000]);
    });

    it('prevents block starvation when early blocks are heavy', async () => {
      setupBuilder({ rollupManaLimit });

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });
      processor.process.mockResolvedValue([[{ hash: Fr.random() } as unknown as ProcessedTx], [], [], [], []]);

      const capturedL2GasLimits: number[] = [];

      // Build 5 blocks. First 2 blocks use 300k each (heavy), rest use whatever they get.
      const manaUsedPerBlock = [300_000, 300_000, 0, 0, 0]; // only first 2 are "used" as prior blocks

      for (let i = 0; i < maxBlocks; i++) {
        const priorBlocks = Array.from({ length: i }, (_, j) =>
          createMockBlock({ manaUsed: manaUsedPerBlock[j], txBlobFields: [10], blockBlobFieldCount: 20 }),
        );
        lightweightCheckpointBuilder.getBlocks.mockReturnValue(priorBlocks);

        await checkpointBuilder.buildBlock([], BlockNumber(blockNumber + i), 1000n, blockBuilderOpts);

        const processCall = processor.process.mock.calls[i];
        const limits = processCall[1] as PublicProcessorLimits;
        capturedL2GasLimits.push(limits.maxBlockGas!.l2Gas);
      }

      // With correct redistribution and heavy early blocks (300k each):
      // Block 0: remaining=1M,   remainingBlocks=5, fairShare=ceil(1M/5*1.2)=240k,   cap=min(240k,240k,1M)=240k
      // Block 1: remaining=700k, remainingBlocks=4, fairShare=ceil(700k/4*1.2)=210k,  cap=min(240k,210k,700k)=210k
      // Block 2: remaining=400k, remainingBlocks=3, fairShare=ceil(400k/3*1.2)=160k,  cap=min(240k,160k,400k)=160k
      // Block 3: remaining=400k, remainingBlocks=2, fairShare=ceil(400k/2*1.2)=240k,  cap=min(240k,240k,400k)=240k
      // Block 4: remaining=400k, remainingBlocks=1, fairShare=ceil(400k/1*1.2)=480k,  cap=min(240k,480k,400k)=240k
      expect(capturedL2GasLimits[0]).toBe(240_000); // Block 0: full fair share
      expect(capturedL2GasLimits[1]).toBe(210_000); // Block 1: tightened by redistribution
      expect(capturedL2GasLimits[2]).toBe(160_000); // Block 2: tightened further
      expect(capturedL2GasLimits[3]).toBe(240_000); // Block 3: relaxed (blocks 2-3 used nothing)
      expect(capturedL2GasLimits[4]).toBe(240_000); // Block 4: still has plenty of budget
    });

    it('explicit per-block limit wins over redistribution when tighter', async () => {
      setupBuilder({ rollupManaLimit });

      const expectedBlock = await L2Block.random(blockNumber);
      lightweightCheckpointBuilder.addBlock.mockResolvedValue({ block: expectedBlock, timings: {} });
      processor.process.mockResolvedValue([[{ hash: Fr.random() } as unknown as ProcessedTx], [], [], [], []]);

      // Explicit per-block limit (100k) is TIGHTER than redistribution.
      // No prior blocks: remaining=1M, 5 remaining, fairShare=ceil(1M/5*1.2)=240k.
      // cap = min(100k, 240k, 1M) = 100k — explicit wins.
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);
      await checkpointBuilder.buildBlock([], blockNumber, 1000n, {
        ...blockBuilderOpts,
        maxBlockGas: new Gas(Infinity, 100_000),
      });

      expect((processor.process.mock.calls[0][1] as PublicProcessorLimits).maxBlockGas!.l2Gas).toBe(100_000);
    });
  });

  describe('proposer redistribution via opts', () => {
    it('computes fair share with multiplier across remaining blocks', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({ rollupManaLimit });

      // 2 existing blocks used 400_000 mana total
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        createMockBlock({ manaUsed: 200_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(proposerOpts());

      // remainingMana = 600_000, remainingBlocks = 3, multiplier = 1.2
      // fairShare = ceil(600_000 / 3 * 1.2) = ceil(240_000) = 240_000
      expect(capped.maxBlockGas!.l2Gas).toBe(240_000);
    });

    it('gives all remaining budget to last block (remainingBlocks=1)', () => {
      const rollupManaLimit = 1_000_000;
      setupBuilder({ rollupManaLimit });

      // 2 existing blocks used 800_000 total
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 400_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
        createMockBlock({ manaUsed: 400_000, txBlobFields: [10], blockBlobFieldCount: 20 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        proposerOpts({ maxBlocksPerCheckpoint: 3 }),
      );

      // remainingMana = 200_000, remainingBlocks = 1, multiplier = 1.2
      // fairShare = ceil(200_000 / 1 * 1.2) = 240_000. min(200_000, 240_000, 200_000) = 200_000
      expect(capped.maxBlockGas!.l2Gas).toBe(200_000);
    });

    it('redistributes DA gas across remaining blocks', () => {
      setupBuilder();

      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        proposerOpts({ maxBlocksPerCheckpoint: 4, perBlockAllocationMultiplier: 1 }),
      );

      // fairShareDA = ceil(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 4 * 1)
      const expectedDA = Math.ceil(MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT / 4);
      expect(capped.maxBlockGas!.daGas).toBe(expectedDA);
    });

    it('redistributes tx count across remaining blocks', () => {
      setupBuilder({ maxTxsPerCheckpoint: 100 });

      // 1 existing block with 10 txs
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([
        createMockBlock({ manaUsed: 0, txBlobFields: new Array(10).fill(1), blockBlobFieldCount: 20 }),
      ]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        proposerOpts({ maxBlocksPerCheckpoint: 4, perBlockAllocationMultiplier: 1 }),
      );

      // remainingTxs = 90, remainingBlocks = 3, multiplier = 1
      // fairShareTxs = ceil(90 / 3 * 1) = 30
      expect(capped.maxTransactions).toBe(30);
    });
  });

  describe('per-block DA allocation multiplier (largest deploy fit under v5 mainnet geometry)', () => {
    // v5 mainnet: 72s slots / 6s blocks -> 10 blocks per checkpoint.
    const mainnetBlocks = 10;
    // Largest tx we want to support: a maximal contract class registration, dominated by its contract class
    // log (content + contract-address field) plus the fixed tx overhead. Deploy-side nullifiers add a few
    // more fields, so this is a lower bound on the true largest deploy.
    const largestDeployBlobFields = CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1 + TX_DA_GAS_OVERHEAD / DA_GAS_PER_FIELD;
    const largestDeployDaGas = largestDeployBlobFields * DA_GAS_PER_FIELD;

    it('fits the largest contract class deploy in DA gas and blob fields with the 1.5 DA multiplier', () => {
      setupBuilder();
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        proposerOpts({
          maxBlocksPerCheckpoint: mainnetBlocks,
          perBlockAllocationMultiplier: 1.2,
          perBlockDAAllocationMultiplier: 1.5,
        }),
      );

      expect(capped.maxBlockGas!.daGas).toBeGreaterThanOrEqual(largestDeployDaGas);
      expect(capped.maxBlobFields).toBeGreaterThanOrEqual(largestDeployBlobFields);
    });

    it('does not fit the largest contract class deploy with only the general 1.2 multiplier', () => {
      setupBuilder();
      lightweightCheckpointBuilder.getBlocks.mockReturnValue([]);

      const capped = (checkpointBuilder as TestCheckpointBuilder).testCapLimits(
        proposerOpts({ maxBlocksPerCheckpoint: mainnetBlocks, perBlockAllocationMultiplier: 1.2 }),
      );

      expect(capped.maxBlockGas!.daGas).toBeLessThan(largestDeployDaGas);
      expect(capped.maxBlobFields!).toBeLessThan(largestDeployBlobFields);
    });
  });

  // These cases use a real world state fork and a real LightweightCheckpointBuilder, since the position of the
  // block's L1-to-L2 message bundle relative to tx execution is invisible with a mocked fork.
  describe('buildBlock with a streaming L1-to-L2 bundle (real world state)', () => {
    let worldState: NativeWorldStateService;
    let realFork: MerkleTreeWriteOperations;
    let lightweight: LightweightCheckpointBuilder;
    let builder: TestCheckpointBuilder;

    const bundle: InboxMessageBundle = [[new Fr(0xb00), new Fr(0xb01), new Fr(0xb02)]];
    const firstBlockNumber = BlockNumber(1);

    const getL1ToL2TreeSize = () => realFork.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE).then(info => info.size);

    beforeEach(async () => {
      worldState = await NativeWorldStateService.tmp();
      realFork = await worldState.fork();
      lightweight = LightweightCheckpointBuilder.startNewCheckpoint(checkpointNumber, constants, [], Fr.ZERO, realFork);
      builder = new TestCheckpointBuilder(
        lightweight,
        realFork,
        config,
        contractDataSource,
        dateProvider,
        telemetryClient,
        mock<AvmSimulator>(),
      );
    });

    afterEach(async () => {
      await realFork.close();
      await worldState.close();
    });

    it("the block's bundle is in the fork when the public processor runs", async () => {
      let treeSizeDuringExecution: bigint | undefined;
      let leafIndicesDuringExecution: (bigint | undefined)[] | undefined;
      processor.process.mockImplementation(async () => {
        treeSizeDuringExecution = await getL1ToL2TreeSize();
        leafIndicesDuringExecution = await realFork.findLeafIndices(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, bundle[0]);
        return [[], [], [], [], []];
      });

      const { block } = await builder.buildBlock([], firstBlockNumber, 1000n, {
        ...validatorOpts(),
        l1ToL2Messages: bundle,
      });

      // The AVM must read the same post-bundle tree the prover and the block-root circuit use.
      expect(treeSizeDuringExecution).toBe(3n);
      expect(leafIndicesDuringExecution).toEqual([0n, 1n, 2n]);
      expect(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex).toBe(3);
      // The bundle is appended exactly once.
      expect(await getL1ToL2TreeSize()).toBe(3n);
    });

    it('a failed block rolls its bundle back', async () => {
      processor.process.mockRejectedValue(new Error('processor failure'));

      await expect(
        builder.buildBlock([], firstBlockNumber, 1000n, { ...validatorOpts(), l1ToL2Messages: bundle }),
      ).rejects.toThrow('processor failure');

      expect(await getL1ToL2TreeSize()).toBe(0n);
      expect(lightweight.getBlocks()).toEqual([]);
    });

    it('a block below minValidTxs rolls its bundle back', async () => {
      processor.process.mockResolvedValue([[], [], [], [], []]);

      await expect(
        builder.buildBlock([], firstBlockNumber, 1000n, {
          ...validatorOpts({ minValidTxs: 1 }),
          l1ToL2Messages: bundle,
        }),
      ).rejects.toThrow(InsufficientValidTxsError);

      expect(await getL1ToL2TreeSize()).toBe(0n);
      expect(lightweight.getBlocks()).toEqual([]);
    });

    it('an empty or absent bundle leaves the tree untouched', async () => {
      processor.process.mockResolvedValue([[], [], [], [], []]);

      const { block: block1 } = await builder.buildBlock([], firstBlockNumber, 1000n, {
        ...validatorOpts(),
        l1ToL2Messages: [],
      });
      expect(block1.header.state.l1ToL2MessageTree.nextAvailableLeafIndex).toBe(0);
      expect(await getL1ToL2TreeSize()).toBe(0n);

      const { block: block2 } = await builder.buildBlock([], BlockNumber(firstBlockNumber + 1), 1000n, validatorOpts());
      expect(block2.header.state.l1ToL2MessageTree.nextAvailableLeafIndex).toBe(0);
      expect(await getL1ToL2TreeSize()).toBe(0n);
    });
  });
});

describe('FullNodeCheckpointsBuilder', () => {
  let worldState: MockProxy<WorldStateSynchronizer>;
  let builder: FullNodeCheckpointsBuilder;

  const blockNumber = BlockNumber(5);

  beforeEach(() => {
    worldState = mock<WorldStateSynchronizer>();
    const telemetryClient = mock<TelemetryClient>();
    telemetryClient.getMeter.mockReturnValue(mock());
    telemetryClient.getTracer.mockReturnValue(mock());

    builder = new FullNodeCheckpointsBuilder(
      { l1GenesisTime: 0n, slotDuration: 24, l1ChainId: 1, rollupVersion: 1, rollupManaLimit: 200_000_000 },
      worldState,
      mock<ContractDataSource>(),
      new TestDateProvider(),
      mock<AvmSimulator>(),
      telemetryClient,
    );
  });

  describe('getFork', () => {
    it('syncs world state to the block (with its hash) before forking', async () => {
      const forkResult = mock<MerkleTreeWriteOperations>();
      worldState.fork.mockResolvedValue(forkResult);
      const blockHash = BlockHash.random();

      const result = await builder.getFork(blockNumber, blockHash);

      expect(result).toBe(forkResult);
      // The block hash is relayed to syncImmediate for reorg detection.
      expect(worldState.syncImmediate).toHaveBeenCalledWith(blockNumber, blockHash);
      expect(worldState.fork).toHaveBeenCalledWith(blockNumber);
      // Syncing must precede the fork, otherwise the fork can hit a block the trees have not applied yet
      // and throw a raw "initialize from future block" tree error.
      expect(worldState.syncImmediate.mock.invocationCallOrder[0]).toBeLessThan(
        worldState.fork.mock.invocationCallOrder[0],
      );
    });

    it('propagates a sync failure without forking', async () => {
      worldState.syncImmediate.mockRejectedValue(new Error('Unable to initialize from future block'));

      await expect(builder.getFork(blockNumber)).rejects.toThrow('Unable to initialize from future block');
      expect(worldState.fork).not.toHaveBeenCalled();
    });
  });
});
