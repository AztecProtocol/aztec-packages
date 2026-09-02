import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type FeeHeader, RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { unfreeze } from '@aztec/foundation/types';
import { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  BlockHash,
  type L1SyncPoint,
  type L2BlockSource,
  type L2Frontier,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { L1PublishedData, type ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
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

  let simulator: NodePublicCallsSimulator;

  // Captures the globals the simulator builds for the next block by intercepting the processor it
  // would run them through, so tests can assert on the result rather than on mock call counts.
  let builtGlobals: GlobalVariables | undefined;

  /** Stable per-block hash, so tips and the frontier agree on block identity. */
  const blockHashOf = (blockNumber: BlockNumber): BlockHash => new BlockHash(new Fr(1000 + blockNumber));

  type L2FrontierArgs = {
    proposed: BlockNumber;
    checkpointedBlock: BlockNumber;
    checkpointed: CheckpointNumber;
    proven?: CheckpointNumber;
    /** Slot of the checkpointed checkpoint, the floor for the next block's slot. Omit for the genesis shape. */
    checkpointedTipSlot?: SlotNumber;
    proposedCheckpoint?: ProposedCheckpointData;
    /** Globals of the proposed tip's header, copied verbatim when the next block continues a checkpoint. */
    latestBlockGlobals?: { slotNumber: SlotNumber; gasFees?: GasFees };
    /** Omit the proposed tip's header from the snapshot, an invariant violation the simulator must reject. */
    omitLatestBlockHeader?: boolean;
    pendingChainValidationStatus?: ValidateCheckpointResult;
    /** L1 block the archiver's snapshot reflects; the fee read must be pinned to it. */
    l1SyncPoint?: L1SyncPoint;
  };

  const makeTips = (args: L2FrontierArgs): L2Tips => {
    const blockId = (number: BlockNumber) => ({ number, hash: blockHashOf(number).toString() });
    const checkpointId = (number: CheckpointNumber) => ({ number, hash: `0xc${number}` });
    return {
      proposed: blockId(args.proposed),
      checkpointed: { block: blockId(args.checkpointedBlock), checkpoint: checkpointId(args.checkpointed) },
      proven: { block: blockId(BlockNumber.ZERO), checkpoint: checkpointId(args.proven ?? args.checkpointed) },
      finalized: { block: blockId(BlockNumber.ZERO), checkpoint: checkpointId(args.proven ?? args.checkpointed) },
    };
  };

  const makeFrontier = (args: L2FrontierArgs): L2Frontier => ({
    tips: makeTips(args),
    proposedCheckpoint: args.proposedCheckpoint,
    l1SyncPoint: args.l1SyncPoint,
    latestBlockHeader:
      args.omitLatestBlockHeader || !args.latestBlockGlobals
        ? undefined
        : BlockHeader.empty({
            globalVariables: GlobalVariables.empty({
              blockNumber: args.proposed,
              slotNumber: args.latestBlockGlobals.slotNumber,
              gasFees: args.latestBlockGlobals.gasFees ?? GasFees.empty(),
            }),
          }),
    checkpointedCheckpoint:
      args.checkpointedTipSlot === undefined
        ? undefined
        : {
            header: CheckpointHeader.empty({ slotNumber: args.checkpointedTipSlot }),
            l1: new L1PublishedData(1n, 0n, `0x`),
          },
    pendingChainValidationStatus: args.pendingChainValidationStatus ?? { valid: true },
  });

  /** Points the block source at one atomic L2 frontier snapshot, the single read the simulator makes. */
  const mockL2Frontier = (args: L2FrontierArgs) => {
    const frontier = makeFrontier(args);
    blockSource.getL2Frontier.mockResolvedValue(frontier);
    return frontier;
  };

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

    worldStateSynchronizer.syncImmediate.mockResolvedValue(BlockNumber.ZERO);
    // The fork is an AsyncDisposable; provide the hook so `await using` does not throw.
    (merkleTreeFork as unknown as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose] = () =>
      Promise.resolve();
    worldStateSynchronizer.fork.mockResolvedValue(merkleTreeFork);
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);

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
    const setupMidCheckpoint = (args: Partial<L2FrontierArgs> = {}) =>
      mockL2Frontier({
        proposed: BlockNumber(9),
        checkpointedBlock: BlockNumber(3),
        checkpointed: CheckpointNumber(1),
        latestBlockGlobals: { slotNumber: SlotNumber(42) },
        proposedCheckpoint: makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(2),
          lastBlock: BlockNumber(5),
        }),
        ...args,
      });

    it('copies the snapshot header globals verbatim and bumps only the block number', async () => {
      const tx = await lowGasTx();
      const headerSlot = SlotNumber(42);
      const headerGasFees = new GasFees(0, 777);
      setupMidCheckpoint({ latestBlockGlobals: { slotNumber: headerSlot, gasFees: headerGasFees } });
      mockNextL1Slot(SlotNumber(100));

      await simulator.simulate(tx);

      expect(builtGlobals).toBeDefined();
      expect(builtGlobals!.blockNumber).toEqual(BlockNumber(10));
      expect(builtGlobals!.slotNumber).toEqual(headerSlot);
      expect(builtGlobals!.gasFees).toEqual(headerGasFees);
      // The header comes with the snapshot: no by-number or by-hash block lookup, no fresh globals, no L1 reads.
      expect(blockSource.getBlockData).not.toHaveBeenCalled();
      expect(globalVariableBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(rollupContract.getManaTarget).not.toHaveBeenCalled();
    });

    it('does not insert L1-to-L2 messages', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      mockNextL1Slot(SlotNumber(100));

      await simulator.simulate(tx);

      expect(l1ToL2MessageSource.getL1ToL2Messages).not.toHaveBeenCalled();
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
    });

    it('rejects a snapshot missing the proposed tip header, without double-inserting messages', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint({ omitLatestBlockHeader: true });
      mockNextL1Slot(SlotNumber(100));

      await expect(simulator.simulate(tx)).rejects.toThrow(/carries no header/);

      // Must not treat the next block as opening a new checkpoint and re-insert the ongoing checkpoint's messages.
      expect(l1ToL2MessageSource.getL1ToL2Messages).not.toHaveBeenCalled();
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
      expect(globalVariableBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
    });
  });

  describe('opening a new checkpoint', () => {
    // The latest proposed block (5) coincides with the proposed-checkpoint frontier, so the next
    // block opens a new checkpoint. Tests that pipeline on a proposed checkpoint pass one in the
    // snapshot; otherwise the frontier is the checkpointed tip (block 5).
    const setupBoundary = (args: Partial<L2FrontierArgs> = {}) =>
      mockL2Frontier({
        proposed: BlockNumber(5),
        checkpointedBlock: BlockNumber(5),
        checkpointed: CheckpointNumber(1),
        checkpointedTipSlot: SlotNumber(5),
        ...args,
      });

    it('targets the next L1 slot plus the pipelining offset and pins tips to the checkpointed tip when idle', async () => {
      const tx = await lowGasTx();
      setupBoundary();
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      // Sequencer formula: nextL1Slot + PROPOSER_PIPELINING_SLOT_OFFSET (=1).
      const [, , slotArg, plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(21));
      expect(builtGlobals!.blockNumber).toEqual(BlockNumber(6));
      // Idle: tips pinned to the checkpointed tip (number 1) for both pending and proven.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(1), proven: CheckpointNumber(1) });
    });

    it('floors the target slot at the checkpointed tip slot plus one when the node clock lags the chain', async () => {
      const tx = await lowGasTx();
      // The checkpointed tip already sits at slot 14, so the next block cannot land before slot 15.
      setupBoundary({ checkpointedTipSlot: SlotNumber(14) });
      mockNextL1Slot(SlotNumber(13));

      await simulator.simulate(tx);

      const [, , slotArg] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(15));
    });

    it('does not raise the target slot when the node clock is ahead of the checkpointed tip', async () => {
      const tx = await lowGasTx();
      setupBoundary({ checkpointedTipSlot: SlotNumber(14) });
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      const [, , slotArg] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(21));
    });

    it('takes the floor slot from the snapshot rather than reading the tip block', async () => {
      const tx = await lowGasTx();
      setupBoundary({ checkpointedTipSlot: SlotNumber(14) });
      mockNextL1Slot(SlotNumber(13));

      await simulator.simulate(tx);

      // The whole decision comes from the one frontier read: a by-number or by-hash lookup could answer with a
      // block from a different instant after a checkpoint unwind.
      expect(blockSource.getBlockData).not.toHaveBeenCalled();
      expect(blockSource.getL2Frontier).toHaveBeenCalledTimes(1);
    });

    it('skips the floor at genesis, where no checkpoint has landed yet', async () => {
      const tx = await lowGasTx();
      mockL2Frontier({
        proposed: BlockNumber.ZERO,
        checkpointedBlock: BlockNumber.ZERO,
        checkpointed: CheckpointNumber(0),
      });
      mockNextL1Slot(SlotNumber(3));

      await simulator.simulate(tx);

      const [, , slotArg] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SlotNumber(4));
    });

    it('inserts L1-to-L2 messages for the next checkpoint', async () => {
      const tx = await lowGasTx();
      const messages = [Fr.fromString('0x1234'), Fr.fromString('0x5678')];
      setupBoundary();
      mockNextL1Slot(SlotNumber(20));
      l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue(messages);

      await simulator.simulate(tx);

      // targetCheckpoint = proposedCheckpoint.number + 1
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(2));
      const [treeId, appended] = merkleTreeFork.appendLeaves.mock.calls[0];
      expect(treeId).toEqual(MerkleTreeId.L1_TO_L2_MESSAGE_TREE);
      expect(appended.slice(0, 2)).toEqual(messages);
    });

    it('tolerates L1ToL2MessagesNotReadyError and simulates without messages', async () => {
      const tx = await lowGasTx();
      setupBoundary();
      mockNextL1Slot(SlotNumber(20));
      l1ToL2MessageSource.getL1ToL2Messages.mockRejectedValue(new L1ToL2MessagesNotReadyError(CheckpointNumber(2), 0n));

      await expect(simulator.simulate(tx)).resolves.toBeDefined();
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
    });

    it('targets parentSlot + 1 and carries the parent overrides when pipelining on a proposed checkpoint', async () => {
      const tx = await lowGasTx();
      const parentSlot = SlotNumber(30);
      const parentArchiveRoot = Fr.fromString('0xabcabc');
      const proposedCheckpointData = makeProposedCheckpointData({
        checkpointNumber: CheckpointNumber(3),
        lastBlock: BlockNumber(5),
        slotNumber: parentSlot,
        archiveRoot: parentArchiveRoot,
      });
      // Both the next L1 slot and the checkpointed tip sit well behind the proposed parent's slot, so the
      // proposed-checkpoint + 1 term must win the max() and the parent slot must come from the proposed
      // checkpoint data itself.
      setupBoundary({ checkpointed: CheckpointNumber(2), proposedCheckpoint: proposedCheckpointData });
      mockNextL1Slot(SlotNumber(5));

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

    it('pins the fee read to the L1 block the frontier was read at', async () => {
      const tx = await lowGasTx();
      setupBoundary({ l1SyncPoint: { blockNumber: 4242n, blockHash: Buffer32.fromNumber(7) } });
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      const [, , , , options] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(options).toEqual({ blockNumber: 4242n });
    });

    it('leaves the fee read unpinned before the archiver has synced', async () => {
      const tx = await lowGasTx();
      setupBoundary();
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      const [, , , , options] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(options).toEqual({ blockNumber: undefined });
    });

    it('pins tips to firstInvalid - 1 when the pending chain is invalid', async () => {
      const tx = await lowGasTx();
      setupBoundary({
        checkpointed: CheckpointNumber(5),
        pendingChainValidationStatus: makeInvalidStatus(CheckpointNumber(4)),
      });
      mockNextL1Slot(SlotNumber(20));

      await simulator.simulate(tx);

      const [, , , plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      // invalidateToPendingCheckpointNumber = firstInvalid (4) - 1 = 3.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(3), proven: CheckpointNumber(3) });
    });

    it('degrades to a pinned-tips plan when pipelining without a rollup contract', async () => {
      const tx = await lowGasTx();
      simulator = makeSimulatorWithoutRollupContract();
      setupBoundary({
        checkpointed: CheckpointNumber(2),
        proposedCheckpoint: makeProposedCheckpointData({
          checkpointNumber: CheckpointNumber(3),
          lastBlock: BlockNumber(5),
          slotNumber: SlotNumber(30),
          archiveRoot: Fr.fromString('0xabcabc'),
        }),
      });
      mockNextL1Slot(SlotNumber(5));

      await simulator.simulate(tx);

      const [, , , plan] = globalVariableBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      // No rollup contract: pin tips to the checkpointed tip (2) without pipelining overrides.
      expect(plan?.chainTipsOverride).toEqual({ pending: CheckpointNumber(2), proven: CheckpointNumber(2) });
      expect(plan?.pendingCheckpointState).toBeUndefined();
    });

    it('simulates without a rollup contract when idle (the TXE shape)', async () => {
      const tx = await lowGasTx();
      simulator = makeSimulatorWithoutRollupContract();
      setupBoundary();
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
