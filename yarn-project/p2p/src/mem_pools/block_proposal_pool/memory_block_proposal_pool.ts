import type { Fr } from '@aztec/foundation/fields';
import type { BlockProposal } from '@aztec/stdlib/p2p';

import type { BlockProposalPool } from './block_proposal_pool.js';

export class InMemoryBlockProposalPool implements BlockProposalPool {
  private queue: Array<string>;
  private writePointer = 0;
  private blockProposalPool: Map<string, BlockProposal> = new Map();

  constructor(readonly poolSize: number) {
    if (this.poolSize <= 0) {
      throw new Error('Pool size must be greater than 0');
    }
    this.queue = new Array<string>(this.poolSize);
  }

  size(): Promise<number> {
    return Promise.resolve(this.blockProposalPool.size);
  }

  addBLockProposal(blockProposal: BlockProposal): Promise<boolean> {
    const hash = blockProposal.payload.header.hash().toString();
    // Check if the block proposal  is already in the cache
    if (this.blockProposalPool.has(hash)) {
      return Promise.resolve(false);
    }
    // If we are at the cache limit, remove the oldest block proposal
    if (this.blockProposalPool.size >= this.poolSize) {
      const proposalToRemove = this.queue[this.writePointer];
      this.blockProposalPool.delete(proposalToRemove);
    }

    // Insert the block proposal into the cache and the queue
    this.blockProposalPool.set(hash, blockProposal);
    this.queue[this.writePointer] = hash;
    this.writePointer = this.writePointer === this.poolSize - 1 ? 0 : this.writePointer + 1;
    return Promise.resolve(true);
  }

  hasBlockProposal(hash: Fr): Promise<boolean> {
    return Promise.resolve(this.blockProposalPool.has(hash.toString()));
  }

  getBlockProposal(hash: Fr): Promise<BlockProposal | undefined> {
    return Promise.resolve(this.blockProposalPool.get(hash.toString()));
  }
}
