import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { L2Block, type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type {
  BuildBlockResult,
  IFullNodeBlockBuilder,
  ITxProvider,
  MerkleTreeWriteOperations,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { OffenseType } from '@aztec/stdlib/slashing';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';
import type { Hex } from 'viem';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { EpochPruneWatcher } from './epoch_prune_watcher.js';

describe('EpochPruneWatcher', () => {
  let watcher: EpochPruneWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let l1ToL2MessageSource: MockProxy<L1ToL2MessageSource>;
  let epochCache: MockProxy<EpochCache>;
  let txProvider: MockProxy<Pick<ITxProvider, 'getAvailableTxs'>>;
  let blockBuilder: MockProxy<IFullNodeBlockBuilder>;
  let fork: MockProxy<MerkleTreeWriteOperations>;

  let ts: bigint;
  let l1Constants: L1RollupConstants;

  const validEpochPrunedPenalty = BigInt(1000000000000000000n);
  const dataWithholdingPenalty = BigInt(2000000000000000000n);

  beforeEach(async () => {
    l2BlockSource = new MockL2BlockSource() as unknown as L2BlockSourceEventEmitter;
    l1ToL2MessageSource = mock<L1ToL2MessageSource>();
    l1ToL2MessageSource.getL1ToL2Messages.mockResolvedValue([]);
    epochCache = mock<EpochCache>();
    txProvider = mock<Pick<ITxProvider, 'getAvailableTxs'>>();
    blockBuilder = mock<IFullNodeBlockBuilder>();
    fork = mock<MerkleTreeWriteOperations>();
    blockBuilder.getFork.mockResolvedValue(fork);

    ts = BigInt(Math.ceil(Date.now() / 1000));
    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: ts,
      slotDuration: 24,
      epochDuration: 8,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
    };

    epochCache.getL1Constants.mockReturnValue(l1Constants);

    watcher = new EpochPruneWatcher(l2BlockSource, l1ToL2MessageSource, epochCache, txProvider, blockBuilder, {
      slashPrunePenalty: validEpochPrunedPenalty,
      slashDataWithholdingPenalty: dataWithholdingPenalty,
    });
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT when a validator is in a pruned epoch when data is unavailable', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');
    const epochNumber = 1n;

    const block = await L2Block.random(
      12, // block number
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
      epoch: epochNumber,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber,
      blocks: [block],
      type: L2BlockSourceEvents.L2PruneDetected,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
      {
        validator: EthAddress.fromString(committee[0]),
        amount: dataWithholdingPenalty,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: epochNumber,
      },
      {
        validator: EthAddress.fromString(committee[1]),
        amount: dataWithholdingPenalty,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: epochNumber,
      },
    ] satisfies WantToSlashArgs[]);
  });

  it('should slash if the data is available and the epoch could have been proven', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const block = await L2Block.random(
      12, // block number
      4, // txs per block
    );
    const tx = Tx.random();
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
        amount: validEpochPrunedPenalty,
        offenseType: OffenseType.VALID_EPOCH_PRUNED,
        epochOrSlot: 1n,
      },
      {
        validator: EthAddress.fromString(committee[1]),
        amount: validEpochPrunedPenalty,
        offenseType: OffenseType.VALID_EPOCH_PRUNED,
        epochOrSlot: 1n,
      },
    ] satisfies WantToSlashArgs[]);

    expect(blockBuilder.buildBlock).toHaveBeenCalledWith([tx], [], block.header.globalVariables, {}, fork);
  });

  it('should not slash if the data is available but the epoch could not have been proven', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const blockFromL1 = await L2Block.random(
      12, // block number
      1, // txs per block
    );
    const blockFromBuilder = await L2Block.random(
      13, // block number
      1, // txs per block
    );
    const tx = Tx.random();
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
