import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type FeeHeader, RollupContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { unfreeze } from '@aztec/foundation/types';
import { type AvmSimulator, PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockQuery,
  L2Block,
  type L2BlockSource,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { InboxBucket, L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type CheckpointGlobalVariables,
  type GlobalVariableBuilder,
  GlobalVariables,
  TxEffect,
} from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

const CHAIN_ID = new Fr(12345);
const ROLLUP_VERSION = new Fr(1);
const ROLLUP_ADDRESS = EthAddress.random();

describe('NodePublicCallsSimulator', () => {
  let blockSource: MockProxy<L2BlockSource>;
  let worldStateSynchronizer: MockProxy<WorldStateSynchronizer>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let globalVariableBuilder: MockProxy<GlobalVariableBuilder>;
  let rollupContract: MockProxy<RollupContract>;
  let epochCache: MockProxy<EpochCacheInterface>;
  let merkleTreeFork: MockProxy<MerkleTreeWriteOperations>;
  let avmSimulator: MockProxy<AvmSimulator>;

  let simulator: NodePublicCallsSimulator;

  // Captures the globals the simulator builds for the next block by intercepting the processor it
  // would run them through, so tests can assert on the result rather than on mock call counts.
  let builtGlobals: GlobalVariables | undefined;

  const makeTips = (args: {
    proposed: BlockNumber;
    checkpointedBlock: BlockNumber;
    checkpointed: CheckpointNumber;
    proven?: CheckpointNumber;
  }): L2Tips => ({
    proposed: { number: args.proposed, hash: '0x0' },
    checkpointed: {
      block: { number: args.checkpointedBlock, hash: '0x0' },
      checkpoint: { number: args.checkpointed, hash: '0x0' },
    },
    proven: {
      block: { number: BlockNumber.ZERO, hash: '0x0' },
      checkpoint: { number: args.proven ?? args.checkpointed, hash: '0x0' },
    },
    finalized: {
      block: { number: BlockNumber.ZERO, hash: '0x0' },
      checkpoint: { number: args.proven ?? args.checkpointed, hash: '0x0' },
    },
  });

  const makeBlockData = (blockNumber: BlockNumber, slotNumber: SlotNumber, gasFees = GasFees.empty()): BlockData => ({
    header: BlockHeader.empty({
      globalVariables: GlobalVariables.empty({ blockNumber, slotNumber, gasFees }),
    }),
    archive: L2Block.empty().archive,
    blockHash: BlockHash.random(),
    checkpointNumber: CheckpointNumber(1),
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
  });

  const mockNextL1Slot = (slot: SlotNumber) => {
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({
      epoch: EpochNumber.ZERO,
      slot,
      ts: 0n,
      nowSeconds: 0n,
    });
  };

  const checkpointGlobals = (slotNumber: SlotNumber): CheckpointGlobalVariables => ({
    chainId: CHAIN_ID,
    version: ROLLUP_VERSION,
    slotNumber,
    timestamp: BigInt(slotNumber) * 72n,
    coinbase: EthAddress.ZERO,
    feeRecipient: AztecAddress.ZERO,
    gasFees: GasFees.empty(),
  });

  /**
   * Mocks the Inbox so the next-block prediction selects a two-message bundle: the fork's message total (0)
   * resolves to bucket 0, and bucket 1 is lag-eligible and holds both messages.
   */
  const mockInboxSelection = () => {
    const makeBucket = (seq: bigint, totalMsgCount: bigint): InboxBucket => ({
      seq,
      inboxRollingHash: Fr.ZERO,
      totalMsgCount,
      timestamp: 0n,
      msgCount: Number(totalMsgCount),
      lastMessageIndex: totalMsgCount === 0n ? 0n : totalMsgCount - 1n,
    });
    const bundle = [new Fr(0x1234), new Fr(0x5678)];
    l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue(makeBucket(0n, 0n));
    l1ToL2MessageSource.getLatestInboxBucketAtOrBefore.mockResolvedValue(makeBucket(1n, 2n));
    l1ToL2MessageSource.getL1ToL2MessagesBetweenBuckets.mockResolvedValue(bundle);
    return bundle;
  };

  const lowGasTx = () =>
    mockTx(0x10000, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      chainId: CHAIN_ID,
      version: ROLLUP_VERSION,
    });

  beforeEach(() => {
    builtGlobals = undefined;

    blockSource = mock<L2BlockSource>();
    worldStateSynchronizer = mock<WorldStateSynchronizer>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    globalVariableBuilder = mock<GlobalVariableBuilder>();
    rollupContract = mock<RollupContract>();
    epochCache = mock<EpochCacheInterface>();
    merkleTreeFork = mock<MerkleTreeWriteOperations>();
    avmSimulator = mock<AvmSimulator>();

    worldStateSynchronizer.syncImmediate.mockResolvedValue(BlockNumber.ZERO);
    // The fork is an AsyncDisposable; provide the hook so `await using` does not throw.
    (merkleTreeFork as unknown as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose] = () =>
      Promise.resolve();
    worldStateSynchronizer.fork.mockResolvedValue(merkleTreeFork);
    merkleTreeFork.getTreeInfo.mockResolvedValue({
      treeId: MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      root: Buffer.alloc(32),
      size: 0n,
      depth: 16,
    });
    blockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });
    blockSource.getProposedCheckpointData.mockResolvedValue(undefined);
    // No Inbox bucket resolves to the fork's message total by default, so the next-block message prediction
    // bails out and tests see the bare tip state unless they opt into it.
    l1ToL2MessageSource.getInboxBucketByTotalMsgCount.mockResolvedValue(undefined);
    epochCache.getL1Constants.mockReturnValue(EmptyL1RollupConstants);

    globalVariableBuilder.buildCheckpointGlobalVariables.mockImplementation((_c, _f, slotNumber) =>
      Promise.resolve(checkpointGlobals(slotNumber)),
    );

    // Capture the globals passed to the public processor and short-circuit execution with a stub
    // processor that echoes them back, so `simulate` returns an output reflecting the chosen globals.
    jest
      .spyOn(PublicProcessorFactory.prototype, 'create')
      .mockImplementation((_fork, globalVariables: GlobalVariables) => {
        builtGlobals = globalVariables;
        const processedTx = {
          revertReason: undefined,
          globalVariables,
          txEffect: TxEffect.empty(),
          gasUsed: { totalGas: undefined, teardownGas: undefined, publicGas: undefined, billedGas: undefined },
        };
        return {
          process: () => Promise.resolve([[processedTx], [], [], [], []]),
        } as unknown as PublicProcessor;
      });

    simulator = new NodePublicCallsSimulator({
      blockSource,
      worldStateSynchronizer,
      l1ToL2MessageSource,
      contractDataSource,
      globalVariableBuilder,
      rollupContract,
      epochCache,
      avmSimulator,
      signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: ROLLUP_ADDRESS },
      config: { rpcSimulatePublicMaxGasLimit: 1e11, rpcSimulatePublicMaxDebugLogMemoryReads: 100 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects when the gas limit exceeds the maximum', async () => {
    const tx = await lowGasTx();
    unfreeze(tx.data.constants.txContext.gasSettings.gasLimits).l2Gas = 1e12;
    await expect(simulator.simulate(tx)).rejects.toThrow(/gas/i);
  });

  describe('continuing an in-progress checkpoint', () => {
    // A proposed checkpoint (#2) terminates at block 5, but the latest proposed block (block 9) is
    // ahead of it, so the next block continues the in-progress checkpoint built on top of the proposed one.
    const setupMidCheckpoint = () => {
      blockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposed: BlockNumber(9), checkpointedBlock: BlockNumber(3), checkpointed: CheckpointNumber(1) }),
      );
      blockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpointData({ checkpointNumber: CheckpointNumber(2), lastBlock: BlockNumber(5) }),
      );
    };

    it('copies the latest proposed header globals verbatim and bumps only the block number', async () => {
      const tx = await lowGasTx();
      const headerSlot = SlotNumber(42);
      const headerGasFees = new GasFees(0, 777);
      setupMidCheckpoint();
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, headerSlot, headerGasFees) : undefined),
      );
      mockNextL1Slot(SlotNumber(100));

      await simulator.simulate(tx);

      expect(builtGlobals).toBeDefined();
      expect(builtGlobals!.blockNumber).toEqual(BlockNumber(10));
      expect(builtGlobals!.slotNumber).toEqual(headerSlot);
      expect(builtGlobals!.gasFees).toEqual(headerGasFees);
      // No fresh globals built and no L1 reads for fees when continuing an in-progress checkpoint.
      expect(globalVariableBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(rollupContract.getManaTarget).not.toHaveBeenCalled();
    });

    it('appends the message bundle the next block would consume', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(42)) : undefined),
      );
      mockNextL1Slot(SlotNumber(100));
      const bundle = mockInboxSelection();

      await simulator.simulate(tx);

      expect(merkleTreeFork.appendLeaves).toHaveBeenCalledWith(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, bundle);
    });

    it('simulates against the tip when the parent Inbox bucket is not synced', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(42)) : undefined),
      );
      mockNextL1Slot(SlotNumber(100));
      // Default mock: no bucket resolves the fork's message total.

      await expect(simulator.simulate(tx)).resolves.toBeDefined();

      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
    });

    it('fails with a retryable error when the latest proposed header is missing, without double-inserting messages', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      // Latest proposed block header is missing (torn snapshot).
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(100));

      await expect(simulator.simulate(tx)).rejects.toThrow();

      // Must not treat the next block as opening a new checkpoint.
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
      expect(globalVariableBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
    });
  });

  describe('opening a new checkpoint', () => {
    // The latest proposed block (5) coincides with the proposed-checkpoint frontier, so the next
    // block opens a new checkpoint. Tests that pipeline on a proposed checkpoint additionally mock
    // `getProposedCheckpointData`; otherwise the frontier is the checkpointed tip (block 5).
    const setupBoundary = (args?: { checkpointed?: CheckpointNumber }) =>
      makeTips({
        proposed: BlockNumber(5),
        checkpointedBlock: BlockNumber(5),
        checkpointed: args?.checkpointed ?? CheckpointNumber(1),
      });

    it('targets the next L1 slot plus the pipelining offset and pins tips to the checkpointed tip when idle', async () => {
      const tx = await lowGasTx();
      blockSource.getL2Tips.mockResolvedValue(setupBoundary());
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(5)) : undefined),
      );
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      // Sequencer formula: nextL1Slot + PROPOSER_PIPELINING_SLOT_OFFSET (=1).
      const [, , slotArg, plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(21));
      expect(builtGlobals!.blockNumber).toEqual(BlockNumber(6));
      // Idle: tips pinned to the checkpointed tip (number 1) for both pending and proven.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(1), proven: CheckpointNumber(1) });
    });

    it('appends the message bundle the next block would consume', async () => {
      const tx = await lowGasTx();
      blockSource.getL2Tips.mockResolvedValue(setupBoundary());
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(5)) : undefined),
      );
      mockNextL1Slot(SlotNumber(20));
      const bundle = mockInboxSelection();

      await expect(simulator.simulate(tx)).resolves.toBeDefined();

      // Only the first block's worth of messages: a fresh checkpoint starts its per-checkpoint budget at the tip.
      expect(merkleTreeFork.appendLeaves).toHaveBeenCalledWith(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, bundle);
    });

    it('targets parentSlot + 1 and carries the parent overrides when pipelining on a proposed checkpoint', async () => {
      const tx = await lowGasTx();
      const parentSlot = SlotNumber(30);
      const parentArchiveRoot = Fr.fromString('0xabcabc');
      blockSource.getL2Tips.mockResolvedValue(setupBoundary({ checkpointed: CheckpointNumber(2) }));
      // The parent slot must come from the proposed checkpoint data itself, not from a separate
      // block-data read that can be torn from it — so leave block data unavailable here.
      blockSource.getBlockData.mockResolvedValue(undefined);
      // The next L1 slot is well behind the proposed parent's slot, so the proposed-checkpoint + 1
      // term must win the max().
      mockNextL1Slot(SlotNumber(5));

      const proposedCheckpointData = makeProposedCheckpointData({
        checkpointNumber: CheckpointNumber(3),
        lastBlock: BlockNumber(5),
        slotNumber: parentSlot,
        archiveRoot: parentArchiveRoot,
      });
      blockSource.getProposedCheckpointData.mockResolvedValue(proposedCheckpointData);

      const grandparentFeeHeader = makeFeeHeader();
      rollupContract.getCheckpoint.mockResolvedValue({ feeHeader: grandparentFeeHeader } as any);
      rollupContract.getManaTarget.mockResolvedValue(1000n);
      const childFeeHeader = makeFeeHeader();
      jest.spyOn(RollupContract, 'computeChildFeeHeader').mockReturnValue(childFeeHeader);

      await simulator.simulate(tx);

      const [, , slotArg, plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(31));
      expect(plan?.pendingCheckpointState?.archive).toEqual(parentArchiveRoot);
      expect(plan?.pendingCheckpointState?.slotNumber).toEqual(parentSlot);
      expect(plan?.pendingCheckpointState?.feeHeader).toEqual(childFeeHeader);
      expect(RollupContract.computeChildFeeHeader).toHaveBeenCalledWith(
        grandparentFeeHeader,
        proposedCheckpointData.totalManaUsed,
        proposedCheckpointData.feeAssetPriceModifier,
        1000n,
      );
    });

    it('pins tips to firstInvalid - 1 when the pending chain is invalid', async () => {
      const tx = await lowGasTx();
      blockSource.getL2Tips.mockResolvedValue(setupBoundary({ checkpointed: CheckpointNumber(5) }));
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(5)) : undefined),
      );
      mockNextL1Slot(SlotNumber(20));
      blockSource.getPendingChainValidationStatus.mockResolvedValue(makeInvalidStatus(CheckpointNumber(4)));

      await simulator.simulate(tx);

      const [, , , plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      // invalidateToPendingCheckpointNumber = firstInvalid (4) - 1 = 3.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(3), proven: CheckpointNumber(3) });
    });

    it('degrades to a pinned-tips plan when pipelining without a rollup contract', async () => {
      const tx = await lowGasTx();
      simulator = makeSimulatorWithoutRollupContract();
      blockSource.getL2Tips.mockResolvedValue(setupBoundary({ checkpointed: CheckpointNumber(2) }));
      mockNextL1Slot(SlotNumber(5));
      blockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(3),
          lastBlock: BlockNumber(5),
          slotNumber: SlotNumber(30),
          archiveRoot: Fr.fromString('0xabcabc'),
        }),
      );

      await simulator.simulate(tx);

      const [, , , plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      // No rollup contract: pin tips to the checkpointed tip (2) without pipelining overrides.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(2), proven: CheckpointNumber(2) });
      expect(plan?.pendingCheckpointState).toBeUndefined();
    });

    it('simulates without a rollup contract when idle (the TXE shape)', async () => {
      const tx = await lowGasTx();
      simulator = makeSimulatorWithoutRollupContract();
      blockSource.getL2Tips.mockResolvedValue(setupBoundary());
      mockNextL1Slot(SlotNumber(20));

      await expect(simulator.simulate(tx)).resolves.toBeDefined();

      const [, , , plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(1), proven: CheckpointNumber(1) });
    });

    const makeSimulatorWithoutRollupContract = () =>
      new NodePublicCallsSimulator({
        blockSource,
        worldStateSynchronizer,
        l1ToL2MessageSource,
        contractDataSource,
        globalVariableBuilder,
        epochCache,
        avmSimulator,
        signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: ROLLUP_ADDRESS },
        config: { rpcSimulatePublicMaxGasLimit: 1e11, rpcSimulatePublicMaxDebugLogMemoryReads: 100 },
      });
  });
});

function makeFeeHeader(): FeeHeader {
  return { excessMana: 0n, manaUsed: 0n, ethPerFeeAsset: 0n, congestionCost: 0n, proverCost: 0n };
}

function makeProposedCheckpointData(args: {
  checkpointNumber: CheckpointNumber;
  lastBlock: BlockNumber;
  slotNumber?: SlotNumber;
  archiveRoot?: Fr;
}): ProposedCheckpointData {
  return {
    checkpointNumber: args.checkpointNumber,
    header: CheckpointHeader.empty({ slotNumber: args.slotNumber ?? SlotNumber(0) }),
    startBlock: args.lastBlock,
    blockCount: 1,
    totalManaUsed: 555n,
    feeAssetPriceModifier: 7n,
    archive: new AppendOnlyTreeSnapshot(args.archiveRoot ?? Fr.ZERO, 0),
    checkpointOutHash: Fr.fromString('0xfeed'),
    inboxMsgTotal: 0n,
  };
}

function makeInvalidStatus(firstInvalid: CheckpointNumber): ValidateCheckpointResult {
  return {
    valid: false,
    checkpoint: {
      archive: Fr.random(),
      lastArchive: Fr.random(),
      slotNumber: SlotNumber(10),
      checkpointNumber: firstInvalid,
      timestamp: 0n,
    },
    committee: [],
    epoch: EpochNumber.ZERO,
    seed: 0n,
    attestors: [],
    attestations: [],
    verbatimAttestations: { signatureIndices: '0x', signaturesOrAddresses: '0x' },
    reason: 'insufficient-attestations',
  };
}
