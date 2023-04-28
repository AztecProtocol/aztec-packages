import { Proof } from '@aztec/circuits.js';
import { makeKernelPublicInputs } from '@aztec/circuits.js/factories';
import { Tx, UnverifiedData, L2BlockSource, L2Block } from '@aztec/types';

export const MockTx = () => {
  return Tx.createPrivate(makeKernelPublicInputs(), new Proof(Buffer.alloc(0)), UnverifiedData.random(8));
};

export class MockBlockSource implements L2BlockSource {
  private l2Blocks: L2Block[];

  constructor(private numBlocks = 100) {
    this.l2Blocks = [];
    for (let i = 0; i < this.numBlocks; i++) {
      this.l2Blocks.push(L2Block.random(i));
    }
  }

  public getBlockHeight() {
    return Promise.resolve(this.l2Blocks.length - 1);
  }

  public getL2Blocks(from: number, take: number) {
    return Promise.resolve(this.l2Blocks.slice(from, from + take));
  }

  public start(): Promise<void> {
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
