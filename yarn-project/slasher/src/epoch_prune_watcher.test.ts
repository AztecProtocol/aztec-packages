import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { L2Block, type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';
import type {
  BuildBlockResult,
  IFullNodeBlockBuilder,
  ITxProvider,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';
import type { Hex } from 'viem';

import { Offense, WANT_TO_SLASH_EVENT } from './config.js';
import { EpochPruneWatcher } from './epoch_prune_watcher.js';

describe('EpochPruneWatcher', () => {
  let watcher: EpochPruneWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let txProvider: MockProxy<Pick<ITxProvider, 'getAvailableTxs'>>;
  let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
  let fork: MockProxy<MerkleTreeWriteOperations>;
  const penalty = BigInt(1000000000000000000n);
  const maxPenalty = penalty * 2n;

  beforeEach(async () => {
    l2BlockSource = new MockL2BlockSource() as unknown as L2BlockSourceEventEmitter;
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    epochCache = mock<EpochCache>();
    txProvider = mock<Pick<ITxProvider, 'getAvailableTxs'>>();
    blockBuilder = mock<IFullNodeBlockBuilder>();
    fork = mock<MerkleTreeWriteOperations>();
    blockBuilder.getFork.mockResolvedValue(fork);

    watcher = new EpochPruneWatcher(
      l2BlockSource,
      l1ToL2MessageSource,
      epochCache,
      txProvider,
      blockBuilder,
      penalty,
      maxPenalty,
    );
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT when a validator is in a pruned epoch when data is unavailable', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const block = await L2Block.random(
      1, // block number
      4, // txs per block
    );
    txProvider.getAvailableTxs.mockResolvedValue({ txs: [], missingTxs: [block.body.txEffects[0].txHash] });

    const committee: Hex[] = [
      '0x0000000000000000000000000000000000000abc',
      '0x0000000000000000000000000000000000000def',
    ];
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee: committee.map(EthAddress.fromString),
      seed: 0n,
      epoch: 1n,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber: 1n,
      blocks: [block],
      type: L2BlockSourceEvents.L2PruneDetected,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
      {
        validator: EthAddress.fromString(committee[0]),
        amount: penalty,
        offense: Offense.DATA_WITHHOLDING,
      },
      {
        validator: EthAddress.fromString(committee[1]),
        amount: penalty,
        offense: Offense.DATA_WITHHOLDING,
      },
    ]);

    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: penalty,
        offense: Offense.DATA_WITHHOLDING,
      }),
    ).resolves.toBe(true);
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[1]),
        amount: penalty,
        offense: Offense.DATA_WITHHOLDING,
      }),
    ).resolves.toBe(true);
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000000'),
        amount: penalty,
        offense: Offense.DATA_WITHHOLDING,
      }),
    ).resolves.toBe(false);

    // Should slash if the penalty is within the max penalty
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: maxPenalty,
        offense: Offense.DATA_WITHHOLDING,
      }),
    ).resolves.toBe(true);
    // Should not slash if the penalty is above the max penalty
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: maxPenalty + 1n,
        offense: Offense.DATA_WITHHOLDING,
      }),
    ).resolves.toBe(false);
  });

  it('should slash if the data is available and the epoch could have been proven', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const block = await L2Block.random(
      1, // block number
      4, // txs per block
    );
    const tx = await Tx.random().toTxWithHash();
    txProvider.getAvailableTxs.mockResolvedValue({ txs: [tx], missingTxs: [] });
    blockBuilder.buildBlock.mockResolvedValue({
      block: block,
      failedTxs: [],
      numTxs: 1,
    } as unknown as BuildBlockResult);

    const committee: Hex[] = [
      '0x0000000000000000000000000000000000000abc',
      '0x0000000000000000000000000000000000000def',
    ];
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee: committee.map(EthAddress.fromString),
      seed: 0n,
      epoch: 1n,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber: 1n,
      blocks: [block],
      type: L2BlockSourceEvents.L2PruneDetected,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
      {
        validator: EthAddress.fromString(committee[0]),
        amount: penalty,
        offense: Offense.VALID_EPOCH_PRUNED,
      },
      {
        validator: EthAddress.fromString(committee[1]),
        amount: penalty,
        offense: Offense.VALID_EPOCH_PRUNED,
      },
    ]);

    expect(blockBuilder.buildBlock).toHaveBeenCalledWith([tx], [], block.header.globalVariables, {}, fork);
  });

  it('should not slash if the data is available but the epoch could not have been proven', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const blockFromL1 = await L2Block.random(
      1, // block number
      1, // txs per block
    );
    const blockFromBuilder = await L2Block.random(
      2, // block number
      1, // txs per block
    );
    const tx = await Tx.random().toTxWithHash();
    txProvider.getAvailableTxs.mockResolvedValue({ txs: [tx], missingTxs: [] });
    blockBuilder.buildBlock.mockResolvedValue({
      block: blockFromBuilder,
      failedTxs: [],
      numTxs: 1,
    } as unknown as BuildBlockResult);

    const committee: Hex[] = [
      '0x0000000000000000000000000000000000000abc',
      '0x0000000000000000000000000000000000000def',
    ];
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee: committee.map(EthAddress.fromString),
      seed: 0n,
      epoch: 1n,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber: 1n,
      blocks: [blockFromL1],
      type: L2BlockSourceEvents.L2PruneDetected,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).not.toHaveBeenCalled();

    expect(blockBuilder.buildBlock).toHaveBeenCalledWith([tx], [], blockFromL1.header.globalVariables, {}, fork);
  });
});

class MockL2BlockSource extends EventEmitter {
  constructor() {
    super();
  }
}
