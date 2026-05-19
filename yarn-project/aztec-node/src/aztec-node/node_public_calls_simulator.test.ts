import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { GlobalVariableBuilder } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockQuery, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, type FeeProvider, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

describe('NodePublicCallsSimulator', () => {
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let feeProvider: MockProxy<FeeProvider>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let lastBlockNumber: BlockNumber;
  let simulator: NodePublicCallsSimulator;
  let feePayer: AztecAddress;

  const chainId = new Fr(12345);
  const rollupVersion = new Fr(1);
  const rpcSimulatePublicMaxGasLimit = 1_000_000_000;
  const rpcSimulatePublicMaxDebugLogMemoryReads = 1024;

  const mockTxForRollup = async (seed: number) => {
    return await mockTx(seed, {
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      feePayer,
      chainId,
      version: rollupVersion,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
    });
  };

  beforeEach(async () => {
    lastBlockNumber = BlockNumber.ZERO;
    feePayer = await AztecAddress.random();

    globalVariablesBuilder = mock<GlobalVariableBuilder>();
    feeProvider = mock<FeeProvider>();
    worldState = mock<WorldStateSynchronizer>();
    worldState.syncImmediate.mockImplementation(() => Promise.resolve(lastBlockNumber));

    l2BlockSource = mock<L2BlockSource>();
    l2BlockSource.getBlockNumber.mockImplementation(((query?: BlockQuery) => {
      if (!query) {
        return Promise.resolve(lastBlockNumber);
      }
      if ('number' in query) {
        return Promise.resolve(query.number);
      }
      return Promise.resolve(undefined);
    }) as L2BlockSource['getBlockNumber']);
    l2BlockSource.getL1Constants.mockResolvedValue(EmptyL1RollupConstants);
    l2BlockSource.getGenesisBlockHash.mockReturnValue(BlockHash.random());

    l1ToL2MessageSource = mock<L1ToL2MessageSource>();

    const contractSource = mock<ContractDataSource>();

    simulator = new NodePublicCallsSimulator({
      blockSource: l2BlockSource,
      worldStateSynchronizer: worldState,
      l1ToL2MessageSource,
      contractDataSource: contractSource,
      globalVariableBuilder: globalVariablesBuilder,
      feeProvider,
      config: {
        rpcSimulatePublicMaxGasLimit,
        rpcSimulatePublicMaxDebugLogMemoryReads,
      },
    });
  });

  it('refuses to simulate public calls if the gas limit is too high', async () => {
    const tx = await mockTxForRollup(0x10000);
    unfreeze(tx.data.constants.txContext.gasSettings.gasLimits).l2Gas = 1e12;
    await expect(simulator.simulate(tx)).rejects.toThrow(/gas/i);
  });

  describe('next-block globals', () => {
    // Snapshot returned by the FeeProvider mock. The simulator consumes this triple for
    // slot/timestamp; gas fees come from `getPredictedMinFees()[0]` (see PREDICTED_GAS_FEES).
    const SNAPSHOT_SLOT = SlotNumber(150);
    const SNAPSHOT_TIMESTAMP = 1_700_003_600n;
    const SNAPSHOT_GAS_FEES = new GasFees(0, 99n);
    // Predicted fees the simulator must consume in Case B. Deliberately distinct from the
    // snapshot's gasFees to prove the simulator picks the predicted value, not the snapshot value.
    const PREDICTED_GAS_FEES = new GasFees(0, 42n);
    const PREDICTED_NEXT_SLOT_FEES = new GasFees(0, 77n);

    /** Builds an L2Tips stub for the simulator tests. */
    function makeSimTips(args: {
      proposedBlock: BlockNumber;
      checkpointedBlock?: BlockNumber;
      proposedCheckpoint: CheckpointNumber;
      proposedCheckpointBlock: BlockNumber;
      checkpointed: CheckpointNumber;
    }): L2Tips {
      const checkpointedBlock = args.checkpointedBlock ?? args.proposedCheckpointBlock;
      return {
        proposed: { number: args.proposedBlock, hash: '' },
        checkpointed: {
          block: { number: checkpointedBlock, hash: '' },
          checkpoint: { number: args.checkpointed, hash: '' },
        },
        proposedCheckpoint: {
          block: { number: args.proposedCheckpointBlock, hash: '' },
          checkpoint: { number: args.proposedCheckpoint, hash: '' },
        },
        proven: {
          block: { number: BlockNumber.ZERO, hash: '' },
          checkpoint: { number: CheckpointNumber.ZERO, hash: '' },
        },
        finalized: {
          block: { number: BlockNumber.ZERO, hash: '' },
          checkpoint: { number: CheckpointNumber.ZERO, hash: '' },
        },
      };
    }

    beforeEach(() => {
      // Snapshot supplies slot + timestamp; gas fees come from the predictor.
      feeProvider.getCurrentMinFeesSnapshot.mockResolvedValue({
        timestamp: SNAPSHOT_TIMESTAMP,
        slotNumber: SNAPSHOT_SLOT,
        gasFees: SNAPSHOT_GAS_FEES,
      });
      feeProvider.getPredictedMinFees.mockResolvedValue([PREDICTED_GAS_FEES, PREDICTED_NEXT_SLOT_FEES]);
      globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mockImplementation(
        (coinbase, feeRecipient, snapshot) => ({
          chainId,
          version: rollupVersion,
          slotNumber: snapshot.slotNumber,
          timestamp: snapshot.timestamp,
          coinbase,
          feeRecipient,
          gasFees: snapshot.gasFees,
        }),
      );
      l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
      // Cause `simulate` to bail out after building the global variables so we can observe what
      // the simulator decided without needing to spin up the full AVM processor.
      worldState.fork.mockRejectedValue(new Error('stop-after-globals'));
    });

    it('case A — mid-checkpoint continuation reuses latest block globals', async () => {
      const tx = await mockTxForRollup(0xa0001);
      const latestGlobals = GlobalVariables.from({
        ...GlobalVariables.empty(),
        chainId,
        version: rollupVersion,
        blockNumber: BlockNumber(7),
        slotNumber: SlotNumber(42),
        timestamp: 1_700_100_000n,
        coinbase: EthAddress.fromString(`0x${'aa'.repeat(20)}`),
        feeRecipient: await AztecAddress.random(),
        gasFees: new GasFees(0, 17n),
      });
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(7),
          proposedCheckpoint: CheckpointNumber(3),
          proposedCheckpointBlock: BlockNumber(5),
          checkpointed: CheckpointNumber(3),
        }),
      );
      l2BlockSource.getBlockData.mockResolvedValue({
        header: BlockHeader.empty({ globalVariables: latestGlobals }),
        archive: AppendOnlyTreeSnapshot.empty(),
        blockHash: BlockHash.random(),
        checkpointNumber: CheckpointNumber(3),
        indexWithinCheckpoint: IndexWithinCheckpoint(2),
      });

      const verboseSpy = jest.spyOn((simulator as any).log, 'verbose');

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // Case A reuses the latest header — the FeeProvider is not consulted at all.
      expect(feeProvider.getCurrentMinFeesSnapshot).not.toHaveBeenCalled();
      expect(feeProvider.getPredictedMinFees).not.toHaveBeenCalled();
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).not.toHaveBeenCalled();
      expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: BlockNumber(7) });
      const call = verboseSpy.mock.calls.find(c => /Simulating public calls/.test(String(c[0])));
      expect(call).toBeDefined();
      const observedGlobals: GlobalVariables = (call![1] as any).globalVariables;
      expect(observedGlobals).toEqual(
        GlobalVariables.from({ ...latestGlobals, blockNumber: BlockNumber(8) }).toInspect(),
      );
    });

    it('case B idle — consumes snapshot timestamp/slot and predicted fees', async () => {
      const tx = await mockTxForRollup(0xb0001);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(10),
          proposedCheckpoint: CheckpointNumber(3),
          proposedCheckpointBlock: BlockNumber(10),
          checkpointed: CheckpointNumber(3),
          checkpointedBlock: BlockNumber(10),
        }),
      );

      const verboseSpy = jest.spyOn((simulator as any).log, 'verbose');

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      expect(feeProvider.getCurrentMinFeesSnapshot).toHaveBeenCalledTimes(1);
      expect(feeProvider.getPredictedMinFees).toHaveBeenCalledTimes(1);
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      const [, , snapshotArg] = globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mock.calls[0];
      // Slot and timestamp come from the snapshot; gas fees come from the predictor's index 0.
      expect(snapshotArg.slotNumber).toEqual(SNAPSHOT_SLOT);
      expect(snapshotArg.timestamp).toEqual(SNAPSHOT_TIMESTAMP);
      expect(snapshotArg.gasFees).toEqual(PREDICTED_GAS_FEES);
      // Idle target checkpoint = checkpointed + 1 = 4.
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(4));
      // Verify the simulator threads the predicted fees through to the composed globals.
      const call = verboseSpy.mock.calls.find(c => /Simulating public calls/.test(String(c[0])));
      expect(call).toBeDefined();
      const observedGlobals: any = (call![1] as any).globalVariables;
      expect(observedGlobals.slotNumber).toEqual(SNAPSHOT_SLOT);
      expect(observedGlobals.timestamp).toEqual(SNAPSHOT_TIMESTAMP);
      expect(observedGlobals.feePerL2Gas).toEqual(Number(PREDICTED_GAS_FEES.feePerL2Gas));
    });

    it('case B uses predicted fees, not snapshot fees', async () => {
      // Distinguishable values prove the simulator's gasFees came from `getPredictedMinFees()`
      // rather than `getCurrentMinFeesSnapshot().gasFees`.
      const tx = await mockTxForRollup(0xb0002);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(10),
          proposedCheckpoint: CheckpointNumber(3),
          proposedCheckpointBlock: BlockNumber(10),
          checkpointed: CheckpointNumber(3),
          checkpointedBlock: BlockNumber(10),
        }),
      );

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      const [, , snapshotArg] = globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mock.calls[0];
      expect(snapshotArg.gasFees).toEqual(PREDICTED_GAS_FEES);
      expect(snapshotArg.gasFees).not.toEqual(SNAPSHOT_GAS_FEES);
    });

    it('case B with proposed parent — targetCheckpoint advances to proposed + 1', async () => {
      const tx = await mockTxForRollup(0xb0003);
      // proposedCheckpoint is two ahead of `checkpointed`: a 2-deep pipeline. The L1-to-L2
      // message fetch must target `proposedCheckpoint + 1 = 6`, not `checkpointed + 1 = 4`.
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(20),
          proposedCheckpoint: CheckpointNumber(5),
          proposedCheckpointBlock: BlockNumber(20),
          checkpointed: CheckpointNumber(3),
          checkpointedBlock: BlockNumber(14),
        }),
      );

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      // We never consult getProposedCheckpointData in the simplified path.
      expect(l2BlockSource.getProposedCheckpointData).not.toHaveBeenCalled();
      // Target checkpoint = proposed parent + 1 = 6.
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(6));
    });

    it('slot anchoring — FeeProvider snapshot drives the simulated slot', async () => {
      // Advancing the snapshot's slot must move the simulator forward in lockstep.
      const tx = await mockTxForRollup(0xb0004);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(10),
          proposedCheckpoint: CheckpointNumber(3),
          proposedCheckpointBlock: BlockNumber(10),
          checkpointed: CheckpointNumber(3),
          checkpointedBlock: BlockNumber(10),
        }),
      );

      const firstSlot = SlotNumber(150);
      const secondSlot = SlotNumber(450);

      feeProvider.getCurrentMinFeesSnapshot.mockResolvedValueOnce({
        timestamp: 1_700_003_600n,
        slotNumber: firstSlot,
        gasFees: SNAPSHOT_GAS_FEES,
      });
      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');
      const observedFirst =
        globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mock.calls[0][2].slotNumber;
      expect(observedFirst).toEqual(firstSlot);

      globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mockClear();
      feeProvider.getCurrentMinFeesSnapshot.mockResolvedValueOnce({
        timestamp: 1_700_010_800n,
        slotNumber: secondSlot,
        gasFees: SNAPSHOT_GAS_FEES,
      });
      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');
      const observedSecond =
        globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mock.calls[0][2].slotNumber;
      expect(observedSecond).toEqual(secondSlot);
      expect(observedSecond).toBeGreaterThan(observedFirst);
    });

    it('case A missing block header falls back to idle Case B with a warning', async () => {
      const tx = await mockTxForRollup(0xa0099);
      // Mid-checkpoint: proposed block (7) is past the last proposed-checkpoint block (5).
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(7),
          proposedCheckpoint: CheckpointNumber(3),
          proposedCheckpointBlock: BlockNumber(5),
          checkpointed: CheckpointNumber(3),
        }),
      );
      // Header for the latest proposed block is missing on this node.
      l2BlockSource.getBlockData.mockResolvedValue(undefined);

      const warnSpy = jest.spyOn((simulator as any).log, 'warn');

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // Fallback uses idle Case B: snapshot-based synchronous builder is used; idle checkpoint.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      // The simplified path never consults the proposed checkpoint data.
      expect(l2BlockSource.getProposedCheckpointData).not.toHaveBeenCalled();
      // Idle target checkpoint = checkpointed + 1 = 4.
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(4));
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Falling back to L1-confirmed-tip simulation.*has no header/),
        expect.objectContaining({ latestBlockNumber: BlockNumber(7) }),
      );
    });
  });
});
