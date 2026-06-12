import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import { type EpochCacheInterface, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { type FeeHeader, RollupContract, RollupFeeReader, SimulationOverridesBuilder } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { unfreeze } from '@aztec/foundation/types';
import { GlobalVariableBuilder as GlobalVariableBuilderImpl } from '@aztec/sequencer-client';
import { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
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
  // Real reader over the mocked rollup contract, so cross-component sharing and per-block caching are
  // exercised end to end rather than stubbed.
  let feeReader: RollupFeeReader;
  let epochCache: MockProxy<EpochCacheInterface>;
  let merkleTreeFork: MockProxy<MerkleTreeWriteOperations>;

  let simulator: NodePublicCallsSimulator;

  // The L1 block number the stubbed rollup client reports; tests mutate it to rotate cache keys.
  let l1BlockNumber: bigint;

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

    // The fee reader reads the current L1 block number off the rollup contract's client to scope its
    // cache keys and pin reads; `client` is not auto-mocked, so stand up a minimal stub.
    l1BlockNumber = 1000n;
    (rollupContract as unknown as { client: { getBlockNumber: () => Promise<bigint> } }).client = {
      getBlockNumber: () => Promise.resolve(l1BlockNumber),
    };

    // The reader translates the plan into a state override via these methods before the min-fee call.
    // Return overrides whose content reflects their inputs so two plans with different override content
    // produce different fingerprints (and therefore different cache keys), while identical plans collide.
    (rollupContract as unknown as { address: string }).address = ROLLUP_ADDRESS.toString();
    rollupContract.getManaTarget.mockResolvedValue(1000n);
    rollupContract.getManaMinFeeAt.mockResolvedValue(0n);
    rollupContract.makeChainTipsOverride.mockImplementation(override =>
      Promise.resolve([
        {
          address: ROLLUP_ADDRESS.toString(),
          stateDiff: [{ slot: '0x00', value: `0x${(override.pending ?? 0).toString(16).padStart(64, '0')}` }],
        },
      ]),
    );
    rollupContract.makeArchiveOverride.mockImplementation((_n, archive) => [
      { address: ROLLUP_ADDRESS.toString(), stateDiff: [{ slot: '0x01', value: archive.toString() }] },
    ]);
    rollupContract.makeTempCheckpointLogOverride.mockImplementation((_n, fields) =>
      Promise.resolve([
        {
          address: ROLLUP_ADDRESS.toString(),
          stateDiff: [
            { slot: '0x02', value: (fields.headerHash ?? Fr.ZERO).toString() },
            {
              slot: '0x03',
              value: `0x${(fields.feeHeader?.manaUsed ?? 0n).toString(16).padStart(64, '0')}`,
            },
            {
              slot: '0x04',
              value: `0x${(fields.feeHeader?.ethPerFeeAsset ?? 0n).toString(16).padStart(64, '0')}`,
            },
          ],
        },
      ]),
    );

    feeReader = new RollupFeeReader(rollupContract);

    worldStateSynchronizer.syncImmediate.mockResolvedValue(BlockNumber.ZERO);
    // The fork is an AsyncDisposable; provide the hook so `await using` does not throw.
    (merkleTreeFork as unknown as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose] = () =>
      Promise.resolve();
    worldStateSynchronizer.fork.mockResolvedValue(merkleTreeFork);
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    blockSource.getPendingChainValidationStatus.mockResolvedValue({ valid: true });
    blockSource.getProposedCheckpointData.mockResolvedValue(undefined);

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
      feeReader,
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

    it('does not insert L1-to-L2 messages', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(42)) : undefined),
      );
      mockNextL1Slot(SlotNumber(100));

      await simulator.simulate(tx);

      expect(l1ToL2MessageSource.getL1ToL2Messages).not.toHaveBeenCalled();
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
    });

    it('fails with a retryable error when the latest proposed header is missing, without double-inserting messages', async () => {
      const tx = await lowGasTx();
      setupMidCheckpoint();
      // Latest proposed block header is missing (torn snapshot).
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(100));

      await expect(simulator.simulate(tx)).rejects.toThrow();

      // Must not treat the next block as opening a new checkpoint and re-insert the ongoing checkpoint's messages.
      expect(l1ToL2MessageSource.getL1ToL2Messages).not.toHaveBeenCalled();
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

    it('inserts L1-to-L2 messages for the next checkpoint', async () => {
      const tx = await lowGasTx();
      const messages = [Fr.fromString('0x1234'), Fr.fromString('0x5678')];
      blockSource.getL2Tips.mockResolvedValue(setupBoundary());
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(5)) : undefined),
      );
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
      blockSource.getL2Tips.mockResolvedValue(setupBoundary());
      blockSource.getBlockData.mockImplementation((query: BlockQuery) =>
        Promise.resolve('number' in query ? makeBlockData(query.number, SlotNumber(5)) : undefined),
      );
      mockNextL1Slot(SlotNumber(20));
      l1ToL2MessageSource.getL1ToL2Messages.mockRejectedValue(new L1ToL2MessagesNotReadyError(CheckpointNumber(2), 0n));

      await expect(simulator.simulate(tx)).resolves.toBeDefined();
      expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
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
        signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: ROLLUP_ADDRESS },
        config: { rpcSimulatePublicMaxGasLimit: 1e11, rpcSimulatePublicMaxDebugLogMemoryReads: 100 },
      });
  });

  // The simulator no longer caches fees itself; the L1 reads it triggers go through the shared
  // RollupFeeReader, which caches per L1 block. These tests assert that *shared* behavior: repeated
  // simulations against unchanged state reuse the reader's cache, while anything that changes the
  // translated override content (and the slot/block) recomputes — emergently, because each such change
  // alters the bytes the reader fingerprints into its key. The observable cached read on the pipelining
  // path is `getCheckpoint` (the grandparent fee-header read).
  describe('sharing fee reads through the RollupFeeReader', () => {
    // Opening a new checkpoint while pipelining: a proposed (not yet L1-confirmed) parent exists, so
    // the fee computation reads the grandparent fee header off the rollup. Returns the base args for
    // `makeProposedCheckpointData` so tests can vary a single field of the proposed parent.
    const setupPipelining = () => {
      blockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposed: BlockNumber(5), checkpointedBlock: BlockNumber(5), checkpointed: CheckpointNumber(2) }),
      );
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(5));
      rollupContract.getCheckpoint.mockResolvedValue({ feeHeader: makeFeeHeader() } as any);

      return {
        checkpointNumber: CheckpointNumber(3),
        lastBlock: BlockNumber(5),
        slotNumber: SlotNumber(30),
        archiveRoot: Fr.fromString('0xabcabc'),
      };
    };

    it('reuses the cached grandparent read for repeated simulations against unchanged state', async () => {
      const base = setupPipelining();
      blockSource.getProposedCheckpointData.mockResolvedValue(makeProposedCheckpointData(base));

      await simulator.simulate(await lowGasTx());
      await simulator.simulate(await lowGasTx());

      // The grandparent fee-header read is served from the reader's cache the second time.
      expect(rollupContract.getCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('shares one grandparent read between concurrent simulations against the same state', async () => {
      const base = setupPipelining();
      blockSource.getProposedCheckpointData.mockResolvedValue(makeProposedCheckpointData(base));
      // Hold the grandparent read open so the second simulation arrives while the first is in flight.
      const deferred = promiseWithResolvers<{ feeHeader: FeeHeader }>();
      rollupContract.getCheckpoint.mockReturnValueOnce(deferred.promise as any);

      const first = simulator.simulate(await lowGasTx());
      const second = simulator.simulate(await lowGasTx());
      await new Promise(resolve => setImmediate(resolve));

      deferred.resolve({ feeHeader: makeFeeHeader() });
      await Promise.all([first, second]);

      // Single-flight: both simulations shared one in-flight read.
      expect(rollupContract.getCheckpoint).toHaveBeenCalledTimes(1);
    });

    it('recomputes when the L1 block number advances', async () => {
      const base = setupPipelining();
      blockSource.getProposedCheckpointData.mockResolvedValue(makeProposedCheckpointData(base));

      await simulator.simulate(await lowGasTx());
      l1BlockNumber = 1001n;
      await simulator.simulate(await lowGasTx());

      expect(rollupContract.getCheckpoint).toHaveBeenCalledTimes(2);
    });

    it('recomputes the min fee when the proposed checkpoint changes hash but not its numbers', async () => {
      const base = setupPipelining();
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(makeProposedCheckpointData(base));
      await simulateThroughRealBuilder();

      // Same checkpoint number and slot, different header content (a re-proposed checkpoint): the
      // changed header hash flows into the temp-checkpoint-log override and rotates the min-fee key.
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(
        makeProposedCheckpointData({ ...base, headerArchiveRoot: Fr.fromString('0xbeef') }),
      );
      await simulateThroughRealBuilder();

      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('recomputes the min fee when only the fee asset price modifier of the proposed checkpoint changes', async () => {
      const base = setupPipelining();
      jest
        .spyOn(RollupContract, 'computeChildFeeHeader')
        .mockImplementation((_p, _m, modifier) => ({ ...makeFeeHeader(), ethPerFeeAsset: 100n + modifier }));
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(makeProposedCheckpointData(base));
      await simulateThroughRealBuilder();

      // The header hash does not commit to the modifier, but it changes the derived fee header (and thus
      // the fee-header override content), which rotates the min-fee key on its own.
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(
        makeProposedCheckpointData({ ...base, feeAssetPriceModifier: 9n }),
      );
      await simulateThroughRealBuilder();

      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('recomputes the min fee when only the stored total mana used of the proposed checkpoint changes', async () => {
      const base = setupPipelining();
      jest
        .spyOn(RollupContract, 'computeChildFeeHeader')
        .mockImplementation((_p, manaUsed) => ({ ...makeFeeHeader(), manaUsed }));
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(makeProposedCheckpointData(base));
      await simulateThroughRealBuilder();

      // The fee-header override consumes the separately-stored bigint, which feeds the derived fee
      // header and therefore the override content and key.
      blockSource.getProposedCheckpointData.mockResolvedValueOnce(
        makeProposedCheckpointData({ ...base, totalManaUsed: 556n }),
      );
      await simulateThroughRealBuilder();

      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('recomputes the min fee when the pending chain validation status changes', async () => {
      blockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposed: BlockNumber(5), checkpointedBlock: BlockNumber(5), checkpointed: CheckpointNumber(5) }),
      );
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(20));

      await simulateThroughRealBuilder();
      // Becoming invalid changes the pending-tip override (it pins to a different checkpoint number),
      // which changes the override content and rotates the key.
      blockSource.getPendingChainValidationStatus.mockResolvedValue(makeInvalidStatus(CheckpointNumber(4)));
      await simulateThroughRealBuilder();

      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('recomputes the min fee when the target slot advances', async () => {
      blockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposed: BlockNumber(5), checkpointedBlock: BlockNumber(5), checkpointed: CheckpointNumber(1) }),
      );
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(20));

      await simulateThroughRealBuilder();
      mockNextL1Slot(SlotNumber(21));
      await simulateThroughRealBuilder();

      // The slot (and thus the timestamp) is part of the min-fee key.
      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed grandparent read and retries on the next call', async () => {
      const base = setupPipelining();
      blockSource.getProposedCheckpointData.mockResolvedValue(makeProposedCheckpointData(base));
      rollupContract.getCheckpoint.mockRejectedValueOnce(new Error('L1 read failed'));

      await expect(simulator.simulate(await lowGasTx())).rejects.toThrow('L1 read failed');

      // The retry recomputes (the rejected promise was evicted) and succeeds.
      rollupContract.getCheckpoint.mockResolvedValue({ feeHeader: makeFeeHeader() } as any);
      await expect(simulator.simulate(await lowGasTx())).resolves.toBeDefined();
      expect(rollupContract.getCheckpoint).toHaveBeenCalledTimes(2);
    });

    it('shares one min-fee eth_call between the simulator and a direct global-variable build', async () => {
      blockSource.getL2Tips.mockResolvedValue(
        makeTips({ proposed: BlockNumber(5), checkpointedBlock: BlockNumber(5), checkpointed: CheckpointNumber(1) }),
      );
      blockSource.getBlockData.mockResolvedValue(undefined);
      mockNextL1Slot(SlotNumber(20));

      // The simulator targets the next L1 slot plus the pipelining offset, and builds globals for it
      // through the real builder over the shared reader.
      const targetSlot = SlotNumber(20 + PROPOSER_PIPELINING_SLOT_OFFSET);
      await simulateThroughRealBuilder();

      // A direct build for the same slot, with the same (pinned) plan, hits the shared reader's cache.
      const builder = new GlobalVariableBuilderImpl(
        { chain: { id: CHAIN_ID.toNumber() } } as any,
        {
          rollupAddress: ROLLUP_ADDRESS,
          ethereumSlotDuration: 12,
          rollupVersion: BigInt(ROLLUP_VERSION.toNumber()),
          slotDuration: 72,
          l1GenesisTime: 0n,
        },
        feeReader,
      );
      const plan = new SimulationOverridesBuilder()
        .withChainTips({ pending: CheckpointNumber(1), proven: CheckpointNumber(1) })
        .withL1BlockNumber(l1BlockNumber)
        .build();
      await builder.buildCheckpointGlobalVariables(EthAddress.ZERO, AztecAddress.ZERO, targetSlot, plan);

      // One eth_call served both the simulator and the direct build.
      expect(rollupContract.getManaMinFeeAt).toHaveBeenCalledTimes(1);
    });
  });

  // Simulates through a real GlobalVariableBuilder wired over the shared reader, so the simulator's
  // plan actually triggers the min-fee eth_call (the mocked builder used elsewhere would not).
  async function simulateThroughRealBuilder(): Promise<void> {
    const realBuilder = new GlobalVariableBuilderImpl(
      { chain: { id: CHAIN_ID.toNumber() } } as any,
      {
        rollupAddress: ROLLUP_ADDRESS,
        ethereumSlotDuration: 12,
        rollupVersion: BigInt(ROLLUP_VERSION.toNumber()),
        slotDuration: 72,
        l1GenesisTime: 0n,
      },
      feeReader,
    );
    const realSimulator = new NodePublicCallsSimulator({
      blockSource,
      worldStateSynchronizer,
      l1ToL2MessageSource,
      contractDataSource,
      globalVariableBuilder: realBuilder,
      feeReader,
      epochCache,
      signatureContext: { chainId: CHAIN_ID.toNumber(), rollupAddress: ROLLUP_ADDRESS },
      config: { rpcSimulatePublicMaxGasLimit: 1e11, rpcSimulatePublicMaxDebugLogMemoryReads: 100 },
    });
    await realSimulator.simulate(await lowGasTx());
  }
});

function makeFeeHeader(): FeeHeader {
  return { excessMana: 0n, manaUsed: 0n, ethPerFeeAsset: 0n, congestionCost: 0n, proverCost: 0n };
}

function makeProposedCheckpointData(args: {
  checkpointNumber: CheckpointNumber;
  lastBlock: BlockNumber;
  slotNumber?: SlotNumber;
  archiveRoot?: Fr;
  // Distinguishes two checkpoints that share the same numbers/slot but differ in header content
  // (e.g. an equivocation), so their header hashes — and thus the fee-cache key — differ.
  headerArchiveRoot?: Fr;
  feeAssetPriceModifier?: bigint;
  totalManaUsed?: bigint;
}): ProposedCheckpointData {
  return {
    checkpointNumber: args.checkpointNumber,
    header: CheckpointHeader.empty({
      slotNumber: args.slotNumber ?? SlotNumber(0),
      lastArchiveRoot: args.headerArchiveRoot ?? Fr.ZERO,
    }),
    startBlock: args.lastBlock,
    blockCount: 1,
    totalManaUsed: args.totalManaUsed ?? 555n,
    feeAssetPriceModifier: args.feeAssetPriceModifier ?? 7n,
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
    reason: 'insufficient-attestations',
  };
}
