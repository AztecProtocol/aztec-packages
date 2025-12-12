import { BlockNumber, type CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2Tips } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * A mocked implementation of L1ToL2MessageSource to be used in tests.
 */
export class MockL1ToL2MessageSource implements L1ToL2MessageSource {
  private messagesPerCheckpoint = new Map<CheckpointNumber, Fr[]>();

  constructor(private blockNumber: number) {}

  public setL1ToL2Messages(checkpointNumber: CheckpointNumber, msgs: Fr[]) {
    this.messagesPerCheckpoint.set(checkpointNumber, msgs);
  }

  public setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return Promise.resolve(this.messagesPerCheckpoint.get(checkpointNumber) ?? []);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }

  getBlockNumber() {
    return Promise.resolve(BlockNumber(this.blockNumber));
  }

  getL2Tips(): Promise<L2Tips> {
    const number = this.blockNumber;
    const tip = { number: BlockNumber(number), hash: new Fr(number).toString() };
    return Promise.resolve({
      latest: tip,
      proven: tip,
      finalized: tip,
    });
  }
}
