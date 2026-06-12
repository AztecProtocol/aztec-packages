import { EpochCache } from '@aztec/epoch-cache';
import type { RollupContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import { unfreeze } from '@aztec/foundation/types';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockData, BlockHash, L2Block, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockTx } from '@aztec/stdlib/testing';
import { BlockHeader, type GlobalVariableBuilder, GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

const NOW_MS = 1718745600000;
const NOW_S = NOW_MS / 1000;

// We create a mock date provider to have control over the next slot timestamp.
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
  let contractDataSource: MockProxy<ContractDataSource>;
  let epochCache: EpochCache;
  let simulator: NodePublicCallsSimulator;

  const chainId = new Fr(12345);
  const rollupVersion = new Fr(1);
  const feePayer = AztecAddress.ZERO;

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

  beforeEach(() => {
    globalVariablesBuilder = mock<GlobalVariableBuilder>();

    worldState = mock<WorldStateSynchronizer>();
    worldState.syncImmediate.mockImplementation(() => Promise.resolve(BlockNumber.ZERO));

    l2BlockSource = mock<L2BlockSource>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();

    const rollupContract = mock<RollupContract>();
    // EpochCache needs a rollup object for other methods, but these tests mock `getEpochAndSlotInNextL1Slot` directly.
    epochCache = new EpochCache(
      rollupContract,
      { ...EmptyL1RollupConstants, lagInEpochsForValidatorSet: 0, lagInEpochsForRandao: 0 },
      new MockDateProvider(),
    );

    simulator = new NodePublicCallsSimulator({
      blockSource: l2BlockSource,
      worldStateSynchronizer: worldState,
      l1ToL2MessageSource,
      contractDataSource,
      globalVariableBuilder: globalVariablesBuilder,
      epochCache,
      config: {
        rpcSimulatePublicMaxGasLimit: 1e10,
        rpcSimulatePublicMaxDebugLogMemoryReads: 1024,
      },
    });
  });

  const mockNextL1Slot = (slot: SlotNumber) => {
    jest.spyOn(epochCache, 'getEpochAndSlotInNextL1Slot').mockReturnValue({
      epoch: EpochNumber(0),
      slot,
      ts: 0n,
      nowSeconds: BigInt(NOW_S),
    });
  };

  const makeSimulationBlockData = (
    blockNumber: BlockNumber,
    slotNumber: SlotNumber,
    checkpointNumber = CheckpointNumber(1),
  ): BlockData => ({
    header: BlockHeader.empty({
      globalVariables: GlobalVariables.empty({ blockNumber, slotNumber }),
    }),
    archive: L2Block.empty().archive,
    blockHash: BlockHash.random(),
    checkpointNumber,
    indexWithinCheckpoint: IndexWithinCheckpoint(0),
  });

  /** Builds an L2Tips stub with the given checkpoint numbers per tip. */
  function makeTips(args: {
    proposed?: BlockNumber;
    proposedCheckpointBlock?: BlockNumber;
    proposedCheckpoint?: CheckpointNumber;
    checkpointed?: CheckpointNumber;
    proven?: CheckpointNumber;
    finalized?: CheckpointNumber;
  }): L2Tips {
    const makeBlockId = (number = BlockNumber(0)) => ({ number, hash: '' });
    const makeTipId = (n: CheckpointNumber, blockNumber?: BlockNumber) => ({
      block: makeBlockId(blockNumber),
      checkpoint: { number: n, hash: '' },
    });
    return {
      proposed: makeBlockId(args.proposed),
      checkpointed: makeTipId(args.checkpointed ?? CheckpointNumber(0)),
      proposedCheckpoint: makeTipId(args.proposedCheckpoint ?? CheckpointNumber(0), args.proposedCheckpointBlock),
      proven: makeTipId(args.proven ?? CheckpointNumber(0)),
      finalized: makeTipId(args.finalized ?? CheckpointNumber(0)),
    };
  }

  it('refuses to simulate public calls if the gas limit is too high', async () => {
    const tx = await mockTxForRollup(0x10000);
    unfreeze(tx.data.constants.txContext.gasSettings.gasLimits).l2Gas = 1e12;
    await expect(simulator.simulate(tx)).rejects.toThrow(/gas/i);
  });

  it('uses the slot after the proposed checkpoint when it is later than the next L1 timestamp slot', async () => {
    const tx = await mockTxForRollup(0x10000);
    const checkpointNumber = CheckpointNumber(1);
    const proposedCheckpointBlockNumber = BlockNumber(9);
    const targetSlot = SlotNumber(10);
    l2BlockSource.getL2Tips.mockResolvedValue(
      makeTips({
        proposed: proposedCheckpointBlockNumber,
        proposedCheckpoint: checkpointNumber,
        proposedCheckpointBlock: proposedCheckpointBlockNumber,
      }),
    );
    l2BlockSource.getBlockData.mockResolvedValue(
      makeSimulationBlockData(proposedCheckpointBlockNumber, SlotNumber(9), checkpointNumber),
    );
    mockNextL1Slot(SlotNumber(5));
    globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      chainId,
      version: rollupVersion,
      slotNumber: targetSlot,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

    await expect(simulator.simulate(tx)).rejects.toThrow();

    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: proposedCheckpointBlockNumber });
    expect(globalVariablesBuilder.buildGlobalVariables).not.toHaveBeenCalled();
    expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledWith(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
    );
  });

  it('uses the next L1 timestamp slot when it is later than the slot after the proposed checkpoint', async () => {
    const tx = await mockTxForRollup(0x10000);
    const checkpointNumber = CheckpointNumber(1);
    const proposedCheckpointBlockNumber = BlockNumber(9);
    const targetSlot = SlotNumber(12);
    l2BlockSource.getL2Tips.mockResolvedValue(
      makeTips({
        proposed: proposedCheckpointBlockNumber,
        proposedCheckpoint: checkpointNumber,
        proposedCheckpointBlock: proposedCheckpointBlockNumber,
      }),
    );
    l2BlockSource.getBlockData.mockResolvedValue(
      makeSimulationBlockData(proposedCheckpointBlockNumber, SlotNumber(9), checkpointNumber),
    );
    mockNextL1Slot(targetSlot);
    globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      chainId,
      version: rollupVersion,
      slotNumber: targetSlot,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

    await expect(simulator.simulate(tx)).rejects.toThrow();

    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: proposedCheckpointBlockNumber });
    expect(globalVariablesBuilder.buildGlobalVariables).not.toHaveBeenCalled();
    expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledWith(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
    );
  });

  it('uses the latest proposed block slot when it is ahead of the proposed checkpoint', async () => {
    const tx = await mockTxForRollup(0x10000);
    const checkpointNumber = CheckpointNumber(1);
    const proposedCheckpointBlockNumber = BlockNumber(9);
    const latestProposedBlockNumber = BlockNumber(12);
    const targetSlot = SlotNumber(12);
    l2BlockSource.getL2Tips.mockResolvedValue(
      makeTips({
        proposed: latestProposedBlockNumber,
        proposedCheckpoint: checkpointNumber,
        proposedCheckpointBlock: proposedCheckpointBlockNumber,
      }),
    );
    l2BlockSource.getBlockData.mockImplementation(query => {
      if (!('number' in query)) {
        return Promise.resolve(undefined);
      }
      if (query.number === proposedCheckpointBlockNumber) {
        return Promise.resolve(makeSimulationBlockData(proposedCheckpointBlockNumber, SlotNumber(9), checkpointNumber));
      }
      return Promise.resolve(makeSimulationBlockData(latestProposedBlockNumber, targetSlot, checkpointNumber));
    });
    mockNextL1Slot(SlotNumber(5));
    globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      chainId,
      version: rollupVersion,
      slotNumber: targetSlot,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

    await expect(simulator.simulate(tx)).rejects.toThrow();

    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: proposedCheckpointBlockNumber });
    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: latestProposedBlockNumber });
    expect(globalVariablesBuilder.buildGlobalVariables).not.toHaveBeenCalled();
    expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledWith(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
    );
  });

  it('disregards missing proposed block slots and uses the next L1 timestamp slot', async () => {
    const tx = await mockTxForRollup(0x10000);
    const checkpointNumber = CheckpointNumber(1);
    const proposedCheckpointBlockNumber = BlockNumber(9);
    const latestProposedBlockNumber = BlockNumber(12);
    const targetSlot = SlotNumber(13);
    l2BlockSource.getL2Tips.mockResolvedValue(
      makeTips({
        proposed: latestProposedBlockNumber,
        proposedCheckpoint: checkpointNumber,
        proposedCheckpointBlock: proposedCheckpointBlockNumber,
      }),
    );
    l2BlockSource.getBlockData.mockResolvedValue(undefined);
    mockNextL1Slot(targetSlot);
    globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      chainId,
      version: rollupVersion,
      slotNumber: targetSlot,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

    await expect(simulator.simulate(tx)).rejects.toThrow();

    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: proposedCheckpointBlockNumber });
    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: latestProposedBlockNumber });
    expect(globalVariablesBuilder.buildGlobalVariables).not.toHaveBeenCalled();
    expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledWith(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
    );
  });

  it('treats slot zero as a valid proposed checkpoint slot', async () => {
    const tx = await mockTxForRollup(0x10000);
    const checkpointNumber = CheckpointNumber(0);
    const proposedCheckpointBlockNumber = BlockNumber(0);
    const targetSlot = SlotNumber(1);
    l2BlockSource.getL2Tips.mockResolvedValue(
      makeTips({
        proposed: proposedCheckpointBlockNumber,
        proposedCheckpoint: checkpointNumber,
        proposedCheckpointBlock: proposedCheckpointBlockNumber,
      }),
    );
    l2BlockSource.getBlockData.mockResolvedValue(
      makeSimulationBlockData(proposedCheckpointBlockNumber, SlotNumber(0), checkpointNumber),
    );
    mockNextL1Slot(SlotNumber(0));
    globalVariablesBuilder.buildCheckpointGlobalVariables.mockResolvedValue({
      chainId,
      version: rollupVersion,
      slotNumber: targetSlot,
      timestamp: 0n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

    await expect(simulator.simulate(tx)).rejects.toThrow();

    expect(l2BlockSource.getBlockData).toHaveBeenCalledWith({ number: proposedCheckpointBlockNumber });
    expect(globalVariablesBuilder.buildGlobalVariables).not.toHaveBeenCalled();
    expect(globalVariablesBuilder.buildCheckpointGlobalVariables).toHaveBeenCalledWith(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      targetSlot,
    );
  });
});
