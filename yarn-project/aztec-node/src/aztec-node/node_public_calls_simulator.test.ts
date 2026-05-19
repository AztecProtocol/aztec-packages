import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { GlobalVariableBuilder } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockQuery, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
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
      l1ChainId: 12345,
      config: {
        rpcSimulatePublicMaxGasLimit,
        rpcSimulatePublicMaxDebugLogMemoryReads,
        rollupAddress: EthAddress.ZERO,
      },
    });
  });

  it('refuses to simulate public calls if the gas limit is too high', async () => {
    const tx = await mockTxForRollup(0x10000);
    unfreeze(tx.data.constants.txContext.gasSettings.gasLimits).l2Gas = 1e12;
    await expect(simulator.simulate(tx)).rejects.toThrow(/gas/i);
  });

  describe('next-block globals', () => {
    // Snapshot returned by the FeeProvider mock. The simulator consumes this triple directly
    // as the source of truth for slot/timestamp/gasFees in Case B.
    const SNAPSHOT_SLOT = SlotNumber(150);
    const SNAPSHOT_TIMESTAMP = 1_700_003_600n;
    const SNAPSHOT_GAS_FEES = new GasFees(0, 42n);

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

    /** Builds a ProposedCheckpointData stub. */
    function makeProposedCheckpoint(args: {
      checkpointNumber: CheckpointNumber;
      startBlock: BlockNumber;
      blockCount: number;
    }): ProposedCheckpointData {
      return {
        checkpointNumber: args.checkpointNumber,
        header: CheckpointHeader.random({ slotNumber: SlotNumber(0) }),
        archive: AppendOnlyTreeSnapshot.empty(),
        checkpointOutHash: Fr.ZERO,
        startBlock: args.startBlock,
        blockCount: args.blockCount,
        totalManaUsed: 0n,
        feeAssetPriceModifier: 0n,
      };
    }

    // Captured rollup contract used by the simulator's overrides-plan helper.
    let rollupContractForBuilder: MockProxy<RollupContract>;

    beforeEach(() => {
      rollupContractForBuilder = mock<RollupContract>();
      rollupContractForBuilder.getCheckpoint.mockResolvedValue({
        feeHeader: { manaUsed: 0n, excessMana: 0n, ethPerFeeAsset: 1n, congestionCost: 0n, proverCost: 0n },
      } as any);
      rollupContractForBuilder.getManaTarget.mockResolvedValue(10_000n);
      globalVariablesBuilder.getRollupContract.mockReturnValue(rollupContractForBuilder);
      // The simulator's Case B path reads slot/timestamp/gasFees from the FeeProvider snapshot.
      feeProvider.getCurrentMinFeesSnapshot.mockResolvedValue({
        timestamp: SNAPSHOT_TIMESTAMP,
        slotNumber: SNAPSHOT_SLOT,
        gasFees: SNAPSHOT_GAS_FEES,
      });
      // No-plan path uses the synchronous from-snapshot composer. Tests that exercise the
      // overrides-plan branch still mock the async builder below.
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
      globalVariablesBuilder.buildCheckpointGlobalVariables.mockImplementation((coinbase, feeRecipient, slotNumber) =>
        Promise.resolve({
          chainId,
          version: rollupVersion,
          slotNumber,
          timestamp: SNAPSHOT_TIMESTAMP,
          coinbase,
          feeRecipient,
          gasFees: SNAPSHOT_GAS_FEES,
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

      globalVariablesBuilder.buildCheckpointGlobalVariables.mockImplementation(() => {
        throw new Error('buildCheckpointGlobalVariables should not be called in case A');
      });
      // The simulator has finished case-A globals composition by the time fork is invoked, so
      // throwing here lets us inspect what was decided without spinning up the full AVM processor.
      worldState.fork.mockImplementation(() => {
        throw new Error('stop-after-globals');
      });
      // We can't easily read `newGlobalVariables` from outside; instead assert via the verbose log.
      const verboseSpy = jest.spyOn((simulator as any).log, 'verbose');

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(l2BlockSource.getL1Timestamp).not.toHaveBeenCalled();
      expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: BlockNumber(7) });
      // verbose log carries the simulated globals; pull them out and assert field-for-field.
      const call = verboseSpy.mock.calls.find(c => /Simulating public calls/.test(String(c[0])));
      expect(call).toBeDefined();
      const observedGlobals: GlobalVariables = (call![1] as any).globalVariables;
      expect(observedGlobals).toEqual(
        GlobalVariables.from({ ...latestGlobals, blockNumber: BlockNumber(8) }).toInspect(),
      );
    });

    it('case B idle — consumes FeeProvider snapshot via the synchronous builder', async () => {
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

      // No overrides plan: snapshot-based synchronous builder is used; async builder is not.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      const [, , snapshotArg] = globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot.mock.calls[0];
      expect(snapshotArg.slotNumber).toEqual(SNAPSHOT_SLOT);
      expect(snapshotArg.timestamp).toEqual(SNAPSHOT_TIMESTAMP);
      expect(snapshotArg.gasFees).toEqual(SNAPSHOT_GAS_FEES);
      // Verify the simulator threads the snapshot fields through to the composed globals.
      const call = verboseSpy.mock.calls.find(c => /Simulating public calls/.test(String(c[0])));
      expect(call).toBeDefined();
      const observedGlobals: any = (call![1] as any).globalVariables;
      expect(observedGlobals.slotNumber).toEqual(SNAPSHOT_SLOT);
      expect(observedGlobals.timestamp).toEqual(SNAPSHOT_TIMESTAMP);
      expect(observedGlobals.feePerL2Gas).toEqual(Number(SNAPSHOT_GAS_FEES.feePerL2Gas));
    });

    it('case B with 2-deep proposed parent — omits overrides plan', async () => {
      const tx = await mockTxForRollup(0xb0007);
      // proposedCheckpoint number is checkpointed + 2, so the proposed parent is 2-deep
      // beyond L1's confirmed view. The grandparent would not be available on L1, so we must
      // not call buildCheckpointSimulationOverridesPlan.
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(20),
          proposedCheckpoint: CheckpointNumber(5),
          proposedCheckpointBlock: BlockNumber(20),
          checkpointed: CheckpointNumber(3),
          checkpointedBlock: BlockNumber(14),
        }),
      );
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpoint({
          checkpointNumber: CheckpointNumber(5),
          startBlock: BlockNumber(18),
          blockCount: 3,
        }),
      );

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // No overrides plan: snapshot-based synchronous builder is used; async builder is not.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      // Grandparent is not on L1, so we must not have asked the rollup contract for it.
      expect(rollupContractForBuilder.getCheckpoint).not.toHaveBeenCalled();
    });

    it('case B with proposed parent — overrides plan carries archive + fee header overrides', async () => {
      const tx = await mockTxForRollup(0xb0002);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(20),
          proposedCheckpoint: CheckpointNumber(5),
          proposedCheckpointBlock: BlockNumber(20),
          checkpointed: CheckpointNumber(4),
          checkpointedBlock: BlockNumber(17),
        }),
      );
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpoint({
          checkpointNumber: CheckpointNumber(5),
          startBlock: BlockNumber(18),
          blockCount: 3,
        }),
      );

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // 1-deep pipelined plan path: async builder takes the slot from the snapshot.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).not.toHaveBeenCalled();
      const [, , slotArg, planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(SNAPSHOT_SLOT);
      // Pipelined plan: target = parent + 1 = 6, parent state must be present.
      expect(planArg!.pendingCheckpointState).toBeDefined();
      expect(planArg!.pendingCheckpointState!.archive).toBeDefined();
      expect(planArg!.pendingCheckpointState!.slotNumber).toBeDefined();
      expect(planArg!.pendingCheckpointState!.headerHash).toBeDefined();
      // Fee header is derived from the grandparent (checkpoint 4) via computeChildFeeHeader.
      // Mocked grandparent feeHeader has ethPerFeeAsset=1n which gets clamped up to the
      // MIN_ETH_PER_FEE_ASSET floor (100n) by computeChildFeeHeader; manaUsed mirrors the
      // proposed parent's totalManaUsed (0n in the fixture).
      expect(planArg!.pendingCheckpointState!.feeHeader).toEqual({
        excessMana: 0n,
        manaUsed: 0n,
        ethPerFeeAsset: 100n,
        congestionCost: 0n,
        proverCost: 0n,
      });
      expect(planArg!.chainTipsOverride?.pending).toEqual(CheckpointNumber(5));
      // L1-to-L2 messages are fetched for the target checkpoint (6).
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(6));
    });

    it('slot anchoring — FeeProvider snapshot drives the simulated slot', async () => {
      // The simulator pulls slot/timestamp/gasFees from `FeeProvider.getCurrentMinFeesSnapshot()`,
      // which is the same triple the wallet observes via `getCurrentMinFees`. Advancing the
      // snapshot's slot must move the simulator forward in lockstep.
      const tx = await mockTxForRollup(0xb0003);
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

    it('coherency guard — checkpoint-number mismatch falls back to idle simulation with a warning', async () => {
      const tx = await mockTxForRollup(0xb0004);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(20),
          proposedCheckpoint: CheckpointNumber(5),
          proposedCheckpointBlock: BlockNumber(20),
          checkpointed: CheckpointNumber(4),
        }),
      );
      // Returned checkpointNumber doesn't match tips.proposedCheckpoint.checkpoint.number.
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpoint({
          checkpointNumber: CheckpointNumber(4),
          startBlock: BlockNumber(18),
          blockCount: 3,
        }),
      );

      const warnSpy = jest.spyOn((simulator as any).log, 'warn');

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // Fallback uses idle Case B: snapshot-based synchronous builder is used.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      // L1-to-L2 messages are fetched for `checkpointed + 1 = 5`, not the parent + 1 = 6.
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(5));
      // Logger received a warning explaining the fallback.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Falling back to L1-confirmed-tip simulation.*[Tt]orn L2 tips snapshot/),
        expect.objectContaining({ expectedNumber: CheckpointNumber(5) }),
      );
    });

    it('case A missing block header falls back to idle simulation with a warning', async () => {
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
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).not.toHaveBeenCalled();
      expect(globalVariablesBuilder.buildCheckpointGlobalVariablesFromSnapshot).toHaveBeenCalledTimes(1);
      // No attempt to consult the proposed checkpoint data — we fell through from a Case-A failure.
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
