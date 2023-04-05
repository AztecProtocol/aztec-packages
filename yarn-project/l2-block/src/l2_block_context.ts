import { KERNEL_NEW_COMMITMENTS_LENGTH } from '@aztec/circuits.js';
import { L2Block } from './l2_block.js';
import { TxHash, getTxHash } from '@aztec/tx';

export class L2BlockContext {
  private txHashes: (TxHash | undefined)[];

  constructor(public readonly block: L2Block) {
    this.txHashes = new Array(Math.floor(block.newCommitments.length / KERNEL_NEW_COMMITMENTS_LENGTH));
  }

  public getTxHash(txIndex: number) {
    if (!this.txHashes[txIndex]) {
      this.txHashes[txIndex] = getTxHash(this.block, txIndex);
    }
    return this.txHashes[txIndex];
  }

  public getTxHashes(): TxHash[] {
    // First ensure that all tx hashes are calculated
    for (let i = 0; i < this.txHashes.length; i++) {
      if (!this.txHashes[i]) {
        this.txHashes[i] = getTxHash(this.block, i);
      }
    }
    return this.txHashes;
  }
}
