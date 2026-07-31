import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';

import { mock } from 'jest-mock-extended';

import { type BenchmarkedAztecNode, withRecording } from './benchmarked_node.js';

describe('withRecording', () => {
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let node: BenchmarkedAztecNode;

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));
    aztecNode.getBlockNumber.mockResolvedValue(BlockNumber(42));
    node = withRecording(aztecNode);
  });

  it('counts a round trip per blocking wait, timing its reads per method', async () => {
    const read = await publicStorageRead();

    const recording = node.startRecording();
    await node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot);
    await node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot);

    const { perMethod, roundTrips } = recording.stop();
    expect(roundTrips.roundTrips).toBe(2);
    expect(roundTrips.roundTripMethods).toEqual([['getPublicStorageAt'], ['getPublicStorageAt']]);
    expect(perMethod.getPublicStorageAt!.times).toHaveLength(2);
  });

  it('counts parallel reads awaited together as a single round trip', async () => {
    const read = await publicStorageRead();

    const recording = node.startRecording();
    await Promise.all([
      node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot),
      node.getBlockNumber(),
    ]);

    const { roundTrips } = recording.stop();
    expect(roundTrips.roundTrips).toBe(1);
    expect(roundTrips.roundTripMethods).toEqual([['getPublicStorageAt', 'getBlockNumber']]);
  });

  it('gives concurrent recordings of the same wrapper their own view', async () => {
    const read = await publicStorageRead();

    const wholeRun = node.startRecording();
    await node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot);
    const secondHalf = node.startRecording();
    await node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot);

    expect(secondHalf.stop().roundTrips.roundTrips).toBe(1);
    expect(wholeRun.stop().roundTrips.roundTrips).toBe(2);
  });

  it('records nothing once stopped', async () => {
    const read = await publicStorageRead();

    const recording = node.startRecording();
    recording.stop();
    await node.getPublicStorageAt(read.blockHash, read.contractAddress, read.storageSlot);

    const { perMethod, roundTrips } = recording.stop();
    expect(perMethod).toEqual({});
    expect(roundTrips.roundTrips).toBe(0);
  });
});

async function publicStorageRead() {
  return { blockHash: BlockHash.random(), contractAddress: await AztecAddress.random(), storageSlot: Fr.random() };
}
