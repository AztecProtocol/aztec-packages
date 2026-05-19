import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { GlobalVariableBuilder } from '@aztec/sequencer-client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockQuery, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import {
  EmptyL1RollupConstants,
  getNextL1SlotTimestamp,
  getSlotAtTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { mockTx } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

// Arbitrary fixed timestamp for the mock date provider. DateProvider.now() returns milliseconds but ExpirationTimestamp
// is denominated in seconds.
const NOW_MS = 1718745600000;
const NOW_S = NOW_MS / 1000;

class MockDateProvider extends DateProvider {
  public override now(): number {
    return NOW_MS;
  }
}

describe('NodePublicCallsSimulator', () => {
  let globalVariablesBuilder: MockProxy<GlobalVariableBuilder>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let l2BlockSource: MockProxy<L2BlockSource>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let lastBlockNumber: BlockNumber;
  let dateProvider: MockDateProvider;
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

    dateProvider = new MockDateProvider();

    const contractSource = mock<ContractDataSource>();

    simulator = new NodePublicCallsSimulator({
      blockSource: l2BlockSource,
      worldStateSynchronizer: worldState,
      l1ToL2MessageSource,
      contractDataSource: contractSource,
      globalVariableBuilder: globalVariablesBuilder,
      dateProvider,
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
    // Constants used across the simulator-shape tests below. We use a non-trivial l1GenesisTime
    // so the wall-clock slot computation produces a deterministic slot we can assert on.
    const L1_CONSTANTS = {
      ...EmptyL1RollupConstants,
      l1GenesisTime: 1_700_000_000n,
      slotDuration: 24,
      ethereumSlotDuration: 12,
    };

    // Slot of the most-recent checkpoint on L1. The simulator reads `slotNumber + 1` from this
    // and combines it with wall-clock to pick a target slot. We park it well in the past so the
    // wall-clock path dominates in tests that don't explicitly bump it.
    const L1_PENDING_CHECKPOINT_SLOT = SlotNumber(0);

    /** Returns the slot the simulator should target given the mock DateProvider and L1 state. */
    function expectedSimulatorSlot(opts: { nowInSeconds?: number; lastL1Slot?: SlotNumber } = {}) {
      const now = opts.nowInSeconds ?? NOW_S;
      const lastSlot = opts.lastL1Slot ?? L1_PENDING_CHECKPOINT_SLOT;
      const earliest = getTimestampForSlot(SlotNumber.add(lastSlot, 1), L1_CONSTANTS);
      const nextEth = getNextL1SlotTimestamp(now, L1_CONSTANTS);
      return getSlotAtTimestamp(earliest > nextEth ? earliest : nextEth, L1_CONSTANTS);
    }

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
      // The simulator anchors its slot selection on `getPendingCheckpoint().slotNumber + 1` and
      // wall-clock — keep the on-L1 slot pinned at zero so the wall-clock path drives the target.
      rollupContractForBuilder.getPendingCheckpoint.mockResolvedValue({
        slotNumber: L1_PENDING_CHECKPOINT_SLOT,
      } as any);
      globalVariablesBuilder.getRollupContract.mockReturnValue(rollupContractForBuilder);
      // Default checkpoint globals — tests override the slotNumber assertion where it matters.
      globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
        chainId,
        version: rollupVersion,
        slotNumber: SlotNumber(0),
        timestamp: 0n,
        coinbase: EthAddress.ZERO,
        feeRecipient: AztecAddress.ZERO,
        gasFees: new GasFees(0, 0),
      });
      l2BlockSource.getL1Constants.mockResolvedValue(L1_CONSTANTS);
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

    it('case B idle — omits overrides plan with no proposed parent', async () => {
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

      const expectedSlot = expectedSimulatorSlot();

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , slotArg, planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(expectedSlot);
      // No proposed parent — fees read L1 state as-is to match the wallet's getCurrentMinFees.
      expect(planArg).toBeUndefined();
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

      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , , planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(planArg).toBeUndefined();
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

      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , , planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
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

    it('slot anchoring — wall-clock drives the simulated slot', async () => {
      // The simulator anchors its slot computation on `dateProvider.nowInSeconds()`, mirroring
      // `FeeProviderImpl.computeCurrentMinFees` so that wallet-side fee estimates match the
      // values the simulator passes to `getManaMinFeeAt`. Advancing the date provider must
      // move the simulated slot forward.
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

      const nowSpy = jest.spyOn(dateProvider, 'nowInSeconds');

      nowSpy.mockReturnValue(NOW_S);
      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');
      const firstSlot = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0][2];
      expect(firstSlot).toEqual(expectedSimulatorSlot({ nowInSeconds: NOW_S }));

      globalVariablesBuilder.buildCheckpointGlobalVariables.mockClear();
      const laterNow = NOW_S + 60 * 60; // +1 hour
      nowSpy.mockReturnValue(laterNow);
      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');
      const secondSlot = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0][2];
      expect(secondSlot).toEqual(expectedSimulatorSlot({ nowInSeconds: laterNow }));

      expect(secondSlot).toBeGreaterThan(firstSlot);
      nowSpy.mockRestore();
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
      const expectedSlot = expectedSimulatorSlot();

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // Fallback uses idle Case B: no overrides plan, slot anchored on wall-clock.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , slotArg, planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(expectedSlot);
      expect(planArg).toBeUndefined();
      // L1-to-L2 messages are fetched for `checkpointed + 1 = 5`, not the parent + 1 = 6.
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(5));
      // Logger received a warning explaining the fallback.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Falling back to L1-confirmed-tip simulation.*[Tt]orn L2 tips snapshot/),
        expect.objectContaining({ expectedNumber: CheckpointNumber(5) }),
      );
    });

    it('coherency guard — last-block mismatch falls back to idle simulation with a warning', async () => {
      const tx = await mockTxForRollup(0xb0006);
      l2BlockSource.getL2Tips.mockResolvedValue(
        makeSimTips({
          proposedBlock: BlockNumber(20),
          proposedCheckpoint: CheckpointNumber(5),
          proposedCheckpointBlock: BlockNumber(20),
          checkpointed: CheckpointNumber(4),
        }),
      );
      // Returned checkpoint number matches, but startBlock+blockCount-1 = 17+2-1 = 18 != tips' 20.
      l2BlockSource.getProposedCheckpointData.mockResolvedValue(
        makeProposedCheckpoint({
          checkpointNumber: CheckpointNumber(5),
          startBlock: BlockNumber(17),
          blockCount: 2,
        }),
      );

      const warnSpy = jest.spyOn((simulator as any).log, 'warn');
      const expectedSlot = expectedSimulatorSlot();

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , slotArg, planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(expectedSlot);
      expect(planArg).toBeUndefined();
      expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(5));
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
      const expectedSlot = expectedSimulatorSlot();

      await expect(simulator.simulate(tx)).rejects.toThrow('stop-after-globals');

      // Fallback uses idle Case B: no overrides plan, wall-clock-anchored slot, idle checkpoint.
      expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledTimes(1);
      const [, , slotArg, planArg] = globalVariablesBuilder.buildCheckpointGlobalVariables.mock.calls[0];
      expect(slotArg).toEqual(expectedSlot);
      expect(planArg).toBeUndefined();
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
