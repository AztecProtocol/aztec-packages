import { L2Block, type L2BlockSource, type L2Tips } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { sleep } from '@aztec/foundation/sleep';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EpochMonitor, type EpochMonitorHandler } from './epoch-monitor.js';

describe('EpochMonitor', () => {
  let l2BlockSource: MockProxy<L2BlockSource>;
  let handler: MockProxy<EpochMonitorHandler>;
  let epochMonitor: EpochMonitor;
  let blocks: L2Block[] = [];

  let lastEpochComplete: bigint = 0n;
  const epochSize = 10;
  const totalNumBlocks = 100;

  const randomBlockHash = () => Fr.random().toString();
  const mockBlock = (blockNum: number) => {
    const block = L2Block.random(blockNum, 1, 1, 1, undefined, Math.round(Math.random() * 1000000));
    return block;
  };

  const l2Tips: L2Tips = {
    latest: { number: 58, hash: randomBlockHash() },
    proven: { number: 39, hash: randomBlockHash() },
    finalized: { number: 20, hash: randomBlockHash() },
  };

  const updateTipsAndBlocks = async (startIndex?: number) => {
    const newBlocks = [...blocks];
    if (startIndex !== undefined) {
      const numToAdd = totalNumBlocks - startIndex;
      const toAdd = await Promise.all(
        Array.from({ length: numToAdd }).map((x: unknown, index: number) => mockBlock(index + startIndex + 1)),
      );
      newBlocks.splice(startIndex, 0, ...toAdd);
    }
    const latestHeader = newBlocks.find(x => x.number == l2Tips.latest.number)!;
    const provenHeader = newBlocks.find(x => x.number == l2Tips.proven.number)!;
    const latestHash = await latestHeader!.hash();
    const provenHash = await provenHeader!.hash();
    blocks = newBlocks;
    l2Tips.latest.hash = latestHash.toString();
    l2Tips.proven.hash = provenHash.toString();
  };

  beforeEach(async () => {
    handler = mock<EpochMonitorHandler>();
    await updateTipsAndBlocks(0);
    l2BlockSource = mock<L2BlockSource>({
      isEpochComplete(epochNumber) {
        return Promise.resolve(epochNumber <= lastEpochComplete);
      },
      getL2Tips() {
        const tips: L2Tips = {
          latest: { number: l2Tips.latest.number, hash: l2Tips.latest.hash! },
          proven: { number: l2Tips.proven.number, hash: l2Tips.proven.hash! },
          finalized: { number: l2Tips.finalized.number, hash: l2Tips.finalized.hash! },
        };
        return Promise.resolve(tips);
      },
      getBlocks(from, limit, _proven) {
        const index = blocks.findIndex(x => x.number == from);
        if (index === undefined) {
          return Promise.resolve([]);
        }
        const slice = blocks.slice(index, index + limit).filter(x => x.number <= l2Tips.latest.number);
        return Promise.resolve(slice);
      },
      getBlockHeader(blockNumber: number | 'latest') {
        if (blockNumber === 'latest') {
          blockNumber = l2Tips.latest.number;
        }
        return Promise.resolve(blocks.find(x => x.number == blockNumber)!.header);
      },
    });

    l2BlockSource.getBlocksForEpoch.mockImplementation((epochNumber: bigint) => {
      const startBlock = blocks.findIndex(x => x.number == Number(epochNumber) * epochSize);
      const slice = blocks.slice(startBlock, startBlock + epochSize);
      return Promise.resolve(slice);
    });

    epochMonitor = new EpochMonitor(l2BlockSource, { pollingIntervalMs: 10 });
  });

  afterEach(async () => {
    await epochMonitor.stop();
  });

  it('triggers initial epoch sync', async () => {
    l2BlockSource.getL2EpochNumber.mockResolvedValue(5n);
    await epochMonitor.start(handler);
    await sleep(100);

    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
  });

  it('does not trigger initial epoch sync on epoch zero', async () => {
    l2BlockSource.getL2EpochNumber.mockResolvedValue(0n);
    await epochMonitor.start(handler);
    await sleep(100);

    expect(handler.handleEpochCompleted).not.toHaveBeenCalled();
  });

  it('triggers epoch completion', async () => {
    lastEpochComplete = 4n;
    l2BlockSource.getL2EpochNumber.mockResolvedValue(5n);
    await epochMonitor.start(handler);

    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    lastEpochComplete = 5n;
    l2Tips.latest.number = 65;
    l2Tips.proven.number = 49;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(5n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(2);

    lastEpochComplete = 6n;
    l2Tips.latest.number = 77;
    l2Tips.proven.number = 59;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(6n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(3);

    lastEpochComplete = 7n;
    l2Tips.latest.number = 83;
    // A partial epoch has been proven, nothing should be triggered
    l2Tips.proven.number = 65;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(3);

    // Now the full epoch has been proven, should trigger
    l2Tips.proven.number = 69;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(7n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(4);
  });

  it('triggers epoch completion if initial epoch was already complete', async () => {
    // this happens if we start the monitor on the very last slot of an epoch
    lastEpochComplete = 5n;
    l2BlockSource.getL2EpochNumber.mockResolvedValue(5n);
    l2Tips.proven.number = 49;
    await epochMonitor.start(handler);

    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(5n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(2);
  });

  it('handles prunes', async () => {
    lastEpochComplete = 4n;
    l2BlockSource.getL2EpochNumber.mockResolvedValue(5n);
    await epochMonitor.start(handler);

    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);
    // We signal epoch 5 has completed, the pending chain is at 65
    // but the proven chain still hasn't moved
    // Nothing should change
    lastEpochComplete = 5n;
    l2Tips.latest.number = 65;
    l2Tips.proven.number = 39;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    // The epoch is partially proven, still nothing happens
    l2Tips.proven.number = 42;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    // We now prune back to the proven chain, nothing should change
    // We will create new set of blocks from the proven block forward
    lastEpochComplete = 5n;
    l2Tips.latest.number = 42;
    l2Tips.proven.number = 42;
    await updateTipsAndBlocks(l2Tips.proven.number);
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    // Move the pending chain forward a few blocks
    lastEpochComplete = 5n;
    l2Tips.latest.number = 46;
    l2Tips.proven.number = 42;
    await updateTipsAndBlocks();
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(4n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    // Epoch 6 now consists of blocks 43 - 48
    const startBlock = blocks.findIndex(x => x.number == 43);
    const slice = blocks.slice(startBlock, startBlock + 5);
    l2BlockSource.getBlocksForEpoch.mockResolvedValueOnce(slice);
    lastEpochComplete = 6n;
    l2Tips.latest.number = 48;
    l2Tips.proven.number = 42;
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(6n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(2);
  });
});
