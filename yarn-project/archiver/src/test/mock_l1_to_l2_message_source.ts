import { type L1ToL2MessageSource } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';

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

  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return Promise.resolve(this.messagesPerBlock.get(Number(blockNumber)) ?? []);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }

  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.blockNumber);
  }
}
