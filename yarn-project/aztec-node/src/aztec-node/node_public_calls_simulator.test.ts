import { L1ToL2MessagesNotReadyError } from '@aztec/archiver';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { unfreeze } from '@aztec/foundation/types';
import { PublicProcessor, PublicProcessorFactory } from '@aztec/simulator/server';
import { BlockHash, type L2Frontier } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { mockTx } from '@aztec/stdlib/testing';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { GlobalVariables, TxEffect } from '@aztec/stdlib/tx';
import { WorldStateSynchronizerError } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { NextBlockPlan, NextBlockPredictor } from './next_block/index.js';
import { NodePublicCallsSimulator } from './node_public_calls_simulator.js';

const CHAIN_ID = new Fr(12345);
const ROLLUP_VERSION = new Fr(1);
const LATEST_BLOCK = BlockNumber(5);
const LATEST_BLOCK_HASH = new BlockHash(new Fr(0xb5)).toString();

describe('NodePublicCallsSimulator', () => {
  let worldStateSynchronizer: MockProxy<WorldStateSynchronizer>;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let contractDataSource: MockProxy<ContractDataSource>;
  let predictor: MockProxy<NextBlockPredictor>;
  let merkleTreeFork: MockProxy<MerkleTreeWriteOperations>;

  let simulator: NodePublicCallsSimulator;

  // Captures the globals the simulator hands the processor, so tests assert on the result rather than on mocks.
  let builtGlobals: GlobalVariables | undefined;

  const globalsFor = (blockNumber: BlockNumber, slotNumber: SlotNumber) =>
    GlobalVariables.empty({ blockNumber, slotNumber, gasFees: new GasFees(0, 100) });

  const boundaryPlan = (): NextBlockPlan => ({
    latestBlockNumber: LATEST_BLOCK,
    latestBlockHash: LATEST_BLOCK_HASH,
    newCheckpoint: {
      targetSlot: SlotNumber(20),
      targetCheckpoint: CheckpointNumber(2),
      proposedCheckpointData: undefined,
      checkpointedCheckpointNumber: CheckpointNumber(1),
    },
  });

  const midCheckpointPlan = (): NextBlockPlan => ({
    latestBlockNumber: LATEST_BLOCK,
    latestBlockHash: LATEST_BLOCK_HASH,
  });

  const mockPrediction = (plan: NextBlockPlan) =>
    predictor.predict.mockResolvedValue({
      plan,
      frontier: {} as L2Frontier,
      globals: globalsFor(BlockNumber.add(plan.latestBlockNumber, 1), SlotNumber(20)),
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

    worldStateSynchronizer = mock<WorldStateSynchronizer>();
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    contractDataSource = mock<ContractDataSource>();
    predictor = mock<NextBlockPredictor>();
    merkleTreeFork = mock<MerkleTreeWriteOperations>();

    worldStateSynchronizer.syncImmediate.mockResolvedValue(LATEST_BLOCK);
    // The fork is an AsyncDisposable; provide the hook so `await using` does not throw.
    (merkleTreeFork as unknown as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose] = () =>
      Promise.resolve();
    worldStateSynchronizer.fork.mockResolvedValue(merkleTreeFork);
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    mockPrediction(boundaryPlan());

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
      worldStateSynchronizer,
      l1ToL2MessageSource,
      contractDataSource,
      predictor,
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
    expect(predictor.predict).not.toHaveBeenCalled();
  });

  it('simulates the block the predictor planned, on a fork of the block it builds on', async () => {
    const output = await simulator.simulate(await lowGasTx());

    expect(worldStateSynchronizer.syncImmediate).toHaveBeenCalledWith(
      LATEST_BLOCK,
      BlockHash.fromString(LATEST_BLOCK_HASH),
    );
    expect(worldStateSynchronizer.fork).toHaveBeenCalledWith(LATEST_BLOCK);
    expect(builtGlobals).toEqual(globalsFor(BlockNumber(6), SlotNumber(20)));
    expect(output.globalVariables).toEqual(builtGlobals);
  });

  it('inserts the L1-to-L2 messages of the checkpoint the next block opens', async () => {
    const messages = [Fr.fromString('0x1234'), Fr.fromString('0x5678')];
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue(messages);

    await simulator.simulate(await lowGasTx());

    expect(l1ToL2MessageSource.getL1ToL2Messages).toHaveBeenCalledWith(CheckpointNumber(2));
    const [treeId, appended] = merkleTreeFork.appendLeaves.mock.calls[0];
    expect(treeId).toEqual(MerkleTreeId.L1_TO_L2_MESSAGE_TREE);
    expect(appended.slice(0, 2)).toEqual(messages);
  });

  it('inserts no L1-to-L2 messages when the next block continues a checkpoint', async () => {
    mockPrediction(midCheckpointPlan());

    await simulator.simulate(await lowGasTx());

    expect(l1ToL2MessageSource.getL1ToL2Messages).not.toHaveBeenCalled();
    expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
  });

  it('tolerates L1ToL2MessagesNotReadyError and simulates without messages', async () => {
    l1ToL2MessageSource.getL1ToL2Messages.mockRejectedValue(new L1ToL2MessagesNotReadyError(CheckpointNumber(2), 0n));

    await expect(simulator.simulate(await lowGasTx())).resolves.toBeDefined();
    expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
  });

  it('tolerates a failed message fetch and simulates without messages', async () => {
    l1ToL2MessageSource.getL1ToL2Messages.mockRejectedValue(new Error('archiver is down'));

    await expect(simulator.simulate(await lowGasTx())).resolves.toBeDefined();
    expect(merkleTreeFork.appendLeaves).not.toHaveBeenCalled();
  });

  it('replans once when the world state holds a different block at the planned height', async () => {
    worldStateSynchronizer.syncImmediate.mockRejectedValueOnce(hashMismatch());
    predictor.predict
      .mockResolvedValueOnce({
        plan: boundaryPlan(),
        frontier: {} as L2Frontier,
        globals: globalsFor(BlockNumber(6), SlotNumber(20)),
      })
      .mockResolvedValueOnce({
        plan: boundaryPlan(),
        frontier: {} as L2Frontier,
        globals: globalsFor(BlockNumber(6), SlotNumber(21)),
      });

    await simulator.simulate(await lowGasTx());

    expect(predictor.predict).toHaveBeenCalledTimes(2);
    expect(builtGlobals!.slotNumber).toEqual(SlotNumber(21));
  });

  it('fails with a retryable error when the world state keeps disagreeing with the plan', async () => {
    worldStateSynchronizer.syncImmediate.mockRejectedValue(hashMismatch());

    await expect(simulator.simulate(await lowGasTx())).rejects.toThrow(/prune race/);
    expect(predictor.predict).toHaveBeenCalledTimes(2);
    expect(worldStateSynchronizer.fork).not.toHaveBeenCalled();
  });

  it('surfaces a block the world state cannot reach without replanning', async () => {
    worldStateSynchronizer.syncImmediate.mockRejectedValue(
      new WorldStateSynchronizerError('unable to sync', { cause: { reason: 'block_not_available' } }),
    );

    await expect(simulator.simulate(await lowGasTx())).rejects.toThrow('unable to sync');
    expect(predictor.predict).toHaveBeenCalledTimes(1);
  });

  it('surfaces any other sync failure without replanning', async () => {
    worldStateSynchronizer.syncImmediate.mockRejectedValue(new Error('world state is down'));

    await expect(simulator.simulate(await lowGasTx())).rejects.toThrow('world state is down');
    expect(predictor.predict).toHaveBeenCalledTimes(1);
  });

  const hashMismatch = () =>
    new WorldStateSynchronizerError('hash mismatch', { cause: { reason: 'block_hash_mismatch' } });
});
