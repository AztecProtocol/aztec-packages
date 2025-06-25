import { Fr } from '@aztec/foundation/fields';
import type { L2Tips } from '@aztec/stdlib/block';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * A mocked implementation of L1ToL2MessageSource to be used in tests.
 */
export class MockL1ToL2MessageSource implements L1ToL2MessageSource {
  private messagesPerBlock = new Map<number, Fr[]>();

  constructor(private blockNumber: number) {}

  public setL1ToL2Messages(blockNumber: number, msgs: Fr[]) {
    this.messagesPerBlock.set(blockNumber, msgs);
  }

  public setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  getL1ToL2Messages(blockNumber: number): Promise<Fr[]> {
    return Promise.resolve(this.messagesPerBlock.get(blockNumber) ?? []);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }

  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.blockNumber);
  }

  getL2Tips(): Promise<L2Tips> {
    const number = this.blockNumber;
    const tip = { number, hash: new Fr(number).toString() };
    return Promise.resolve({
      latest: tip,
      proven: tip,
      finalized: tip,
    });
  }
}
